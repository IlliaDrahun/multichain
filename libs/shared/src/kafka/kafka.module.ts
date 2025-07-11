import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

@Module({})
export class KafkaModule {
  static registerClient(name: string): DynamicModule {
    return {
      module: KafkaModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name,
            useFactory: (configService: ConfigService) => ({
              transport: Transport.KAFKA,
              options: {
                client: {
                  clientId: name.toLowerCase() + '-producer',
                  brokers: (
                    configService.get<string>('KAFKA_BROKERS') ?? ''
                  ).split(','),
                  retry: {
                    initialRetryTime: 1000,
                    retries: 10,
                  },
                },
                producer: {
                  retry: {
                    initialRetryTime: 1000,
                    retries: 10,
                  },
                  allowAutoTopicCreation: true,
                },
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
