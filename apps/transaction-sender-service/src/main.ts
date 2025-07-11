import { NestFactory } from '@nestjs/core';
import { TransactionSenderServiceModule } from './transaction-sender-service.module';

async function bootstrap() {
  const app = await NestFactory.create(TransactionSenderServiceModule);
  await app.listen(3000);
}
void bootstrap();
