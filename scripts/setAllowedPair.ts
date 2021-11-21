import hre from "hardhat";
import { CORE_ADDRESS, WNATIVE_ADDRESS } from "../constants";
import { DCACore } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 137;

  const DCA_CORE_ADDRESS = CORE_ADDRESS[chainId];

  const tokenIns = [
    WNATIVE_ADDRESS[chainId], // WMATIC
    WNATIVE_ADDRESS[chainId], // WMATIC
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
  ];
  const tokenOuts = [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC
    "0x2f800db0fdb5223b3c3f354886d907a671414a7f", // BCT
    "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", // LINK
    "0xd6df932a45c0f255f85145f286ea0b292b21c90b", // AAVE
  ];
  const alloweds = [true, true, true, true, true, true, true];

  const dcaCore = <DCACore>(
    await hre.ethers.getContractAt("DCACore", DCA_CORE_ADDRESS)
  );

  const tx = await dcaCore
    .connect(signer)
    .setAllowedTokenPairs(tokenIns, tokenOuts, alloweds);
  console.log(tx.hash);
  await tx.wait();

  console.log("CONFIRMED");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
