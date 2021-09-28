import { ethers } from "hardhat";
import {
  DCACore,
  DCACoreResolver,
  DCACoreResolver__factory,
  DCACore__factory,
  IERC20,
  IPokeMe,
  ITaskTreasury,
} from "../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  POKEME_MAINNET,
  SUSHIWAP_ROUTER_MAINNET,
  TASK_TREASURY_MAINNET,
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
import { Contract } from "ethers/lib/ethers";

const { expect } = chai;
chai.use(solidity);

describe("DCACoreResolver", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;

  let dcaCore: DCACore;
  let resolver: DCACoreResolver;
  let pokeMe: Contract;
  let taskTreasury: Contract;

  let usdc: IERC20;
  let weth: IERC20;

  let defaultFund: BigNumber;
  let defaultDCA: BigNumber;
  let defaultInterval: BigNumberish;
  let defaultSwapPath: string[];

  let snapshotId: string;

  before("setup contracts", async () => {
    [deployer, alice] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;

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
      POKEME_MAINNET
    );
    await dcaCore.deployed();

    const DCACoreResolverFactory = (await ethers.getContractFactory(
      "DCACoreResolver",
      deployer
    )) as DCACoreResolver__factory;
    resolver = await DCACoreResolverFactory.deploy(
      dcaCore.address,
      SUSHIWAP_ROUTER_MAINNET
    );
    await resolver.deployed();

    pokeMe = <IPokeMe>await ethers.getContractAt("IPokeMe", POKEME_MAINNET);
    taskTreasury = <ITaskTreasury>(
      await ethers.getContractAt("ITaskTreasury", TASK_TREASURY_MAINNET)
    );

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
  // describe("getExecutablePositions()", async () => {
  //   it("should revert if token fund is not allowed", async () => {
  //     expect(await dcaCore.allowedTokenFunds(weth.address)).to.be.eq(false);
  //     await expect(
  //       dcaCore
  //         .connect(alice)
  //         .createAndDepositFund(
  //           weth.address,
  //           weth.address,
  //           defaultFund,
  //           defaultDCA,
  //           defaultInterval
  //         )
  //     ).to.be.revertedWith("_tokenFund not allowed");
  //   });
  //   it("should create position and deposit fund", async () => {
  //     const positionId = await getNextPositionId(dcaCore);
  //     await usdc.connect(alice).approve(dcaCore.address, defaultFund);

  //     const balanceAliceBefore = await usdc.balanceOf(aliceAddress);
  //     const balanceContractBefore = await usdc.balanceOf(dcaCore.address);

  //     const tx = await dcaCore
  //       .connect(alice)
  //       .createAndDepositFund(
  //         usdc.address,
  //         weth.address,
  //         defaultFund,
  //         defaultDCA,
  //         defaultInterval
  //       );

  //     expect(tx)
  //       .to.emit(dcaCore, "PositionCreated")
  //       .withArgs(
  //         positionId,
  //         aliceAddress,
  //         usdc.address,
  //         weth.address,
  //         defaultDCA,
  //         defaultInterval
  //       );
  //     expect(tx)
  //       .to.emit(dcaCore, "DepositFund")
  //       .withArgs(positionId, defaultFund);

  //     const balanceAliceAfter = await usdc.balanceOf(aliceAddress);
  //     const balanceContractAfter = await usdc.balanceOf(dcaCore.address);

  //     expect(balanceAliceBefore.sub(balanceAliceAfter)).to.be.eq(defaultFund);
  //     expect(balanceContractAfter.sub(balanceContractBefore)).to.be.eq(
  //       defaultFund
  //     );

  //     const position = await dcaCore.positions(positionId);
  //     expect(position[0]).to.be.eq(positionId);
  //     expect(position[1]).to.be.eq(aliceAddress);
  //     expect(position[2]).to.be.eq(usdc.address);
  //     expect(position[3]).to.be.eq(weth.address);
  //     expect(position[4]).to.be.eq(defaultFund);
  //     expect(position[5]).to.be.eq(defaultDCA);
  //     expect(position[6]).to.be.eq(0);
  //     expect(position[7]).to.be.eq(defaultInterval);
  //     expect(position[8]).to.be.eq(0);
  //   });
  // });
});
