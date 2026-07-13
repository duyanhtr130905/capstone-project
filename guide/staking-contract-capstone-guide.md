# Capstone Project — Staking Contract: Hướng dẫn toàn bộ quy trình

> Tài liệu này là blueprint đầy đủ để thực hiện project từ zero đến deploy thật trên testnet.
> Được thiết kế để dùng cùng AI (Claude, Copilot, …) — mỗi phase có prompt mẫu sẵn.

---

## Mục lục

1. [Tổng quan project](#1-tổng-quan-project)
2. [Phạm vi và yêu cầu](#2-phạm-vi-và-yêu-cầu)
3. [Kiến trúc contract](#3-kiến-trúc-contract)
4. [Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
5. [Phase 1 — Khởi tạo môi trường](#5-phase-1--khởi-tạo-môi-trường)
6. [Phase 2 — Viết contract Layer 1 (Core)](#6-phase-2--viết-contract-layer-1-core)
7. [Phase 3 — Viết contract Layer 2 (Reward Engine)](#7-phase-3--viết-contract-layer-2-reward-engine)
8. [Phase 4 — Viết contract Layer 3 (Security + Admin)](#8-phase-4--viết-contract-layer-3-security--admin)
9. [Phase 5 — Tích hợp và hoàn thiện contract](#9-phase-5--tích-hợp-và-hoàn-thiện-contract)
10. [Phase 6 — Viết test](#10-phase-6--viết-test)
11. [Phase 7 — Deploy lên testnet](#11-phase-7--deploy-lên-testnet)
12. [Phase 8 — Verify trên Etherscan](#12-phase-8--verify-trên-etherscan)
13. [Phase 9 — Demo và báo cáo](#13-phase-9--demo-và-báo-cáo)
14. [Checklist nộp bài](#14-checklist-nộp-bài)

---

## 1. Tổng quan project

### Tên project
`StakingRewards` — ERC20 Staking Contract với Reward Engine

### Mô tả
Smart contract cho phép người dùng stake token ERC20 để nhận reward token theo thời gian.
Áp dụng **Accumulator Pattern** (chuẩn Synthetix) để tính reward chính xác, gas-efficient,
và không cần loop qua toàn bộ danh sách user.

### Tech stack

| Thành phần | Công cụ |
|---|---|
| Ngôn ngữ | Solidity ^0.8.20 |
| Framework | Hardhat |
| Thư viện contract | OpenZeppelin Contracts v5 |
| Testing | Hardhat + Chai + Ethers.js v6 |
| Deploy | Hardhat Ignition hoặc scripts |
| Verify | hardhat-etherscan plugin |
| Testnet | Sepolia |

### Kết quả cuối cùng cần đạt

- 2 file `.sol` hoàn chỉnh (MockERC20 + StakingRewards)
- Deploy và verify thành công trên Sepolia Etherscan
- Bộ test cover 3 scenario cốt lõi, pass 100%
- Video demo 5–10 phút
- Tài liệu mô tả 1 trang PDF

---

## 2. Phạm vi và yêu cầu

### 2.1 Yêu cầu bắt buộc (theo đề bài)

- [ ] Người dùng stake token ERC20
- [ ] Ghi nhận amount và timestamp khi stake
- [ ] Owner rút token stake (admin withdraw)
- [ ] Deploy lên testnet (Sepolia)
- [ ] Verify contract trên Etherscan
- [ ] Gửi link Etherscan + source code
- [ ] Video demo deploy và test

### 2.2 Tính năng nâng cao (làm cho xịn)

- [ ] Reward Engine theo Accumulator Pattern — tính reward O(1), không loop
- [ ] `claimReward()` — user tự claim reward bất cứ lúc nào
- [ ] `notifyRewardAmount()` — owner nạp reward pool và set rate
- [ ] `Pausable` — owner có thể tạm dừng khi phát hiện bug
- [ ] `ReentrancyGuard` — chống tấn công re-entrancy
- [ ] Custom errors — tiết kiệm gas hơn `require("string")`
- [ ] `recoverERC20()` — rút token gửi nhầm vào contract
- [ ] Event đầy đủ với `indexed` parameters

### 2.3 Ngoài phạm vi (không làm)

- Frontend / dApp UI
- Mainnet deploy
- Multi-token reward
- Governance / voting
- Upgradeability (proxy pattern)

---

## 3. Kiến trúc contract

### 3.1 Sơ đồ tổng thể

```
StakingRewards.sol
│
├── Layer 1 — Core
│   ├── stake(uint256 amount)
│   ├── unstake(uint256 amount)
│   └── State: mapping(address => uint256) stakedBalance
│               mapping(address => uint256) stakedAt
│               uint256 totalStaked
│
├── Layer 2 — Reward Engine (Accumulator Pattern)
│   ├── rewardPerToken() → uint256          [view]
│   ├── earned(address account) → uint256   [view]
│   ├── claimReward()
│   ├── modifier updateReward(address)
│   └── State: uint256 rewardPerTokenStored
│               uint256 rewardRate
│               uint256 lastUpdateTime
│               uint256 periodFinish
│               mapping(address => uint256) userRewardPerTokenPaid
│               mapping(address => uint256) rewards
│
└── Layer 3 — Security + Admin
    ├── Ownable      → onlyOwner
    ├── Pausable     → whenNotPaused
    ├── ReentrancyGuard → nonReentrant
    ├── notifyRewardAmount(uint256 amount, uint256 duration)
    ├── recoverERC20(address token, uint256 amount)
    ├── setRewardsDuration(uint256 duration)
    └── Custom errors + Events
```

### 3.2 Giải thích Accumulator Pattern (quan trọng nhất)

**Vấn đề:** Khi nhiều user stake với amount khác nhau và thời điểm khác nhau,
tính reward bằng cách loop qua tất cả user sẽ tốn gas O(n) — không thể dùng thật.

**Giải pháp — biến tích lũy toàn cục `rewardPerTokenStored`:**

```
Mỗi giây trôi qua, biến này tăng thêm:
  rewardRate / totalStaked

Reward của user = balance × (rewardPerToken_hiện_tại − rewardPerToken_lúc_user_stake)

Khi user thực hiện bất kỳ action nào:
  1. updateReward modifier chạy trước
  2. Snapshot rewardPerToken() → userRewardPerTokenPaid[user]
  3. Balance thay đổi
  4. Lần sau tính earned() chỉ cần nhìn vào hiệu số → O(1)
```

**Công thức:**

```
rewardPerToken() = rewardPerTokenStored
                 + (rewardRate × min(block.timestamp, periodFinish) − lastUpdateTime)
                   / totalStaked

earned(user)    = stakedBalance[user]
                  × (rewardPerToken() − userRewardPerTokenPaid[user])
                  + rewards[user]
```

### 3.3 Luồng chính (flow)

```
[User]          [StakingRewards]           [ERC20 Token]
  │                    │                        │
  ├─ approve() ───────────────────────────────► │
  │                    │                        │
  ├─ stake(100) ──────►│                        │
  │               updateReward()                │
  │               snapshot rewardPerToken        │
  │               stakedBalance[user] += 100     │
  │               totalStaked += 100            │
  │               ─────────────────────────────►│ transferFrom(user, contract, 100)
  │               emit Staked(user, 100)        │
  │                    │                        │
  │        ... thời gian trôi qua ...           │
  │                    │                        │
  ├─ claimReward() ───►│                        │
  │               updateReward()                │
  │               earned = balance × Δreward    │
  │               rewards[user] = 0             │
  │               ─────────────────────────────►│ transfer(user, earned)
  │               emit RewardPaid(user, earned) │
  │                    │                        │
  ├─ unstake(100) ────►│                        │
  │               updateReward()                │
  │               stakedBalance[user] -= 100     │
  │               totalStaked -= 100            │
  │               ─────────────────────────────►│ transfer(user, 100)
  │               emit Withdrawn(user, 100)     │
```

---

## 4. Cấu trúc thư mục

```
staking-capstone/
│
├── contracts/
│   ├── StakingRewards.sol      ← contract chính
│   └── mocks/
│       └── MockERC20.sol       ← token dùng để test
│
├── ignition/
│   └── modules/
│       └── StakingRewards.ts   ← deploy script (Hardhat Ignition)
│
├── scripts/
│   └── interact.ts             ← script tương tác sau deploy
│
├── test/
│   └── StakingRewards.test.ts  ← file test chính
│
├── .env                        ← PRIVATE_KEY, INFURA_KEY, ETHERSCAN_KEY
├── .env.example                ← template (commit lên git, không có key thật)
├── .gitignore
├── hardhat.config.ts
├── package.json
└── README.md
```

---

## 5. Phase 1 — Khởi tạo môi trường

### Bước 1.1 — Tạo project

```bash
mkdir staking-capstone
cd staking-capstone
npm init -y
npm install --save-dev hardhat
npx hardhat init
# Chọn: Create a TypeScript project
```

### Bước 1.2 — Cài dependencies

```bash
# OpenZeppelin contracts
npm install @openzeppelin/contracts

# Hardhat plugins
npm install --save-dev \
  @nomicfoundation/hardhat-toolbox \
  @nomicfoundation/hardhat-ignition \
  @nomicfoundation/hardhat-ignition-ethers \
  dotenv

# TypeScript types
npm install --save-dev ts-node typescript @types/node
```

### Bước 1.3 — Tạo file `.env`

```bash
# .env (KHÔNG commit file này lên git)
PRIVATE_KEY=0x_khoa_rieng_tu_cua_ban
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/PROJECT_ID
ETHERSCAN_API_KEY=api_key_etherscan_cua_ban
```

```bash
# .env.example (commit lên git)
PRIVATE_KEY=
SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=
```

### Bước 1.4 — Cấu hình `hardhat.config.ts`

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
```

### Bước 1.5 — Cập nhật `.gitignore`

```
node_modules/
.env
artifacts/
cache/
typechain-types/
ignition/deployments/
```

---

## 6. Phase 2 — Viết contract Layer 1 (Core)

### Mục tiêu
Implement đủ 3 hàm cốt lõi: `stake()`, `unstake()`, và state variables cơ bản.
Chưa có reward logic — Layer 2 sẽ bổ sung sau.

### File: `contracts/mocks/MockERC20.sol`

Token ERC20 đơn giản dùng để test. Viết trước để có token mà test ngay.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

### File: `contracts/StakingRewards.sol` — skeleton Layer 1

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract StakingRewards is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Token addresses ──────────────────────────────────────────────────────
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    // ─── Core state ───────────────────────────────────────────────────────────
    mapping(address => uint256) public stakedBalance;
    uint256 public totalStaked;

    // ─── Events ───────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address _stakingToken,
        address _rewardsToken
    ) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
    }

    // ─── Core functions ───────────────────────────────────────────────────────

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        // Effects trước interactions (CEI pattern)
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;

        // Interaction cuối cùng
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount)
            revert InsufficientBalance(amount, stakedBalance[msg.sender]);

        // Effects trước interactions
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;

        // Interaction cuối cùng
        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
```

### Kiểm tra Layer 1

```bash
npx hardhat compile
# Kết quả mong đợi: Compiled 2 Solidity files successfully
```
---

## 7. Phase 3 — Viết contract Layer 2 (Reward Engine)

### Mục tiêu
Bổ sung Accumulator Pattern vào contract đã có. Đây là phần kỹ thuật khó nhất
và cũng là phần tạo ra sự khác biệt lớn nhất trong portfolio.

### State variables cần thêm

```solidity
// ─── Reward state ─────────────────────────────────────────────────────────
uint256 public rewardRate;              // token reward mỗi giây
uint256 public rewardsDuration = 7 days;
uint256 public periodFinish;            // thời điểm reward kết thúc
uint256 public lastUpdateTime;          // lần cuối accumulator được cập nhật
uint256 public rewardPerTokenStored;    // accumulator toàn cục

mapping(address => uint256) public userRewardPerTokenPaid; // snapshot per user
mapping(address => uint256) public rewards;                 // reward đang chờ claim
```

### Events và errors cần thêm

```solidity
event RewardAdded(uint256 reward);
event RewardPaid(address indexed user, uint256 reward);
event RewardsDurationUpdated(uint256 newDuration);
event Recovered(address token, uint256 amount);

error RewardPeriodNotFinished();
error ProvidedRewardTooHigh();
error CannotWithdrawStakingToken();
```

### Modifier `updateReward`

```solidity
modifier updateReward(address account) {
    // 1. Cập nhật accumulator toàn cục
    rewardPerTokenStored = rewardPerToken();
    lastUpdateTime = lastTimeRewardApplicable();

    // 2. Nếu có account cụ thể, snapshot cho account đó
    if (account != address(0)) {
        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
    _;
}
```

### View functions

```solidity
function lastTimeRewardApplicable() public view returns (uint256) {
    return block.timestamp < periodFinish ? block.timestamp : periodFinish;
}

function rewardPerToken() public view returns (uint256) {
    if (totalStaked == 0) {
        return rewardPerTokenStored;
    }
    return rewardPerTokenStored
        + (rewardRate
            * (lastTimeRewardApplicable() - lastUpdateTime)
            * 1e18)
        / totalStaked;
}

function earned(address account) public view returns (uint256) {
    return (stakedBalance[account]
        * (rewardPerToken() - userRewardPerTokenPaid[account]))
        / 1e18
        + rewards[account];
}
```

### Hàm `claimReward`

```solidity
function claimReward() external nonReentrant updateReward(msg.sender) {
    uint256 reward = rewards[msg.sender];
    if (reward == 0) revert ZeroAmount();

    rewards[msg.sender] = 0;
    rewardsToken.safeTransfer(msg.sender, reward);

    emit RewardPaid(msg.sender, reward);
}
```

### Cập nhật `stake()` và `unstake()` với modifier

```solidity
// Thêm updateReward(msg.sender) vào cả hai hàm:
function stake(uint256 amount)
    external
    nonReentrant
    whenNotPaused
    updateReward(msg.sender)
{
    // ... code như cũ ...
}

function unstake(uint256 amount)
    external
    nonReentrant
    whenNotPaused
    updateReward(msg.sender)
{
    // ... code như cũ ...
}
```

### Kiểm tra Layer 2

```bash
npx hardhat compile
```

Nếu compile thành công, viết test nhanh để verify math:

```bash
# Tạo test tạm thời để kiểm tra logic
npx hardhat test --grep "reward calculation"
```

## 8. Phase 4 — Viết contract Layer 3 (Security + Admin)

### Mục tiêu
Bổ sung các hàm admin để contract hoạt động được trong thực tế:
nạp reward pool, thu hồi token gửi nhầm, và quản lý duration.

### Hàm `notifyRewardAmount` (quan trọng nhất)

```solidity
function notifyRewardAmount(uint256 reward)
    external
    onlyOwner
    updateReward(address(0))
{
    if (block.timestamp >= periodFinish) {
        // Chu kỳ mới: tính rate từ đầu
        rewardRate = reward / rewardsDuration;
    } else {
        // Còn trong chu kỳ cũ: cộng dồn reward còn lại
        uint256 remaining = periodFinish - block.timestamp;
        uint256 leftover = remaining * rewardRate;
        rewardRate = (reward + leftover) / rewardsDuration;
    }

    // Kiểm tra contract có đủ token để trả reward không
    uint256 balance = rewardsToken.balanceOf(address(this));
    if (rewardRate > balance / rewardsDuration)
        revert ProvidedRewardTooHigh();

    lastUpdateTime = block.timestamp;
    periodFinish = block.timestamp + rewardsDuration;

    emit RewardAdded(reward);
}
```

### Hàm `setRewardsDuration`

```solidity
function setRewardsDuration(uint256 duration) external onlyOwner {
    if (block.timestamp <= periodFinish) revert RewardPeriodNotFinished();
    rewardsDuration = duration;
    emit RewardsDurationUpdated(duration);
}
```

### Hàm `recoverERC20` (safety net)

```solidity
function recoverERC20(address tokenAddress, uint256 tokenAmount)
    external
    onlyOwner
{
    // Không cho phép rút staking token (sẽ phá vỡ accounting)
    if (tokenAddress == address(stakingToken))
        revert CannotWithdrawStakingToken();

    IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);
    emit Recovered(tokenAddress, tokenAmount);
}
```

---

## 9. Phase 5 — Tích hợp và hoàn thiện contract

### Mục tiêu
Ghép 3 layer lại, clean up code, và đảm bảo contract compile sạch không warning.

### Checklist tích hợp

- [ ] Tất cả `import` đúng và không thừa
- [ ] Thứ tự kế thừa đúng: `Ownable, ReentrancyGuard, Pausable`
- [ ] `modifier updateReward` đứng trước `nonReentrant` và `whenNotPaused` trong mọi hàm
- [ ] Tất cả state variable có `public` để Etherscan đọc được
- [ ] `immutable` cho `stakingToken` và `rewardsToken`
- [ ] Không có magic number (dùng `1e18` thay vì `1000000000000000000`)
- [ ] SPDX license và pragma version đầy đủ

### Thứ tự hàm trong file (convention)

```
1. State variables
2. Events
3. Errors
4. Constructor
5. Modifiers
6. External / public functions (user-facing)
7. External / public functions (admin)
8. Public view functions
9. Internal functions (nếu có)
```

### Lệnh kiểm tra cuối cùng

```bash
# Compile không warning
npx hardhat compile

# Đọc bytecode size (nên < 24KB để tránh lỗi deploy)
npx hardhat size-contracts
```

---

## 10. Phase 6 — Viết test

### Mục tiêu
Viết test cover đủ 3 scenario cốt lõi chứng minh reward math đúng.
Test phải pass 100% trước khi deploy.

### File: `test/StakingRewards.test.ts`

#### Setup và helpers

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StakingRewards", () => {
  // Helper: deploy toàn bộ
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    // Deploy 2 token: staking token và reward token
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const stakingToken = await ERC20.deploy("Staking Token", "STK");
    const rewardsToken = await ERC20.deploy("Reward Token", "RWD");

    // Deploy contract chính
    const Staking = await ethers.getContractFactory("StakingRewards");
    const staking = await Staking.deploy(
      await stakingToken.getAddress(),
      await rewardsToken.getAddress()
    );

    // Setup: mint token cho alice và bob
    const STAKE_AMOUNT = ethers.parseEther("100");
    await stakingToken.mint(alice.address, STAKE_AMOUNT * 10n);
    await stakingToken.mint(bob.address, STAKE_AMOUNT * 10n);

    // Setup reward pool: mint 1000 RWD cho owner, nạp vào contract
    const REWARD_AMOUNT = ethers.parseEther("1000");
    await rewardsToken.mint(owner.address, REWARD_AMOUNT);
    await rewardsToken.approve(await staking.getAddress(), REWARD_AMOUNT);
    await rewardsToken.transfer(await staking.getAddress(), REWARD_AMOUNT);

    // Kích hoạt reward: 1000 RWD trong 7 ngày
    const DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
    await staking.notifyRewardAmount(REWARD_AMOUNT);

    return { staking, stakingToken, rewardsToken, owner, alice, bob, STAKE_AMOUNT, REWARD_AMOUNT };
  }

  // Scenario 1: Stake → wait → claim đúng amount
  describe("Scenario 1: Single user stake and claim", () => {
    it("should earn correct reward after staking for half the duration", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT, REWARD_AMOUNT } = await deployFixture();

      // Alice approve và stake 100 STK
      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);

      // Tua thời gian 3.5 ngày (50% duration)
      const HALF_DURATION = 7 * 24 * 60 * 60 / 2;
      await time.increase(HALF_DURATION);

      // Alice là user duy nhất nên nhận 50% total reward
      const expectedReward = REWARD_AMOUNT / 2n;
      const actualEarned = await staking.earned(alice.address);

      // Cho phép sai số nhỏ do integer division (< 0.01%)
      const tolerance = expectedReward / 10000n;
      expect(actualEarned).to.be.closeTo(expectedReward, tolerance);
    });

    it("should reset earned to 0 after claiming", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT } = await deployFixture();

      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await time.increase(24 * 60 * 60); // 1 ngày

      await staking.connect(alice).claimReward();
      expect(await staking.earned(alice.address)).to.equal(0n);
    });
  });

  // Scenario 2: Stake → unstake ngay lập tức → reward = 0
  describe("Scenario 2: Stake and unstake immediately", () => {
    it("should have zero reward when unstaking in same block", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT } = await deployFixture();

      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);

      // Unstake ngay trong cùng block (không mine thêm block)
      await staking.connect(alice).unstake(STAKE_AMOUNT);

      expect(await staking.earned(alice.address)).to.equal(0n);
      expect(await staking.stakedBalance(alice.address)).to.equal(0n);
    });

    it("should return staking tokens correctly after unstake", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT } = await deployFixture();

      const balanceBefore = await stakingToken.balanceOf(alice.address);
      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await staking.connect(alice).unstake(STAKE_AMOUNT);
      const balanceAfter = await stakingToken.balanceOf(alice.address);

      expect(balanceAfter).to.equal(balanceBefore);
    });
  });

  // Scenario 3: Hai user stake cùng lúc → reward chia theo tỉ lệ
  describe("Scenario 3: Two users — proportional reward split", () => {
    it("should split rewards proportionally when alice stakes 2x bob", async () => {
      const { staking, stakingToken, alice, bob, STAKE_AMOUNT, REWARD_AMOUNT } = await deployFixture();

      // Alice stake 200, Bob stake 100 → tỉ lệ 2:1
      const aliceAmount = STAKE_AMOUNT * 2n;
      const bobAmount = STAKE_AMOUNT;

      await stakingToken.connect(alice).approve(await staking.getAddress(), aliceAmount);
      await staking.connect(alice).stake(aliceAmount);

      await stakingToken.connect(bob).approve(await staking.getAddress(), bobAmount);
      await staking.connect(bob).stake(bobAmount);

      // Tua 7 ngày (full duration)
      await time.increase(7 * 24 * 60 * 60);

      const aliceEarned = await staking.earned(alice.address);
      const bobEarned = await staking.earned(bob.address);
      const totalEarned = aliceEarned + bobEarned;

      // Tổng reward ≈ REWARD_AMOUNT (sai số nhỏ cho phép)
      const tolerance = REWARD_AMOUNT / 1000n;
      expect(totalEarned).to.be.closeTo(REWARD_AMOUNT, tolerance);

      // Alice nhận ~2/3, Bob nhận ~1/3
      expect(aliceEarned).to.be.closeTo(totalEarned * 2n / 3n, tolerance);
      expect(bobEarned).to.be.closeTo(totalEarned * 1n / 3n, tolerance);
    });
  });

  // Security tests
  describe("Security", () => {
    it("should revert stake with zero amount", async () => {
      const { staking, alice } = await deployFixture();
      await expect(staking.connect(alice).stake(0)).to.be.revertedWithCustomError(
        staking, "ZeroAmount"
      );
    });

    it("should revert unstake more than staked balance", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT } = await deployFixture();
      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);

      await expect(
        staking.connect(alice).unstake(STAKE_AMOUNT * 2n)
      ).to.be.revertedWithCustomError(staking, "InsufficientBalance");
    });

    it("should revert when paused", async () => {
      const { staking, stakingToken, alice, STAKE_AMOUNT } = await deployFixture();
      await staking.pause();

      await stakingToken.connect(alice).approve(await staking.getAddress(), STAKE_AMOUNT);
      await expect(staking.connect(alice).stake(STAKE_AMOUNT)).to.be.revertedWithCustomError(
        staking, "EnforcedPause"
      );
    });

    it("only owner can call notifyRewardAmount", async () => {
      const { staking, alice } = await deployFixture();
      await expect(
        staking.connect(alice).notifyRewardAmount(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });
});
```

### Chạy test

```bash
# Chạy tất cả test
npx hardhat test

# Chạy test với gas report
REPORT_GAS=true npx hardhat test

# Chạy test coverage (cần cài thêm)
npx hardhat coverage
```

### Kết quả mong đợi

```
StakingRewards
  Scenario 1: Single user stake and claim
    ✔ should earn correct reward after staking for half the duration
    ✔ should reset earned to 0 after claiming
  Scenario 2: Stake and unstake immediately
    ✔ should have zero reward when unstaking in same block
    ✔ should return staking tokens correctly after unstake
  Scenario 3: Two users — proportional reward split
    ✔ should split rewards proportionally when alice stakes 2x bob
  Security
    ✔ should revert stake with zero amount
    ✔ should revert unstake more than staked balance
    ✔ should revert when paused
    ✔ only owner can call notifyRewardAmount

9 passing (2s)
```

---

## 11. Phase 7 — Deploy lên testnet

### Chuẩn bị

```bash
# Kiểm tra balance ví trên Sepolia (cần ít nhất 0.05 ETH)
# Faucet: https://sepoliafaucet.com hoặc https://faucet.sepolia.dev

# Compile lần cuối trước khi deploy
npx hardhat compile
```

### File deploy: `ignition/modules/StakingRewards.ts`

```typescript
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const REWARD_AMOUNT = ethers.parseEther("1000"); // 1000 reward tokens
const REWARD_DURATION = 7 * 24 * 60 * 60;        // 7 ngày

const StakingRewardsModule = buildModule("StakingRewardsModule", (m) => {
  // Bước 1: Deploy MockERC20 làm staking token
  const stakingToken = m.contract("MockERC20", ["Staking Token", "STK"]);

  // Bước 2: Deploy MockERC20 làm reward token
  const rewardsToken = m.contract("MockERC20", ["Reward Token", "RWD"]);

  // Bước 3: Deploy StakingRewards contract chính
  const stakingRewards = m.contract("StakingRewards", [
    stakingToken,
    rewardsToken,
  ]);

  return { stakingToken, rewardsToken, stakingRewards };
});

export default StakingRewardsModule;
```

### Deploy lên Sepolia

```bash
npx hardhat ignition deploy ignition/modules/StakingRewards.ts \
  --network sepolia \
  --deployment-id staking-sepolia-v1
```

### Sau khi deploy — ghi lại thông tin

Tạo file `deployed-addresses.txt` và lưu lại:

```
Network: Sepolia
Deploy date: [ngày deploy]

StakingToken (MockERC20):  0x...
RewardsToken (MockERC20):  0x...
StakingRewards:            0x...

Block number at deploy:    #...
Transaction hash:          0x...
```

### Script tương tác sau deploy: `scripts/interact.ts`

```typescript
import { ethers } from "hardhat";

async function main() {
  const STAKING_ADDRESS = "0x..."; // điền địa chỉ contract
  const STAKING_TOKEN_ADDRESS = "0x...";
  const REWARDS_TOKEN_ADDRESS = "0x...";

  const [owner] = await ethers.getSigners();
  console.log("Owner:", owner.address);

  const staking = await ethers.getContractAt("StakingRewards", STAKING_ADDRESS);
  const stakingToken = await ethers.getContractAt("MockERC20", STAKING_TOKEN_ADDRESS);
  const rewardsToken = await ethers.getContractAt("MockERC20", REWARDS_TOKEN_ADDRESS);

  // Nạp reward pool
  const rewardAmount = ethers.parseEther("1000");
  console.log("Approving rewards token...");
  await rewardsToken.approve(STAKING_ADDRESS, rewardAmount);
  console.log("Transferring to contract...");
  await rewardsToken.transfer(STAKING_ADDRESS, rewardAmount);
  console.log("Notifying reward amount...");
  await staking.notifyRewardAmount(rewardAmount);
  console.log("Reward pool funded!");

  // Demo stake
  const stakeAmount = ethers.parseEther("10");
  console.log("Approving staking token...");
  await stakingToken.approve(STAKING_ADDRESS, stakeAmount);
  console.log("Staking...");
  await staking.stake(stakeAmount);
  console.log(`Staked ${ethers.formatEther(stakeAmount)} STK`);

  // Đọc state
  console.log("Total staked:", ethers.formatEther(await staking.totalStaked()));
  console.log("Reward rate:", (await staking.rewardRate()).toString());
}

main().catch(console.error);
```

```bash
npx hardhat run scripts/interact.ts --network sepolia
```

---

## 12. Phase 8 — Verify trên Etherscan

### Verify tự động với Hardhat Ignition

```bash
npx hardhat ignition verify staking-sepolia-v1
```

### Verify thủ công (nếu cần)

```bash
# Verify StakingToken
npx hardhat verify --network sepolia \
  0x_STAKING_TOKEN_ADDRESS \
  "Staking Token" "STK"

# Verify RewardsToken
npx hardhat verify --network sepolia \
  0x_REWARDS_TOKEN_ADDRESS \
  "Reward Token" "RWD"

# Verify StakingRewards (cần 2 constructor args)
npx hardhat verify --network sepolia \
  0x_STAKING_REWARDS_ADDRESS \
  0x_STAKING_TOKEN_ADDRESS \
  0x_REWARDS_TOKEN_ADDRESS
```

### Kiểm tra verify thành công

Truy cập `https://sepolia.etherscan.io/address/0x_CONTRACT_ADDRESS#code`
→ Phải thấy tab "Contract" hiện icon xanh ✓ và source code đầy đủ.

### Sau khi verify — test thủ công trên Etherscan

1. Vào tab "Write Contract" → Connect MetaMask
2. Gọi `stake(amount)` với một lượng nhỏ
3. Chờ vài giây → gọi `earned(your_address)` ở tab "Read Contract"
4. Gọi `claimReward()` và kiểm tra transaction thành công

---

## 13. Phase 9 — Demo và báo cáo

### 13.1 Kịch bản video demo (tối đa 10 phút)

```
[0:00 – 0:30] Giới thiệu
  - Tên project, tech stack
  - Mở Etherscan và show contract đã verify

[0:30 – 3:00] Demo deploy (nếu demo live) hoặc show transaction trên Etherscan
  - Show 3 contract addresses đã verify
  - Giải thích ngắn kiến trúc 3 layer

[3:00 – 6:00] Demo tương tác
  - Stake một lượng token
  - Show totalStaked và rewardRate thay đổi
  - Chờ vài block → earned() tăng lên
  - Claim reward → show RewardPaid event trên Etherscan

[6:00 – 8:00] Demo test
  - Chạy `npx hardhat test` live
  - Show 9 test pass

[8:00 – 9:30] Giải thích Accumulator Pattern (điểm kỹ thuật nổi bật)
  - Vẽ tay hoặc dùng slide đơn giản

[9:30 – 10:00] Tổng kết và link Etherscan
```

### 13.2 Nội dung tài liệu 1 trang PDF

```
STAKING CONTRACT — CAPSTONE PROJECT

1. Mô tả
   Smart contract ERC20 Staking với Reward Engine theo Accumulator Pattern.
   Người dùng stake token để nhận reward tính theo thời gian, chính xác O(1).

2. Kiến trúc
   [Sơ đồ 3 layer — vẽ lại từ phần kiến trúc ở trên]
   Layer 1: Core — stake, unstake
   Layer 2: Reward Engine — rewardPerToken, earned, claimReward
   Layer 3: Security — ReentrancyGuard, Pausable, Ownable

3. Tính năng nâng cao
   - Accumulator Pattern: tính reward O(1) không cần loop
   - notifyRewardAmount: owner nạp reward pool linh hoạt
   - Custom errors: tiết kiệm gas hơn require string
   - Pausable: dừng khẩn cấp khi phát hiện lỗi
   - recoverERC20: thu hồi token gửi nhầm

4. Địa chỉ contract (Sepolia testnet)
   StakingToken:   https://sepolia.etherscan.io/address/0x...
   RewardsToken:   https://sepolia.etherscan.io/address/0x...
   StakingRewards: https://sepolia.etherscan.io/address/0x...

5. Test results
   9/9 test cases passed
   Coverage: stake, unstake, claim, proportional reward, security

6. Source code
   GitHub: https://github.com/your_username/staking-capstone
```

---

## 14. Checklist nộp bài

### Theo yêu cầu bắt buộc

- [ ] Source code contract (file `.sol`)
  - [x] `contracts/StakingRewards.sol`
  - [ ] `contracts/mocks/MockERC20.sol`
- [ ] Địa chỉ contract trên testnet (Sepolia)
  - [ ] StakingToken: `0x...`
  - [ ] RewardsToken: `0x...`
  - [ ] StakingRewards: `0x...`
- [ ] Link verify Etherscan — cả 3 contract đều có icon ✓
- [ ] Video demo (max 10 phút)
- [ ] Tài liệu mô tả (1 trang PDF)
---
