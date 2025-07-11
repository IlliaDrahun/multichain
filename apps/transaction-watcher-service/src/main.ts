import { NestFactory } from '@nestjs/core';
import { TransactionWatcherServiceModule } from './transaction-watcher-service.module';

async function bootstrap() {
  const app = await NestFactory.create(TransactionWatcherServiceModule);
  await app.listen(3000);
}
void bootstrap();
