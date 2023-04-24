import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-gas-reporter';
import dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.8.18',
  networks: {
    hardhat: {},
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIV_KEY as string],
      chainId: 11155111
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    currency: 'USD'
  }
};

export default config;
