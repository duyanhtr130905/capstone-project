# Threat Model: Smart Contract StakingRewards

| | |
|---|---|
| **Mã tài liệu** | SEC-TM-005 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Rà soát nội bộ |
| **Đối tượng đánh giá** | `contracts/StakingRewards.sol` (triển khai trên Sepolia Testnet) |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Tóm tắt

Tài liệu này xác định các mối đe dọa bảo mật áp dụng cho smart contract `StakingRewards`, đánh giá các biện pháp phòng chống hiện có, và ghi nhận rủi ro còn tồn đọng (residual risk). Contract triển khai mô hình staking theo kiểu accumulator (chuẩn Synthetix) trên Ethereum (Sepolia testnet). Sáu nhóm mối đe dọa đã được phân tích. Năm nhóm được phòng chống bằng thiết kế và có test tự động bao phủ; một nhóm (reentrancy) được phòng chống bằng thiết kế nhưng chưa có test giả lập tấn công riêng. Trong phạm vi đánh giá, không phát hiện lỗ hổng nghiêm trọng chưa được xử lý.

Đây là **rà soát kỹ thuật nội bộ**, không phải một cuộc audit độc lập bởi bên thứ ba. Mức độ đảm bảo của tài liệu này chưa đạt tiêu chuẩn cần thiết để triển khai lên mainnet với giá trị tài sản đáng kể.

## 2. Phạm vi và phương pháp đánh giá

**Trong phạm vi:**
- `contracts/StakingRewards.sol`
- `contracts/mocks/MockERC20.sol`
- Cấu hình triển khai (`ignition/modules/StakingRewards.ts`)

**Ngoài phạm vi:**
- Bảo mật tầng ví (browser extension, cách quản lý private key)
- Độ tin cậy của nhà cung cấp RPC bên thứ ba
- Bảo mật ứng dụng frontend (xem tài liệu riêng: `06-onchain-offchain-data-map.md`)

**Phương pháp:** Rà soát mã nguồn thủ công, đối chiếu với bộ test tự động (`test/StakingRewards.test.ts`, 16 test case). Các mối đe dọa được liệt kê theo khung phân loại rủi ro tiêu chuẩn cho smart contract (reentrancy, kiểm soát truy cập, thao túng kinh tế, lỗi số học, rủi ro liên quan tới tính bất biến). Mỗi phát hiện ghi nhận: vector tấn công, thành phần bị ảnh hưởng, biện pháp phòng chống hiện có, mức rủi ro còn lại, và tình trạng bao phủ test.

## 3. Bối cảnh hệ thống

Contract nắm giữ 2 loại tài sản ERC20 (`stakingToken`, `rewardsToken`) thay mặt người dùng. Ranh giới tin cậy (trust boundary) được xác định như sau: **bất kỳ địa chỉ nào cũng có thể gọi các hàm dành cho người dùng** (`stake`, `unstake`, `claimReward`); **chỉ địa chỉ `owner`** (được xác lập lúc deploy) mới có quyền gọi các hàm quản trị (`notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, `pause`, `unpause`). Vì bytecode của contract không thể sửa đổi sau khi deploy, mọi biện pháp phòng chống phải được giải quyết **trước khi** triển khai — không tồn tại đường sửa lỗi (hotfix) sau đó.

## 4. Danh mục mối đe dọa

### T-01 — Reentrancy (Gọi lại trong lúc đang xử lý)

| Trường | Nội dung |
|---|---|
| **Mô tả** | Một contract độc hại có thể "gọi ngược lại" hàm đang thực thi trong lúc contract này đang thực hiện chuyển token ra ngoài, trước khi state được cập nhật xong — dẫn tới khả năng rút tài sản nhiều lần trái phép. |
| **Vector tấn công** | Logic `receive`/fallback độc hại được kích hoạt trong lúc gọi `safeTransfer`/`safeTransferFrom` bên trong các hàm `stake`, `unstake`, `claimReward`, `recoverERC20`. |
| **Biện pháp phòng chống** | Modifier `nonReentrant` được áp dụng cho cả 4 hàm có gọi chuyển token ra ngoài. Đồng thời tuân thủ nguyên tắc Checks-Effects-Interactions một cách độc lập (cập nhật số dư/state luôn thực hiện trước khi gọi chuyển token). |
| **Rủi ro còn lại** | Thấp |
| **Tình trạng test** | ⚠️ Chưa đầy đủ — biện pháp phòng chống đã được xác minh qua rà soát mã nguồn tĩnh; chưa có test giả lập tấn công thật sự (dùng mock token độc hại có khả năng reentrant) trong bộ test hiện tại. |

### T-02 — Thao túng công thức chia thưởng qua chuyển token trực tiếp ("Donation Attack")

| Trường | Nội dung |
|---|---|
| **Mô tả** | Các contract tính tỷ lệ chia thưởng dựa trên `token.balanceOf(address(this))` dễ bị thao túng bằng cách gửi token trực tiếp không qua hàm chính thức. |
| **Vector tấn công** | Kẻ tấn công chuyển thẳng `stakingToken` vào địa chỉ contract (không qua `stake()`) nhằm làm sai lệch số dư dùng trong công thức tính thưởng. |
| **Biện pháp phòng chống** | Công thức chia thưởng chỉ dựa vào biến trạng thái nội bộ `totalStaked`, biến này chỉ thay đổi khi có người gọi `stake()`/`unstake()` thật sự. Chuyển token trực tiếp không làm `totalStaked` thay đổi, do đó không ảnh hưởng tới việc chia thưởng. |
| **Rủi ro còn lại** | Không đáng kể |
| **Tình trạng test** | ✅ Không cần test riêng — theo thiết kế, không tồn tại đường code nào bị ảnh hưởng bởi vector này. |

### T-03 — Leo thang đặc quyền / Vượt qua kiểm soát truy cập

| Trường | Nội dung |
|---|---|
| **Mô tả** | Nếu địa chỉ không có thẩm quyền gọi được các hàm quản trị, hậu quả có thể là từ chối dịch vụ, chiếm đoạt tài sản, hoặc thao túng lịch trình chia thưởng. |
| **Vector tấn công** | Địa chỉ không phải owner cố gọi `notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, `pause`, hoặc `unpause`. |
| **Biện pháp phòng chống** | Modifier `onlyOwner` (từ thư viện OpenZeppelin `Ownable`) giới hạn cả 5 hàm quản trị chỉ cho 1 địa chỉ duy nhất được xác lập lúc deploy. |
| **Rủi ro còn lại** | Thấp (phụ thuộc vào cách quản lý private key vận hành — xem mục 6) |
| **Tình trạng test** | ✅ Đầy đủ — có test case riêng xác nhận các lệnh gọi từ địa chỉ không phải owner đều bị revert. |

### T-04 — Sai số làm tròn trong công thức tính `rewardRate`

| Trường | Nội dung |
|---|---|
| **Mô tả** | Solidity làm tròn xuống mọi phép chia số nguyên. Nếu `reward < rewardsDuration` (tính bằng giây), `rewardRate` sẽ làm tròn về 0, khiến toàn bộ chu kỳ thưởng vô hiệu một cách âm thầm dù `notifyRewardAmount` vẫn thực thi thành công. |
| **Vector tấn công** | Không áp dụng (đây là lỗi cấu hình vận hành, không phải hành vi tấn công chủ động) |
| **Biện pháp phòng chống** | Chưa có biện pháp chặn cụ thể. Đây là đặc tính kế thừa từ chính công thức reward-rate gốc của mô hình Synthetix. |
| **Rủi ro còn lại** | Thấp — không gây mất tài sản; chỉ gây lãng phí thao tác (chu kỳ thưởng không hoạt động, cần cấp lại). |
| **Tình trạng test** | ⚠️ Chưa được bao phủ — chưa có test cho trường hợp biên với giá trị reward quá nhỏ. |

### T-05 — Thay đổi địa chỉ token sau khi deploy (dạng "Rug Pull")

| Trường | Nội dung |
|---|---|
| **Mô tả** | Nếu địa chỉ tham chiếu của `stakingToken`/`rewardsToken` có thể bị thay đổi sau khi deploy, owner có thể chuyển hướng tài sản người dùng sang một token vô giá trị hoặc độc hại. |
| **Vector tấn công** | Không áp dụng — xem biện pháp phòng chống. |
| **Biện pháp phòng chống** | Cả 2 địa chỉ token được khai báo `immutable`, chỉ được gán đúng 1 lần trong constructor. Không hàm nào — kể cả hàm có quyền owner — có thể thay đổi chúng sau khi deploy. |
| **Rủi ro còn lại** | Không có (được đảm bảo ở tầng compiler) |
| **Tình trạng test** | ✅ Được đảm bảo ở tầng ngôn ngữ lập trình, không cần test runtime. |

### T-06 — Tham số đầu vào không hợp lệ khi deploy

| Trường | Nội dung |
|---|---|
| **Mô tả** | Deploy với địa chỉ 0 (rỗng), hoặc với `stakingToken == rewardsToken`, có thể dẫn tới hành vi không xác định hoặc có thể bị khai thác. |
| **Vector tấn công** | Tham số deploy sai định dạng (do sơ suất hoặc cố ý). |
| **Biện pháp phòng chống** | Constructor revert với custom error `InvalidTokenAddress` / `IdenticalTokenAddresses` khi gặp input không hợp lệ. Các hàm liên quan khác có cơ chế chặn tương đương (`ZeroAmount`). |
| **Rủi ro còn lại** | Không đáng kể |
| **Tình trạng test** | ✅ Đầy đủ — có test case riêng cho cả 2 tình huống. |

## 5. Bảng tổng hợp rủi ro

| Mã | Mối đe dọa | Khả năng xảy ra | Mức độ ảnh hưởng | Rủi ro còn lại | Trạng thái |
|---|---|---|---|---|---|
| T-01 | Reentrancy | Thấp | Nghiêm trọng | Thấp | Đã phòng chống, còn thiếu test |
| T-02 | Donation attack | Không áp dụng | Không áp dụng | Không đáng kể | Không áp dụng theo thiết kế |
| T-03 | Vượt kiểm soát truy cập | Thấp | Nghiêm trọng | Thấp | Đã phòng chống đầy đủ |
| T-04 | Sai số làm tròn | Trung bình | Thấp | Thấp | Chưa phòng chống, mức độ thấp |
| T-05 | Thay đổi token | Không áp dụng | Không áp dụng | Không có | Đảm bảo ở tầng compiler |
| T-06 | Input không hợp lệ | Thấp | Trung bình | Không đáng kể | Đã phòng chống đầy đủ |

## 6. Nội dung ngoài phạm vi đánh giá

- Bảo mật của browser extension / môi trường trình duyệt chứa ví.
- Độ tin cậy hoặc tính sẵn sàng của nhà cung cấp RPC bên thứ ba (`publicnode.com`, `thirdweb.com`).
- Mô hình quản lý quyền `owner` bằng 1 private key duy nhất (EOA — Externally Owned Account), không có multisig hay timelock. Đây là rủi ro vận hành đã được ghi nhận, xử lý ở tầng quy trình trong tài liệu `09-operational-runbook.md`, không phải ở tầng contract.
- Tài liệu này **không phải** một cuộc audit được chứng nhận bởi bên thứ ba, và không nên được trình bày như vậy trong bất kỳ tài liệu nào hướng ra bên ngoài.

## 7. Khuyến nghị

| Mức ưu tiên | Khuyến nghị | Lý do |
|---|---|---|
| P1 | Bổ sung test giả lập tấn công reentrancy, dùng mock contract độc hại | Khắc phục khoảng trống test đã ghi nhận ở T-01 |
| P2 | Bổ sung test cho trường hợp biên `notifyRewardAmount` với giá trị nhỏ | Khắc phục khoảng trống test đã ghi nhận ở T-04 |
| P3 | Chuyển quyền `owner` sang multisig hoặc timelock contract trước khi triển khai mainnet với giá trị tài sản đáng kể | Giảm rủi ro quản lý bằng 1 private key duy nhất (xem mục 6) |
| P3 | Thuê audit độc lập bởi bên thứ ba trước khi triển khai mainnet | Rà soát nội bộ này chưa đạt tiêu chuẩn đảm bảo cho mainnet |

---
*Tham chiếu chéo: chi tiết triển khai các biện pháp phòng chống tương ứng với từng hàm trong `02-smart-contract-functional-spec.md` và các dòng mã trong `contracts/StakingRewards.sol`.*
