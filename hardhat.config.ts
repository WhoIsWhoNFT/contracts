import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-gas-reporter';
import dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.18',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIV_KEY as string],
      chainId: 11155111
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIV_KEY as string],
      chainId: 5
    },
    testnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      accounts: [process.env.PRIV_KEY as string]
    }
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY as string,
      sepolia: process.env.ETHERSCAN_API_KEY as string,
      bscTestnet: process.env.BSCSCAN_API_KEY as string
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    currency: 'USD'
  }
};

export default config;
