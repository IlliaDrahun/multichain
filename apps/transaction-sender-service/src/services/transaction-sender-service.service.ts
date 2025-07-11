import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RedisService,
  Transaction,
  BlockchainService,
  TransactionStatus,
} from '@app/shared';
import { Interface, Wallet, TransactionResponse } from 'ethers';

@Injectable()
export class TransactionSenderServiceService implements OnModuleInit {
  private readonly logger = new Logger(TransactionSenderServiceService.name);
  private lastStreamId = '0';

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly redisService: RedisService,
    private readonly blockchainService: BlockchainService,
    @Inject('TRANSACTION_SENDER_CLIENT')
    private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Waiting for Kafka to initialize...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await this.connectToKafkaWithRetry();
    this.startProcessing();
  }

  private async connectToKafkaWithRetry(
    maxRetries = 10,
    delay = 2000,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `Attempting to connect to Kafka (attempt ${attempt}/${maxRetries})...`,
        );
        await this.kafkaClient.connect();
        this.logger.log('Successfully connected to Kafka');
        return;
      } catch (error) {
        this.logger.warn(
          `Kafka connection attempt ${attempt} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (attempt === maxRetries) {
          this.logger.error(
            'Failed to connect to Kafka after maximum retries. Service will continue but Kafka operations may fail.',
          );
          return;
        }

        this.logger.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000);
      }
    }
  }

  private startProcessing() {
    void this.processPendingTransactionsLoop();
  }

  private async processPendingTransactionsLoop(): Promise<void> {
    while (true) {
      try {
        await this.processNextTransaction();
      } catch (error) {
        this.logger.error(
          'Error in processing loop. Retrying in 5s...',
          error instanceof Error ? error.stack : error,
        );

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processNextTransaction(): Promise<void> {
    this.logger.log('Checking for pending transactions...');
    const streamData = await this.redisService
      .getClient()
      .xread(
        'COUNT',
        1,
        'BLOCK',
        5000,
        'STREAMS',
        'tx:to-sign',
        this.lastStreamId,
      );

    if (streamData) {
      const [, messages] = streamData[0];
      for (const [messageId, fields] of messages) {
        this.logger.log(`Processing transaction: ${messageId}`);
        await this.signAndSendTransaction(fields, messageId);
        this.lastStreamId = messageId;
      }
    }
  }

  private async signAndSendTransaction(fields: string[], messageId: string) {
    this.logger.log('Parsing transaction fields...');
    const transactionData = this.parseTransactionFields(fields);
    const { transactionId, chainId, contractAddress, method, args } =
      transactionData;

    this.logger.log(`Finding transaction ${transactionId} in database...`);
    const transaction = await this.transactionRepository.findOneBy({
      id: transactionId,
    });
    if (!transaction) {
      this.logger.error(`Transaction ${transactionId} not found in database.`);
      return;
    }

    transaction.redisStreamMessageId = messageId;

    try {
      this.logger.log(`Getting provider for chainId ${chainId}...`);
      const provider = this.blockchainService.getProvider(chainId);
      this.logger.log('Connecting signer...');
      const signer = this.blockchainService.getSigner().connect(provider);

      this.logger.log('Encoding function data...');
      const contractInterface = new Interface([
        `function ${method}(address, uint256)`,
      ]);
      const data = contractInterface.encodeFunctionData(method, args);

      const txRequest = {
        to: contractAddress,
        data,
      };

      this.logger.log('Estimating gas for the transaction...');
      try {
        await signer.estimateGas(txRequest);
        this.logger.log('Gas estimation successful.');
      } catch (error) {
        this.logger.error(
          `Gas estimation failed for tx ${transaction.id}. Marking as FAILED.`,
          error,
        );
        transaction.status = TransactionStatus.FAILED;
        await this.transactionRepository.save(transaction);
        return;
      }

      const tx = await this.sendTransactionWithRetry(signer, txRequest);

      if (!tx) {
        this.logger.error(
          `Transaction ${transaction.id} failed after multiple retries.`,
        );
        transaction.status = TransactionStatus.FAILED;
        await this.transactionRepository.save(transaction);
        return;
      }

      this.logger.log(`Transaction sent: ${tx.hash}`);

      transaction.txHash = tx.hash;
      transaction.status = TransactionStatus.PENDING;
      await this.transactionRepository.save(transaction);

      this.logger.log(
        `Emitting 'tx.sent' for transaction ${transaction.id} with hash ${tx.hash}`,
      );
      try {
        this.kafkaClient.emit('tx.sent', {
          transactionId: transaction.id,
          txHash: tx.hash,
        });
      } catch (error) {
        this.logger.error(
          `Failed to emit tx.sent message for transaction ${transaction.id}:`,
          error,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send transaction ${transaction.id}:`, error);
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(transaction);
    }
  }

  private async sendTransactionWithRetry(
    signer: Wallet,
    txRequest: { to: string; data: string },
    retries = 5,
    delay = 1000,
  ): Promise<TransactionResponse | null> {
    for (let i = 0; i < retries; i++) {
      try {
        this.logger.log(`Attempt ${i + 1} to send transaction...`);
        const tx = await signer.sendTransaction(txRequest);
        return tx;
      } catch (error) {
        if (i === retries - 1) {
          this.logger.error('All retries failed.', error);
          return null;
        }
        this.logger.warn(
          `Attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return null;
  }

  private parseTransactionFields(fields: string[]): {
    transactionId: string;
    chainId: string;
    contractAddress: string;
    method: string;
    args: any[];
    userAddress: string;
  } {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }
    return {
      transactionId: data.transactionId,
      chainId: data.chainId,
      contractAddress: data.contractAddress,
      method: data.method,
      args: JSON.parse(data.args) as any[],
      userAddress: data.userAddress,
    };
  }
}
