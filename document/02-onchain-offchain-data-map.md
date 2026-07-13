# Data Architecture Map: On-chain / Off-chain — StakingRewards DApp

| | |
|---|---|
| **Mã tài liệu** | ARCH-DM-002 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Rà soát nội bộ |
| **Đối tượng mô tả** | `contracts/StakingRewards.sol` + `frontend/src/App.tsx` |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích tài liệu

Trong kiến trúc phần mềm truyền thống, tài liệu thiết kế cơ sở dữ liệu mô tả schema, bảng, quan hệ giữa các bảng. Kiến trúc Web3 không có một cơ sở dữ liệu tập trung duy nhất — dữ liệu của hệ thống này phân tán trên **3 lớp có đặc tính khác nhau hoàn toàn**: dữ liệu lưu trữ vĩnh viễn trên blockchain (on-chain storage), dữ liệu được tính toán lại ở phía client mà không lưu trữ ở đâu cả (derived/off-chain), và dữ liệu phải được tái tạo từ lịch sử log giao dịch (indexed from event logs).

Tài liệu này đóng vai trò tương đương tài liệu thiết kế database trong quy trình phát triển truyền thống: xác định **dữ liệu nào nằm ở đâu, lấy bằng cách nào, độ tin cậy và tần suất cập nhật ra sao**.

## 2. Tổng quan 3 lớp dữ liệu

| Lớp | Nơi lưu trữ thật sự | Đặc tính | Chi phí truy xuất |
|---|---|---|---|
| **Lớp 1 — On-chain Storage** | Storage của contract trên blockchain | Vĩnh viễn, là nguồn sự thật duy nhất (source of truth) | Đọc miễn phí, ghi tốn gas |
| **Lớp 2 — Derived / Off-chain Computed** | Không lưu ở đâu cả — tính lại mỗi lần cần, tại thời điểm client đọc | Tạm thời, chỉ đúng tại thời điểm tính | Miễn phí (tính toán thuần JavaScript) |
| **Lớp 3 — Indexed from Event Logs** | Transaction log trên blockchain, được quét lại bởi frontend | Vĩnh viễn nhưng không truy vấn trực tiếp được — phải quét theo khoảng block | Miễn phí nhưng giới hạn theo nhà cung cấp RPC |

## 3. Lớp 1 — On-chain Storage

Đây là dữ liệu thật sự nằm trong storage của contract `StakingRewards`, được đọc qua `publicClient.readContract()`.

| Biến | Kiểu dữ liệu | Phân loại | Ai ghi được |
|---|---|---|---|
| `stakingToken`, `rewardsToken` | `address` (immutable) | Cấu hình cố định | Chỉ constructor lúc deploy |
| `PRECISION` | `uint256` (constant) | Hằng số tính toán | Không đổi được |
| `totalStaked` | `uint256` | Trạng thái tổng hợp | `stake()`, `unstake()` — bất kỳ ai |
| `rewardRate`, `periodFinish`, `lastUpdateTime`, `rewardPerTokenStored` | `uint256` | Trạng thái chu kỳ thưởng | Modifier `updateReward`, hàm `notifyRewardAmount` (owner) |
| `rewardsDuration` | `uint256` | Cấu hình vận hành | `setRewardsDuration()` — chỉ owner |
| `stakedBalance[address]`, `stakedAt[address]` | `mapping(address => uint256)` | Trạng thái theo từng người dùng | `stake()`, `unstake()` — chính chủ địa chỉ đó |
| `userRewardPerTokenPaid[address]`, `rewards[address]` | `mapping(address => uint256)` | Checkpoint kế toán thưởng | Modifier `updateReward` (tự động, gắn kèm mọi hành động) |
| `paused` | `bool` | Trạng thái vận hành | `pause()`/`unpause()` — chỉ owner |

**Đặc điểm quan trọng:** Đây là nơi duy nhất có giá trị **tuyệt đối đúng** — mọi lớp còn lại chỉ là suy diễn hoặc bản sao có thời hạn của lớp này.

## 4. Lớp 2 — Derived / Off-chain Computed

Các giá trị này **không tồn tại trong contract**, không được lưu ở bất kỳ đâu — chúng được tính lại từ Lớp 1 mỗi khi frontend cần hiển thị (trong hàm `loadState()` và các biến suy ra trong thân component `App()`).

| Giá trị hiển thị | Công thức tính | Tính từ (Lớp 1) |
|---|---|---|
| `rewardRatePerDay` | `rewardRate × 86400` | `rewardRate` |
| `nominalApyPercent` (APR danh nghĩa) | `(rewardRate × 31536000) / totalStaked × 100` | `rewardRate`, `totalStaked` |
| `fundingCoveragePercent` | `contractRewardBalance / scheduledRewardsRemaining × 100` | Số dư token thưởng thực tế + nghĩa vụ chi trả còn lại |
| `poolHealth` (Healthy/Low/Critical/Inactive/Paused) | Quy tắc kết hợp từ `paused`, `fundingCoveragePercent`, `rewardRunwaySeconds` | Tổng hợp nhiều giá trị trên |
| `timeLeftSeconds` / countdown chu kỳ | `periodFinish − thời điểm hiện tại` | `periodFinish` |
| `periodProgress` (%) | Suy ra từ `periodFinish − rewardsDuration` làm mốc bắt đầu | `periodFinish`, `rewardsDuration` |

**Cơ chế làm mới:** Toàn bộ Lớp 2 được tính lại mỗi khi Lớp 1 được đọc lại — cụ thể là mỗi 10 giây (interval polling), sau mỗi giao dịch thành công, và khi kết nối/đổi tài khoản/đổi mạng.

**Rủi ro cần lưu ý:** Vì đây là dữ liệu tính lại, **không có gì đảm bảo tính nhất quán giữa các lần hiển thị nếu người dùng có 2 tab trình duyệt mở cùng lúc** — mỗi tab tự đọc và tự tính riêng, độ trễ tối đa giữa thực tế on-chain và những gì hiển thị là khoảng thời gian của 1 chu kỳ polling (10 giây).

## 5. Lớp 3 — Indexed from Event Logs

Contract phát ra (`emit`) các event khi có hành động xảy ra: `Staked`, `Withdrawn`, `RewardPaid`, `RewardAdded`, `RewardsDurationUpdated`, `Recovered`, cùng với event `Transfer`/`Approval` chuẩn ERC20 (dùng để suy ra hành vi mint/faucet, approve). Các event này **không nằm trong storage** — không có hàm nào trong contract trả về "lịch sử giao dịch". Để hiển thị mục Activity trên giao diện, frontend phải tự quét lại (`eth_getLogs`) toàn bộ log từ block deploy (`11,001,025`) tới hiện tại.

| Đặc tính | Chi tiết |
|---|---|
| Cơ chế truy vấn | `publicClient.getLogs()`, chia nhỏ theo khoảng `2,000` block/lần gọi (giới hạn của RPC công khai) |
| Số loại log cần quét | 6–9 loại (tùy người dùng có quyền owner hay không) |
| Chiến lược gọi | **Tuần tự**, không song song — quyết định có chủ đích nhằm tránh bị RPC giới hạn tần suất (rate limit) khi số lượng request nhân lên theo số block đã trôi qua |
| Thời điểm tải | Chỉ khi người dùng mở tab "Activity" (lazy load) — không tải ngầm khi ở các tab khác |
| Độ tin cậy | Phụ thuộc tính khả dụng của RPC provider tại thời điểm truy vấn; có cơ chế thử lại (retry) khi gọi thất bại |

**Rủi ro cần lưu ý:** Khi số block kể từ lúc deploy tăng lên theo thời gian, số lượng request cần thiết để quét đầy đủ lịch sử tăng tuyến tính. Đây là giới hạn về khả năng mở rộng (scalability) đã được ghi nhận, không phải lỗi hiện tại — xem thêm khuyến nghị ở mục 7.

## 6. Sơ đồ tổng hợp luồng dữ liệu

```
[On-chain Storage]  --readContract()-->  [App state, mỗi 10s]  --tính toán-->  [Derived values hiển thị UI]
[Event Logs]        --getLogs() tuần tự-->  [Activity feed, khi mở tab]
```

Không có lớp trung gian nào khác (không có server backend, không có database riêng) — toàn bộ pipeline dữ liệu chỉ có 2 nguồn gốc: **storage hiện tại** và **log lịch sử**, cả hai đều lấy trực tiếp từ blockchain qua RPC.

## 7. Khuyến nghị

| Mức ưu tiên | Khuyến nghị | Lý do |
|---|---|---|
| P2 | Cân nhắc giới hạn phạm vi quét log theo cửa sổ thời gian gần nhất (VD: 30 ngày gần nhất) thay vì quét từ block deploy | Giảm số lượng request khi contract chạy lâu dài, tránh vấn đề scalability đã ghi nhận ở mục 5 |
| P3 | Cân nhắc bổ sung lớp cache phía client (VD: lưu log đã quét vào bộ nhớ trình duyệt) để tránh quét lại toàn bộ mỗi lần tải trang | Cải thiện tốc độ tải, giảm tải cho RPC provider |
| P3 | Nếu mở rộng quy mô người dùng, cân nhắc dịch vụ indexing chuyên dụng (The Graph hoặc tương đương) thay vì quét log trực tiếp từ client | Giải pháp chuẩn công nghiệp cho bài toán truy vấn lịch sử on-chain ở quy mô lớn |

---
*Tham chiếu chéo: chi tiết cơ chế đọc/ghi dữ liệu tương ứng với `frontend/src/App.tsx` (hàm `loadState()`, `loadActivity()`) và `contracts/StakingRewards.sol`.*
