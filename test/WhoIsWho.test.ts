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

describe(`${CollectionConfig.contractName} test suite`, function () {
  let [deployer, minter, minter2, minter3, minter4, operator1, operator2, owner]: SignerWithAddress[] = [];
  let contract: Contract;
  let ogListedSigners: SignerWithAddress[];
  let whitelistedSigners: SignerWithAddress[];

  let wlMerkleTree: MerkleTree;
  let ogMerkleTree: MerkleTree;

  before(async function () {
    const signers = await ethers.getSigners();
    [deployer, minter, minter2, minter3, minter4, operator1, operator2, owner] = signers;

    // Get 3 hardhat test OG addresses starting from 8th index
    ogListedSigners = signers.slice(8, 11);

    // Get 9 hardhat addresses starting from 11th index
    whitelistedSigners = signers.slice(11, 20);
  });

  describe('#Deployment', async function () {
    it('should deploy', async function () {
      const Contract = await ethers.getContractFactory(CollectionConfig.contractName);
      contract = await Contract.deploy(...CollectionArguments);
      await contract.deployed();
    });

    it('should owner is the default admin', async function () {
      expect(await contract.hasRole(getRole('DEFAULT_ADMIN_ROLE'), owner.address)).to.be.true;
    });

    it('should build merkle tree and update root hash', async function () {
      // Build merkle tree for OG
      const ogLeafNodes = ogListedSigners.map((addr) => keccak256(addr.address));
      ogMerkleTree = new MerkleTree(ogLeafNodes, keccak256, { sortPairs: true });
      const ogRootHash = ogMerkleTree.getRoot();
      await (await contract.connect(owner).setOgMerkleRoot('0x' + ogRootHash.toString('hex'))).wait();

      // Build merkle tree for WL
      const wlLeafNodes = whitelistedSigners.map((addr) => keccak256(addr.address));
      wlMerkleTree = new MerkleTree(wlLeafNodes, keccak256, { sortPairs: true });
      const wlRootHash = wlMerkleTree.getRoot();
      await (await contract.connect(owner).setWlMerkleRoot('0x' + wlRootHash.toString('hex'))).wait();
    });

    it('should return exact initial data for storage', async function () {
      expect(await contract.name()).to.equal(CollectionConfig.tokenName);
      expect(await contract.symbol()).to.equal(CollectionConfig.tokenSymbol);

      expect(await contract.PRESALE_PRICE_OG()).to.equal(getPrice(CollectionConfig.presale.og.price, 1));
      expect(await contract.PRESALE_PRICE_WL()).to.equal(getPrice(CollectionConfig.presale.wl.price, 1));
      expect(await contract.PRESALE_MAX_TOKEN_PER_OG()).to.equal(CollectionConfig.presale.og.maxTokenPerWallet);
      expect(await contract.PRESALE_MAX_TOKEN_PER_WL()).to.equal(CollectionConfig.presale.wl.maxTokenPerWallet);
      expect(await contract.PRESALE_INTERVAL()).to.equal(CollectionConfig.presaleInterval);
      expect(await contract.RESERVED_TOKENS()).to.equal(CollectionConfig.reservedTokens);

      expect(await contract.price()).to.equal(utils.parseEther(CollectionConfig.publicSale.price.toString()));
      expect(await contract.maxTokenPerWallet()).to.equal(CollectionConfig.publicSale.maxTokenPerWallet);
      expect(await contract.presaleDate()).to.equal(CollectionConfig.presale.date);
      expect(await contract.publicSaleDate()).to.equal(CollectionConfig.publicSale.date);
      expect(await contract.revealDate()).to.equal(CollectionConfig.revealDate);
      expect(await contract.metadataBaseURI()).to.equal(CollectionConfig.metadataBaseURI);
    });

    it('should owner own all the reserved tokens', async function () {
      const currentTotalSupply = parseInt(await contract.totalSupply());
      for (let i = 0; i < currentTotalSupply; i++) {
        expect(await contract.ownerOf(i)).to.equal(owner.address);
      }
    });
  });

  describe('#Presale (OG)', async function () {
    it('should revert when OG member tries to mint before presale', async function () {
      await expect(
        contract
          .connect(ogListedSigners[0])
          .ogMint(CollectionConfig.presale.og.maxTokenPerWallet, getProof(ogMerkleTree, ogListedSigners[0].address), {
            value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    });

    it('should OG mint without errors', async function () {
      // Should time travel to presale date
      await timeTravel(CollectionConfig.presale.date);

      /*********************** OG Minter #1 **********************/

      let currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(ogListedSigners[0])
        .ogMint(CollectionConfig.presale.og.maxTokenPerWallet, getProof(ogMerkleTree, ogListedSigners[0].address), {
          value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet)
        });

      let totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.og.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(ogListedSigners[0].address);
      }

      /*********************** OG Minter #2 **********************/

      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(ogListedSigners[1])
        .ogMint(CollectionConfig.presale.og.maxTokenPerWallet - 1, getProof(ogMerkleTree, ogListedSigners[1].address), {
          value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet - 1)
        });

      await contract
        .connect(ogListedSigners[1])
        .ogMint(CollectionConfig.presale.og.maxTokenPerWallet - 2, getProof(ogMerkleTree, ogListedSigners[1].address), {
          value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet - 2)
        });

      totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.og.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(ogListedSigners[1].address);
      }

      /*********************** Check balances **********************/

      expect(await contract.balanceOf(ogListedSigners[0].address)).to.equal(
        CollectionConfig.presale.og.maxTokenPerWallet
      );

      expect(await contract.balanceOf(ogListedSigners[1].address)).to.equal(
        CollectionConfig.presale.og.maxTokenPerWallet
      );
    });

    it('should revert when non OG member tries to mint the NFT', async function () {
      await expect(
        contract
          .connect(minter)
          .ogMint(CollectionConfig.presale.og.maxTokenPerWallet, getProof(ogMerkleTree, minter.address), {
            value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InvalidProof');
    });

    it('should revert when OG tries to mint with insufficient funds', async function () {
      await expect(
        contract
          .connect(ogListedSigners[2])
          .ogMint(CollectionConfig.presale.og.maxTokenPerWallet, getProof(ogMerkleTree, ogListedSigners[2].address), {
            value: utils.parseEther('0.0001')
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InsufficientFunds');
    });

    it('should revert when OG tries to mint more than the allowed max token per wallet', async function () {
      await expect(
        contract.connect(ogListedSigners[2]).ogMint(100, getProof(ogMerkleTree, ogListedSigners[2].address), {
          value: getPrice(CollectionConfig.presale.og.price, 100)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert second transaction when second transaction will maxed the OG wallet', async function () {
      await contract.connect(ogListedSigners[2]).ogMint(1, getProof(ogMerkleTree, ogListedSigners[2].address), {
        value: getPrice(CollectionConfig.presale.og.price, 1)
      });
      await expect(
        contract
          .connect(ogListedSigners[2])
          .ogMint(CollectionConfig.presale.og.maxTokenPerWallet, getProof(ogMerkleTree, ogListedSigners[2].address), {
            value: getPrice(CollectionConfig.presale.og.price, CollectionConfig.presale.og.maxTokenPerWallet)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });
  });

  describe('#Presale (WL)', async function () {
    it('should revert when WL member tries to mint during OG presale', async function () {
      // Skip time to a minute
      await timeTravel(CollectionConfig.presale.date + 60);

      await expect(
        contract
          .connect(whitelistedSigners[0])
          .wlMint(
            CollectionConfig.presale.wl.maxTokenPerWallet,
            getProof(wlMerkleTree, whitelistedSigners[0].address),
            {
              value: getPrice(CollectionConfig.presale.wl.price, CollectionConfig.presale.wl.maxTokenPerWallet)
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__StageNotReady');
    });

    it('should WL mint without errors', async function () {
      // Should time travel
      await timeTravel(CollectionConfig.presale.date + CollectionConfig.presaleInterval);

      /*********************** WL Minter #1 **********************/

      let currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(whitelistedSigners[0])
        .wlMint(CollectionConfig.presale.wl.maxTokenPerWallet, getProof(wlMerkleTree, whitelistedSigners[0].address), {
          value: getPrice(CollectionConfig.presale.wl.price, CollectionConfig.presale.wl.maxTokenPerWallet)
        });

      let totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.wl.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(whitelistedSigners[0].address);
      }

      /*********************** WL Minter #2 **********************/

      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract
        .connect(whitelistedSigners[1])
        .wlMint(CollectionConfig.presale.wl.maxTokenPerWallet, getProof(wlMerkleTree, whitelistedSigners[1].address), {
          value: getPrice(CollectionConfig.presale.wl.price, CollectionConfig.presale.wl.maxTokenPerWallet)
        });

      totalSupplyAfter = currentTotalSupply + CollectionConfig.presale.wl.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(whitelistedSigners[1].address);
      }

      /*********************** Check balances **********************/

      expect(await contract.balanceOf(whitelistedSigners[0].address)).to.equal(
        CollectionConfig.presale.wl.maxTokenPerWallet
      );

      expect(await contract.balanceOf(whitelistedSigners[1].address)).to.equal(
        CollectionConfig.presale.wl.maxTokenPerWallet
      );
    });

    it('should revert when non WL member tries to mint the NFT', async function () {
      await expect(
        contract
          .connect(minter)
          .wlMint(CollectionConfig.presale.wl.maxTokenPerWallet, getProof(wlMerkleTree, minter.address), {
            value: getPrice(CollectionConfig.presale.wl.price, CollectionConfig.presale.wl.maxTokenPerWallet)
          })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InvalidProof');
    });

    it('should revert when WL tries to mint with insufficient funds', async function () {
      await expect(
        contract
          .connect(whitelistedSigners[2])
          .wlMint(
            CollectionConfig.presale.wl.maxTokenPerWallet,
            getProof(wlMerkleTree, whitelistedSigners[2].address),
            {
              value: utils.parseEther('0.0001')
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__InsufficientFunds');
    });

    it('should revert when WL tries to mint more than the allowed max token per wallet', async function () {
      await expect(
        contract.connect(whitelistedSigners[2]).wlMint(100, getProof(wlMerkleTree, whitelistedSigners[2].address), {
          value: getPrice(CollectionConfig.presale.wl.price, 100)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert second transaction when second transaction will maxed the WL wallet', async function () {
      await contract.connect(whitelistedSigners[2]).wlMint(1, getProof(wlMerkleTree, whitelistedSigners[2].address), {
        value: getPrice(CollectionConfig.presale.wl.price, 1)
      });
      await expect(
        contract
          .connect(whitelistedSigners[2])
          .wlMint(
            CollectionConfig.presale.wl.maxTokenPerWallet,
            getProof(wlMerkleTree, whitelistedSigners[2].address),
            {
              value: getPrice(CollectionConfig.presale.wl.price, CollectionConfig.presale.wl.maxTokenPerWallet)
            }
          )
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });
  });

  describe('#Public Sale', async function () {
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

      /*********************** Minter #1 **********************/

      let currentTotalSupply = parseInt(await contract.totalSupply());

      await contract.connect(minter).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet - 2, {
        value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet - 2)
      });

      await contract.connect(minter).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet - 3, {
        value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet - 3)
      });

      let totalSupplyAfter = currentTotalSupply + CollectionConfig.publicSale.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter.address);
      }

      /*********************** Minter #2 **********************/

      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract.connect(minter2).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet - 1, {
        value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet - 1)
      });

      await contract.connect(minter2).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet - 4, {
        value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet - 4)
      });

      totalSupplyAfter = currentTotalSupply + CollectionConfig.publicSale.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter2.address);
      }

      /*********************** Minter #3 **********************/

      currentTotalSupply = parseInt(await contract.totalSupply());

      await contract.connect(minter3).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet, {
        value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet)
      });

      totalSupplyAfter = currentTotalSupply + CollectionConfig.publicSale.maxTokenPerWallet;

      for (let i = currentTotalSupply; i < totalSupplyAfter; i++) {
        expect(await contract.ownerOf(i)).to.equal(minter3.address);
      }

      /*********************** Check balances **********************/

      expect(await contract.balanceOf(minter.address)).to.equal(5);
      expect(await contract.balanceOf(minter2.address)).to.equal(5);
      expect(await contract.balanceOf(minter3.address)).to.equal(5);
    });

    it('should revert when minter tries to mint again where minter has already maxed their wallet', async function () {
      await expect(
        contract.connect(minter3).functions['mint(uint256)'](CollectionConfig.publicSale.maxTokenPerWallet, {
          value: getPrice(CollectionConfig.publicSale.price, CollectionConfig.publicSale.maxTokenPerWallet)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert when minter tries to mint more than the allowed total token per wallet', async function () {
      await expect(
        contract.connect(minter4).functions['mint(uint256)'](100, {
          value: getPrice(CollectionConfig.publicSale.price, 100)
        })
      ).to.be.revertedWithCustomError(contract, 'WhoIsWho__MaxMint');
    });

    it('should revert when mint amount is 0', async function () {
      await expect(contract.connect(minter4).functions['mint(uint256)'](0)).to.be.revertedWithCustomError(
        contract,
        'WhoIsWho__ZeroMintAmount'
      );
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

  describe('#Multi Confirm', async function () {
    it('should set base uri', async function () {
      await contract.connect(owner).setMetadataBaseURI('ipfs://QmV5VrfGUpaRRpCVP4pmi9f6dHjwTXnq6Urv9aUmJyRCpv/');
      expect(await contract.tokenURI(1)).to.equal('ipfs://QmV5VrfGUpaRRpCVP4pmi9f6dHjwTXnq6Urv9aUmJyRCpv/hidden.json');
    });

    it('should revert when non operator submit a transaction', async function () {
      const balance = await ethers.provider.getBalance(contract.address);
      await expect(
        contract.connect(minter).submitWithdrawTransaction(owner.address, balance, ethers.utils.formatBytes32String(''))
      ).to.be.reverted;
    });

    it('should grant operator role', async function () {
      await contract.connect(owner).grantRole(getRole('OPERATOR_ROLE'), operator1.address);
      await contract.connect(owner).grantRole(getRole('OPERATOR_ROLE'), operator2.address);
    });

    it('should submit transaction', async function () {
      const balance = await ethers.provider.getBalance(contract.address);
      await contract
        .connect(operator1)
        .submitWithdrawTransaction(owner.address, balance, ethers.utils.formatBytes32String(''));
      const transaction = await contract.getTransaction(0);

      expect(transaction.to).to.equal(owner.address.toString());
      expect(transaction.value).to.equal(balance);
      expect(transaction.data).to.equal(ZERO_ADDRESS);
      expect(transaction.executed).to.false;
      expect(transaction.numConfirmations).to.equal(0);
    });

    it("should revert confirmation when transaction doesn't exists", async function () {
      await expect(contract.connect(operator1).confirmWithdrawTransaction(1)).to.be.rejectedWith("tx doesn't exists");
    });

    it('should revert transaction when non operator confirms the transaction', async function () {
      await expect(contract.connect(minter).confirmWithdrawTransaction(0)).to.be.reverted;
    });

    it('should confirm transaction', async function () {
      await contract.connect(operator1).confirmWithdrawTransaction(0);
      await contract.connect(operator2).confirmWithdrawTransaction(0);
      const transaction = await contract.getTransaction(0);
      expect(transaction.numConfirmations).to.equal(2);
    });

    it('should revert when operator already confirmed the transaction', async function () {
      await expect(contract.connect(operator1).confirmWithdrawTransaction(0)).to.be.rejectedWith(
        'tx already confirmed'
      );
    });

    it('should revert transaction when # of confirmations is insufficient', async function () {
      await expect(contract.connect(owner).withdraw(0)).to.be.rejectedWith("tx can't execute");
    });

    it('should revert when operator or any other wallet address tries to withdraw', async function () {
      await expect(contract.connect(operator1).withdraw(0)).to.be.reverted;
      await expect(contract.connect(deployer).withdraw(0)).to.be.reverted;
      await expect(contract.connect(minter).withdraw(0)).to.be.reverted;
    });

    it('should withdraw without errors', async function () {
      await contract.connect(owner).confirmWithdrawTransaction(0);

      const transaction = await contract.getTransaction(0);
      const ownerPrevBalance = await ethers.provider.getBalance(transaction.to);

      await contract.connect(owner).withdraw(0);

      const transactionValue = ethers.BigNumber.from(transaction.value);
      const afterBalance = ownerPrevBalance.add(transactionValue);

      const txValueEth = ethers.utils.formatEther(await ethers.provider.getBalance(transaction.to));
      const afterBalEth = ethers.utils.formatEther(afterBalance);

      expect(parseFloat(txValueEth).toFixed(2)).to.equal(parseFloat(afterBalEth).toFixed(2));
      expect(await ethers.provider.getBalance(contract.address)).to.equal(0);

      const executedTransaction = await contract.getTransaction(0);
      expect(executedTransaction.executed).to.true;
    });
  });
});
