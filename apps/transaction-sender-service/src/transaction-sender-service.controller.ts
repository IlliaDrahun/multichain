import { Controller } from '@nestjs/common';
import { TransactionSenderServiceService } from './transaction-sender-service.service';

@Controller()
export class TransactionSenderServiceController {
  constructor(
    private readonly transactionSenderServiceService: TransactionSenderServiceService,
  ) {}
}
