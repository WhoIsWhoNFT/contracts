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
      price: 0.025,
      maxTokenPerWallet: 3
    },
    date: 1684108800
  },
  publicSale: {
    price: 0.03,
    date: 1684368000,
    maxTokenPerWallet: 5
  },
  presaleInterval: 900, // 15 minutes in seconds
  reservedTokens: 50,
  revealDate: 1684454400,
  metadataBaseURI: ''
};

export const CollectionArguments = [
  utils.parseEther(CollectionConfig.publicSale.price.toString()),
  CollectionConfig.publicSale.maxTokenPerWallet,
  CollectionConfig.presale.date,
  CollectionConfig.publicSale.date,
  CollectionConfig.revealDate,
  utils.formatBytes32String(''),
  utils.formatBytes32String(''),
  ''
];
