import { ethers } from 'hardhat';
import { CollectionArguments, CollectionConfig } from '../config/collection.config';

async function main() {
  const WhoIsWho = await ethers.getContractFactory(CollectionConfig.contractName);
  const whoIsWho = await WhoIsWho.deploy(...CollectionArguments);

  await whoIsWho.deployed();

  console.log(`WhoIsWho deployed to ${whoIsWho.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
