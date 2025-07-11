# Multichain Transaction Microservices System

A monorepo system of **three microservices** for managing blockchain transactions across Ethereum, Polygon, and BSC testnets. The services interact via **Redis Streams** and **Kafka**, and persist data in a single PostgreSQL instance.

## Architecture

- **Monorepo** (NestJS, TypeScript)
- **Single PostgreSQL instance** for all services
- **Redis Streams** for inter-service communication
- **Kafka** for event-driven updates and notifications
- **WebSocket notifications** for real-time transaction status
- **Swagger UI** for API documentation
- **Docker Compose** for local orchestration

### Services

#### 1. Transaction Service

- **REST API** to create transactions:
  ```json
  {
    "chainId": "0x1",
    "contractAddress": "0x...",
    "method": "transfer",
    "args": ["0xReceiver", "1000000000000000000"],
    "userAddress": "0x000"
  }
  ```
- Forms a transaction and sends it to **Redis Stream `tx:to-sign`**
- Saves status `PENDING_SIGN` in PostgreSQL
- **REST API**: `GET /tx/:userAddress` — returns all user transactions and statuses
- Consumes **Kafka** topics (`tx.sent`, `tx.status`), updates DB, and sends **WebSocket** notifications to the frontend
- **Rate limiting** enabled

#### 2. TransactionSender Service

- Reads from **Redis Stream `tx:to-sign`**
- Signs and sends transactions using **ethers.js**
- Emits to **Kafka topic `tx.sent`**:
  ```json
  {
    "txHash": "0x...",
    "chain": "ethereum",
    "userId": "user_123"
  }
  ```
- Saves status `PENDING` in PostgreSQL
- Retries on network errors

#### 3. TransactionWatcher Service

- Subscribes to **Transfer events** on all supported chains (via ethers.js)
- On event, checks if txHash belongs to the system
- Emits to **Kafka topic `tx.status`**:
  ```json
  {
    "txHash": "0x...",
    "status": "CONFIRMED",
    "userId": "user_123"
  }
  ```
- Handles chain reorganizations (waits for N confirmations)

---

## Technologies

- **NestJS** (modular, scalable Node.js framework)
- **ethers.js** (blockchain interaction)
- **Redis Streams** (message queue)
- **Kafka** (event bus, partitioned by chainId)
- **PostgreSQL** (TypeORM ORM)
- **WebSocket** (real-time notifications)
- **Swagger UI** (API docs)
- **Docker Compose** (local orchestration)

---

## WebSocket Notifications

- The Transaction Service exposes a WebSocket gateway for real-time transaction status updates.
- When a transaction status changes (e.g., sent, confirmed, failed), the backend pushes a notification to the connected frontend client.
- This allows users to receive instant feedback about their transaction progress without polling the API.
- WebSocket server runs on the same port as the Transaction Service (default: 3000).

---

## Multichain Configuration

- Supports Ethereum Sepolia, Polygon Amoy, BSC Testnet
- All chain RPC URLs and confirmations are set via environment variables

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js (for local dev, optional)

### Environment Variables

Create a `.env` file in the project root with the following (example values):

```
ETHEREUM_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
POLYGON_AMOY_RPC_URL=https://polygon-amoy.infura.io/v3/your-key
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
SIGNER_PRIVATE_KEY=your_private_key
```

### Launch with Docker Compose

```bash
docker-compose up --build
```

- Transaction Service: http://localhost:3000 (Swagger UI at `/api`)
- Kafka UI: http://localhost:8080
- PostgreSQL: localhost:5432 (user: user, password: password, db: multichain)
- Redis: localhost:6379
- You can use the included `websocket-test-client.html` file in the project root to test WebSocket notifications. Open it in your browser and connect to ws://localhost:3000 to receive real-time transaction status updates.

### Local Development

Install dependencies:

```bash
npm install
```

Run any service locally (example for transaction-service):

```bash
npm run start:dev transaction-service
```

---

## API Documentation

- Swagger UI available at `http://localhost:3000/api` (Transaction Service)

---

## Project Structure

```
apps/
  transaction-service/
  transaction-sender-service/
  transaction-watcher-service/
libs/
  shared/
    blockchain/
    database/
    entities/
    filters/
    kafka/
    redis/
```

---

## Features

- **Monorepo**: All services and shared code in one repository
- **Single DB**: All services use the same PostgreSQL instance
- **Multichain**: Easily add new chains via config
- **Transaction simulation**: Uses `eth_call`/`estimateGas` before sending
- **Retry logic**: Network errors are retried automatically
- **Chain reorg safety**: Waits for N confirmations before marking as confirmed
- **Rate limiting**: Prevents API abuse
- **WebSocket notifications**: Real-time status updates for users

---

## License

MIT
