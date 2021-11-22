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
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    WNATIVE_ADDRESS[chainId], // WMATIC
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
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
    "0x4e78011ce80ee02d2c3e649fb657e45898257815", // KLIMA
    "0x4e78011ce80ee02d2c3e649fb657e45898257815", // KLIMA
    "0x2c89bbc92bd86f8075d1decc58c7f4e0107f286b", // AVAX
    "0x172370d5cd63279efa6d502dab29171933a610af", // CRV
    "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a", // SUSHI
    "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4", // MANA
    "0x5fe2b58c013d7601147dcdd68c143a77499f5531", // GRT
  ];
  const alloweds = [
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ];

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
