import * as Joi from 'joi';

export const validationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  KAFKA_BROKERS: Joi.string().required(),
  SIGNER_PRIVATE_KEY: Joi.string().required(),
  CHAIN_CONFIRMATIONS: Joi.number().default(3),
  ETHEREUM_SEPOLIA_RPC_URL: Joi.string().required(),
  POLYGON_AMOY_RPC_URL: Joi.string().required(),
  BSC_TESTNET_RPC_URL: Joi.string().required(),
});
