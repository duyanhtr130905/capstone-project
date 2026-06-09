import { expect } from "chai";
import { network } from "hardhat";

const DAY = 24n * 60n * 60n;
const DEFAULT_DURATION = 7n * DAY;

function expectCloseTo(actual: bigint, expected: bigint, tolerance: bigint) {
  const diff = actual > expected ? actual - expected : expected - actual;
  expect(
    diff <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  ).to.equal(true);
}

async function deployFixture() {
  const { ethers, networkHelpers } = await network.create();
  const [owner, alice, bob, outsider] = await ethers.getSigners();

  const stakeAmount = ethers.parseEther("100");
  const rewardAmount = ethers.parseEther("1000");

  const stakingToken = await ethers.deployContract(
    "MockERC20",
    ["Stake Token", "STK"],
    owner,
  );
  const rewardsToken = await ethers.deployContract(
    "MockERC20",
    ["Reward Token", "RWD"],
    owner,
  );

  await stakingToken.waitForDeployment();
  await rewardsToken.waitForDeployment();

  const stakingRewards = await ethers.deployContract(
    "StakingRewards",
    [await stakingToken.getAddress(), await rewardsToken.getAddress()],
    owner,
  );
  await stakingRewards.waitForDeployment();

  await stakingToken.mint(await alice.getAddress(), stakeAmount * 10n);
  await stakingToken.mint(await bob.getAddress(), stakeAmount * 10n);

  return {
    ethers,
    networkHelpers,
    owner,
    alice,
    bob,
    outsider,
    stakingToken,
    rewardsToken,
    stakingRewards,
    stakeAmount,
    rewardAmount,
  };
}

describe("StakingRewards", function () {
  describe("Deployment", function () {
    it("deploys with the expected token addresses, owner, and defaults", async function () {
      const { ethers, owner, stakingToken, rewardsToken, stakingRewards } =
        await deployFixture();

      expect(await stakingRewards.stakingToken()).to.equal(
        await stakingToken.getAddress(),
      );
      expect(await stakingRewards.rewardsToken()).to.equal(
        await rewardsToken.getAddress(),
      );
      expect(await stakingRewards.owner()).to.equal(await owner.getAddress());
      expect(await stakingRewards.PRECISION()).to.equal(ethers.parseEther("1"));
      expect(await stakingRewards.rewardsDuration()).to.equal(DEFAULT_DURATION);

      await expect(
        ethers.deployContract(
          "StakingRewards",
          [ethers.ZeroAddress, await rewardsToken.getAddress()],
          owner,
        ),
      ).to.be.revertedWithCustomError(stakingRewards, "InvalidTokenAddress");

      await expect(
        ethers.deployContract(
          "StakingRewards",
          [await stakingToken.getAddress(), await stakingToken.getAddress()],
          owner,
        ),
      ).to.be.revertedWithCustomError(stakingRewards, "IdenticalTokenAddresses");
    });
  });

  describe("Scenario 1: single user stake and claim", function () {
    it("earns the expected reward after staking for half the duration", async function () {
      const {
        ethers,
        networkHelpers,
        alice,
        stakingToken,
        rewardsToken,
        stakingRewards,
        stakeAmount,
        rewardAmount,
      } = await deployFixture();
      const aliceAddress = await alice.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);
      const rewardRate = rewardAmount / DEFAULT_DURATION;
      const halfDuration = DEFAULT_DURATION / 2n;

      await networkHelpers.time.increaseTo(notifyTimestamp + halfDuration);

      const expectedReward = rewardRate * halfDuration;
      const actualEarned = await stakingRewards.earned(aliceAddress);
      const tolerance = rewardAmount / 10_000n;

      expectCloseTo(actualEarned, expectedReward, tolerance);
    });

    it("transfers rewards and resets earned after claiming", async function () {
      const {
        ethers,
        networkHelpers,
        alice,
        stakingToken,
        rewardsToken,
        stakingRewards,
        stakeAmount,
        rewardAmount,
      } = await deployFixture();
      const aliceAddress = await alice.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);

      await networkHelpers.time.increaseTo(notifyTimestamp + DAY);
      await stakingRewardsAsAlice.claimReward();

      expect(await rewardsToken.balanceOf(aliceAddress)).to.be.greaterThan(0n);
      expect(await stakingRewards.earned(aliceAddress)).to.equal(0n);
      expect(await stakingRewards.rewards(aliceAddress)).to.equal(0n);
    });
  });

  describe("Scenario 2: stake and unstake immediately", function () {
    it("has zero reward when no reward period has been funded", async function () {
      const { alice, stakingToken, stakingRewards, stakeAmount } =
        await deployFixture();
      const aliceAddress = await alice.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await stakingRewardsAsAlice.unstake(stakeAmount);

      expect(await stakingRewards.earned(aliceAddress)).to.equal(0n);
      expect(await stakingRewards.stakedBalance(aliceAddress)).to.equal(0n);
      expect(await stakingRewards.totalStaked()).to.equal(0n);
      expect(await stakingRewards.stakedAt(aliceAddress)).to.equal(0n);
    });

    it("returns staking tokens correctly after immediate unstake", async function () {
      const { alice, stakingToken, stakingRewards, stakeAmount } =
        await deployFixture();
      const aliceAddress = await alice.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      const balanceBefore = await stakingToken.balanceOf(aliceAddress);

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await stakingRewardsAsAlice.unstake(stakeAmount);

      expect(await stakingToken.balanceOf(aliceAddress)).to.equal(balanceBefore);
    });
  });

  describe("Scenario 3: two users proportional reward split", function () {
    it("splits rewards proportionally when alice stakes twice bob's amount", async function () {
      const {
        ethers,
        networkHelpers,
        alice,
        bob,
        stakingToken,
        rewardsToken,
        stakingRewards,
        stakeAmount,
        rewardAmount,
      } = await deployFixture();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const aliceStake = stakeAmount * 2n;
      const bobStake = stakeAmount;
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingTokenAsBob = stakingToken.connect(bob) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;
      const stakingRewardsAsBob = stakingRewards.connect(
        bob,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), aliceStake);
      await stakingRewardsAsAlice.stake(aliceStake);
      await stakingTokenAsBob.approve(await stakingRewards.getAddress(), bobStake);
      await stakingRewardsAsBob.stake(bobStake);
      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);

      await networkHelpers.time.increaseTo(notifyTimestamp + DEFAULT_DURATION);

      const aliceEarned = await stakingRewards.earned(aliceAddress);
      const bobEarned = await stakingRewards.earned(bobAddress);
      const totalEarned = aliceEarned + bobEarned;
      const rewardRate = rewardAmount / DEFAULT_DURATION;
      const expectedTotal = rewardRate * DEFAULT_DURATION;
      const tolerance = rewardAmount / 1_000n;

      expectCloseTo(totalEarned, expectedTotal, tolerance);
      expectCloseTo(aliceEarned, (totalEarned * 2n) / 3n, tolerance);
      expectCloseTo(bobEarned, totalEarned / 3n, tolerance);
    });

    it("accounts correctly when bob joins after alice has accrued rewards", async function () {
      const {
        ethers,
        networkHelpers,
        alice,
        bob,
        stakingToken,
        rewardsToken,
        stakingRewards,
        stakeAmount,
        rewardAmount,
      } = await deployFixture();
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingTokenAsBob = stakingToken.connect(bob) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;
      const stakingRewardsAsBob = stakingRewards.connect(
        bob,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);
      const rewardRate = rewardAmount / DEFAULT_DURATION;

      await networkHelpers.time.setNextBlockTimestamp(notifyTimestamp + 100n);
      await stakingTokenAsBob.approve(await stakingRewards.getAddress(), stakeAmount);
      const bobStakeTx = await stakingRewardsAsBob.stake(stakeAmount);
      const bobStakeReceipt = await bobStakeTx.wait();
      const bobStakeBlock = await ethers.provider.getBlock(
        bobStakeReceipt!.blockNumber,
      );
      const bobStakeTimestamp = BigInt(bobStakeBlock!.timestamp);

      await networkHelpers.time.increaseTo(bobStakeTimestamp + 100n);

      const aliceEarned = await stakingRewards.earned(aliceAddress);
      const bobEarned = await stakingRewards.earned(bobAddress);
      const aliceSoloSeconds = bobStakeTimestamp - notifyTimestamp;
      const aliceExpected =
        rewardRate * aliceSoloSeconds + (rewardRate * 100n) / 2n;
      const bobExpected = (rewardRate * 100n) / 2n;
      const tolerance = rewardAmount / 10_000n;

      expectCloseTo(aliceEarned, aliceExpected, tolerance);
      expectCloseTo(bobEarned, bobExpected, tolerance);
    });
  });

  describe("Reward accounting boundaries", function () {
    it("caps rewards at periodFinish even if more time passes", async function () {
      const {
        ethers,
        networkHelpers,
        alice,
        stakingToken,
        rewardsToken,
        stakingRewards,
        stakeAmount,
        rewardAmount,
      } = await deployFixture();
      const aliceAddress = await alice.getAddress();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);
      const rewardRate = rewardAmount / DEFAULT_DURATION;

      await networkHelpers.time.increaseTo(notifyTimestamp + DEFAULT_DURATION + DAY);

      expect(await stakingRewards.lastTimeRewardApplicable()).to.equal(
        notifyTimestamp + DEFAULT_DURATION,
      );
      expectCloseTo(
        await stakingRewards.earned(aliceAddress),
        rewardRate * DEFAULT_DURATION,
        rewardAmount / 10_000n,
      );
    });

    it("carries leftover rewards into a new active reward period", async function () {
      const { ethers, networkHelpers, rewardsToken, stakingRewards, rewardAmount } =
        await deployFixture();
      const duration = 1_000n;

      await stakingRewards.setRewardsDuration(duration);
      await rewardsToken.transfer(
        await stakingRewards.getAddress(),
        rewardAmount * 2n,
      );

      const firstNotifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const firstNotifyReceipt = await firstNotifyTx.wait();
      const firstNotifyBlock = await ethers.provider.getBlock(
        firstNotifyReceipt!.blockNumber,
      );
      const firstNotifyTimestamp = BigInt(firstNotifyBlock!.timestamp);
      const firstRewardRate = rewardAmount / duration;
      const firstPeriodFinish = firstNotifyTimestamp + duration;

      await networkHelpers.time.setNextBlockTimestamp(firstNotifyTimestamp + 100n);
      const secondNotifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const secondNotifyReceipt = await secondNotifyTx.wait();
      const secondNotifyBlock = await ethers.provider.getBlock(
        secondNotifyReceipt!.blockNumber,
      );
      const secondNotifyTimestamp = BigInt(secondNotifyBlock!.timestamp);
      const remaining = firstPeriodFinish - secondNotifyTimestamp;
      const leftover = remaining * firstRewardRate;
      const expectedRewardRate = (rewardAmount + leftover) / duration;

      expect(await stakingRewards.rewardRate()).to.equal(expectedRewardRate);
      expect(await stakingRewards.lastUpdateTime()).to.equal(secondNotifyTimestamp);
      expect(await stakingRewards.periodFinish()).to.equal(
        secondNotifyTimestamp + duration,
      );
    });

    it("reverts claim when there is no reward", async function () {
      const { alice, stakingRewards } = await deployFixture();
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await expect(stakingRewardsAsAlice.claimReward()).to.be.revertedWithCustomError(
        stakingRewards,
        "ZeroAmount",
      );
    });
  });

  describe("Admin and recovery", function () {
    it("allows duration updates only after the active reward period finishes", async function () {
      const { ethers, networkHelpers, rewardsToken, stakingRewards, rewardAmount } =
        await deployFixture();
      const duration = 1_000n;

      await expect(stakingRewards.setRewardsDuration(0)).to.be.revertedWithCustomError(
        stakingRewards,
        "ZeroAmount",
      );

      await stakingRewards.setRewardsDuration(duration);
      expect(await stakingRewards.rewardsDuration()).to.equal(duration);

      await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
      const notifyTx = await stakingRewards.notifyRewardAmount(rewardAmount);
      const notifyReceipt = await notifyTx.wait();
      const notifyBlock = await ethers.provider.getBlock(notifyReceipt!.blockNumber);
      const notifyTimestamp = BigInt(notifyBlock!.timestamp);

      await expect(
        stakingRewards.setRewardsDuration(duration + 1n),
      ).to.be.revertedWithCustomError(stakingRewards, "RewardPeriodNotFinished");

      await networkHelpers.time.increaseTo(notifyTimestamp + duration + 1n);
      await stakingRewards.setRewardsDuration(duration + 1n);

      expect(await stakingRewards.rewardsDuration()).to.equal(duration + 1n);
    });

    it("recovers unrelated ERC20 tokens but protects staking and rewards tokens", async function () {
      const {
        ethers,
        owner,
        alice,
        stakingToken,
        rewardsToken,
        stakingRewards,
      } = await deployFixture();
      const recoverAmount = ethers.parseEther("5");
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      const otherToken = await ethers.deployContract(
        "MockERC20",
        ["Other Token", "OTH"],
        owner,
      );
      await otherToken.waitForDeployment();
      await otherToken.transfer(await stakingRewards.getAddress(), recoverAmount);

      await expect(
        stakingRewardsAsAlice.recoverERC20(
          await otherToken.getAddress(),
          recoverAmount,
        ),
      ).to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");

      await expect(
        stakingRewards.recoverERC20(await stakingToken.getAddress(), recoverAmount),
      ).to.be.revertedWithCustomError(stakingRewards, "CannotWithdrawStakingToken");

      await expect(
        stakingRewards.recoverERC20(await rewardsToken.getAddress(), recoverAmount),
      ).to.be.revertedWithCustomError(stakingRewards, "CannotWithdrawRewardToken");

      await expect(
        stakingRewards.recoverERC20(ethers.ZeroAddress, recoverAmount),
      ).to.be.revertedWithCustomError(stakingRewards, "InvalidTokenAddress");

      await expect(
        stakingRewards.recoverERC20(await otherToken.getAddress(), 0),
      ).to.be.revertedWithCustomError(stakingRewards, "ZeroAmount");

      await stakingRewards.recoverERC20(await otherToken.getAddress(), recoverAmount);

      expect(await otherToken.balanceOf(await stakingRewards.getAddress())).to.equal(0n);
      expect(await otherToken.balanceOf(await owner.getAddress())).to.equal(
        ethers.parseEther("1000000"),
      );
    });
  });

  describe("Security", function () {
    it("reverts zero amount staking and excess unstaking", async function () {
      const { alice, stakingToken, stakingRewards, stakeAmount } =
        await deployFixture();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await expect(stakingRewardsAsAlice.stake(0)).to.be.revertedWithCustomError(
        stakingRewards,
        "ZeroAmount",
      );

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);

      await expect(
        stakingRewardsAsAlice.unstake(stakeAmount * 2n),
      ).to.be.revertedWithCustomError(stakingRewards, "InsufficientBalance");
    });

    it("blocks stake and unstake while paused", async function () {
      const { alice, stakingToken, stakingRewards, stakeAmount } =
        await deployFixture();
      const stakingTokenAsAlice = stakingToken.connect(alice) as typeof stakingToken;
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await stakingTokenAsAlice.approve(await stakingRewards.getAddress(), stakeAmount);
      await stakingRewardsAsAlice.stake(stakeAmount);
      await stakingRewards.pause();

      await expect(stakingRewardsAsAlice.stake(stakeAmount)).to.be
        .revertedWithCustomError(stakingRewards, "EnforcedPause");
      await expect(stakingRewardsAsAlice.unstake(stakeAmount)).to.be
        .revertedWithCustomError(stakingRewards, "EnforcedPause");

      await stakingRewards.unpause();
      await stakingRewardsAsAlice.unstake(stakeAmount);

      expect(await stakingRewards.stakedBalance(await alice.getAddress())).to.equal(0n);
    });

    it("restricts owner-only admin functions", async function () {
      const { alice, stakingRewards, rewardAmount } = await deployFixture();
      const stakingRewardsAsAlice = stakingRewards.connect(
        alice,
      ) as typeof stakingRewards;

      await expect(stakingRewardsAsAlice.pause()).to.be.revertedWithCustomError(
        stakingRewards,
        "OwnableUnauthorizedAccount",
      );
      await expect(
        stakingRewardsAsAlice.notifyRewardAmount(rewardAmount),
      ).to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
      await expect(
        stakingRewardsAsAlice.setRewardsDuration(DEFAULT_DURATION + 1n),
      ).to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
    });

    it("reverts notifyRewardAmount when reward is zero or not funded", async function () {
      const { stakingRewards, rewardAmount } = await deployFixture();

      await expect(stakingRewards.notifyRewardAmount(0)).to.be.revertedWithCustomError(
        stakingRewards,
        "ZeroAmount",
      );
      await expect(stakingRewards.notifyRewardAmount(rewardAmount)).to.be
        .revertedWithCustomError(stakingRewards, "ProvidedRewardTooHigh");
    });
  });
});
