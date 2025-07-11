import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({
    description: 'The chain ID where the transaction will be executed.',
    example: '0xaa36a7',
  })
  @IsString()
  @IsNotEmpty()
  chainId: string;

  @ApiProperty({
    description: 'The address of the smart contract to interact with.',
    example: '0x...',
  })
  @IsString()
  @IsNotEmpty()
  contractAddress: string;

  @ApiProperty({
    description: 'The name of the method to call on the smart contract.',
    example: 'transfer',
  })
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiProperty({
    description: 'An array of arguments to pass to the smart contract method.',
    example: ['0xReceiver', '1000000000000000000'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  args: string[];

  @ApiProperty({
    description: 'The address of the user initiating the transaction.',
    example: '0x000',
  })
  @IsString()
  @IsNotEmpty()
  userAddress: string;
}
