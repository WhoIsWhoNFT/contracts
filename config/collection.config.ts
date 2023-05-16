import { utils } from 'ethers';

export const CollectionConfig = {
  contractName: 'WhoIsWho',
  tokenName: 'Who Is Who',
  tokenSymbol: 'WhoIsWho',
  maxSupply: 5000,
  presale: {
    wl: {
      price: 0.025,
      maxTokenPerWallet: 2
    },
    og: {
      price: 0.02,
      maxTokenPerWallet: 3
    },
    date: 1684508400
  },
  publicSale: {
    price: 0.025,
    date: 1684526400,
    maxTokenPerWallet: 5
  },
  presaleInterval: 900, // 15 minutes in seconds
  reservedTokens: 50,
  revealDate: 1685131200,
  metadataBaseURI: '',
  contractURI: ''
};

const operators = [process.env.OPERATOR_1_ADDRESS, process.env.OPERATOR_2_ADDRESS, process.env.ADMIN_ADDRESS];

export const CollectionArguments = [
  process.env.ADMIN_ADDRESS,
  utils.parseEther(CollectionConfig.publicSale.price.toString()),
  CollectionConfig.publicSale.maxTokenPerWallet,
  CollectionConfig.presale.date,
  CollectionConfig.publicSale.date,
  CollectionConfig.revealDate,
  process.env?.OG_LISTS_MERKLE_ROOT ? `0x${process.env?.OG_LISTS_MERKLE_ROOT}` : utils.formatBytes32String(''),
  process.env?.WL_LISTS_MERKLE_ROOT ? `0x${process.env?.WL_LISTS_MERKLE_ROOT}` : utils.formatBytes32String(''),
  operators,
  process.env?.CONTRACT_URI ?? '',
  process.env?.HIDDEN_TOKEN_URI ?? ''
];
