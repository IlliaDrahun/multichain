import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DatabaseModule,
  RedisModule,
  Transaction,
  BlockchainModule,
  KafkaModule,
} from '@app/shared';
import { validationSchema } from '@app/shared/config/schema';
import { TransactionSenderServiceService } from './services/transaction-sender-service.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([Transaction]),
    RedisModule,
    BlockchainModule,
    KafkaModule.registerClient('TRANSACTION_SENDER_CLIENT'),
  ],
  providers: [TransactionSenderServiceService],
})
export class TransactionSenderServiceModule {}
