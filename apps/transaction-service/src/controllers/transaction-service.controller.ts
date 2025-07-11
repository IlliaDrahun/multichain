import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { TransactionServiceService } from '../services/transaction-service.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Transaction } from '@app/shared';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionServiceController {
  constructor(
    private readonly transactionServiceService: TransactionServiceService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({
    status: 201,
    description: 'The transaction has been successfully created.',
    type: Transaction,
  })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  create(
    @Body() createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionServiceService.create(createTransactionDto);
  }

  @Get(':userAddress')
  @ApiOperation({ summary: 'Get all transactions for a user' })
  @ApiResponse({
    status: 200,
    description: 'List of user transactions.',
    type: [Transaction],
  })
  findByUserAddress(
    @Param('userAddress') userAddress: string,
  ): Promise<Transaction[]> {
    return this.transactionServiceService.findByUserAddress(userAddress);
  }
}
