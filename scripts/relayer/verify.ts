import hre from 'hardhat';

// npx hardhat run scripts/relayer/verify.ts
async function main() {
  const network = hre.hardhatArguments.network;

  if (!network) throw new Error('Network undefined');

  console.log(`Verifying contracts on ${network}...`);

  await hre
    .run('verify:verify', {
      address: process.env[`${network?.toUpperCase()}_RELAYER_ADDRESS`],
      contract: 'contracts/relayer/Relayer.sol:Relayer',
      constructorArguments: [
        process.env[`${network?.toUpperCase()}_COLLECTION_ADDRESS`],
        `0x${process.env.WHITELISTS_MERKLE_ROOT}`
      ]
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
