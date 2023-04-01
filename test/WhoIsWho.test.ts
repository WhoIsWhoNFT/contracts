import chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CollectionConfig, CollectionArguments } from '../config/collection.config';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';

chai.use(ChaiAsPromised);

function getPrice(price: number, mintAmount: number) {
  return utils.parseEther(price.toString()).mul(mintAmount);
}

function getProof(merkleTree: MerkleTree, address: string) {
  return merkleTree.getHexProof(keccak256(address));
}

async function timeTravel(travelTo: number) {
  await ethers.provider.send('evm_mine', []);
  await ethers.provider.send('evm_setNextBlockTimestamp', [travelTo]);
  await ethers.provider.send('evm_mine', []);
}

describe(`${CollectionConfig.contractName} test suite`, function () {
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let contract: Contract;
  let ogListedAddresses: SignerWithAddress[];
  let whitelistedAddresses: SignerWithAddress[];

  before(async function () {
    const signers = await ethers.getSigners();
    [owner, minter] = signers;

    // Get 3 hardhat test OG addresses starting from 7th index
    ogListedAddresses = signers.slice(7, 10);

    // Get 10 hardhat addresses starting from 10th index
    whitelistedAddresses = signers.slice(10, 22);
  });

  it('should deploy', async function () {
    const Contract = await ethers.getContractFactory(CollectionConfig.contractName);
    contract = await Contract.deploy(...CollectionArguments);
    await contract.deployed();
  });

  it('should return exact initial data for storage', async function () {
    expect(await contract.name()).to.equal(CollectionConfig.tokenName);
    expect(await contract.symbol()).to.equal(CollectionConfig.tokenSymbol);

    expect(await contract.PRESALE_PRICE_OG()).to.equal(
      getPrice(CollectionConfig.presale.og.price, 1)
    );
    expect(await contract.PRESALE_PRICE_WL()).to.equal(
      getPrice(CollectionConfig.presale.wl.price, 1)
    );
    expect(await contract.PRESALE_MAX_MINT_OG()).to.equal(
      CollectionConfig.presale.og.maxMintAmountPerTx
    );
    expect(await contract.PRESALE_MAX_MINT_WL()).to.equal(
      CollectionConfig.presale.wl.maxMintAmountPerTx
    );
    expect(await contract.PRESALE_INTERVAL()).to.equal(CollectionConfig.presaleInterval);
    expect(await contract.RESERVED_TOKENS()).to.equal(CollectionConfig.reservedTokens);

    expect(await contract.price()).to.equal(
      utils.parseEther(CollectionConfig.publicSale.price.toString())
    );
    expect(await contract.maxMintPerTx()).to.equal(
      CollectionConfig.publicSale.maxMintAmountPerTx
    );
    expect(await contract.presaleDate()).to.equal(CollectionConfig.presale.date);
    expect(await contract.publicSaleDate()).to.equal(CollectionConfig.publicSale.date);
    expect(await contract.revealDate()).to.equal(CollectionConfig.revealDate);
    expect(await contract.metadataBaseURI()).to.equal(CollectionConfig.metadataBaseURI);
  });

  it('should revert when member tries to mint before presale', async function () {
    await expect(
      contract.connect(minter).functions['mint(uint256)'](1)
    ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    await expect(
      contract.connect(ogListedAddresses[0]).functions['mint(uint256)'](1)
    ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    await expect(
      contract.connect(whitelistedAddresses[0]).functions['mint(uint256)'](1)
    ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
  });

  it('should OG mint during presale', async function () {
    // Build OG MerkleTree
    const leafNodes = ogListedAddresses.map((addr) => keccak256(addr.address));
    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getRoot();
    await (await contract.setOgMerkleRoot('0x' + rootHash.toString('hex'))).wait();

    // Time travel to presale date
    await timeTravel(CollectionConfig.presale.date);

    // OG Mint
    await contract
      .connect(ogListedAddresses[0])
      .ogMint(
        CollectionConfig.presale.og.maxMintAmountPerTx,
        getProof(merkleTree, ogListedAddresses[0].address),
        {
          value: getPrice(
            CollectionConfig.presale.og.price,
            CollectionConfig.presale.og.maxMintAmountPerTx
          )
        }
      );
    await contract
      .connect(ogListedAddresses[1])
      .ogMint(
        CollectionConfig.presale.og.maxMintAmountPerTx,
        getProof(merkleTree, ogListedAddresses[1].address),
        {
          value: getPrice(
            CollectionConfig.presale.og.price,
            CollectionConfig.presale.og.maxMintAmountPerTx
          )
        }
      );

    // Check balances
    expect(await contract.balanceOf(ogListedAddresses[0].address)).to.equal(
      CollectionConfig.presale.og.maxMintAmountPerTx
    );
    expect(await contract.balanceOf(ogListedAddresses[1].address)).to.equal(
      CollectionConfig.presale.og.maxMintAmountPerTx
    );
  });
});
