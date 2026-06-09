import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("StakingRewardsModule", (m) => {
  const stakingToken = m.contract("MockERC20", ["Staking Token", "STK"], {
    id: "StakingToken",
  });
  const rewardsToken = m.contract("MockERC20", ["Reward Token", "RWD"], {
    id: "RewardsToken",
  });
  const stakingRewards = m.contract("StakingRewards", [
    stakingToken,
    rewardsToken,
  ]);

  return { stakingToken, rewardsToken, stakingRewards };
});
