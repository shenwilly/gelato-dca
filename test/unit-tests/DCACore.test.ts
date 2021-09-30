import { ethers } from "hardhat";
import { DCACore, DCACore__factory, IERC20 } from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ETH_TOKEN_ADDRESS,
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
import { parseEther, parseUnits } from "@ethersproject/units";

const { expect } = chai;
chai.use(solidity);

describe("DCACore", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let executor: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let executorAddress: string;

  let dcaCore: DCACore;

  let usdc: IERC20;
  let weth: IERC20;

  let defaultFund: BigNumber;
  let defaultDCA: BigNumber;
  let defaultSlippage: BigNumber;
  let defaultInterval: BigNumberish;
  let defaultSwapPath: string[];

  let snapshotId: string;
  const chainId = 1;

  before("setup contracts", async () => {
    [deployer, alice, bob, executor] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;
    executorAddress = executor.address;

    usdc = <IERC20>await ethers.getContractAt("IERC20", USDC_ADDRESS);
    weth = <IERC20>await ethers.getContractAt("IERC20", WETH_ADDRESS[chainId]);

    defaultFund = parseUnits("10000", USDC_DECIMALS);
    defaultDCA = defaultFund.div(10);
    defaultInterval = 60; // second;
    defaultSwapPath = [USDC_ADDRESS, weth.address];

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHISWAP_ROUTER_ADDRESS[chainId],
      executorAddress,
      weth.address
    );
    await dcaCore.deployed();
    defaultSlippage = await dcaCore.minSlippage();

    await dcaCore
      .connect(deployer)
      .setAllowedTokenPair(usdc.address, weth.address, true);

    await mintUsdc(defaultFund, aliceAddress);
    await usdc
      .connect(alice)
      .approve(dcaCore.address, ethers.constants.MaxUint256);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createPositionAndDeposit()", async () => {
    it("should revert if system is paused", async () => {
      await dcaCore.connect(deployer).setSystemPause(true);
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            usdc.address,
            defaultFund,
            defaultDCA,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("System is paused");
    });
    it("should revert if token pair is not allowed", async () => {
      await dcaCore
        .connect(deployer)
        .setAllowedTokenPair(usdc.address, weth.address, false);
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("Pair not allowed");
    });
    it("should revert if fund amount is 0", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            0,
            defaultDCA,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("Invalid inputs");

      await dcaCore
        .connect(deployer)
        .setAllowedTokenPair(weth.address, usdc.address, true);
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            ETH_TOKEN_ADDRESS,
            usdc.address,
            defaultFund,
            defaultDCA,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if DCA amount is 0", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            defaultFund,
            0,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if interval is less than one minute", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            0,
            defaultSlippage
          )
      ).to.be.revertedWith("Invalid inputs");

      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            59,
            defaultSlippage
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if amountIn is less than one time amountDCA", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createPositionAndDeposit(
            usdc.address,
            weth.address,
            100,
            110,
            defaultInterval,
            defaultSlippage
          )
      ).to.be.revertedWith("Deposit for at least 1 DCA");
    });
    it("should create position and deposit ETH fund", async () => {
      const positionId = await getNextPositionId(dcaCore);

      const balanceAliceBefore = await ethers.provider.getBalance(aliceAddress);
      const balanceContractBefore = await weth.balanceOf(dcaCore.address);

      await dcaCore
        .connect(deployer)
        .setAllowedTokenPair(weth.address, usdc.address, true);
      const amountFund = parseEther("1");
      const amountDCA = amountFund.div(10);

      const tx = await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          ETH_TOKEN_ADDRESS,
          usdc.address,
          0,
          amountDCA,
          defaultInterval,
          defaultSlippage,
          {
            value: amountFund,
          }
        );

      expect(tx)
        .to.emit(dcaCore, "PositionCreated")
        .withArgs(
          positionId,
          aliceAddress,
          weth.address,
          usdc.address,
          amountDCA,
          defaultInterval,
          defaultSlippage
        );
      expect(tx).to.emit(dcaCore, "Deposit").withArgs(positionId, amountFund);
      const receipt = await tx.wait();
      const gasUsed = parseUnits(receipt.gasUsed.toString(), "gwei");

      const balanceAliceAfter = await ethers.provider.getBalance(aliceAddress);
      const balanceContractAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceAliceBefore.sub(balanceAliceAfter).sub(gasUsed)).to.be.eq(
        amountFund
      );
      expect(balanceContractAfter.sub(balanceContractBefore)).to.be.eq(
        amountFund
      );

      const position = await dcaCore.positions(positionId);
      expect(position[0]).to.be.eq(positionId);
      expect(position[1]).to.be.eq(aliceAddress);
      expect(position[2]).to.be.eq(weth.address);
      expect(position[3]).to.be.eq(usdc.address);
      expect(position[4]).to.be.eq(amountFund);
      expect(position[5]).to.be.eq(0);
      expect(position[6]).to.be.eq(amountDCA);
      expect(position[7]).to.be.eq(defaultInterval);
      expect(position[8]).to.be.eq(0);
      expect(position[9]).to.be.eq(defaultSlippage);
    });
    it("should create position and deposit fund", async () => {
      const positionId = await getNextPositionId(dcaCore);

      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      const tx = await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      expect(tx)
        .to.emit(dcaCore, "PositionCreated")
        .withArgs(
          positionId,
          aliceAddress,
          usdc.address,
          weth.address,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
      expect(tx).to.emit(dcaCore, "Deposit").withArgs(positionId, defaultFund);

      const balanceAliceAfter = await usdc.balanceOf(aliceAddress);
      const balanceContractAfter = await usdc.balanceOf(dcaCore.address);

      expect(balanceAliceBefore.sub(balanceAliceAfter)).to.be.eq(defaultFund);
      expect(balanceContractAfter.sub(balanceContractBefore)).to.be.eq(
        defaultFund
      );

      const position = await dcaCore.positions(positionId);
      expect(position[0]).to.be.eq(positionId);
      expect(position[1]).to.be.eq(aliceAddress);
      expect(position[2]).to.be.eq(usdc.address);
      expect(position[3]).to.be.eq(weth.address);
      expect(position[4]).to.be.eq(defaultFund);
      expect(position[5]).to.be.eq(0);
      expect(position[6]).to.be.eq(defaultDCA);
      expect(position[7]).to.be.eq(defaultInterval);
      expect(position[8]).to.be.eq(0);
      expect(position[9]).to.be.eq(defaultSlippage);
    });
  });

  describe("updatePosition()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).updatePosition(positionId.add(1), 100, 100)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).updatePosition(positionId, 100, 100)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if DCA amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).updatePosition(positionId, 0, defaultInterval)
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if interval is less than one minute", async () => {
      await expect(
        dcaCore.connect(alice).updatePosition(positionId, defaultDCA, 0)
      ).to.be.revertedWith("Invalid inputs");

      await expect(
        dcaCore.connect(alice).updatePosition(positionId, defaultDCA, 59)
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should update position", async () => {
      await expect(dcaCore.connect(alice).updatePosition(positionId, 999, 120))
        .to.emit(dcaCore, "PositionUpdated")
        .withArgs(positionId, 999, 120);

      const position = await dcaCore.positions(positionId);
      expect(position[6]).to.be.eq(999);
      expect(position[7]).to.be.eq(120);
    });
  });

  describe("deposit()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).deposit(positionId.add(1), 1)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if system is paused", async () => {
      await dcaCore.connect(deployer).setSystemPause(true);
      await expect(
        dcaCore.connect(alice).deposit(positionId.add(1), 1)
      ).to.be.revertedWith("System is paused");
    });
    it("should revert if amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).deposit(positionId, 0)
      ).to.be.revertedWith("_amount must be > 0");
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).deposit(positionId, 1)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should deposit fund", async () => {
      await mintUsdc(defaultDCA, alice.address);

      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      await expect(dcaCore.connect(alice).deposit(positionId, defaultDCA))
        .to.emit(dcaCore, "Deposit")
        .withArgs(positionId, defaultDCA);

      const balanceAliceAfter = await usdc.balanceOf(aliceAddress);
      const balanceContractAfter = await usdc.balanceOf(dcaCore.address);

      expect(balanceAliceBefore.sub(balanceAliceAfter)).to.be.eq(defaultDCA);
      expect(balanceContractAfter.sub(balanceContractBefore)).to.be.eq(
        defaultDCA
      );

      const position = await dcaCore.positions(positionId);
      expect(position[4]).to.be.eq(defaultFund.add(defaultDCA));
    });
  });

  describe("depositETH()", async () => {
    let positionId: BigNumber;
    let amountFund: BigNumber;
    let amountDCA: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(deployer)
        .setAllowedTokenPair(weth.address, usdc.address, true);
      amountFund = parseEther("1");
      amountDCA = amountFund.div(10);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          ETH_TOKEN_ADDRESS,
          usdc.address,
          0,
          amountDCA,
          defaultInterval,
          defaultSlippage,
          {
            value: amountFund,
          }
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .depositETH(positionId.add(1), { value: defaultDCA })
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if system is paused", async () => {
      await dcaCore.connect(deployer).setSystemPause(true);
      await expect(
        dcaCore.connect(alice).depositETH(positionId, { value: defaultDCA })
      ).to.be.revertedWith("System is paused");
    });
    it("should revert if amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).depositETH(positionId)
      ).to.be.revertedWith("msg.value must be > 0");
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).depositETH(positionId, { value: defaultDCA })
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if tokenIn is not weth", async () => {
      const positionId = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
      await expect(
        dcaCore.connect(alice).depositETH(positionId, { value: defaultDCA })
      ).to.be.revertedWith("tokenIn must be WETH");
    });
    it("should deposit ETH", async () => {
      const balanceAliceBefore = await ethers.provider.getBalance(aliceAddress);
      const balanceContractBefore = await weth.balanceOf(dcaCore.address);

      const tx = await dcaCore
        .connect(alice)
        .depositETH(positionId, { value: amountDCA });
      expect(tx).to.emit(dcaCore, "Deposit").withArgs(positionId, amountDCA);
      const receipt = await tx.wait();
      const gasUsed = parseUnits(receipt.gasUsed.toString(), "gwei");

      const balanceAliceAfter = await ethers.provider.getBalance(aliceAddress);
      const balanceContractAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceAliceBefore.sub(balanceAliceAfter).sub(gasUsed)).to.be.eq(
        amountDCA
      );
      expect(balanceContractAfter.sub(balanceContractBefore)).to.be.eq(
        amountDCA
      );

      const position = await dcaCore.positions(positionId);
      expect(position[4]).to.be.eq(amountFund.add(amountDCA));
    });
  });

  describe("withdrawTokenIn()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).withdrawTokenIn(positionId.add(1), 1)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).withdrawTokenIn(positionId, 0)
      ).to.be.revertedWith("_amount must be > 0");
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).withdrawTokenIn(positionId, 1)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if withdraw amount is larger than amountIn", async () => {
      await expect(
        dcaCore.connect(alice).withdrawTokenIn(positionId, defaultFund.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
      );
    });
    it("should withdraw fund", async () => {
      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      await expect(
        dcaCore.connect(alice).withdrawTokenIn(positionId, defaultDCA)
      )
        .to.emit(dcaCore, "WithdrawTokenIn")
        .withArgs(positionId, defaultDCA);

      const balanceAliceAfter = await usdc.balanceOf(aliceAddress);
      const balanceContractAfter = await usdc.balanceOf(dcaCore.address);

      expect(balanceAliceAfter.sub(balanceAliceBefore)).to.be.eq(defaultDCA);
      expect(balanceContractBefore.sub(balanceContractAfter)).to.be.eq(
        defaultDCA
      );

      const position = await dcaCore.positions(positionId);
      expect(position[4]).to.be.eq(defaultFund.sub(defaultDCA));
    });
  });

  describe("withdrawTokenOut()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).withdrawTokenOut(positionId.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(bob).withdrawTokenOut(positionId)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if withdrawable is 0", async () => {
      await expect(
        dcaCore.connect(alice).withdrawTokenOut(positionId)
      ).to.be.revertedWith("DCA asset amount must be > 0");
    });
    it("should withdraw", async () => {
      await dcaCore.connect(executor).executeDCA(positionId, {
        swapAmountOutMin: 0,
        swapPath: [usdc.address, weth.address],
      });

      const positionPre = await dcaCore.positions(positionId);
      const withdrawable = positionPre[5];
      expect(withdrawable).to.be.gt(0);

      const balanceAliceBefore = await ethers.provider.getBalance(aliceAddress);
      const balanceContractBefore = await weth.balanceOf(dcaCore.address);

      const tx = await dcaCore.connect(alice).withdrawTokenOut(positionId);
      expect(tx)
        .to.emit(dcaCore, "WithdrawTokenOut")
        .withArgs(positionId, withdrawable);
      const receipt = await tx.wait();
      const gasUsed = parseUnits(receipt.gasUsed.toString(), "gwei");

      const balanceAliceAfter = await ethers.provider.getBalance(aliceAddress);
      const balanceContractAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceAliceAfter.sub(balanceAliceBefore).add(gasUsed)).to.be.eq(
        withdrawable
      );
      expect(balanceContractBefore.sub(balanceContractAfter)).to.be.eq(
        withdrawable
      );

      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[5]).to.be.eq(0);
    });
  });

  describe("exit()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).exit(positionId.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if sender is not owner", async () => {
      await expect(dcaCore.connect(bob).exit(positionId)).to.be.revertedWith(
        "Sender must be owner"
      );
    });
    it("should withdraw all tokenIn and tokenOut", async () => {
      await dcaCore.connect(executor).executeDCA(positionId, {
        swapAmountOutMin: 0,
        swapPath: [usdc.address, weth.address],
      });

      const positionPre = await dcaCore.positions(positionId);
      const withdrawableEth = positionPre[5];
      expect(withdrawableEth).to.be.gt(0);

      const balanceUsdcAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceEthAliceBefore = await ethers.provider.getBalance(
        aliceAddress
      );
      const balanceUsdcContractBefore = await usdc.balanceOf(dcaCore.address);
      const balanceWethContractBefore = await weth.balanceOf(dcaCore.address);

      const withdrawableUsdc = defaultFund.sub(defaultDCA);

      const tx = await dcaCore.connect(alice).exit(positionId);
      expect(tx)
        .to.emit(dcaCore, "WithdrawTokenIn")
        .withArgs(positionId, withdrawableUsdc);
      expect(tx)
        .to.emit(dcaCore, "WithdrawTokenOut")
        .withArgs(positionId, withdrawableEth);
      const receipt = await tx.wait();
      const gasUsed = parseUnits(receipt.gasUsed.toString(), "gwei");

      const balanceUsdcAliceAfter = await usdc.balanceOf(aliceAddress);
      const balanceEthAliceAfter = await ethers.provider.getBalance(
        aliceAddress
      );
      const balanceUsdcContractAfter = await usdc.balanceOf(dcaCore.address);
      const balanceWethContractAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceUsdcAliceAfter.sub(balanceUsdcAliceBefore)).to.be.eq(
        withdrawableUsdc
      );
      expect(
        balanceEthAliceAfter.sub(balanceEthAliceBefore).add(gasUsed)
      ).to.be.eq(withdrawableEth);
      expect(balanceUsdcContractBefore.sub(balanceUsdcContractAfter)).to.be.eq(
        withdrawableUsdc
      );
      expect(balanceWethContractBefore.sub(balanceWethContractAfter)).to.be.eq(
        withdrawableEth
      );

      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[4]).to.be.eq(0);
      expect(positionPost[5]).to.be.eq(0);
    });
  });

  describe("executeDCA()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(executor).executeDCA(positionId.add(1), {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if sender is not executor", async () => {
      await expect(
        dcaCore.connect(alice).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith("Only Executor");
    });

    it("should revert if system is paused", async () => {
      await dcaCore.connect(deployer).setSystemPause(true);
      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith("System is paused");
    });
    it("should revert if position has run out of fund", async () => {
      await dcaCore.connect(alice).withdrawTokenIn(positionId, defaultFund);

      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith("Insufficient fund");
    });
    it("should revert if swap path is invalid", async () => {
      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: [usdc.address, usdc.address],
        })
      ).to.be.revertedWith("Invalid swap path");
    });
    it("should revert if token pair is not allowed", async () => {
      await dcaCore
        .connect(deployer)
        .setAllowedTokenPair(usdc.address, weth.address, false);

      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith("Token pair not allowed");
    });
    it("should revert if it's not time to DCA", async () => {
      const positionPre = await dcaCore.positions(positionId);
      expect(positionPre[8]).to.be.eq(0);

      await dcaCore.connect(executor).executeDCA(positionId, {
        swapAmountOutMin: 0,
        swapPath: defaultSwapPath,
      });

      const now = await getCurrentTimestamp();
      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[8]).to.be.eq(now);

      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: 0,
          swapPath: defaultSwapPath,
        })
      ).to.be.revertedWith("Not time to DCA");
    });
    it("should execute DCA", async () => {
      const positionPre = await dcaCore.positions(positionId);
      const dcaAmount = positionPre[6];

      const balanceFundBefore = await usdc.balanceOf(dcaCore.address);
      const balanceAssetBefore = await weth.balanceOf(dcaCore.address);

      const uniRouter = await ethers.getContractAt(
        "IUniswapV2Router",
        SUSHISWAP_ROUTER_ADDRESS[chainId]
      );
      const swapAmounts1 = await uniRouter.getAmountsOut(dcaAmount, [
        usdc.address,
        weth.address,
      ]);

      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: swapAmounts1[1],
          swapPath: defaultSwapPath,
        })
      )
        .to.emit(dcaCore, "ExecuteDCA")
        .withArgs(positionId);

      const balanceFundAfter = await usdc.balanceOf(dcaCore.address);
      const balanceAssetAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceFundBefore.sub(balanceFundAfter)).to.be.eq(defaultDCA);

      const wethDifference = balanceAssetAfter.sub(balanceAssetBefore);
      expect(wethDifference).to.be.gte(swapAmounts1[1]);

      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[4]).to.be.eq(defaultFund.sub(defaultDCA));
      expect(positionPost[5]).to.be.eq(wethDifference);

      const lastDCA = BigNumber.from(positionPost[8]);
      const nextDCA = lastDCA.add(positionPost[7]);

      await fastForwardTo(nextDCA.toNumber());

      const swapAmounts2 = await uniRouter.getAmountsOut(dcaAmount, [
        usdc.address,
        weth.address,
      ]);
      await expect(
        dcaCore.connect(executor).executeDCA(positionId, {
          swapAmountOutMin: swapAmounts2[1],
          swapPath: defaultSwapPath,
        })
      )
        .to.emit(dcaCore, "ExecuteDCA")
        .withArgs(positionId);
    });
  });

  describe("executeDCAs()", async () => {
    let positionIds: BigNumber[];

    beforeEach(async () => {
      await mintUsdc(defaultFund, aliceAddress);
      await mintUsdc(defaultFund, bobAddress);

      await usdc
        .connect(bob)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      positionIds = [];
      positionIds.push(await getNextPositionId(dcaCore));
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      positionIds.push(await getNextPositionId(dcaCore));
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      positionIds.push(await getNextPositionId(dcaCore));
      await dcaCore
        .connect(bob)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA.mul(2),
          defaultInterval,
          defaultSlippage
        );
    });

    it("should revert if params length not equal", async () => {
      await expect(
        dcaCore.connect(executor).executeDCAs([1], [])
      ).to.be.revertedWith("Params lengths must be equal");
    });
    it("should execute multiple DCAs", async () => {
      const positionAlice = await dcaCore.positions(positionIds[0]);
      const dcaAmountAlice = positionAlice[6];
      const positionBob = await dcaCore.positions(positionIds[2]);
      const dcaAmountBob = positionBob[6];

      const balanceFundBefore = await usdc.balanceOf(dcaCore.address);
      const balanceAssetBefore = await weth.balanceOf(dcaCore.address);

      const uniRouter = await ethers.getContractAt(
        "IUniswapV2Router",
        SUSHISWAP_ROUTER_ADDRESS[chainId]
      );
      const swapAmountsAlice = await uniRouter.getAmountsOut(
        dcaAmountAlice,
        defaultSwapPath
      );
      const swapAmountsBob = await uniRouter.getAmountsOut(
        dcaAmountBob,
        defaultSwapPath
      );
      const swapAmountAlice = swapAmountsAlice[1].mul(995).div(1000); // 0.5% slippage
      const swapAmountBob = swapAmountsBob[1].mul(995).div(1000); // 0.5% slippage

      await dcaCore.connect(executor).executeDCAs(positionIds, [
        { swapAmountOutMin: swapAmountAlice, swapPath: defaultSwapPath },
        { swapAmountOutMin: swapAmountAlice, swapPath: defaultSwapPath },
        { swapAmountOutMin: swapAmountBob, swapPath: defaultSwapPath },
      ]);

      const balanceFundAfter = await usdc.balanceOf(dcaCore.address);
      const balanceAssetAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceFundBefore.sub(balanceFundAfter)).to.be.eq(
        defaultDCA.mul(4)
      ); // 2 alice + 2 bob

      const wethDifference = balanceAssetAfter.sub(balanceAssetBefore);
      expect(wethDifference).to.be.gte(
        swapAmountAlice.mul(2).add(swapAmountBob)
      );
    });
  });

  describe("setAllowedPair()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .setAllowedTokenPair(usdc.address, weth.address, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if fund token equal asset token", async () => {
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedTokenPair(usdc.address, usdc.address, false)
      ).to.be.revertedWith("Duplicate tokens");
    });
    it("should revert if new value is same to old value", async () => {
      expect(
        await dcaCore.allowedTokenPairs(usdc.address, weth.address)
      ).to.be.eq(true);
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedTokenPair(usdc.address, weth.address, true)
      ).to.be.revertedWith("Same _allowed value");
    });
    it("should set new value", async () => {
      expect(
        await dcaCore.allowedTokenPairs(usdc.address, weth.address)
      ).to.be.eq(true);
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedTokenPair(usdc.address, weth.address, false)
      )
        .to.emit(dcaCore, "AllowedTokenPairSet")
        .withArgs(usdc.address, weth.address, false);
      expect(
        await dcaCore.allowedTokenPairs(usdc.address, weth.address)
      ).to.be.eq(false);
    });
  });

  describe("setMinSlippage()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(dcaCore.connect(alice).setMinSlippage(0)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
    it("should revert if new value is same to old value", async () => {
      await expect(
        dcaCore.connect(deployer).setMinSlippage(defaultSlippage)
      ).to.be.revertedWith("Same slippage value");
    });
    it("should revert if slippage is too large", async () => {
      await expect(
        dcaCore.connect(deployer).setMinSlippage(1000000)
      ).to.be.revertedWith("Min slippage too large");
    });
    it("should set new value", async () => {
      expect(await dcaCore.minSlippage()).to.be.eq(defaultSlippage);
      await expect(
        dcaCore.connect(deployer).setMinSlippage(defaultSlippage.add(1))
      )
        .to.emit(dcaCore, "MinSlippageSet")
        .withArgs(defaultSlippage.add(1));
      expect(await dcaCore.minSlippage()).to.be.eq(defaultSlippage.add(1));
    });
  });

  describe("setSystemPause()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(alice).setSystemPause(false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if new value is same to old value", async () => {
      expect(await dcaCore.paused()).to.be.eq(false);
      await expect(
        dcaCore.connect(deployer).setSystemPause(false)
      ).to.be.revertedWith("Same _paused value");
    });
    it("should set new value", async () => {
      expect(await dcaCore.paused()).to.be.eq(false);
      await expect(dcaCore.connect(deployer).setSystemPause(true))
        .to.emit(dcaCore, "PausedSet")
        .withArgs(true);
      expect(await dcaCore.paused()).to.be.eq(true);
    });
  });

  describe("_swap()", async () => {
    it("should revert", async () => {
      // TODO: WRAPPER
    });
  });

  describe("getNextPositionId()", async () => {
    it("should get next positionId", async () => {
      expect(await dcaCore.getNextPositionId()).to.be.eq(0);

      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      expect(await dcaCore.getNextPositionId()).to.be.eq(1);
    });
  });

  describe("getReadyPositionIds()", async () => {
    it("should return ids of active positions", async () => {
      await mintUsdc(defaultFund.mul(10), aliceAddress);

      const emptyIds = await dcaCore.getReadyPositionIds();
      expect(emptyIds.length).to.be.eq(0);

      const positionId1 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
      const activePositions1 = await dcaCore.getReadyPositionIds();
      expect(activePositions1.length).to.be.eq(1);
      expect(activePositions1[0]).to.be.eq(positionId1);

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );
      const activePositions2 = await dcaCore.getReadyPositionIds();
      expect(activePositions2.length).to.be.eq(2);
      expect(activePositions2[0]).to.be.eq(positionId1);
      expect(activePositions2[1]).to.be.eq(positionId2);

      await dcaCore.connect(alice).withdrawTokenIn(positionId1, defaultFund);
      const activePositions3 = await dcaCore.getReadyPositionIds();
      expect(activePositions3.length).to.be.eq(1);
      expect(activePositions3[0]).to.be.eq(positionId2);
    });
  });

  describe("getPositions()", async () => {
    it("should revert if positionId does not exist", async () => {
      const positionId = await getNextPositionId(dcaCore);
      await expect(dcaCore.getPositions([positionId])).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should return selected positions", async () => {
      await mintUsdc(defaultFund.mul(10), aliceAddress);

      const emptyPositions = await dcaCore.getPositions([]);
      expect(emptyPositions.length).to.be.eq(0);

      const positionId1 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      const positions1 = await dcaCore.getPositions([positionId1]);
      expect(positions1.length).to.be.eq(1);
      expect(positions1[0].id).to.be.eq(positionId1);

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      const positions2 = await dcaCore.getPositions([positionId1, positionId2]);
      expect(positions2.length).to.be.eq(2);
      expect(positions2[0].id).to.be.eq(positionId1);
      expect(positions2[1].id).to.be.eq(positionId2);
    });
  });
});
