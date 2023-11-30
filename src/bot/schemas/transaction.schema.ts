import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ChainStatus } from 'src/utils/types';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Transaction {
  @Prop({ required: true })
  chatId: number;

  @Prop({ required: false })
  walletPrivateKey: string;

  @Prop({ required: false })
  tokenName: string;

  @Prop({ required: false })
  tokenSymbol: string;

  @Prop({ required: false })
  tokenAmount: string;

  @Prop({ required: false })
  tokenContractAddress: string;

  @Prop({ required: false })
  brokerId: string;

  @Prop({
    required: false,
    enum: [ChainStatus.Ethereum, ChainStatus.Arbitrum],
    default: ChainStatus.Arbitrum,
  })
  chainType: number;

  @Prop({ required: false })
  depositAmount: number;

  @Prop({ required: false })
  withdrawAmount: number;

  @Prop({ required: false })
  idDeposited: number;

  @Prop({ required: false })
  isWithdrawed: number;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
