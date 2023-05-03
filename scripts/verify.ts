import { CollectionArguments } from '../config/collection.config';
import hre from 'hardhat';

async function main() {
  const network = hre.hardhatArguments.network;

  if (!network) throw new Error('Network undefined');

  console.log(`Verifying contracts on ${network}...`);

  await hre
    .run('verify:verify', {
      address: process.env[`${network?.toUpperCase()}_COLLECTION_ADDRESS`],
      contract: 'contracts/WhoIsWho.sol:WhoIsWho',
      constructorArguments: [...CollectionArguments]
    })
    .catch((error) => {
      console.error(error);
    });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
