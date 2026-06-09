import "dotenv/config";

import { network } from "hardhat";

const MIN_RECOMMENDED_BALANCE = 50_000_000_000_000_000n; // 0.05 ETH

function requireEnv(name: string) {
  if (process.env[name] === undefined || process.env[name] === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
}

async function main() {
  requireEnv("PRIVATE_KEY");
  requireEnv("SEPOLIA_RPC_URL");
  requireEnv("ETHERSCAN_API_KEY");

  const { ethers } = await network.create("sepolia");
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("Network: Sepolia");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < MIN_RECOMMENDED_BALANCE) {
    throw new Error("Sepolia balance is below the recommended 0.05 ETH.");
  }

  console.log("Sepolia readiness check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
