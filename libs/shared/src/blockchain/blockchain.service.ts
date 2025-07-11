import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Wallet } from 'ethers';
import { SUPPORTED_CHAINS } from './constants';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private providers: Map<string, JsonRpcProvider> = new Map();
  private signer: Wallet;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const privateKey = this.configService.get<string>('SIGNER_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('SIGNER_PRIVATE_KEY not configured.');
    }

    for (const chain of Object.values(SUPPORTED_CHAINS)) {
      try {
        const rpcUrl = this.configService.get<string>(chain.rpcUrlEnvVar);
        if (!rpcUrl) {
          throw new Error(
            `RPC URL environment variable ${chain.rpcUrlEnvVar} not set.`,
          );
        }
        this.providers.set(chain.hexChainId, new JsonRpcProvider(rpcUrl));
      } catch (e: unknown) {
        this.logger.warn(
          `Failed to initialize provider for chain ${chain.name} (${chain.hexChainId}). Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
        );
      }
    }

    this.signer = new Wallet(privateKey);
  }

  getProvider(chainId: string): JsonRpcProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`Provider for chainId ${chainId} not found.`);
    }
    return provider;
  }

  getSigner(): Wallet {
    return this.signer;
  }

  getSupportedChainIds(): IterableIterator<string> {
    return this.providers.keys();
  }
}
