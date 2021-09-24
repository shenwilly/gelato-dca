import { ethers } from "hardhat";
import { Greeter__factory } from "../typechain";

import chai from "chai";
const { expect } = chai;

describe("Greeter", function () {
  it("Should return the new greeting once it's changed", async function () {
    const GreeterFactory = <Greeter__factory>(
      await ethers.getContractFactory("Greeter")
    );

    const greeter = await GreeterFactory.deploy("Hello, world!");
    await greeter.deployed();
    expect(await greeter.greet()).to.equal("Hello, world!");
    const setGreetingTx = await greeter.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
});
