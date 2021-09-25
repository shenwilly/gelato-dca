import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "solidity-coverage";

import { HardhatUserConfig } from "hardhat/types";
import {
  ETHERSCAN_API_KEY,
  MAINNET_PRIVATE_KEY,
  NETWORK_FORK_URL,
  NETWORK_MAINNET_URL,
  NETWORK_RINKEBY_URL,
  NETWORK_ROPSTEN_URL,
  RINKEBY_PRIVATE_KEY,
  ROPSTEN_PRIVATE_KEY,
} from "./constants";

import "./tasks/accounts";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0, // workaround from https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136 . Remove when that issue is closed.
      // allowUnlimitedContractSize: true,
      forking: {
        url: NETWORK_FORK_URL,
        blockNumber: 13293605,
      },
      // hardfork: "berlin"
    },
    mainnet: {
      url: NETWORK_MAINNET_URL,
      accounts: [MAINNET_PRIVATE_KEY],
    },
    rinkeby: {
      url: NETWORK_RINKEBY_URL,
      accounts: [RINKEBY_PRIVATE_KEY],
    },
    ropsten: {
      url: NETWORK_ROPSTEN_URL,
      accounts: [ROPSTEN_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: {
    enabled: false,
    currency: "eth",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
};

export default config;
