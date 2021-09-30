import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";
import { CORE_ADDRESS, USDC_ADDRESS, WETH_ADDRESS } from "../constants";
import { DCACore } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 3;

  const DCA_CORE_ADDRESS = CORE_ADDRESS[chainId];
  const TOKEN_IN_ADDRESS = USDC_ADDRESS[chainId];
  const TOKEN_OUT_ADDRESS = WETH_ADDRESS[chainId];

  const dcaCore = <DCACore>(
    await hre.ethers.getContractAt("DCACore", DCA_CORE_ADDRESS)
  );

  const tx = await dcaCore
    .connect(signer)
    .setAllowedTokenPair(TOKEN_IN_ADDRESS, TOKEN_OUT_ADDRESS, true);
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