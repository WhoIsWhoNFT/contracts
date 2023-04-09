import chai, { expect } from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import { Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CollectionConfig, CollectionArguments } from '../config/collection.config';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';

chai.use(ChaiAsPromised);

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

describe(`${CollectionConfig.contractName} test suite`, function () {
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let minter2: SignerWithAddress;
  let minter3: SignerWithAddress;
  let minter4: SignerWithAddress;
  let contract: Contract;
  let ogListedSigners: SignerWithAddress[];
  let whitelistedSigners: SignerWithAddress[];

  before(async function () {
    const signers = await ethers.getSigners();
    [owner, minter, minter2, minter3, minter4] = signers;

    // Get 3 hardhat test OG addresses starting from 7th index
    ogListedSigners = signers.slice(7, 10);

    // Get 10 hardhat addresses starting from 10th index
    whitelistedSigners = signers.slice(10, 22);
  });

  describe('#Deployment', () => {
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
        CollectionConfig.presale.og.maxMintPerTx
      );
      expect(await contract.PRESALE_MAX_MINT_WL()).to.equal(
        CollectionConfig.presale.wl.maxMintPerTx
      );
      expect(await contract.PUBLIC_MAX_MINT()).to.equal(
        CollectionConfig.publicSale.maxMintPerTx
      );
      expect(await contract.MAX_TOKEN_PER_WALLET()).to.equal(
        CollectionConfig.maxTokenPerWallet
      );
      expect(await contract.PRESALE_INTERVAL()).to.equal(
        CollectionConfig.presaleInterval
      );
      expect(await contract.RESERVED_TOKENS()).to.equal(CollectionConfig.reservedTokens);

      expect(await contract.price()).to.equal(
        utils.parseEther(CollectionConfig.publicSale.price.toString())
      );
      expect(await contract.presaleDate()).to.equal(CollectionConfig.presale.date);
      expect(await contract.publicSaleDate()).to.equal(CollectionConfig.publicSale.date);
      expect(await contract.revealDate()).to.equal(CollectionConfig.revealDate);
      expect(await contract.metadataBaseURI()).to.equal(CollectionConfig.metadataBaseURI);
    });

    it('should owner own all reserved tokens', async function () {
      const currentTotalSupply = parseInt(await contract.totalSupply());
      for (let i = 0; i < currentTotalSupply; i++) {
        expect(await contract.ownerOf(i)).to.equal(owner.address);
      }
    });
  });

  describe('#Presale (OG)', () => {
    let leafNodes: Buffer[];
    let merkleTree: MerkleTree;
    let rootHash: Buffer;

    before(async () => {
      // Build MerkleTree
      leafNodes = ogListedSigners.map((addr) => keccak256(addr.address));
      merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      rootHash = merkleTree.getRoot();
      await (await contract.setOgMerkleRoot('0x' + rootHash.toString('hex'))).wait();
    });

    it('should revert when OG member tries to mint before presale', async function () {
      await expect(
        contract
          .connect(ogListedSigners[0])
          .ogMint(
            CollectionConfig.presale.og.maxMintPerTx,
            getProof(merkleTree, ogListedSigners[0].address),
            {
              value: getPrice(
                CollectionConfig.presale.og.price,
                CollectionConfig.presale.og.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    });

    it('should OG mint without errors', async function () {
      // Should time travel to presale date
      await timeTravel(CollectionConfig.presale.date);

      // OG Mint #1
      let currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(ogListedSigners[0])
        .ogMint(
          CollectionConfig.presale.og.maxMintPerTx,
          getProof(merkleTree, ogListedSigners[0].address),
          {
            value: getPrice(
              CollectionConfig.presale.og.price,
              CollectionConfig.presale.og.maxMintPerTx
            )
          }
        );

      let totalSupplyAfter =
        currentTotalSupply + CollectionConfig.presale.og.maxMintPerTx;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(ogListedSigners[0].address);
      }

      // OG Mint #2
      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(ogListedSigners[1])
        .ogMint(
          CollectionConfig.presale.og.maxMintPerTx,
          getProof(merkleTree, ogListedSigners[1].address),
          {
            value: getPrice(
              CollectionConfig.presale.og.price,
              CollectionConfig.presale.og.maxMintPerTx
            )
          }
        );

      totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.og.maxMintPerTx;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(ogListedSigners[1].address);
      }

      // Check balances
      expect(await contract.balanceOf(ogListedSigners[0].address)).to.equal(
        CollectionConfig.presale.og.maxMintPerTx
      );

      expect(await contract.balanceOf(ogListedSigners[1].address)).to.equal(
        CollectionConfig.presale.og.maxMintPerTx
      );
    });

    it('should revert when non OG member tries to mint the NFT', async function () {
      await expect(
        contract
          .connect(minter)
          .ogMint(
            CollectionConfig.presale.og.maxMintPerTx,
            getProof(merkleTree, minter.address),
            {
              value: getPrice(
                CollectionConfig.presale.og.price,
                CollectionConfig.presale.og.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InvalidProof');
    });

    it('should revert when OG tries to mint with insufficient funds', async function () {
      await expect(
        contract
          .connect(ogListedSigners[2])
          .ogMint(
            CollectionConfig.presale.og.maxMintPerTx,
            getProof(merkleTree, ogListedSigners[2].address),
            {
              value: utils.parseEther('0.0001')
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InsufficientFunds');
    });

    it('should revert when OG tries to mint more than the allowed max token per tx', async function () {
      await expect(
        contract
          .connect(ogListedSigners[2])
          .ogMint(100, getProof(merkleTree, ogListedSigners[2].address), {
            value: getPrice(CollectionConfig.presale.og.price, 100)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert when OG tries to mint again after claiming an NFT', async function () {
      await expect(
        contract
          .connect(ogListedSigners[0])
          .ogMint(
            CollectionConfig.presale.og.maxMintPerTx,
            getProof(merkleTree, ogListedSigners[0].address),
            {
              value: getPrice(
                CollectionConfig.presale.og.price,
                CollectionConfig.presale.og.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__AlreadyClaimed');
    });
  });

  describe('#Presale (WL)', () => {
    let leafNodes: Buffer[];
    let merkleTree: MerkleTree;
    let rootHash: Buffer;

    before(async () => {
      // Build MerkleTree
      leafNodes = whitelistedSigners.map((addr) => keccak256(addr.address));
      merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      rootHash = merkleTree.getRoot();
      await (await contract.setWlMerkleRoot('0x' + rootHash.toString('hex'))).wait();
    });

    it('should revert when WL member tries to mint during OG presale', async function () {
      // Skip time to a minute
      await timeTravel(CollectionConfig.presale.date + 60);

      await expect(
        contract
          .connect(whitelistedSigners[0])
          .wlMint(
            CollectionConfig.presale.wl.maxMintPerTx,
            getProof(merkleTree, whitelistedSigners[0].address),
            {
              value: getPrice(
                CollectionConfig.presale.wl.price,
                CollectionConfig.presale.wl.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    });

    it('should WL mint without errors', async function () {
      // Should time travel
      await timeTravel(CollectionConfig.presale.date + CollectionConfig.presaleInterval);

      // WL Mint #1
      let currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(whitelistedSigners[0])
        .wlMint(
          CollectionConfig.presale.wl.maxMintPerTx,
          getProof(merkleTree, whitelistedSigners[0].address),
          {
            value: getPrice(
              CollectionConfig.presale.wl.price,
              CollectionConfig.presale.wl.maxMintPerTx
            )
          }
        );

      let totalSupplyAfter =
        currentTotalSupply + CollectionConfig.presale.wl.maxMintPerTx;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(whitelistedSigners[0].address);
      }

      // WL Mint #2
      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(whitelistedSigners[1])
        .wlMint(
          CollectionConfig.presale.wl.maxMintPerTx,
          getProof(merkleTree, whitelistedSigners[1].address),
          {
            value: getPrice(
              CollectionConfig.presale.wl.price,
              CollectionConfig.presale.wl.maxMintPerTx
            )
          }
        );

      totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.wl.maxMintPerTx;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(whitelistedSigners[1].address);
      }

      // Check balances
      expect(await contract.balanceOf(whitelistedSigners[0].address)).to.equal(
        CollectionConfig.presale.wl.maxMintPerTx
      );

      expect(await contract.balanceOf(whitelistedSigners[1].address)).to.equal(
        CollectionConfig.presale.wl.maxMintPerTx
      );
    });

    it('should revert when non WL member tries to mint the NFT', async function () {
      await expect(
        contract
          .connect(minter)
          .wlMint(
            CollectionConfig.presale.wl.maxMintPerTx,
            getProof(merkleTree, minter.address),
            {
              value: getPrice(
                CollectionConfig.presale.wl.price,
                CollectionConfig.presale.wl.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InvalidProof');

      await expect(
        contract
          .connect(ogListedSigners[0])
          .wlMint(
            CollectionConfig.presale.wl.maxMintPerTx,
            getProof(merkleTree, ogListedSigners[0].address),
            {
              value: getPrice(
                CollectionConfig.presale.wl.price,
                CollectionConfig.presale.wl.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InvalidProof');
    });

    it('should revert when WL tries to mint with insufficient funds', async function () {
      await expect(
        contract
          .connect(whitelistedSigners[2])
          .wlMint(
            CollectionConfig.presale.wl.maxMintPerTx,
            getProof(merkleTree, whitelistedSigners[2].address),
            {
              value: utils.parseEther('0.0001')
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InsufficientFunds');
    });

    it('should revert when WL tries to mint more than the allowed max mint per tx', async function () {
      await expect(
        contract
          .connect(whitelistedSigners[2])
          .wlMint(100, getProof(merkleTree, whitelistedSigners[2].address), {
            value: getPrice(CollectionConfig.presale.wl.price, 100)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert when WL tries to mint again after claiming an NFT', async function () {
      await expect(
        contract
          .connect(whitelistedSigners[0])
          .wlMint(
            CollectionConfig.presale.wl.maxMintPerTx,
            getProof(merkleTree, whitelistedSigners[0].address),
            {
              value: getPrice(
                CollectionConfig.presale.wl.price,
                CollectionConfig.presale.wl.maxMintPerTx
              )
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__AlreadyClaimed');
    });
  });

  describe('#Public Sale', () => {
    it('should revert when minter tries to mint during presale', async function () {
      await expect(
        contract.connect(minter).functions['mint(uint256)'](1, {
          value: getPrice(CollectionConfig.publicSale.price, 1)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    });

    it('should bulk mint without errors', async function () {
      // Should time travel
      await timeTravel(CollectionConfig.publicSale.date);

      // Minter #1
      let currentTotalSupply = parseInt(await contract.totalSupply());
      await contract.connect(minter).functions['mint(uint256)'](1, {
        value: getPrice(CollectionConfig.publicSale.price, 1)
      });

      let totalSupplyAfter = currentTotalSupply + 1;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter.address);
      }

      // Minter #2
      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract.connect(minter2).functions['mint(uint256)'](3, {
        value: getPrice(CollectionConfig.publicSale.price, 3)
      });

      totalSupplyAfter = currentTotalSupply + 3;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter2.address);
      }

      // Minter #3
      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(minter3)
        .functions['mint(uint256)'](CollectionConfig.publicSale.maxMintPerTx, {
          value: getPrice(
            CollectionConfig.publicSale.price,
            CollectionConfig.publicSale.maxMintPerTx
          )
        });

      totalSupplyAfter = currentTotalSupply + CollectionConfig.publicSale.maxMintPerTx;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter3.address);
      }

      // Minter #4 (OG)
      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract.connect(ogListedSigners[0]).functions['mint(uint256)'](5, {
        value: getPrice(CollectionConfig.publicSale.price, 5)
      });

      totalSupplyAfter = currentTotalSupply + 5;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(ogListedSigners[0].address);
      }

      // Check balances
      expect(await contract.balanceOf(minter.address)).to.equal(1);
      expect(await contract.balanceOf(minter2.address)).to.equal(3);
      expect(await contract.balanceOf(minter3.address)).to.equal(
        CollectionConfig.publicSale.maxMintPerTx
      );

      // OG already minted 2 tokens in the previous test case
      expect(await contract.balanceOf(ogListedSigners[0].address)).to.equal(7);
    });

    it('should revert when minter tries to mint more than the allowed total token per wallet', async function () {
      const balance = await contract.balanceOf(minter3.address);
      const amount = CollectionConfig.maxTokenPerWallet - parseInt(balance) + 1;

      await expect(
        contract.connect(minter3).functions['mint(uint256)'](amount, {
          value: getPrice(CollectionConfig.publicSale.price, amount)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert when mint amount is 0', async function () {
      await expect(
        contract.connect(minter4).functions['mint(uint256)'](0)
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__ZeroMintAmount');
    });

    it('should revert when minter tries to mint with insufficient funds', async function () {
      await expect(
        contract.connect(minter4).functions['mint(uint256)'](1, {
          value: utils.parseEther('0.0001')
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InsufficientFunds');
    });

    it('should revert when minter tries to mint more than the allowed max mint per tx', async function () {
      await expect(
        contract.connect(minter4).functions['mint(uint256)'](100, {
          value: getPrice(CollectionConfig.publicSale.price, 100)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });
  });
});
