# Test Plan: StakingRewards Smart Contract

| | |
|---|---|
| **Mã tài liệu** | QA-TP-004 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Đã thực thi — 16/16 pass |
| **Đối tượng kiểm thử** | `contracts/StakingRewards.sol`, `contracts/mocks/MockERC20.sol` |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục tiêu và phạm vi

Vì smart contract không thể sửa chữa sau khi triển khai, kiểm thử trước khi deploy đóng vai trò quyết định hơn nhiều so với phát triển phần mềm thông thường. Tài liệu này chốt phạm vi, chiến lược, và ma trận test case đối chiếu với đặc tả chức năng ở `02-smart-contract-functional-spec.md`, trước khi đối chiếu ngược với kết quả thực thi.

**Trong phạm vi:** toàn bộ hàm public/external của `StakingRewards`, các đường revert đã khai báo, và các kịch bản nhiều người dùng.

**Ngoài phạm vi:** kiểm thử tấn công reentrancy bằng contract độc hại thật (chưa có trong bộ test hiện tại — ghi nhận là khoảng trống ở Mục 6), kiểm thử tải (load test) số lượng lớn người dùng đồng thời.

## 2. Môi trường và công cụ kiểm thử

| Hạng mục | Giá trị |
|---|---|
| Nền tảng chạy test | Hardhat Network (mạng Ethereum giả lập, chạy trong bộ nhớ) |
| Framework | Hardhat 3 + Chai + Ethers.js v6 |
| Khả năng điều khiển thời gian | `networkHelpers.time.increaseTo()` — dịch chuyển `block.timestamp` tức thời, không cần chờ thời gian thực |
| Cô lập trạng thái | Mỗi test case gọi lại `deployFixture()` để triển khai lại từ đầu 3 contract liên quan |
| Sai số cho phép | So sánh kết quả contract với giá trị tính tay trong biên độ 0.01%, nhằm hấp thụ sai số làm tròn của phép chia số nguyên trong Solidity |

## 3. Ma trận test case

| # | Nhóm | Tên test case | Hàm/luồng được kiểm tra | Kết quả |
|---|---|---|---|---|
| 1 | Deployment | deploys with the expected token addresses, owner, and defaults (bao gồm revert khi deploy với địa chỉ 0 / 2 token trùng nhau) | Constructor | ✅ Pass |
| 2 | Scenario 1 — một người dùng | earns the expected reward after staking for half the duration | `stake`, `earned`, time travel | ✅ Pass |
| 3 | Scenario 1 — một người dùng | transfers rewards and resets earned after claiming | `claimReward` | ✅ Pass |
| 4 | Scenario 2 — stake/unstake tức thời | has zero reward when no reward period has been funded | `earned` khi chưa có `notifyRewardAmount` | ✅ Pass |
| 5 | Scenario 2 — stake/unstake tức thời | returns staking tokens correctly after immediate unstake | `stake` → `unstake` ngay lập tức | ✅ Pass |
| 6 | Scenario 3 — hai người dùng | splits rewards proportionally when alice stakes twice bob's amount | Chia tỷ lệ reward theo `stakedBalance` | ✅ Pass |
| 7 | Scenario 3 — hai người dùng | accounts correctly when bob joins after alice has accrued rewards | Checkpoint cá nhân khi tham gia lệch thời điểm | ✅ Pass |
| 8 | Ranh giới kế toán reward | caps rewards at periodFinish even if more time passes | `lastTimeRewardApplicable` chặn tại `periodFinish` | ✅ Pass |
| 9 | Ranh giới kế toán reward | carries leftover rewards into a new active reward period | `notifyRewardAmount` gọi giữa chu kỳ | ✅ Pass |
| 10 | Ranh giới kế toán reward | reverts claim when there is no reward | `claimReward` → `ZeroAmount()` | ✅ Pass |
| 11 | Quản trị và thu hồi | allows duration updates only after the active reward period finishes | `setRewardsDuration` + `RewardPeriodNotFinished()` | ✅ Pass |
| 12 | Quản trị và thu hồi | recovers unrelated ERC20 tokens but protects staking and rewards tokens | `recoverERC20` + 2 lỗi bảo vệ token | ✅ Pass |
| 13 | Bảo mật | reverts zero amount staking and excess unstaking | `ZeroAmount()`, `InsufficientBalance()` | ✅ Pass |
| 14 | Bảo mật | blocks stake and unstake while paused | `whenNotPaused` | ✅ Pass |
| 15 | Bảo mật | restricts owner-only admin functions | `onlyOwner` trên cả 5 hàm quản trị | ✅ Pass |
| 16 | Bảo mật | reverts notifyRewardAmount when reward is zero or not funded | `ZeroAmount()`, `ProvidedRewardTooHigh()` | ✅ Pass |

**Tổng kết:** 16/16 test case pass khi chạy `npx hardhat test`, tương ứng đúng bước 2 trong quy trình triển khai (`08-deployment-runbook.md`).

## 4. Nguyên tắc thiết kế test case

1. **Cô lập trạng thái:** không test nào phụ thuộc thứ tự chạy hay trạng thái để lại bởi test khác.
2. **Đối chiếu công thức, không chỉ đối chiếu hành vi:** với các test liên quan tới reward (test 2, 3, 6–9), giá trị kỳ vọng được tính độc lập theo công thức ở `02-smart-contract-functional-spec.md` Mục 5, rồi so với giá trị contract trả về.
3. **Test cả đường thành công lẫn đường revert:** mỗi lỗi tuỳ chỉnh khai báo trong Mục 7 của `02-smart-contract-functional-spec.md` đều có ít nhất một test xác nhận revert đúng lỗi mong đợi.

## 5. Kiểm tra bổ sung ngoài bộ test logic

| Kiểm tra | Công cụ | Kết quả |
|---|---|---|
| Biên dịch production frontend | `npm run build` | Thành công, không lỗi TypeScript/Vite |
| Rà soát lỗ hổng phụ thuộc frontend | `npm audit` | 1 lỗ hổng mức HIGH từ gói `ws` (phụ thuộc gián tiếp qua `viem`) — không phải lỗi trong mã nguồn của dự án, cần theo dõi khi `viem` phát hành bản vá |
| Kích thước bytecode | `npx hardhat size-contracts` | Trong giới hạn EIP-170 (24.576 bytes) |

## 6. Khoảng trống kiểm thử đã ghi nhận (Test Gaps)

| Mã | Khoảng trống | Rủi ro liên quan | Ưu tiên khắc phục |
|---|---|---|---|
| GAP-01 | Chưa có test giả lập tấn công reentrancy bằng contract độc hại thật (chỉ mới xác minh qua rà soát mã nguồn tĩnh) | T-01, `05-threat-model.md` | P1 |
| GAP-02 | Chưa có test cho trường hợp biên `rewardRate` bị làm tròn về 0 khi `reward` quá nhỏ so với `rewardsDuration` | T-04, `05-threat-model.md` | P2 |
| GAP-03 | Chưa có test tải với số lượng lớn địa chỉ stake đồng thời (ngoài phạm vi capstone) | — | P3 |

---
*Tài liệu liên quan: `02-smart-contract-functional-spec.md` (đặc tả được test đối chiếu), `05-threat-model.md` (rủi ro tương ứng với từng khoảng trống test).*
