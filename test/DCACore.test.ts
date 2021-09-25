import { ethers } from "hardhat";
import { Greeter__factory } from "../typechain";

import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const { expect } = chai;

describe("DCACore", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let snapshotId: string;

  before("setup contracts", async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createAndDepositFund()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("depositFund()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("withdrawFund()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("withdraw()", async () => {
    it("should revert", async () => {
      // test
    });
  });

  describe("doDCA()", async () => {
    it("should revert", async () => {
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
});
