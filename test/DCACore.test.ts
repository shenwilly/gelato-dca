import { ethers } from "hardhat";
import { DCACore, DCACore__factory, IERC20 } from "../typechain";

import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SUSHIWAP_ROUTER_MAINNET,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
} from "../constants";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  fastForwardTo,
  getCurrentTimestamp,
  getNextPositionId,
  mintUsdc,
} from "./helpers/utils";
import { parseUnits } from "@ethersproject/units";

const { expect } = chai;
chai.use(solidity);
chai.use(smock.matchers);

// TODO: NotPaused test cases
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
  let defaultInterval: BigNumberish;
  let defaultSwapPath: string[];

  let snapshotId: string;

  before("setup contracts", async () => {
    [deployer, alice, bob, executor] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;
    executorAddress = executor.address;

    defaultFund = parseUnits("10000", USDC_DECIMALS);
    defaultDCA = defaultFund.div(10);
    defaultInterval = 60; // second;
    defaultSwapPath = [USDC_ADDRESS, WETH_ADDRESS];

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHIWAP_ROUTER_MAINNET,
      executorAddress
    );
    await dcaCore.deployed();

    usdc = <IERC20>await ethers.getContractAt("IERC20", USDC_ADDRESS);
    weth = <IERC20>await ethers.getContractAt("IERC20", WETH_ADDRESS);

    await dcaCore.connect(deployer).setAllowedTokenFund(usdc.address, true);
    await dcaCore.connect(deployer).setAllowedTokenAsset(weth.address, true);
    await dcaCore
      .connect(deployer)
      .setAllowedPair(usdc.address, weth.address, true);

    await mintUsdc(defaultFund, aliceAddress);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createAndDepositFund()", async () => {
    it("should revert if token fund is not allowed", async () => {
      expect(await dcaCore.allowedTokenFunds(weth.address)).to.be.eq(false);
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            weth.address,
            weth.address,
            defaultFund,
            defaultDCA,
            defaultInterval
          )
      ).to.be.revertedWith("_tokenFund not allowed");
    });
    it("should revert if token asset is not allowed", async () => {
      expect(await dcaCore.allowedTokenAssets(usdc.address)).to.be.eq(false);
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            usdc.address,
            defaultFund,
            defaultDCA,
            defaultInterval
          )
      ).to.be.revertedWith("_tokenAsset not allowed");
    });
    it("should revert if token pair is not allowed", async () => {
      await dcaCore
        .connect(deployer)
        .setAllowedPair(usdc.address, weth.address, false);
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            defaultInterval
          )
      ).to.be.revertedWith("Pair not allowed");
    });
    it("should revert if fund amount is 0", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            0,
            defaultDCA,
            defaultInterval
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if DCA amount is 0", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            defaultFund,
            0,
            defaultInterval
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if interval is less than one minute", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            0
          )
      ).to.be.revertedWith("Invalid inputs");

      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            defaultFund,
            defaultDCA,
            59
          )
      ).to.be.revertedWith("Invalid inputs");
    });
    it("should revert if fund amount modulo DCA amount not equal 0", async () => {
      await expect(
        dcaCore
          .connect(alice)
          .createAndDepositFund(
            usdc.address,
            weth.address,
            100,
            3,
            defaultInterval
          )
      ).to.be.revertedWith("Improper DCA amount");
    });
    it("should create position and deposit fund", async () => {
      const positionId = await getNextPositionId(dcaCore);
      await usdc.connect(alice).approve(dcaCore.address, defaultFund);

      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      const tx = await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      expect(tx)
        .to.emit(dcaCore, "PositionCreated")
        .withArgs(
          positionId,
          aliceAddress,
          usdc.address,
          weth.address,
          defaultDCA,
          defaultInterval
        );
      expect(tx)
        .to.emit(dcaCore, "DepositFund")
        .withArgs(positionId, defaultFund);

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
      expect(position[5]).to.be.eq(defaultDCA);
      expect(position[6]).to.be.eq(0);
      expect(position[7]).to.be.eq(defaultInterval);
      expect(position[8]).to.be.eq(0);
    });
  });

  describe("depositFund()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).depositFund(positionId.add(1), 1)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).depositFund(positionId, 0)
      ).to.be.revertedWith("_amount must be > 0");
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).depositFund(positionId, 1)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if fund amount modulo DCA amount not equal 0", async () => {
      await expect(
        dcaCore.connect(alice).depositFund(positionId, defaultFund.sub(1))
      ).to.be.revertedWith("Improper amountFund");
    });
    it("should deposit fund", async () => {
      await mintUsdc(defaultDCA, alice.address);

      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      await expect(dcaCore.connect(alice).depositFund(positionId, defaultDCA))
        .to.emit(dcaCore, "DepositFund")
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

  describe("withdrawFund()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).withdrawFund(positionId.add(1), 1)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if amount is 0", async () => {
      await expect(
        dcaCore.connect(alice).withdrawFund(positionId, 0)
      ).to.be.revertedWith("_amount must be > 0");
    });
    it("should revert if sender is not position owner", async () => {
      await expect(
        dcaCore.connect(bob).withdrawFund(positionId, 1)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if fund amount modulo DCA amount not equal 0", async () => {
      await expect(
        dcaCore.connect(alice).withdrawFund(positionId, defaultDCA.sub(1))
      ).to.be.revertedWith("Improper amountFund");
    });
    it("should withdraw fund", async () => {
      const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
      const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

      await expect(dcaCore.connect(alice).withdrawFund(positionId, defaultDCA))
        .to.emit(dcaCore, "WithdrawFund")
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

  describe("withdraw()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );
    });

    it("should revert if position does not exist", async () => {
      await expect(
        dcaCore.connect(alice).withdraw(positionId.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index"
      );
    });
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(bob).withdraw(positionId)
      ).to.be.revertedWith("Sender must be owner");
    });
    it("should revert if withdrawable is 0", async () => {
      await expect(
        dcaCore.connect(alice).withdraw(positionId)
      ).to.be.revertedWith("DCA asset amount must be > 0");
    });
    it("should withdraw", async () => {
      await dcaCore.connect(executor).executeDCA(positionId, {
        swapAmountOutMin: 0,
        swapPath: [usdc.address, weth.address],
      });

      const positionPre = await dcaCore.positions(positionId);
      const withdrawable = positionPre[6];
      expect(withdrawable).to.be.gt(0);

      const balanceAliceBefore = await weth.balanceOf(aliceAddress);
      const balanceContractBefore = await weth.balanceOf(dcaCore.address);

      await expect(dcaCore.connect(alice).withdraw(positionId))
        .to.emit(dcaCore, "Withdraw")
        .withArgs(positionId, withdrawable);

      const balanceAliceAfter = await weth.balanceOf(aliceAddress);
      const balanceContractAfter = await weth.balanceOf(dcaCore.address);

      expect(balanceAliceAfter.sub(balanceAliceBefore)).to.be.eq(withdrawable);
      expect(balanceContractBefore.sub(balanceContractAfter)).to.be.eq(
        withdrawable
      );

      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[6]).to.be.eq(0);
    });
  });

  describe("executeDCA()", async () => {
    let positionId: BigNumber;

    beforeEach(async () => {
      positionId = await getNextPositionId(dcaCore);
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
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
    it("should revert if position has run out of fund", async () => {
      await dcaCore.connect(alice).withdrawFund(positionId, defaultFund);

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
        .setAllowedPair(usdc.address, weth.address, false);

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
      const dcaAmount = positionPre[5];

      const balanceFundBefore = await usdc.balanceOf(dcaCore.address);
      const balanceAssetBefore = await weth.balanceOf(dcaCore.address);

      const uniRouter = await ethers.getContractAt(
        "IUniswapV2Router",
        SUSHIWAP_ROUTER_MAINNET
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
      expect(positionPost[6]).to.be.eq(wethDifference);

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

  describe("setAllowedTokenFund()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(alice).setAllowedTokenFund(usdc.address, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if new value is same to old value", async () => {
      expect(await dcaCore.allowedTokenFunds(usdc.address)).to.be.eq(true);
      await expect(
        dcaCore.connect(deployer).setAllowedTokenFund(usdc.address, true)
      ).to.be.revertedWith("Same _allowed value");
    });
    it("should set new value", async () => {
      expect(await dcaCore.allowedTokenFunds(usdc.address)).to.be.eq(true);
      await expect(
        dcaCore.connect(deployer).setAllowedTokenFund(usdc.address, false)
      )
        .to.emit(dcaCore, "AllowedTokenFundSet")
        .withArgs(usdc.address, false);
      expect(await dcaCore.allowedTokenFunds(usdc.address)).to.be.eq(false);
    });
  });

  describe("setAllowedTokenAsset()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(alice).setAllowedTokenAsset(weth.address, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if new value is same to old value", async () => {
      expect(await dcaCore.allowedTokenAssets(weth.address)).to.be.eq(true);
      await expect(
        dcaCore.connect(deployer).setAllowedTokenAsset(weth.address, true)
      ).to.be.revertedWith("Same _allowed value");
    });
    it("should set new value", async () => {
      expect(await dcaCore.allowedTokenAssets(weth.address)).to.be.eq(true);
      await expect(
        dcaCore.connect(deployer).setAllowedTokenAsset(weth.address, false)
      )
        .to.emit(dcaCore, "AllowedTokenAssetSet")
        .withArgs(weth.address, false);
      expect(await dcaCore.allowedTokenAssets(weth.address)).to.be.eq(false);
    });
  });

  describe("setAllowedPair()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        dcaCore.connect(alice).setAllowedPair(usdc.address, weth.address, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if fund token equal asset token", async () => {
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedPair(usdc.address, usdc.address, false)
      ).to.be.revertedWith("Duplicate tokens");
    });
    it("should revert if new value is same to old value", async () => {
      expect(await dcaCore.allowedPairs(usdc.address, weth.address)).to.be.eq(
        true
      );
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedPair(usdc.address, weth.address, true)
      ).to.be.revertedWith("Same _allowed value");
    });
    it("should set new value", async () => {
      expect(await dcaCore.allowedPairs(usdc.address, weth.address)).to.be.eq(
        true
      );
      await expect(
        dcaCore
          .connect(deployer)
          .setAllowedPair(usdc.address, weth.address, false)
      )
        .to.emit(dcaCore, "AllowedPairSet")
        .withArgs(usdc.address, weth.address, false);
      expect(await dcaCore.allowedPairs(usdc.address, weth.address)).to.be.eq(
        false
      );
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
      // test
    });
  });

  describe("getNextPositionId()", async () => {
    it("should get next positionId", async () => {
      expect(await dcaCore.getNextPositionId()).to.be.eq(0);

      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      expect(await dcaCore.getNextPositionId()).to.be.eq(1);
    });
  });

  describe("getActivePositionIds()", async () => {
    it("should return ids of active positions", async () => {
      await mintUsdc(defaultFund.mul(10), aliceAddress);
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      const emptyIds = await dcaCore.getActivePositionIds();
      expect(emptyIds.length).to.be.eq(0);

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
      const activePositions1 = await dcaCore.getActivePositionIds();
      expect(activePositions1.length).to.be.eq(1);
      expect(activePositions1[0]).to.be.eq(positionId1);

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );
      const activePositions2 = await dcaCore.getActivePositionIds();
      expect(activePositions2.length).to.be.eq(2);
      expect(activePositions2[0]).to.be.eq(positionId1);
      expect(activePositions2[1]).to.be.eq(positionId2);

      await dcaCore.connect(alice).withdrawFund(positionId1, defaultFund);
      const activePositions3 = await dcaCore.getActivePositionIds();
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
      await usdc
        .connect(alice)
        .approve(dcaCore.address, ethers.constants.MaxUint256);

      const emptyPositions = await dcaCore.getPositions([]);
      expect(emptyPositions.length).to.be.eq(0);

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

      const positions1 = await dcaCore.getPositions([positionId1]);
      expect(positions1.length).to.be.eq(1);
      expect(positions1[0].id).to.be.eq(positionId1);

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createAndDepositFund(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          defaultInterval
        );

      const positions2 = await dcaCore.getPositions([positionId1, positionId2]);
      expect(positions2.length).to.be.eq(2);
      expect(positions2[0].id).to.be.eq(positionId1);
      expect(positions2[1].id).to.be.eq(positionId2);
    });
  });
});
