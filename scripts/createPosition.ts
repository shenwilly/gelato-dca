import { parseEther, parseUnits } from "ethers/lib/utils";
import hre from "hardhat";
import {
  CORE_ADDRESS,
  ETH_TOKEN_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  WNATIVE_ADDRESS,
} from "../constants";
import { DCACore, IERC20 } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 137;

  const DCA_CORE_ADDRESS = CORE_ADDRESS[chainId];
  const TOKEN_IN_ADDRESS = ETH_TOKEN_ADDRESS;
  const TOKEN_OUT_ADDRESS = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
  const AMOUNT_IN = parseEther("1");
  const AMOUNT_DCA = parseEther("0.25");
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
      0,
      AMOUNT_DCA,
      INTERVAL,
      slippage,
      {
        value: AMOUNT_IN,
      }
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
