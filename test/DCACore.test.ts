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
import { getNextPositionId, mintUsdc } from "./helpers/utils";
import { parseUnits } from "@ethersproject/units";

const { expect } = chai;
chai.use(solidity);
chai.use(smock.matchers);

describe("DCACore", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let dcaCore: DCACore;

  let usdc: IERC20;
  let weth: IERC20;

  let defaultFund: BigNumber;
  let defaultDCA: BigNumber;
  let defaultInterval: BigNumberish;

  let snapshotId: string;

  before("setup contracts", async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;

    defaultFund = parseUnits("10000", USDC_DECIMALS);
    defaultDCA = defaultFund.div(10);
    defaultInterval = 60; // second;

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHIWAP_ROUTER_MAINNET,
      deployer.address
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
    it("should revert if position does not exist", async () => {
      // test
    });
    it("should revert if withdrawable is 0", async () => {
      // test
    });
    it("should withdraw", async () => {
      // test
    });
  });

  describe("executeDCA()", async () => {
    it("should revert if position does not exist", async () => {
      // test
    });
    it("should revert if position has run out of fund", async () => {
      // test
    });
    it("should revert if token pair is not allowed", async () => {
      // test
    });
    it("should execute DCA", async () => {
      // test
    });
  });

  describe("setAllowedTokenFund()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("setAllowedTokenAsset()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("setAllowedPair()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("setSystemPause()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("_swap()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("getActivePositionIds()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("getPositions()", async () => {
    it("should revert", async () => {
      // test
    });
  });
});
