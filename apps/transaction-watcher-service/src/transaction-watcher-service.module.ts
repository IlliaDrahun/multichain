import { Module } from '@nestjs/common';
import { TransactionWatcherServiceService } from './transaction-watcher-service.service';
import {
  BlockchainModule,
  DatabaseModule,
  KafkaModule,
  RedisModule,
  Transaction,
} from '@app/shared';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    TypeOrmModule.forFeature([Transaction]),
    BlockchainModule,
    RedisModule,
    KafkaModule.registerClient('TRANSACTION_WATCHER_CLIENT'),
  ],
  providers: [TransactionWatcherServiceService],
})
export class TransactionWatcherServiceModule {}
