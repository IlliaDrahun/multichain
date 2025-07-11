import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, RedisService, TransactionStatus } from '@app/shared';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { NotificationsGateway } from '../gateways/notifications.gateway';

/**
 * Payload for transaction events (tx.sent, tx.status)
 */
interface TransactionEventPayload {
  transactionId: string;
  txHash?: string;
  status?: TransactionStatus;
  [key: string]: unknown;
}

@Injectable()
export class TransactionServiceService implements OnModuleInit {
  private readonly logger = new Logger(TransactionServiceService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly redisService: RedisService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      'TransactionService initialized and ready to receive messages',
    );
  }

  async create(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    const transaction = this.transactionRepository.create(createTransactionDto);
    await this.transactionRepository.save(transaction);

    const redisClient = this.redisService.getClient();
    await redisClient.xadd(
      'tx:to-sign',
      '*',
      'transactionId',
      transaction.id,
      'chainId',
      transaction.chainId,
      'contractAddress',
      transaction.contractAddress,
      'method',
      transaction.method,
      'args',
      JSON.stringify(transaction.args),
      'userAddress',
      transaction.userAddress,
    );

    return transaction;
  }

  /**
   * Handles a 'tx.sent' event from Kafka.
   * @param data The event payload
   */
  @EventPattern('tx.sent')
  async handleTransactionSent(data: unknown): Promise<void> {
    this.logger.log('🎉 RAW tx.sent event received:', JSON.stringify(data));
    const payload = this.parseTransactionEventPayload(data);
    if (!payload) {
      this.logger.error('Invalid tx.sent payload:', JSON.stringify(data));
      return;
    }
    const { transactionId, txHash } = payload;
    this.logger.log(`🎉 PARSED tx.sent event for txId: ${transactionId}`);
    const transaction = await this.transactionRepository.findOneBy({
      id: transactionId,
    });
    if (!transaction) {
      this.logger.error(`Transaction with id ${transactionId} not found.`);
      return;
    }
    transaction.txHash = txHash ?? '';
    transaction.status = TransactionStatus.PENDING;
    await this.transactionRepository.save(transaction);
    this.logger.log(
      `Transaction ${transaction.id} updated with hash ${transaction.txHash} and status PENDING`,
    );
    this.notificationsGateway.sendToUser(
      transaction.userAddress,
      'statusUpdate',
      transaction,
    );
  }

  /**
   * Handles a 'tx.status' event from Kafka.
   * @param data The event payload
   */
  @EventPattern('tx.status')
  async handleTransactionStatusUpdate(data: unknown): Promise<void> {
    this.logger.log('🎉 RAW tx.status event received:', JSON.stringify(data));
    const payload = this.parseTransactionEventPayload(data);
    if (!payload) {
      this.logger.error('Invalid tx.status payload:', JSON.stringify(data));
      return;
    }
    const { transactionId, status } = payload;
    this.logger.log(
      `🎉 PARSED tx.status event for txId: ${transactionId} with status ${status}`,
    );
    const transaction = await this.transactionRepository.findOneBy({
      id: transactionId,
    });
    if (!transaction) {
      this.logger.error(`Transaction with id ${transactionId} not found.`);
      return;
    }
    transaction.status = status as TransactionStatus;
    await this.transactionRepository.save(transaction);
    this.logger.log(
      `Transaction ${transaction.id} status updated to ${transaction.status}`,
    );
    if (transaction.status === TransactionStatus.REORGED) {
      this.notificationsGateway.sendToUser(transaction.userAddress, 'reorged', {
        id: transaction.id,
        status: transaction.status,
        txHash: transaction.txHash,
        blockNumber: transaction.blockNumber,
        updatedAt: transaction.updatedAt,
      });
    } else {
      this.notificationsGateway.sendToUser(
        transaction.userAddress,
        'statusUpdate',
        {
          id: transaction.id,
          status: transaction.status,
          txHash: transaction.txHash,
          blockNumber: transaction.blockNumber,
          updatedAt: transaction.updatedAt,
        },
      );
    }
  }

  /**
   * Parses and validates a transaction event payload.
   * @param data The raw event data
   * @returns The parsed payload or null if invalid
   */
  private parseTransactionEventPayload(
    data: unknown,
  ): TransactionEventPayload | null {
    if (typeof data === 'object' && data !== null) {
      const payload = (data as { value?: unknown }).value ?? data;
      if (
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as { transactionId?: unknown }).transactionId ===
          'string'
      ) {
        return payload as TransactionEventPayload;
      }
    }
    return null;
  }

  async findByUserAddress(userAddress: string): Promise<Transaction[]> {
    return this.transactionRepository.find({ where: { userAddress } });
  }
}
