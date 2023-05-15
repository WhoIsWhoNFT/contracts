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
    date: 1684172700
  },
  publicSale: {
    price: 0.03,
    date: 1684173900,
    maxTokenPerWallet: 5
  },
  presaleInterval: 900, // 15 minutes in seconds
  reservedTokens: 50,
  revealDate: 1684174200,
  metadataBaseURI: ''
};

export const CollectionArguments = [
  process.env.ADMIN_ADDRESS,
  utils.parseEther(CollectionConfig.publicSale.price.toString()),
  CollectionConfig.publicSale.maxTokenPerWallet,
  CollectionConfig.presale.date,
  CollectionConfig.publicSale.date,
  CollectionConfig.revealDate,
  `0x${process.env.OG_LISTS_MERKLE_ROOT ?? ''}`,
  `0x${process.env.WHITELISTS_MERKLE_ROOT ?? ''}`,
  [process.env.OPERATOR_1_ADDRESS, process.env.OPERATOR_2_ADDRESS, process.env.ADMIN_ADDRESS],
  process.env.BASE_URI
];
