import { utils } from 'ethers';

export const CollectionConfig = {
  contractName: 'WhoIsWho',
  tokenName: 'Who Is Who',
  tokenSymbol: 'WhoIsWho',
  maxSupply: 5000,
  presale: {
    wl: {
      price: 0.025,
      maxMintAmountPerTx: 5
    },
    og: {
      price: 0.025,
      maxMintAmountPerTx: 5
    },
    date: 1684108800
  },
  publicSale: {
    price: 0.03,
    maxMintAmountPerTx: 5,
    date: 1684368000
  },
  presaleInterval: 900,
  reservedTokens: 20,
  contractAddress: null,
  revealDate: 1684454400,
  metadataBaseURI: ''
};

export const CollectionArguments = [
  utils.parseEther(CollectionConfig.publicSale.price.toString()),
  CollectionConfig.publicSale.maxMintAmountPerTx,
  CollectionConfig.presale.date,
  CollectionConfig.publicSale.date,
  CollectionConfig.revealDate,
  utils.formatBytes32String(''),
  utils.formatBytes32String(''),
  ''
];
