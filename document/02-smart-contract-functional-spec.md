# Smart Contract Functional Specification: StakingRewards

| | |
|---|---|
| **Mã tài liệu** | DEV-SPEC-003 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Khớp với mã nguồn đã triển khai |
| **Đối tượng mô tả** | `contracts/StakingRewards.sol` |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích tài liệu

Tài liệu này đặc tả đầy đủ giao diện (interface) và hành vi của contract `StakingRewards`, độc lập với phần trình bày lý thuyết/toán học ở báo cáo chính — dùng làm tài liệu tham chiếu nhanh khi review code hoặc viết test, tương đương một functional spec được viết trước khi lập trình ở quy trình phát triển chuẩn.

Contract kế thừa `Ownable`, `ReentrancyGuard`, `Pausable` (OpenZeppelin) và dùng `SafeERC20` cho mọi thao tác chuyển token.

## 2. Hằng số và biến trạng thái

| Tên | Kiểu | Khai báo | Mô tả |
|---|---|---|---|
| `PRECISION` | `uint256` | `constant = 1e18` | Hệ số nhân giảm sai số làm tròn khi chia số nguyên |
| `stakingToken` | `IERC20` | `immutable` | Token dùng để stake, gán 1 lần lúc deploy |
| `rewardsToken` | `IERC20` | `immutable` | Token dùng để trả thưởng, gán 1 lần lúc deploy |
| `stakedBalance[address]` | `mapping → uint256` | state | Số token mỗi địa chỉ đang stake |
| `stakedAt[address]` | `mapping → uint256` | state | Timestamp lần stake gần nhất (reset về 0 khi rút hết) |
| `totalStaked` | `uint256` | state | Tổng token đang stake toàn hệ thống |
| `rewardRate` | `uint256` | state | Tốc độ phát thưởng (token/giây) của chu kỳ hiện tại |
| `rewardsDuration` | `uint256` | state, mặc định `7 days` | Thời lượng một chu kỳ thưởng |
| `periodFinish` | `uint256` | state | Thời điểm kết thúc chu kỳ hiện tại |
| `lastUpdateTime` | `uint256` | state | Thời điểm gần nhất `rewardPerTokenStored` được cập nhật |
| `rewardPerTokenStored` | `uint256` | state | Giá trị tích luỹ reward/token, xem công thức Mục 2.2 báo cáo chính |
| `userRewardPerTokenPaid[address]` | `mapping → uint256` | state | Checkpoint reward-per-token riêng từng địa chỉ |
| `rewards[address]` | `mapping → uint256` | state | Phần reward đã "chốt" của từng địa chỉ |

## 3. Đặc tả hàm — nhóm người dùng (không giới hạn quyền gọi)

### 3.1 `stake(uint256 amount)`

| Mục | Nội dung |
|---|---|
| Modifier | `updateReward(msg.sender)`, `nonReentrant`, `whenNotPaused` |
| Điều kiện đầu vào | `amount > 0`, người gọi đã `approve()` đủ `stakingToken` cho contract |
| Revert khi | `amount == 0` → `ZeroAmount()` |
| Hiệu ứng | `stakedBalance[msg.sender] += amount`; `stakedAt[msg.sender] = block.timestamp`; `totalStaked += amount`; chuyển `amount` token từ người gọi vào contract |
| Sự kiện phát ra | `Staked(msg.sender, amount)` |

### 3.2 `unstake(uint256 amount)`

| Mục | Nội dung |
|---|---|
| Modifier | `updateReward(msg.sender)`, `nonReentrant`, `whenNotPaused` |
| Điều kiện đầu vào | `amount > 0`, `amount ≤ stakedBalance[msg.sender]` |
| Revert khi | `amount == 0` → `ZeroAmount()`; `amount > stakedBalance[msg.sender]` → `InsufficientBalance(requested, available)` |
| Hiệu ứng | Trừ `stakedBalance` và `totalStaked`; nếu số dư về 0 thì reset `stakedAt` về 0; chuyển `amount` token về người gọi |
| Sự kiện phát ra | `Withdrawn(msg.sender, amount)` |

### 3.3 `claimReward()`

| Mục | Nội dung |
|---|---|
| Modifier | `updateReward(msg.sender)`, `nonReentrant` — **không có `whenNotPaused`** (có chủ đích, xem `05-threat-model.md`) |
| Điều kiện đầu vào | `rewards[msg.sender] > 0` sau khi `updateReward` chạy |
| Revert khi | Không có reward để nhận → `ZeroAmount()` |
| Hiệu ứng | `rewards[msg.sender] = 0`; chuyển toàn bộ reward về người gọi |
| Sự kiện phát ra | `RewardPaid(msg.sender, reward)` |

## 4. Đặc tả hàm — nhóm quản trị (`onlyOwner`)

### 4.1 `notifyRewardAmount(uint256 reward)`

| Mục | Nội dung |
|---|---|
| Modifier | `onlyOwner`, `updateReward(address(0))` |
| Điều kiện đầu vào | `reward > 0`; số dư `rewardsToken` thực tế trong contract đủ để `rewardRate` mới không vượt `balance / rewardsDuration` |
| Revert khi | `reward == 0` → `ZeroAmount()`; không đủ vốn → `ProvidedRewardTooHigh()` |
| Hiệu ứng | Nếu chu kỳ cũ đã kết thúc: `rewardRate = reward / rewardsDuration`. Nếu chưa: cộng dồn phần thưởng còn lại (`leftover`) của chu kỳ cũ vào `reward` trước khi chia lại. Cập nhật `lastUpdateTime`, `periodFinish = now + rewardsDuration` |
| Sự kiện phát ra | `RewardAdded(reward)` |
| Ghi chú | Thứ tự vận hành bắt buộc: chuyển token vào contract **trước**, gọi hàm này **sau** — xem `07-tokenomics-note.md` |

### 4.2 `setRewardsDuration(uint256 duration)`

| Mục | Nội dung |
|---|---|
| Modifier | `onlyOwner` |
| Điều kiện đầu vào | `duration > 0`; chu kỳ hiện tại đã kết thúc (`block.timestamp > periodFinish`) |
| Revert khi | `duration == 0` → `ZeroAmount()`; chu kỳ chưa kết thúc → `RewardPeriodNotFinished()` |
| Hiệu ứng | Cập nhật `rewardsDuration` cho chu kỳ kế tiếp |
| Sự kiện phát ra | `RewardsDurationUpdated(duration)` |

### 4.3 `recoverERC20(address tokenAddress, uint256 tokenAmount)`

| Mục | Nội dung |
|---|---|
| Modifier | `onlyOwner`, `nonReentrant` |
| Điều kiện đầu vào | `tokenAddress != address(0)`, `tokenAmount > 0`, `tokenAddress` không phải `stakingToken`/`rewardsToken` |
| Revert khi | Địa chỉ 0 → `InvalidTokenAddress`; amount 0 → `ZeroAmount()`; trùng `stakingToken` → `CannotWithdrawStakingToken()`; trùng `rewardsToken` → `CannotWithdrawRewardToken()` |
| Hiệu ứng | Chuyển `tokenAmount` của `tokenAddress` về địa chỉ `owner()` |
| Sự kiện phát ra | `Recovered(tokenAddress, tokenAmount)` |

### 4.4 `pause()` / `unpause()`

| Mục | Nội dung |
|---|---|
| Modifier | `onlyOwner` |
| Hiệu ứng | Bật/tắt trạng thái `Pausable`, chặn/mở lại `stake()`/`unstake()` (không ảnh hưởng `claimReward()`) |

## 5. Hàm chỉ đọc (view)

| Hàm | Trả về | Công thức |
|---|---|---|
| `lastTimeRewardApplicable()` | `uint256` | `min(block.timestamp, periodFinish)` |
| `rewardPerToken()` | `uint256` | Nếu `totalStaked == 0`: trả về `rewardPerTokenStored`. Ngược lại: `rewardPerTokenStored + (lastTimeRewardApplicable() − lastUpdateTime) × rewardRate × PRECISION / totalStaked` |
| `earned(address account)` | `uint256` | `stakedBalance[account] × (rewardPerToken() − userRewardPerTokenPaid[account]) / PRECISION + rewards[account]` |

## 6. Ma trận phân quyền

| Hàm | Bất kỳ ai | Chỉ `owner` |
|---|:---:|:---:|
| `stake`, `unstake`, `claimReward` | ✅ | |
| `notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, `pause`, `unpause` | | ✅ |
| Toàn bộ hàm `view` | ✅ | |

## 7. Danh sách lỗi tuỳ chỉnh (custom errors)

| Lỗi | Khi nào phát sinh |
|---|---|
| `ZeroAmount()` | Tham số số lượng bằng 0 ở bất kỳ hàm nào yêu cầu > 0 |
| `InvalidTokenAddress(address)` | Địa chỉ token bằng `address(0)` |
| `IdenticalTokenAddresses()` | `stakingToken == rewardsToken` lúc deploy |
| `InsufficientBalance(uint256, uint256)` | Unstake vượt quá số dư đang stake |
| `RewardPeriodNotFinished()` | Đổi `rewardsDuration` khi chu kỳ hiện tại chưa kết thúc |
| `ProvidedRewardTooHigh()` | `rewardRate` mới vượt quá khả năng chi trả thực tế |
| `CannotWithdrawStakingToken()` / `CannotWithdrawRewardToken()` | `recoverERC20` cố rút `stakingToken`/`rewardsToken` |

## 8. Bất biến hệ thống (invariants) cần giữ đúng

- `totalStaked` luôn bằng tổng `stakedBalance` của mọi địa chỉ.
- Tổng `earned()` của mọi người dùng không vượt quá tổng reward đã phát ra trong lịch sử các chu kỳ (xem chứng minh công thức ở Mục 2.2 báo cáo chính).
- `stakingToken` và `rewardsToken` không đổi trong suốt vòng đời contract.

---
*Tài liệu liên quan: `03-test-plan.md` (đối chiếu từng hàm với test case), `05-threat-model.md` (rủi ro theo từng hàm).*
