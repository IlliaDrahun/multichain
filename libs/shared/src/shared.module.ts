import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';
import { DatabaseModule } from './database/database.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [DatabaseModule, BlockchainModule, RedisModule, KafkaModule],
  providers: [SharedService],
  exports: [
    SharedService,
    DatabaseModule,
    BlockchainModule,
    RedisModule,
    KafkaModule,
  ],
})
export class SharedModule {}
