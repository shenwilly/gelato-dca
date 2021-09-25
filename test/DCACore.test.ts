import { ethers } from "hardhat";
import { DCACore, DCACore__factory } from "../typechain";

import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SUSHIWAP_ROUTER_MAINNET } from "../constants";

const { expect } = chai;
chai.use(smock.matchers);

describe("DCACore", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let dcaCore: DCACore;

  let snapshotId: string;

  before("setup contracts", async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHIWAP_ROUTER_MAINNET,
      deployer.address
    );
    await dcaCore.deployed();

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createAndDepositFund()", async () => {
    it("should revert if token fund is not allowed", async () => {
      // test
    });
    it("should revert if token asset is not allowed", async () => {
      // test
    });
    it("should revert if token pair is not allowed", async () => {
      // test
    });
    it("should revert if fund amount is 0", async () => {
      // test
    });
    it("should revert if DCA amount is 0", async () => {
      // test
    });
    it("should revert if interval is less than one minute", async () => {
      // test
    });
    it("should create position and deposit fund", async () => {
      // test
    });
  });

  describe("depositFund()", async () => {
    it("should revert if position does not exist", async () => {
      // test
    });
    it("should revert if amount is 0", async () => {
      // test
    });
    it("should revert if sender is not position owner", async () => {
      // test
    });
    it("should revert if fund amount modulo DCA amount not equal 0", async () => {
      // test
    });
    it("should deposit fund", async () => {
      // test
    });
  });

  describe("withdrawFund()", async () => {
    it("should revert if position does not exist", async () => {
      // test
    });
    it("should revert if amount is 0", async () => {
      // test
    });
    it("should revert if sender is not position owner", async () => {
      // test
    });
    it("should revert if fund amount modulo DCA amount not equal 0", async () => {
      // test
    });
    it("should withdraw fund", async () => {
      // test
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

  describe("setAllowedTokenFunds()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("setAllowedTokenAssets()", async () => {
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
