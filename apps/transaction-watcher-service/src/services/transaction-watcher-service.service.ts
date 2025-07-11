import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BlockchainService,
  RedisService,
  Transaction,
  TransactionStatus,
} from '@app/shared';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class TransactionWatcherServiceService implements OnModuleInit {
  private readonly logger = new Logger(TransactionWatcherServiceService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
    @Inject('TRANSACTION_WATCHER_CLIENT')
    private readonly kafkaClient: ClientKafka,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Waiting for Kafka to initialize...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.connectToKafkaWithRetry();
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

  @Interval(10000)
  async handleInterval() {
    this.logger.log('Polling for pending transaction statuses...');
    const chainIds = this.blockchainService.getSupportedChainIds();
    for (const chainId of chainIds) {
      await this.checkPendingTransactions(chainId);
      await this.checkReorgedNonces(chainId);
    }
  }

  private async checkPendingTransactions(chainId: string) {
    this.logger.log(`Checking pending transactions on chain ${chainId}`);

    const pendingTxs = await this.transactionRepository.find({
      where: { chainId, status: TransactionStatus.PENDING },
    });

    if (pendingTxs.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${pendingTxs.length} pending tx(s) to check on chain ${chainId}.`,
    );
    const provider = this.blockchainService.getProvider(chainId);

    for (const tx of pendingTxs) {
      if (!tx.txHash) {
        this.logger.warn(
          `Pending transaction ${tx.id} has no hash yet. Skipping.`,
        );
        continue;
      }

      try {
        if (tx.blockNumber != null) {
          const isFinalized = await this.blockchainService.isBlockFinalized(
            chainId,
            Number(tx.blockNumber),
          );
          if (!isFinalized) {
            this.logger.log(
              `Block ${tx.blockNumber} for tx ${tx.txHash} is not finalized yet.`,
            );
            continue;
          }
          const provider = this.blockchainService.getProvider(chainId);
          const block = await provider.getBlock(Number(tx.blockNumber), true);
          const found = Array.isArray(block?.transactions)
            ? block.transactions.some(
                (t: { hash?: string }) => t?.hash === tx.txHash,
              )
            : false;
          if (found) {
            this.logger.log(
              `Transaction ${tx.txHash} is finalized and confirmed!`,
            );
            tx.status = TransactionStatus.CONFIRMED;
          } else {
            this.logger.error(
              `Transaction ${tx.txHash} not found in finalized block. Marking as REORGED.`,
            );
            tx.status = TransactionStatus.REORGED;
          }
          await this.transactionRepository.save(tx);
          try {
            this.kafkaClient.emit('tx.status', {
              transactionId: tx.id,
              status: tx.status,
              txHash: tx.txHash,
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit tx.status message for transaction ${tx.id}:`,
              err instanceof Error ? err.message : String(err),
            );
          }
          await this.deleteTransactionFromStream(tx);
          continue;
        }
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        if (receipt) {
          const confirmations = await receipt.confirmations();
          const requiredConfirmations =
            this.configService.get<number>('CHAIN_CONFIRMATIONS') ?? 3;

          this.logger.log(
            `Tx ${tx.txHash} has ${confirmations}/${requiredConfirmations} confirmations.`,
          );

          if (confirmations >= requiredConfirmations) {
            if (receipt.status === 1) {
              this.logger.log(`Transaction ${tx.txHash} confirmed!`);
              tx.status = TransactionStatus.CONFIRMED;
            } else {
              this.logger.error(`Transaction ${tx.txHash} failed (reverted).`);
              tx.status = TransactionStatus.FAILED;
            }
            await this.transactionRepository.save(tx);
            try {
              this.kafkaClient.emit('tx.status', {
                transactionId: tx.id,
                status: tx.status,
                txHash: tx.txHash,
              });
            } catch (error) {
              this.logger.error(
                `Failed to emit tx.status message for transaction ${tx.id}:`,
                error,
              );
            }
            await this.deleteTransactionFromStream(tx);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error checking receipt for tx ${tx.txHash}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Мониторинг nonce для REORGED транзакций: если появляется новая tx с этим nonce — уведомить пользователя
   */
  private async checkReorgedNonces(chainId: string) {
    const reorgedTxs = await this.transactionRepository.find({
      where: { chainId, status: TransactionStatus.REORGED },
    });
    if (reorgedTxs.length === 0) return;
    const provider = this.blockchainService.getProvider(chainId);
    for (const tx of reorgedTxs) {
      if (!tx.nonce || !tx.userAddress) continue;
      const userNonce = await provider.getTransactionCount(
        tx.userAddress,
        'latest',
      );
      const ourNonce = Number(tx.nonce);
      if (userNonce > ourNonce) {
        // Nonce уже занят — пользователь отправил другую транзакцию
        tx.status = TransactionStatus.FAILED;
        await this.transactionRepository.save(tx);
        try {
          this.kafkaClient.emit('tx.status', {
            transactionId: tx.id,
            status: tx.status,
            txHash: tx.txHash,
            reason: 'nonce_replaced',
          });
        } catch (err) {
          this.logger.error(
            `Failed to emit tx.status message for transaction ${tx.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        continue;
      }
      if (userNonce === ourNonce) {
        // Автоматически повторно отправляем транзакцию
        const redisClient = this.redisService.getClient();
        await redisClient.xadd(
          'tx:to-sign',
          '*',
          'transactionId',
          tx.id,
          'chainId',
          tx.chainId,
          'contractAddress',
          tx.contractAddress,
          'method',
          tx.method,
          'args',
          JSON.stringify(tx.args),
          'userAddress',
          tx.userAddress,
        );
        tx.status = TransactionStatus.PENDING_SIGN;
        await this.transactionRepository.save(tx);
        try {
          this.kafkaClient.emit('tx.status', {
            transactionId: tx.id,
            status: tx.status,
            txHash: tx.txHash,
            reason: 'auto_resubmitted',
          });
        } catch (err) {
          this.logger.error(
            `Failed to emit tx.status message for transaction ${tx.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
  }

  private async deleteTransactionFromStream(transaction: Transaction) {
    if (transaction.redisStreamMessageId) {
      try {
        const redisClient = this.redisService.getClient();
        await redisClient.xdel('tx:to-sign', transaction.redisStreamMessageId);
        this.logger.log(
          `Deleted message ${transaction.redisStreamMessageId} for transaction ${transaction.id} from Redis stream.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete message for transaction ${transaction.id} from Redis stream:`,
          error,
        );
      }
    }
  }
}
