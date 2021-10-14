import hre from "hardhat";
import {
  POKEME_ADDRESS,
  SUSHISWAP_ROUTER_ADDRESS,
  WNATIVE_ADDRESS,
} from "../constants";
import { DCACoreResolver__factory, DCACore__factory } from "../typechain";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chainId = 137;

  const DCACoreFactory = <DCACore__factory>(
    await hre.ethers.getContractFactory("DCACore", signer)
  );

  const dcaCore = await DCACoreFactory.deploy(
    SUSHISWAP_ROUTER_ADDRESS[chainId],
    POKEME_ADDRESS[chainId],
    WNATIVE_ADDRESS[chainId]
  );
  console.log("DCACore TxHash:", dcaCore.deployTransaction.hash);
  await dcaCore.deployed();
  console.log("DCACore deployed to:", dcaCore.address);

  const DCACoreResolverFactory = <DCACoreResolver__factory>(
    await hre.ethers.getContractFactory("DCACoreResolver", signer)
  );
  const resolver = await DCACoreResolverFactory.deploy(
    dcaCore.address,
    SUSHISWAP_ROUTER_ADDRESS[chainId]
  );
  console.log("Resolver TxHash:", resolver.deployTransaction.hash);
  await resolver.deployed();
  console.log("Resolver deployed to:", resolver.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
