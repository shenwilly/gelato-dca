import { ethers } from "hardhat";
import {
  DCACore,
  DCACoreResolver,
  DCACoreResolver__factory,
  DCACore__factory,
  IERC20,
  IPokeMe,
  ITaskTreasury,
} from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ETH_TOKEN_ADDRESS,
  GELATO_ADDRESS,
  POKEME_ADDRESS,
  SUSHISWAP_ROUTER_ADDRESS,
  TASK_TREASURY_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
} from "../../constants";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  fastForwardTo,
  getCurrentTimestamp,
  getNextPositionId,
  impersonateAccount,
  mintUsdc,
} from "../helpers/utils";
import { parseEther, parseUnits } from "@ethersproject/units";

const { expect } = chai;
chai.use(solidity);

describe("Integration Test: Gelato DCA", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let executor: SignerWithAddress;
  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let dcaCore: DCACore;
  let resolver: DCACoreResolver;
  let pokeMe: IPokeMe;
  let taskTreasury: ITaskTreasury;

  let usdc: IERC20;
  let weth: IERC20;

  let defaultFund: BigNumber;
  let defaultDCA: BigNumber;
  let defaultSlippage: BigNumber;
  let defaultInterval: BigNumberish;
  let defaultGelatoFee: BigNumber;

  let executeDCAsSelector: string;
  let resolverData: string;
  let resolverHash: string;

  let snapshotId: string;
  const chainId = 1;

  before("setup contracts", async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddress = deployer.address;
    aliceAddress = alice.address;
    bobAddress = bob.address;

    defaultFund = parseUnits("3000", USDC_DECIMALS);
    defaultDCA = defaultFund.div(3);
    defaultInterval = 60; // second;
    defaultGelatoFee = parseEther("0.05");

    usdc = <IERC20>await ethers.getContractAt("IERC20", USDC_ADDRESS[chainId]);
    weth = <IERC20>await ethers.getContractAt("IERC20", WETH_ADDRESS[chainId]);

    const DCACoreFactory = (await ethers.getContractFactory(
      "DCACore",
      deployer
    )) as DCACore__factory;
    dcaCore = await DCACoreFactory.deploy(
      SUSHISWAP_ROUTER_ADDRESS[chainId],
      POKEME_ADDRESS[chainId],
      weth.address
    );
    await dcaCore.deployed();
    defaultSlippage = await dcaCore.minSlippage();

    const DCACoreResolverFactory = (await ethers.getContractFactory(
      "DCACoreResolver",
      deployer
    )) as DCACoreResolver__factory;
    resolver = await DCACoreResolverFactory.deploy(
      dcaCore.address,
      SUSHISWAP_ROUTER_ADDRESS[chainId]
    );
    await resolver.deployed();

    pokeMe = <IPokeMe>(
      await ethers.getContractAt("IPokeMe", POKEME_ADDRESS[chainId])
    );
    taskTreasury = <ITaskTreasury>(
      await ethers.getContractAt(
        "ITaskTreasury",
        TASK_TREASURY_ADDRESS[chainId]
      )
    );
    await taskTreasury
      .connect(deployer)
      .depositFunds(deployerAddress, ETH_TOKEN_ADDRESS, 0, {
        value: parseEther("1"),
      });

    await dcaCore
      .connect(deployer)
      .setAllowedTokenPair(usdc.address, weth.address, true);

    await mintUsdc(defaultFund.mul(10), aliceAddress);
    await mintUsdc(defaultFund.mul(10), bobAddress);

    await usdc
      .connect(alice)
      .approve(dcaCore.address, ethers.constants.MaxUint256);
    await usdc
      .connect(bob)
      .approve(dcaCore.address, ethers.constants.MaxUint256);

    executor = await impersonateAccount(GELATO_ADDRESS[chainId]);

    executeDCAsSelector = dcaCore.interface.getSighash("executeDCAs");
    resolverData = resolver.interface.encodeFunctionData(
      "getExecutablePositions"
    );
    resolverHash = await pokeMe.getResolverHash(resolver.address, resolverData);

    await pokeMe
      .connect(deployer)
      .createTask(
        dcaCore.address,
        executeDCAsSelector,
        resolver.address,
        resolverData
      );

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("Gelato DCA", async () => {
    it("should DCA until funds run out", async () => {
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

      const balanceBeforeUsdc = await usdc.balanceOf(dcaCore.address);
      const balanceBeforeWeth = await weth.balanceOf(dcaCore.address);

      let hasFunds = true;
      while (hasFunds) {
        const [canExec, payload] = await resolver.getExecutablePositions();
        expect(canExec).to.be.eq(true);

        const tx = await pokeMe
          .connect(executor)
          .exec(
            defaultGelatoFee,
            ETH_TOKEN_ADDRESS,
            deployerAddress,
            true,
            resolverHash,
            dcaCore.address,
            payload
          );
        expect(tx).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId);

        const now = await getCurrentTimestamp();
        await fastForwardTo(now.add(defaultInterval).toNumber());

        const position = await dcaCore.positions(positionId);
        if (position[4].lt(position[6])) {
          hasFunds = false;
        }
      }

      const balanceAfterUsdc = await usdc.balanceOf(dcaCore.address);
      const balanceAfterWeth = await weth.balanceOf(dcaCore.address);

      expect(balanceBeforeUsdc.sub(balanceAfterUsdc)).to.be.eq(defaultFund);
      expect(balanceAfterWeth.sub(balanceBeforeWeth)).to.be.gt(0);
    });
    it("should continue DCA if inactive position gets new deposit", async () => {
      const positionId = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultDCA,
          defaultDCA,
          defaultInterval,
          defaultSlippage
        );

      const [canExec, payload] = await resolver.getExecutablePositions();
      expect(canExec).to.be.eq(true);
      const tx1 = await pokeMe
        .connect(executor)
        .exec(
          defaultGelatoFee,
          ETH_TOKEN_ADDRESS,
          deployerAddress,
          true,
          resolverHash,
          dcaCore.address,
          payload
        );
      expect(tx1).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId);

      const positionPre = await dcaCore.positions(positionId);
      expect(positionPre[4]).to.be.eq(0); // fund left

      const now = await getCurrentTimestamp();
      await fastForwardTo(now.add(defaultInterval).toNumber());

      const [canExec2] = await resolver.getExecutablePositions();
      expect(canExec2).to.be.eq(false);

      await dcaCore.connect(alice).deposit(positionId, defaultDCA);

      const [canExec3, payload3] = await resolver.getExecutablePositions();
      expect(canExec3).to.be.eq(true);

      const tx2 = await pokeMe
        .connect(executor)
        .exec(
          defaultGelatoFee,
          ETH_TOKEN_ADDRESS,
          deployerAddress,
          true,
          resolverHash,
          dcaCore.address,
          payload3
        );
      expect(tx2).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId);

      const positionPost = await dcaCore.positions(positionId);
      expect(positionPost[5]).to.be.gt(positionPre[5]);
    });

    it("should DCA each position according to interval", async () => {
      const positionId1 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(alice)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          200,
          defaultSlippage
        );

      const positionId2 = await getNextPositionId(dcaCore);
      await dcaCore
        .connect(bob)
        .createPositionAndDeposit(
          usdc.address,
          weth.address,
          defaultFund,
          defaultDCA,
          400,
          defaultSlippage
        );

      const [canExec1, payload1] = await resolver.getExecutablePositions();
      expect(canExec1).to.be.eq(true);
      const tx1 = await pokeMe
        .connect(executor)
        .exec(
          defaultGelatoFee,
          ETH_TOKEN_ADDRESS,
          deployerAddress,
          true,
          resolverHash,
          dcaCore.address,
          payload1
        );
      expect(tx1).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId1);
      expect(tx1).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId2);

      let now = await getCurrentTimestamp();
      await fastForwardTo(now.add(200).toNumber());

      const [canExec2, payload2] = await resolver.getExecutablePositions();
      expect(canExec2).to.be.eq(true);
      const tx2 = await pokeMe
        .connect(executor)
        .exec(
          defaultGelatoFee,
          ETH_TOKEN_ADDRESS,
          deployerAddress,
          true,
          resolverHash,
          dcaCore.address,
          payload2
        );
      expect(tx2).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId1);

      now = await getCurrentTimestamp();
      await fastForwardTo(now.add(200).toNumber());

      const [canExec3, paylod3] = await resolver.getExecutablePositions();
      expect(canExec3).to.be.eq(true);
      const tx3 = await pokeMe
        .connect(executor)
        .exec(
          defaultGelatoFee,
          ETH_TOKEN_ADDRESS,
          deployerAddress,
          true,
          resolverHash,
          dcaCore.address,
          paylod3
        );
      expect(tx3).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId1);
      expect(tx3).to.emit(dcaCore, "ExecuteDCA").withArgs(positionId2);
    });
  });
});
