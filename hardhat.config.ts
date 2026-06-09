import "dotenv/config";

import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { readFileSync } from "node:fs";
import path from "node:path";
import { configVariable, defineConfig, task } from "hardhat/config";

const hasSepoliaRpcUrl = process.env.SEPOLIA_RPC_URL !== undefined && process.env.SEPOLIA_RPC_URL !== "";
const hasPrivateKey = process.env.PRIVATE_KEY !== undefined && process.env.PRIVATE_KEY !== "";
const hasEtherscanApiKey = process.env.ETHERSCAN_API_KEY !== undefined && process.env.ETHERSCAN_API_KEY !== "";
const maxDeployedBytecodeBytes = 24_576;

type ContractArtifact = {
  deployedBytecode: string;
};

const sizeContractsTask = task(
  "size-contracts",
  "Print deployed bytecode sizes for project contracts",
)
  .setInlineAction(async (_taskArguments, hre) => {
    await hre.tasks.getTask("compile").run();

    const contracts = [
      {
        name: "StakingRewards",
        artifactPath: path.join(
          process.cwd(),
          "artifacts",
          "contracts",
          "StakingRewards.sol",
          "StakingRewards.json",
        ),
      },
      {
        name: "MockERC20",
        artifactPath: path.join(
          process.cwd(),
          "artifacts",
          "contracts",
          "mocks",
          "MockERC20.sol",
          "MockERC20.json",
        ),
      },
    ];

    let hasOversizedContract = false;

    for (const contract of contracts) {
      const artifact = JSON.parse(
        readFileSync(contract.artifactPath, "utf8"),
      ) as ContractArtifact;
      const normalizedBytecode = artifact.deployedBytecode.startsWith("0x")
        ? artifact.deployedBytecode.slice(2)
        : artifact.deployedBytecode;
      const deployedSize = normalizedBytecode.length / 2;
      const percentage = (deployedSize / maxDeployedBytecodeBytes) * 100;

      console.log(
        `${contract.name}: ${deployedSize} bytes (${percentage.toFixed(
          2,
        )}% of 24 KiB limit)`,
      );

      if (deployedSize > maxDeployedBytecodeBytes) {
        hasOversizedContract = true;
      }
    }

    if (hasOversizedContract) {
      throw new Error("One or more contracts exceed the 24 KiB bytecode limit.");
    }
  })
  .build();

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  tasks: [sizeContractsTask],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: hasSepoliaRpcUrl
    ? {
        sepolia: {
          type: "http",
          chainId: 11155111,
          chainType: "l1",
          url: configVariable("SEPOLIA_RPC_URL"),
          accounts: hasPrivateKey ? [configVariable("PRIVATE_KEY")] : [],
        },
      }
    : {},
  verify: {
    etherscan: {
      apiKey: hasEtherscanApiKey ? configVariable("ETHERSCAN_API_KEY") : "",
    },
  },
});
