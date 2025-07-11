import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TransactionStatus {
  PENDING_SIGN = 'PENDING_SIGN',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REORGED = 'REORGED',
}

@Entity({ name: 'transactions' })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userAddress: string;

  @Column()
  chainId: string;

  @Column()
  contractAddress: string;

  @Column()
  method: string;

  @Column('simple-json')
  args: string[];

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  redisStreamMessageId: string;

  @Column({ type: 'bigint', nullable: true })
  blockNumber: string | null;

  @Column({ type: 'bigint', nullable: true })
  nonce: string | null;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING_SIGN,
  })
  status: TransactionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
