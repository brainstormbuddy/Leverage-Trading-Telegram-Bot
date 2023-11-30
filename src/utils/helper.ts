import { isProduction } from './config';
import { ChainStatus } from './types';

export const convertEnumToChain = (chain: number): string => {
  switch (chain) {
    case ChainStatus.Ethereum:
      return isProduction == true ? 'homestead' : 'goerli';
    case ChainStatus.Arbitrum:
      return isProduction == true
        ? process.env.ARBITRUM_MAINNET_RPC_URL
        : process.env.ARBITRUM_TESTNET_RPC_URL;
  }
};

export const convertChainToEnum = (chain: string): number => {
  if (isProduction) {
    switch (chain) {
      case 'ethereum':
        return ChainStatus.Ethereum;
      case 'arbitrum':
        return ChainStatus.Arbitrum;
    }
  } else {
    switch (chain) {
      case 'arbitrum':
        return ChainStatus.Arbitrum;
    }
    return -1;
  }
};

export const convertEnumToExplorer = (chain: number): string => {
  switch (chain) {
    case ChainStatus.Ethereum:
      return isProduction == true
        ? process.env.ETHEREUM_MAINNET_EXPLORER_URL
        : process.env.ETHEREUM_TESTNET_EXPLORER_URL;
    case ChainStatus.Arbitrum:
      return isProduction == true
        ? process.env.ARBITRUM_MAINNET_EXPLORER_URL
        : process.env.ARBITRUM_TESTNET_EXPLORER_URL;
  }
};

export const convertEnumToApi = (chain: number): string => {
  switch (chain) {
    case ChainStatus.Ethereum:
      return isProduction == true
        ? process.env.ETHEREUM_MAINNET_SCAN_API_URL
        : process.env.ETHEREUM_TESTNET_SCAN_API_URL;
    case ChainStatus.Arbitrum:
      return isProduction == true
        ? process.env.ARBITRUM_TESTNET_SCAN_API_URL
        : process.env.ARBITRUM_TESTNET_SCAN_API_URL;
  }
};

export const convertEnumToAPIKey = (chain: number): string => {
  switch (chain) {
    case ChainStatus.Ethereum:
      return process.env.ETHEREUM_SCAN_API_KEY;
    case ChainStatus.Arbitrum:
      return process.env.ARBITRUM_SCAN_API_KEY;
  }
};
