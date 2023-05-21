import chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { BigNumber, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CollectionConfig, CollectionArguments } from '../config/collection.config';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';

chai.use(ChaiAsPromised);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

function getRole(name: string) {
  if (!name || name === 'DEFAULT_ADMIN_ROLE') {
    return ZERO_ADDRESS;
  }
  return '0x' + Buffer.from(ethers.utils.solidityKeccak256(['string'], [name]).slice(2), 'hex').toString('hex');
}

function getPrice(price: number, mintAmount: number | bigint) {
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

describe('Relayer test suite', function () {
  let [deployer, minter, minter2, minter3, minter4, operator1, operator2, owner]: SignerWithAddress[] = [];
  let whitelistedSigners: SignerWithAddress[];
  let wlMerkleTree: MerkleTree;
  let relayer: Contract;
  let collection: Contract;

  before(async function () {
    const signers = await ethers.getSigners();
    [deployer, minter, minter2, minter3, minter4, operator1, operator2, owner] = signers;
    whitelistedSigners = signers.slice(11, 20);
  });

  it('should deploy collection contract', async function () {
    const Collection = await ethers.getContractFactory(CollectionConfig.contractName);

    collection = await Collection.deploy(
      CollectionArguments[0],
      utils.formatBytes32String(''),
      utils.formatBytes32String(''),
      CollectionArguments[3]
    );

    await collection.deployed();
  });

  it('should deploy relayer contract', async function () {
    // Build merkle tree for WL
    const wlLeafNodes = whitelistedSigners.map((addr) => keccak256(addr.address));
    wlMerkleTree = new MerkleTree(wlLeafNodes, keccak256, { sortPairs: true });
    const wlRootHash = wlMerkleTree.getRoot();

    const Relayer = await ethers.getContractFactory('Relayer');
    relayer = await Relayer.deploy(collection.address, '0x' + wlRootHash.toString('hex'));
    relayer.deployed();
  });

  it('set relayer to operators role', async function () {
    await collection.connect(owner).grantRole(getRole('OPERATOR_ROLE'), relayer.address);
    expect(await collection.hasRole(getRole('OPERATOR_ROLE'), relayer.address)).to.be.true;
  });

  it('should revert whitelist mint before presale', async function () {
    await expect(
      relayer.connect(whitelistedSigners[0]).mintRelay(1, getProof(wlMerkleTree, whitelistedSigners[0].address), {
        value: getPrice(CollectionConfig.relay.price, 1)
      })
    ).to.be.revertedWithCustomError(relayer, 'Relayer__InvalidCall');
  });

  it('should relay presale whitelist mint', async function () {
    await relayer.setPresaleStartDate(parseInt(String(new Date('January 1, 2023 00:00:00').getTime() / 1000)));
    await relayer.connect(whitelistedSigners[0]).mintRelay(1, getProof(wlMerkleTree, whitelistedSigners[0].address), {
      value: getPrice(CollectionConfig.relay.price, 1)
    });
    await relayer.connect(whitelistedSigners[1]).mintRelay(3, getProof(wlMerkleTree, whitelistedSigners[1].address), {
      value: getPrice(CollectionConfig.relay.price, 3)
    });
    await relayer.connect(whitelistedSigners[2]).mintRelay(5, getProof(wlMerkleTree, whitelistedSigners[2].address), {
      value: getPrice(CollectionConfig.relay.price, 5)
    });
    expect(await collection.balanceOf(whitelistedSigners[0].address)).to.be.equal(1);
    expect(await collection.balanceOf(whitelistedSigners[1].address)).to.be.equal(3);
    expect(await collection.balanceOf(whitelistedSigners[2].address)).to.be.equal(5);

    const total = getPrice(CollectionConfig.relay.price, 1)
      .add(getPrice(CollectionConfig.relay.price, 3))
      .add(getPrice(CollectionConfig.relay.price, 5));

    expect(await ethers.provider.getBalance(collection.address)).to.be.equal(total);
  });

  it('should set presale end date', async function () {
    await relayer.setPresaleEndDate(parseInt(String(new Date('January 1, 2023 00:00:00').getTime() / 1000)));
  });

  it('should revert whitelist mint after the presale has ended', async function () {
    await expect(
      relayer.connect(whitelistedSigners[0]).mintRelay(1, getProof(wlMerkleTree, whitelistedSigners[0].address), {
        value: getPrice(CollectionConfig.relay.price, 1)
      })
    ).to.be.revertedWithCustomError(relayer, 'Relayer__InvalidCall');
  });
});
