# System Design Document: StakingRewards DApp

| | |
|---|---|
| **Mã tài liệu** | ARCH-SDD-002 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Đã áp dụng |
| **Đối tượng mô tả** | Kiến trúc tổng thể hệ thống (contract + frontend + hạ tầng RPC) |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích tài liệu

Tài liệu này trình bày kiến trúc tổng thể được chọn để đáp ứng các yêu cầu tại `00-requirements-spec.md`, cùng căn cứ lựa chọn công nghệ. Đây là tài liệu tham chiếu khi cần trả lời câu hỏi "vì sao hệ thống được tổ chức như vậy" trước khi đi vào chi tiết cài đặt (`02-smart-contract-functional-spec.md`).

## 2. Kiến trúc tổng thể

Hệ thống không có máy chủ backend hay cơ sở dữ liệu trung tâm. Toàn bộ trạng thái nghiệp vụ nằm trên smart contract; frontend chỉ đọc và hiển thị lại, không xử lý nghiệp vụ độc lập.

```
┌────────────────┐        Yêu cầu ký / xác nhận đã ký        ┌──────────────────┐
│    Frontend     │ ───────────────────────────────────────> │   Ví người dùng   │
│  React + viem   │ <─────────────────────────────────────── │     MetaMask      │
└────────────────┘        Gửi giao dịch / kết quả giao dịch   └──────────────────┘
        │                                                              │
        │  Đọc dữ liệu trực tiếp (publicClient) — miễn phí, không cần ví
        v                                                              v
┌─────────────────────────────────────────────────────────────────────────┐
│                    Blockchain — StakingRewards (Sepolia Testnet)         │
└─────────────────────────────────────────────────────────────────────────┘
```

Ba lớp dữ liệu (on-chain storage, derived/off-chain computed, indexed từ event log) được mô tả chi tiết ở tài liệu riêng `06-onchain-offchain-data-map.md`.

## 3. Quyết định công nghệ và căn cứ

### 3.1 Nền tảng blockchain

| Nền tảng | Ưu điểm | Nhược điểm |
|---|---|---|
| **Ethereum (EVM)** *(đã chọn)* | Hệ sinh thái công cụ trưởng thành nhất (Hardhat, Foundry, OpenZeppelin); tài liệu và cộng đồng lớn; nhiều mạng thử nghiệm miễn phí | Phí giao dịch mainnet cao; tốc độ xử lý không cao bằng một số nền tảng mới |
| BNB Smart Chain / Polygon | Tương thích EVM; phí giao dịch thấp hơn | Mức độ phi tập trung và độ tin cậy cộng đồng thấp hơn Ethereum |
| Solana | Tốc độ cao, phí rất thấp | Ngôn ngữ (Rust) và mô hình tài khoản khác biệt hoàn toàn; đường cong học tập không phù hợp thời lượng thực tập |

**Căn cứ chọn Ethereum (Sepolia Testnet):** hệ sinh thái công cụ và tài liệu phù hợp nhất với thời lượng thực tập, đồng thời phổ biến nhất để minh hoạ các khái niệm nền tảng của smart contract.

### 3.2 Framework phát triển

| Framework | Ưu điểm | Nhược điểm |
|---|---|---|
| **Hardhat** *(đã chọn)* | TypeScript/JavaScript thống nhất với frontend; hệ thống plugin phong phú; Hardhat Ignition triển khai khai báo | Tốc độ chạy test chậm hơn Foundry ở dự án lớn |
| Foundry | Viết test bằng Solidity, tốc độ rất nhanh, fuzzing tích hợp | Không dùng chung ngôn ngữ với frontend |
| Truffle | Lâu đời, tài liệu phong phú | Không còn được duy trì phát triển tích cực |

### 3.3 Thư viện tương tác blockchain phía frontend

| Thư viện | Ưu điểm | Nhược điểm |
|---|---|---|
| **viem** *(đã chọn cho frontend)* | Type-safe với TypeScript, gói nhỏ gọn, tách bạch client đọc/ghi | Cộng đồng nhỏ hơn ethers.js |
| **ethers.js v6** *(đã chọn cho tooling — script test/deploy)* | Cộng đồng lớn, phổ biến trong tài liệu học tập | API cồng kềnh hơn với TypeScript nghiêm ngặt |
| web3.js | Lâu đời nhất | API không nhất quán, hỗ trợ TypeScript kém |

Hai lớp riêng biệt, không mâu thuẫn: ethers.js phục vụ development tooling, viem phục vụ sản phẩm cuối hướng tới người dùng.

### 3.4 Thư viện chuẩn hoá smart contract

Sử dụng **OpenZeppelin Contracts** (`Ownable`, `ReentrancyGuard`, `Pausable`, `SafeERC20`) thay vì tự triển khai từ đầu, nhằm giảm rủi ro tự tạo lỗi bảo mật khi viết lại các cơ chế đã có giải pháp được kiểm chứng rộng rãi.

## 4. Trade-off thiết kế đáng chú ý

| Quyết định | Đánh đổi |
|---|---|
| Không có thời gian khoá (lock-up) khi stake | Đơn giản hoá UX, nhưng cho phép "farm and dump" ngắn hạn — xem `07-tokenomics-note.md` |
| Không lưu lịch sử giao dịch trong storage, chỉ dùng event log | Giảm chi phí gas, nhưng frontend phải tự quét log (Mục 5, `06-onchain-offchain-data-map.md`) |
| Quyền `owner` là một EOA đơn, chưa dùng multisig | Phù hợp phạm vi thử nghiệm, nhưng là rủi ro vận hành cần xử lý trước khi triển khai thực tế — xem `05-threat-model.md` |
| Dùng Accumulator Pattern thay vì lưu reward riêng từng người | Tăng độ phức tạp khi thiết kế công thức, nhưng đưa chi phí cập nhật về O(1), khả thi trên blockchain |

## 5. Ràng buộc thiết kế

- Smart contract không thể sửa sau khi triển khai → mọi quyết định thiết kế phải được kiểm thử kỹ trước deploy (xem `03-test-plan.md`).
- Không tồn tại vòng lặp qua toàn bộ người dùng trong bất kỳ hàm nào (giới hạn gas per block).
- Không phụ thuộc bất kỳ máy chủ trung gian nào ngoài RPC provider công khai.

---
*Tài liệu liên quan: `02-smart-contract-functional-spec.md` (chi tiết cài đặt), `06-onchain-offchain-data-map.md` (phân loại dữ liệu).*
