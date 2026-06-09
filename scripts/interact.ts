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

  const rewardAmount = ethers.parseEther(
    process.env.REWARD_POOL_AMOUNT ?? "1000",
  );
  const stakeAmount = ethers.parseEther(process.env.DEMO_STAKE_AMOUNT ?? "10");

  console.log("Owner:", ownerAddress);
  console.log("StakingRewards:", stakingAddress);
  console.log("StakingToken:", stakingTokenAddress);
  console.log("RewardsToken:", rewardsTokenAddress);

  const existingRewardRate = await staking.rewardRate();
  if (existingRewardRate === 0n) {
    console.log("Transferring reward pool...");
    const transferRewardsTx = await rewardsToken.transfer(
      stakingAddress,
      rewardAmount,
    );
    await transferRewardsTx.wait();

    console.log("Notifying reward amount...");
    const notifyTx = await staking.notifyRewardAmount(rewardAmount);
    await notifyTx.wait();

    console.log(
      `Reward pool funded: ${ethers.formatEther(rewardAmount)} RWD`,
    );
  } else {
    console.log("Reward pool already active; skipping notifyRewardAmount.");
  }

  console.log("Approving staking token...");
  const approveStakeTx = await stakingToken.approve(stakingAddress, stakeAmount);
  await approveStakeTx.wait();

  console.log("Staking demo amount...");
  const stakeTx = await staking.stake(stakeAmount);
  await stakeTx.wait();

  console.log(`Staked ${ethers.formatEther(stakeAmount)} STK`);
  console.log(
    "Total staked:",
    ethers.formatEther(await staking.totalStaked()),
  );
  console.log("Reward rate:", (await staking.rewardRate()).toString());
  console.log("Pending reward:", ethers.formatEther(await staking.earned(ownerAddress)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
