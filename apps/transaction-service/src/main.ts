import { NestFactory } from '@nestjs/core';
import { TransactionServiceModule } from './transaction-service.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '@app/shared';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SocketIoAdapter } from './adapters/socket-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(TransactionServiceModule);

  app.useWebSocketAdapter(new SocketIoAdapter(app));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Transaction Service API')
    .setDescription('API for managing multichain transactions')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
void bootstrap();
