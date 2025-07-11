import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, EachMessagePayload } from 'kafkajs';
import { TransactionServiceService } from './transaction-service.service';

import type { TransactionStatus } from '@app/shared';

interface TransactionEventPayload {
  transactionId: string;
  txHash?: string;
  status?: TransactionStatus;
  [key: string]: unknown;
}

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionService: TransactionServiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    this.kafka = new Kafka({
      clientId: 'transaction-service-direct-consumer',
      brokers: (this.configService.get<string>('KAFKA_BROKERS') ?? '').split(
        ',',
      ),
    });

    this.consumer = this.kafka.consumer({
      groupId: 'transaction-direct-consumer',
    });

    await this.connectWithRetry();
  }

  private async connectWithRetry(maxRetries = 10, delay = 2000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `Attempting to connect to Kafka (attempt ${attempt}/${maxRetries})`,
        );

        await this.consumer.connect();
        this.logger.log('✅ Connected to Kafka successfully');

        await this.consumer.subscribe({
          topics: ['tx.sent', 'tx.status'],
          fromBeginning: false,
        });
        this.logger.log('✅ Subscribed to topics: tx.sent, tx.status');

        await this.consumer.run({
          eachMessage: async (payload: EachMessagePayload) => {
            await this.handleMessage(payload);
          },
        });
        this.logger.log('✅ Kafka consumer is running');
        return;
      } catch (error) {
        this.logger.warn(
          `Kafka connection attempt ${attempt} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (attempt === maxRetries) {
          this.logger.error('Failed to connect to Kafka after maximum retries');
          return;
        }

        this.logger.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000);
      }
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const value = message.value?.toString('utf8');
    this.logger.log(
      `🎉 Received message from ${topic} partition ${partition}: ${value}`,
    );
    try {
      const cleanValue = value?.trim().replace(/\r?\n/g, '');
      const parsed: unknown = JSON.parse(cleanValue || '{}');
      this.logger.log(`📝 Parsed data:`, JSON.stringify(parsed));

      const data: TransactionEventPayload | null =
        this.parseTransactionEventPayload(parsed);
      if (!data) {
        this.logger.error(`Invalid event payload: ${JSON.stringify(parsed)}`);
        return;
      }
      if (topic === 'tx.sent') {
        await this.transactionService.handleTransactionSent(data);
        this.logger.log(`✅ Successfully processed tx.sent message`);
      } else if (topic === 'tx.status') {
        await this.transactionService.handleTransactionStatusUpdate(data);
        this.logger.log(`✅ Successfully processed tx.status message`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error processing message from ${topic}:`,
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error(`Raw message value: "${value}"`);
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
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { transactionId?: unknown }).transactionId === 'string'
    ) {
      return data as TransactionEventPayload;
    }
    return null;
  }
}
