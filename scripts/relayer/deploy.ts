import { utils } from 'ethers';
import { ethers } from 'hardhat';
import hre from 'hardhat';

// npx hardhat run scripts/relayer/deploy.ts
async function main() {
  const network = hre.hardhatArguments.network;

  if (!network) throw new Error('Network undefined');

  const collectionAddress =
    process.env[`${network?.toUpperCase()}_COLLECTION_ADDRESS`] ?? utils.formatBytes32String('');

  const Relayer = await ethers.getContractFactory('Relayer');
  const relayer = await Relayer.deploy(collectionAddress);

  await relayer.deployed();
  console.log(`Relayer deployed to ${relayer.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
