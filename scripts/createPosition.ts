import { parseUnits } from "ethers/lib/utils";
import hre from "hardhat";
import { CORE_ADDRESS, USDC_ADDRESS, WETH_ADDRESS } from "../constants";
import { DCACore, IERC20 } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 3;

  const DCA_CORE_ADDRESS = CORE_ADDRESS[chainId];
  const TOKEN_IN_ADDRESS = USDC_ADDRESS[chainId];
  const TOKEN_OUT_ADDRESS = WETH_ADDRESS[chainId];
  const AMOUNT_IN = parseUnits("1000", "6");
  const AMOUNT_DCA = parseUnits("100", "6");
  const INTERVAL = 900;

  const dcaCore = <DCACore>(
    await hre.ethers.getContractAt("DCACore", DCA_CORE_ADDRESS)
  );
  const slippage = await dcaCore.minSlippage();

  // const usdc = <IERC20>await hre.ethers.getContractAt("IERC20", TOKEN_IN_ADDRESS);
  // const txApprove = await usdc
  //   .connect(signer)
  //   .approve(dcaCore.address, hre.ethers.constants.MaxUint256);
  // console.log(txApprove.hash);
  // await txApprove.wait();

  const tx = await dcaCore
    .connect(signer)
    .createPositionAndDeposit(
      TOKEN_IN_ADDRESS,
      TOKEN_OUT_ADDRESS,
      AMOUNT_IN,
      AMOUNT_DCA,
      INTERVAL,
      slippage
    );
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
