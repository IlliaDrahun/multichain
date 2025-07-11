import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule, RedisModule, Transaction } from '@app/shared';
import { validationSchema } from '@app/shared/config/schema';
import { TransactionServiceController } from './transaction-service.controller';
import { TransactionServiceService } from './transaction-service.service';
import { NotificationsGateway } from './notifications.gateway';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([Transaction]),
    RedisModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [TransactionServiceController],
  providers: [
    TransactionServiceService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    NotificationsGateway,
    KafkaConsumerService,
  ],
})
export class TransactionServiceModule {}
