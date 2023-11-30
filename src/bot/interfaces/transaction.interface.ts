export interface ITransaction {
  chatId: number;
  walletPrivateKey?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenContractAddress?: string;
  brokerId?: string;
  chainType?: number;
  depositAmount?: number;
  withdrawAmount?: number;
  isVerified?: boolean;
}

export interface IMatchParams {
  chatId: number;
  walletPrivateKey?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenContractAddress?: string;
  brokerId?: string;
  depositAmount?: number;
  withdrawAmount?: number;
}
