# Gelato DCA Dapp

Smart contracts for doing Dollar Cost Averaging, powered by Gelato.

## Installation

```
yarn && yarn install
yarn prepare
```

## Available Functionalities

### Clean and compile contracts
```
yarn build
```

### Run test
```
yarn test
```

### Check test coverage
```
yarn coverage
```

### Run script
```
yarn hardhat run PATH_TO_SCRIPT
```

### Run task
```
yarn hardhat HARDHAT_TASK
```

### Etherscan verification
Deploy your contract address first before verifying.

```
yarn hardhat run --network ropsten scripts/deploy.ts
yarn verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello"
```
