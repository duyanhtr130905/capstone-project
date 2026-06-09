import "dotenv/config";

import { network } from "hardhat";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

async function main() {
  const stakingAddress = getRequiredEnv("STAKING_REWARDS_ADDRESS");
  const stakingTokenAddress = getRequiredEnv("STAKING_TOKEN_ADDRESS");
  const rewardsTokenAddress = getRequiredEnv("REWARDS_TOKEN_ADDRESS");

  const { ethers } = await network.create();
  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  const staking = (await ethers.getContractAt(
    "StakingRewards",
    stakingAddress,
    owner,
  )) as any;
  const stakingToken = (await ethers.getContractAt(
    "MockERC20",
    stakingTokenAddress,
    owner,
  )) as any;
  const rewardsToken = (await ethers.getContractAt(
    "MockERC20",
    rewardsTokenAddress,
    owner,
  )) as any;

  console.log("Owner:", ownerAddress);
  console.log("Contract owner:", await staking.owner());
  console.log("Staking token in contract:", await staking.stakingToken());
  console.log("Rewards token in contract:", await staking.rewardsToken());
  console.log("Total staked:", ethers.formatEther(await staking.totalStaked()));
  console.log("Owner staked:", ethers.formatEther(await staking.stakedBalance(ownerAddress)));
  console.log("Reward rate:", (await staking.rewardRate()).toString());
  console.log("Period finish:", (await staking.periodFinish()).toString());
  console.log(
    "Reward token balance in staking contract:",
    ethers.formatEther(await rewardsToken.balanceOf(stakingAddress)),
  );
  console.log(
    "Staking token balance in staking contract:",
    ethers.formatEther(await stakingToken.balanceOf(stakingAddress)),
  );
  console.log(
    "Owner pending reward:",
    ethers.formatEther(await staking.earned(ownerAddress)),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
