// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingRewards is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant PRECISION = 1e18;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    mapping(address account => uint256 amount) public stakedBalance;
    mapping(address account => uint256 timestamp) public stakedAt;

    uint256 public totalStaked;
    uint256 public rewardRate;
    uint256 public rewardsDuration = 7 days;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address account => uint256 rewardPerToken) public userRewardPerTokenPaid;
    mapping(address account => uint256 reward) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardAdded(uint256 reward);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address indexed token, uint256 amount);

    error ZeroAmount();
    error InvalidTokenAddress(address token);
    error IdenticalTokenAddresses();
    error InsufficientBalance(uint256 requested, uint256 available);
    error RewardPeriodNotFinished();
    error ProvidedRewardTooHigh();
    error CannotWithdrawStakingToken();
    error CannotWithdrawRewardToken();

    /// @notice Creates the staking contract with separate staking and reward tokens.
    /// @param _stakingToken ERC20 token users deposit into the contract.
    /// @param _rewardsToken ERC20 token paid out as staking rewards.
    constructor(address _stakingToken, address _rewardsToken) Ownable(msg.sender) {
        if (_stakingToken == address(0)) revert InvalidTokenAddress(_stakingToken);
        if (_rewardsToken == address(0)) revert InvalidTokenAddress(_rewardsToken);
        if (_stakingToken == _rewardsToken) revert IdenticalTokenAddresses();

        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }

        _;
    }

    /// @notice Stakes ERC20 tokens and starts or refreshes the sender stake timestamp.
    /// @param amount Amount of staking tokens to deposit.
    function stake(
        uint256 amount
    ) external updateReward(msg.sender) nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        stakedBalance[msg.sender] += amount;
        stakedAt[msg.sender] = block.timestamp;
        totalStaked += amount;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /// @notice Withdraws previously staked tokens.
    /// @param amount Amount of staking tokens to withdraw.
    function unstake(
        uint256 amount
    ) external updateReward(msg.sender) nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        uint256 balance = stakedBalance[msg.sender];
        if (balance < amount) revert InsufficientBalance(amount, balance);

        stakedBalance[msg.sender] = balance - amount;
        totalStaked -= amount;

        if (stakedBalance[msg.sender] == 0) {
            stakedAt[msg.sender] = 0;
        }

        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Claims all currently accrued rewards for the sender.
    function claimReward() external updateReward(msg.sender) nonReentrant {
        uint256 reward = rewards[msg.sender];
        if (reward == 0) revert ZeroAmount();

        rewards[msg.sender] = 0;
        rewardsToken.safeTransfer(msg.sender, reward);

        emit RewardPaid(msg.sender, reward);
    }

    /// @notice Starts a new reward period or tops up the currently active period.
    /// @param reward Amount of reward tokens already funded in this contract.
    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (reward == 0) revert ZeroAmount();

        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        uint256 balance = rewardsToken.balanceOf(address(this));
        if (rewardRate > balance / rewardsDuration) revert ProvidedRewardTooHigh();

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;

        emit RewardAdded(reward);
    }

    /// @notice Updates the reward duration for future reward periods.
    /// @param duration Duration in seconds for the next reward period.
    function setRewardsDuration(uint256 duration) external onlyOwner {
        if (duration == 0) revert ZeroAmount();
        if (block.timestamp <= periodFinish) revert RewardPeriodNotFinished();

        rewardsDuration = duration;

        emit RewardsDurationUpdated(duration);
    }

    /// @notice Recovers ERC20 tokens sent here by mistake, excluding staking and reward tokens.
    /// @param tokenAddress ERC20 token address to recover.
    /// @param tokenAmount Amount of tokens to recover.
    function recoverERC20(
        address tokenAddress,
        uint256 tokenAmount
    ) external onlyOwner nonReentrant {
        if (tokenAddress == address(0)) revert InvalidTokenAddress(tokenAddress);
        if (tokenAmount == 0) revert ZeroAmount();
        if (tokenAddress == address(stakingToken)) revert CannotWithdrawStakingToken();
        if (tokenAddress == address(rewardsToken)) revert CannotWithdrawRewardToken();

        IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);

        emit Recovered(tokenAddress, tokenAmount);
    }

    /// @notice Pauses staking and unstaking.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses staking and unstaking.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Returns the last timestamp where rewards should accrue.
    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @notice Returns the accumulated reward per staked token, scaled by 1e18.
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored +
            ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * PRECISION) /
            totalStaked;
    }

    /// @notice Returns pending rewards for an account.
    /// @param account Address to calculate rewards for.
    function earned(address account) public view returns (uint256) {
        return
            ((stakedBalance[account] *
                (rewardPerToken() - userRewardPerTokenPaid[account])) / PRECISION) +
            rewards[account];
    }
}
