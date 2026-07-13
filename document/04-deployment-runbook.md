# Deployment Runbook: StakingRewards DApp

| | |
|---|---|
| **Mã tài liệu** | OPS-RB-004 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Áp dụng nội bộ |
| **Đối tượng áp dụng** | Triển khai `contracts/StakingRewards.sol` lên mạng Ethereum (Testnet/Mainnet) |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích và phạm vi sử dụng

Tài liệu này chuẩn hóa quy trình triển khai contract, nhằm đảm bảo mọi lần deploy đều theo đúng trình tự, không bỏ sót bước kiểm tra — điều đặc biệt quan trọng với smart contract vì **không có khả năng sửa lỗi sau khi deploy**. Tài liệu áp dụng cho triển khai lên Sepolia Testnet (đã thực hiện) và làm cơ sở tham chiếu nếu triển khai lên Mainnet trong tương lai (xem lưu ý riêng ở mục 6).

## 2. Điều kiện tiên quyết

| Hạng mục | Yêu cầu |
|---|---|
| Biến môi trường `.env` | `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY` — tham khảo `.env.example` |
| Số dư ví triển khai | Đủ Sepolia ETH để trả gas cho 3 lần deploy contract + các giao dịch thiết lập ban đầu (lấy từ Sepolia faucet công khai) |
| Trạng thái mã nguồn | Đã merge vào nhánh chính (`main`), không còn thay đổi chưa commit |
| Công cụ | Node.js phiên bản tương thích Hardhat 3, đã chạy `npm install` tại thư mục gốc dự án |

## 3. Quy trình triển khai

### Bước 1 — Biên dịch

```
npx hardhat compile
```
Kiểm tra: không có lỗi/cảnh báo biên dịch. Artifact (ABI, bytecode) được sinh vào thư mục `artifacts/`.

### Bước 2 — Chạy toàn bộ bộ test

```
npx hardhat test
```
Kiểm tra: **toàn bộ 16 test case phải pass**. Không được deploy nếu có bất kỳ test nào fail — vì đây là lần kiểm tra logic cuối cùng trước khi hành động trở nên không thể hoàn tác.

### Bước 3 — Kiểm tra kích thước bytecode

```
npx hardhat size-contracts
```
Kiểm tra: kích thước bytecode đã deploy của từng contract nằm dưới giới hạn 24.576 bytes (EIP-170). Nếu vượt, deploy sẽ thất bại ở Bước 5 — nên phát hiện sớm ở đây.

### Bước 4 — Rà soát kế hoạch triển khai

Đọc lại `ignition/modules/StakingRewards.ts`, xác nhận:
- Tham số constructor của `MockERC20` (tên, ký hiệu token) đúng như dự kiến.
- Thứ tự phụ thuộc: `StakingToken` và `RewardsToken` deploy trước, `StakingRewards` deploy sau, nhận địa chỉ 2 token trên làm tham số.

### Bước 5 — Triển khai lên Sepolia

```
npx hardhat ignition deploy ignition/modules/StakingRewards.ts --network sepolia
```
Ignition tự động: deploy theo đúng thứ tự phụ thuộc, ghi nhật ký tiến trình (journal) vào ổ đĩa. Nếu quá trình bị gián đoạn (mất kết nối, hết gas giữa chừng), **chạy lại đúng lệnh trên** — Ignition tự tiếp tục từ bước dang dở, không deploy lại phần đã thành công.

Kiểm tra: ghi lại 3 địa chỉ contract được trả về (`StakingToken`, `RewardsToken`, `StakingRewards`).

### Bước 6 — Cập nhật cấu hình tham chiếu

Cập nhật `frontend/src/config/contracts.ts` với 3 địa chỉ vừa deploy. Cập nhật file ghi chú địa chỉ đã triển khai (`deployed-addresses.txt`) để tiện tra cứu, tránh nhầm lẫn giữa các lần deploy thử nghiệm khác nhau.

### Bước 7 — Xác thực mã nguồn công khai (Verify)

```
npx hardhat verify --network sepolia <địa_chỉ_contract> <tham_số_constructor>
```
Thực hiện cho cả 3 contract. Kiểm tra: trang Etherscan của từng địa chỉ hiển thị nhãn "✅ Contract Source Code Verified" và cho phép đọc/gọi thử hàm `view` trực tiếp trên giao diện Etherscan.

### Bước 8 — Kiểm tra tình trạng sẵn sàng

```
npx ts-node scripts/check-sepolia-readiness.ts
npx ts-node scripts/read-deployment-state.ts
```
Kiểm tra: các script đọc đúng địa chỉ vừa deploy, trạng thái ban đầu đúng như kỳ vọng (`totalStaked = 0`, `paused = false`, `owner` đúng là ví triển khai).

### Bước 9 — Khởi tạo pool thưởng ban đầu

Thực hiện thủ công hoặc qua `scripts/interact.ts`:
1. Chuyển một lượng `RewardsToken` vào địa chỉ `StakingRewards`.
2. Gọi `notifyRewardAmount(reward)` để kích hoạt chu kỳ thưởng đầu tiên.

Kiểm tra: `rewardRate > 0`, `periodFinish` đúng bằng thời điểm hiện tại cộng `rewardsDuration`.

### Bước 10 — Triển khai frontend

Build lại frontend với địa chỉ contract mới (`npm run build` trong thư mục `frontend/`), triển khai bản build. Kiểm tra: giao diện đọc đúng dữ liệu từ contract vừa deploy, không còn trỏ tới địa chỉ deploy thử nghiệm cũ.

## 4. Bảng kiểm tra nhanh (Checklist tóm tắt)

| # | Hạng mục | Đạt |
|---|---|---|
| 1 | Compile không lỗi | ☐ |
| 2 | 16/16 test pass | ☐ |
| 3 | Kích thước bytecode trong giới hạn | ☐ |
| 4 | Kế hoạch deploy đã rà soát | ☐ |
| 5 | Deploy thành công, đã ghi lại 3 địa chỉ | ☐ |
| 6 | Cấu hình frontend đã cập nhật | ☐ |
| 7 | Cả 3 contract đã verify trên Etherscan | ☐ |
| 8 | Script kiểm tra readiness pass | ☐ |
| 9 | Pool thưởng đã khởi tạo, `rewardRate > 0` | ☐ |
| 10 | Frontend build & deploy trỏ đúng địa chỉ mới | ☐ |

## 5. Không có quy trình Rollback

Khác với triển khai phần mềm truyền thống, **không tồn tại thao tác "rollback" một khi contract đã deploy**. Nếu phát hiện lỗi nghiêm trọng sau khi deploy:

1. Gọi `pause()` ngay lập tức để chặn `stake()`/`unstake()` mới (không chặn được `claimReward()` theo thiết kế — xem `01-threat-model.md`).
2. Thông báo cho toàn bộ người dùng liên quan.
3. Deploy một **contract hoàn toàn mới** với bản vá, không phải "sửa" contract cũ.
4. Xây dựng quy trình di chuyển dữ liệu (migration) thủ công nếu cần chuyển trạng thái người dùng sang contract mới — hiện tại chưa có cơ chế migration tự động trong hệ thống.

## 6. Lưu ý riêng nếu triển khai lên Mainnet

Runbook này được xây dựng cho môi trường Testnet. Nếu triển khai lên Mainnet với tài sản có giá trị thật, bổ sung bắt buộc trước Bước 5:

- Hoàn tất audit bởi bên thứ ba (xem khuyến nghị P3 trong `01-threat-model.md`).
- Chuyển quyền `owner` sang ví multisig thay vì private key đơn lẻ (xem `05-operational-runbook.md`).
- Chạy thử toàn bộ quy trình 10 bước trên một mạng testnet có điều kiện gần giống mainnet nhất trước khi thực hiện thật.

---
*Tham chiếu chéo: các lệnh trong tài liệu này tương ứng trực tiếp với `hardhat.config.ts`, `ignition/modules/StakingRewards.ts`, và các script trong thư mục `scripts/`.*
