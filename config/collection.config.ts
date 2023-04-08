import { utils } from 'ethers';

export const CollectionConfig = {
  contractName: 'WhoIsWho',
  tokenName: 'Who Is Who',
  tokenSymbol: 'WhoIsWho',
  maxSupply: 5000,
  presale: {
    wl: {
      price: 0.025
    },
    og: {
      price: 0.025
    },
    date: 1684108800
  },
  publicSale: {
    price: 0.03,
    date: 1684368000
  },
  presaleInterval: 900, // 15 minutes in seconds
  reservedTokens: 50,
  contractAddress: null,
  revealDate: 1684454400,
  maxTokenPerWallet: 1,
  maxTokenPerOgWallet: 2,
  metadataBaseURI: ''
};

export const CollectionArguments = [
  utils.parseEther(CollectionConfig.publicSale.price.toString()),
  CollectionConfig.presale.date,
  CollectionConfig.publicSale.date,
  CollectionConfig.revealDate,
  utils.formatBytes32String(''),
  utils.formatBytes32String(''),
  ''
];
