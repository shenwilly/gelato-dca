import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";
import {
  CORE_ADDRESS,
  ETH_TOKEN_ADDRESS,
  POKEME_ADDRESS,
  RESOLVER_ADDRESS,
  TASK_TREASURY_ADDRESS,
} from "../constants";
import { DCACore, DCACoreResolver, IPokeMe, ITaskTreasury } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 137;

  const DCA_CORE_ADDRESS = CORE_ADDRESS[chainId];
  const DCA_RESOLVER_ADDRESS = RESOLVER_ADDRESS[chainId];

  const dcaCore = <DCACore>(
    await hre.ethers.getContractAt("DCACore", DCA_CORE_ADDRESS)
  );
  const resolver = <DCACoreResolver>(
    await hre.ethers.getContractAt("DCACoreResolver", DCA_RESOLVER_ADDRESS)
  );

  const pokeMe = <IPokeMe>(
    await hre.ethers.getContractAt("IPokeMe", POKEME_ADDRESS[chainId])
  );
  const taskTreasury = <ITaskTreasury>(
    await hre.ethers.getContractAt(
      "ITaskTreasury",
      TASK_TREASURY_ADDRESS[chainId]
    )
  );
  const txDeposit = await taskTreasury
    .connect(signer)
    .depositFunds(signer.address, ETH_TOKEN_ADDRESS, 0, {
      value: parseEther("5"),
    });
  console.log("Deposit:", txDeposit.hash);
  await txDeposit.wait();

  const executeDCAsSelector = dcaCore.interface.getSighash("executeDCAs");
  const resolverData = resolver.interface.encodeFunctionData(
    "getExecutablePositions"
  );
  const tx = await pokeMe
    .connect(signer)
    .createTask(
      dcaCore.address,
      executeDCAsSelector,
      resolver.address,
      resolverData
    );
  console.log("Create task:", tx.hash);
  await tx.wait();

  console.log("CONFIRMED");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
