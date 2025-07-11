export interface Blockchain {
  name: string;
  chainId: number;
  hexChainId: string;
  rpcUrlEnvVar: string;
}

export const SUPPORTED_CHAINS: Record<string, Blockchain> = {
  ETHEREUM_SEPOLIA: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    hexChainId: '0xaa36a7',
    rpcUrlEnvVar: 'ETHEREUM_SEPOLIA_RPC_URL',
  },
  POLYGON_AMOY: {
    name: 'Polygon Amoy',
    chainId: 80002,
    hexChainId: '0x13882',
    rpcUrlEnvVar: 'POLYGON_AMOY_RPC_URL',
  },
  BSC_TESTNET: {
    name: 'BSC Testnet',
    chainId: 97,
    hexChainId: '0x61',
    rpcUrlEnvVar: 'BSC_TESTNET_RPC_URL',
  },
};

export const CHAIN_ID_TO_NETWORK: Record<string, Blockchain> = Object.values(
  SUPPORTED_CHAINS,
).reduce((acc: Record<string, Blockchain>, chain) => {
  acc[chain.hexChainId] = chain;
  return acc;
}, {});
