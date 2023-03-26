import chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CollectionConfig, CollectionArguments } from '../config/collection.config';

chai.use(ChaiAsPromised);

function getPrice(price: number, mintAmount: number) {
  return utils.parseEther(price.toString()).mul(mintAmount);
}

describe(`${CollectionConfig.contractName} test suite`, function () {
  let owner!: SignerWithAddress;
  let contract!: Contract;

  before(async function () {
    [owner] = await ethers.getSigners();
  });

  it('should deploy', async function () {
    const Contract = await ethers.getContractFactory(CollectionConfig.contractName);
    contract = await Contract.deploy(...CollectionArguments);
    await contract.deployed();
  });

  it('should return exact initial data for storage', async function () {
    expect(await contract.name()).to.equal(CollectionConfig.tokenName);
    expect(await contract.symbol()).to.equal(CollectionConfig.tokenSymbol);

    expect(await contract.PRESALE_PRICE_OG()).to.equal(getPrice(CollectionConfig.presale.og.price, 1));
    expect(await contract.PRESALE_PRICE_WL()).to.equal(getPrice(CollectionConfig.presale.wl.price, 1));
    expect(await contract.PRESALE_MAX_MINT_OG()).to.equal(CollectionConfig.presale.og.maxMintAmountPerTx);
    expect(await contract.PRESALE_MAX_MINT_WL()).to.equal(CollectionConfig.presale.wl.maxMintAmountPerTx);
    expect(await contract.PRESALE_INTERVAL()).to.equal(CollectionConfig.presaleInterval);
    expect(await contract.RESERVED_TOKENS()).to.equal(CollectionConfig.reservedTokens);

    expect(await contract.price()).to.equal(utils.parseEther(CollectionConfig.publicSale.price.toString()));
    expect(await contract.maxMintPerTx()).to.equal(CollectionConfig.publicSale.maxMintAmountPerTx);
    expect(await contract.presaleDate()).to.equal(CollectionConfig.presale.date);
    expect(await contract.publicSaleDate()).to.equal(CollectionConfig.publicSale.date);
    expect(await contract.revealDate()).to.equal(CollectionConfig.revealDate);
    expect(await contract.metadataBaseURI()).to.equal(CollectionConfig.metadataBaseURI);
    expect(await contract.paused()).to.false;
  });
});
