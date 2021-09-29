import { ethers } from "hardhat";
import {
  DCACore,
  DCACoreResolver,
  DCACoreResolver__factory,
  DCACore__factory,
  IERC20,
} from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SUSHISWAP_ROUTER_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
} from "../../constants";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  fastForwardTo,
  getCurrentTimestamp,
  getNextPositionId,
  mintUsdc,
} from "../helpers/utils";
import { parseUnits } from "@ethersproject/units";
import { Contract } from "ethers/lib/ethers";

const { expect } = chai;
chai.use(solidity);

describe("DCACoreResolver", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let dcaCore: DCACore;
  let resolver: DCACoreResolver;
  let uniRouter: Contract;

  let usdc: IERC20;
  let weth: IERC20;

  let defaultFund: BigNumber;
  let defaultDCA: BigNumber;
  let defaultInterval: BigNumberish;
  let defaultSwapPath: string[];
  let defaultSlippage: BigNumber;

  let snapshotId: string;
  const chainId = 1;

  before("setup contracts", async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;

    defaultFund = parseUnits("10000", USDC_DECIMALS);
    defaultDCA = defaultFund.div(10);
    defaultInterval = 60; // second;
    defaultSwapPath = [USDC_ADDRESS, WETH_ADDRESS];

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHISWAP_ROUTER_ADDRESS[chainId],
      deployerAddress
    );
    await dcaCore.deployed();

    const DCACoreResolverFactory = (await ethers.getContractFactory(
      "DCACoreResolver",
      deployer
    )) as DCACoreResolver__factory;
    resolver = await DCACoreResolverFactory.deploy(
      dcaCore.address,
      SUSHISWAP_ROUTER_ADDRESS[chainId]
    );
    await resolver.deployed();
    defaultSlippage = await resolver.maxSlippage();

    uniRouter = await ethers.getContractAt(
      "IUniswapV2Router",
      SUSHISWAP_ROUTER_ADDRESS[chainId]
    );

    usdc = <IERC20>await ethers.getContractAt("IERC20", USDC_ADDRESS);
    weth = <IERC20>await ethers.getContractAt("IERC20", WETH_ADDRESS);

    await dcaCore.connect(deployer).setAllowedTokenFund(usdc.address, true);
    await dcaCore.connect(deployer).setAllowedTokenAsset(weth.address, true);
    await dcaCore
      .connect(deployer)
      .setAllowedPair(usdc.address, weth.address, true);

    await mintUsdc(defaultFund.mul(10), aliceAddress);
    await mintUsdc(defaultFund.mul(10), bobAddress);

    await usdc
      .connect(alice)
      .approve(dcaCore.address, ethers.constants.MaxUint256);
    await usdc
      .connect(bob)
      .approve(dcaCore.address, ethers.constants.MaxUint256);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("setMaxSlippage()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(resolver.connect(alice).setMaxSlippage(1)).to.be.reverted;
    });
    it("should revert if max slippage is higher than 5%", async () => {
      await expect(resolver.connect(deployer).setMaxSlippage(501)).to.be
        .reverted;
    });
    it("should set new maxSlippage", async () => {
      const oldValue = await resolver.maxSlippage();
      const newValue = oldValue.add(1);

      await resolver.connect(deployer).setMaxSlippage(newValue);
      expect(await resolver.maxSlippage()).to.be.eq(newValue);
    });
  });
  describe("getExecutablePositions()", async () => {
    it("should return false if no executable positions", async () => {
      const [canExec, payload] = await resolver.getExecutablePositions();
      expect(canExec).to.be.eq(false);

      const taskData = dcaCore.interface.encodeFunctionData("executeDCAs", [
        [],
        [],
      ]);
      expect(payload).to.be.eq(taskData);
    });
    it("should return true if there is an executable position", async () => {
      const positionId = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      const [canExec, payload] = await resolver.getExecutablePositions();
      expect(canExec).to.be.eq(true);

      const amounts = await uniRouter.getAmountsOut(
        defaultDCA,
        defaultSwapPath
      );
      let amountOutMin: BigNumber = amounts[1];
      amountOutMin = amountOutMin.sub(
        amountOutMin.mul(defaultSlippage).div(10000)
      );

      const taskData = dcaCore.interface.encodeFunctionData("executeDCAs", [
        [positionId],
        [{ swapAmountOutMin: amountOutMin, swapPath: defaultSwapPath }],
      ]);
      expect(payload).to.be.eq(taskData);
    });
    it("should return true if there are executable positions", async () => {
      const positionId1 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(bob)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA.mul(2),
          defaultInterval
        );

      const [canExec, payload] = await resolver.getExecutablePositions();
      expect(canExec).to.be.eq(true);

      const amounts1 = await uniRouter.getAmountsOut(
        defaultDCA,
        defaultSwapPath
      );
      let amountOutMin1: BigNumber = amounts1[1];
      amountOutMin1 = amountOutMin1.sub(
        amountOutMin1.mul(defaultSlippage).div(10000)
      );
      const amounts2 = await uniRouter.getAmountsOut(
        defaultDCA.mul(2),
        defaultSwapPath
      );
      let amountOutMin2: BigNumber = amounts2[1];
      amountOutMin2 = amountOutMin2.sub(
        amountOutMin2.mul(defaultSlippage).div(10000)
      );

      const taskData = dcaCore.interface.encodeFunctionData("executeDCAs", [
        [positionId1, positionId2],
        [
          { swapAmountOutMin: amountOutMin1, swapPath: defaultSwapPath },
          { swapAmountOutMin: amountOutMin2, swapPath: defaultSwapPath },
        ],
      ]);
      expect(payload).to.be.eq(taskData);
    });
    it("should skip ineligible positions", async () => {
      const positionId1 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(bob)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      const positionId3 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(bob)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      // empty position1, trigger interval position2
      await dcaCore.connect(alice).withdrawFund(positionId1, defaultFund);
      await dcaCore.connect(deployer).executeDCA(positionId2, {
        swapAmountOutMin: 0,
        swapPath: defaultSwapPath,
      });

      const [canExec, payload] = await resolver.getExecutablePositions();
      expect(canExec).to.be.eq(true);

      const amounts = await uniRouter.getAmountsOut(
        defaultDCA,
        defaultSwapPath
      );
      let amountOutMin: BigNumber = amounts[1];
      amountOutMin = amountOutMin.sub(
        amountOutMin.mul(defaultSlippage).div(10000)
      );

      const taskData = dcaCore.interface.encodeFunctionData("executeDCAs", [
        [positionId3],
        [{ swapAmountOutMin: amountOutMin, swapPath: defaultSwapPath }],
      ]);
      expect(payload).to.be.eq(taskData);

      const now = await getCurrentTimestamp();
      await fastForwardTo(now.add(defaultInterval).toNumber());

      const [canExec2, payload2] = await resolver.getExecutablePositions();
      expect(canExec2).to.be.eq(true);

      const amounts2 = await uniRouter.getAmountsOut(
        defaultDCA,
        defaultSwapPath
      );
      let amountOutMin2: BigNumber = amounts2[1];
      amountOutMin2 = amountOutMin2.sub(
        amountOutMin2.mul(defaultSlippage).div(10000)
      );

      const taskData2 = dcaCore.interface.encodeFunctionData("executeDCAs", [
        [positionId2, positionId3],
        [
          { swapAmountOutMin: amountOutMin2, swapPath: defaultSwapPath },
          { swapAmountOutMin: amountOutMin2, swapPath: defaultSwapPath },
        ],
      ]);
      expect(payload2).to.be.eq(taskData2);
    });
  });
});
