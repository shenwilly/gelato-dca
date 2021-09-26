import { BigNumber, BigNumberish } from "ethers/lib/ethers";
import { ethers, network } from "hardhat";
import { USDC_ADDRESS, USDC_MINTER } from "../../constants";
import { DCACore } from "../../typechain";

export const getNextPositionId = async (
  dcaCore: DCACore
): Promise<BigNumber> => {
  return await dcaCore.getNextPositionId();
};

export const mintUsdc = async (amount: BigNumberish, to: string) => {
  const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [USDC_MINTER],
  });

  const usdcWalletSigner = await ethers.getSigner(USDC_MINTER);
  await usdc.connect(usdcWalletSigner).transfer(to, amount);
};
