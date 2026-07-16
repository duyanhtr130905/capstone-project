# Operational & Incident Response Runbook: StakingRewards DApp

| | |
|---|---|
| **Mã tài liệu** | OPS-RB-009 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Áp dụng nội bộ |
| **Đối tượng áp dụng** | Vận hành `StakingRewards` sau khi đã triển khai (post-deployment) |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích và phạm vi

Tài liệu `08-deployment-runbook.md` kết thúc ở thời điểm contract đã triển khai và vận hành. Tài liệu này quy định **những việc cần làm trong suốt vòng đời vận hành sau đó**: giám sát định kỳ, quy trình xử lý khi phát hiện sự cố, và quản lý quyền truy cập — những nội dung không thể hiện trong code, chỉ tồn tại dưới dạng quy trình con người.

## 2. Vai trò và quyền hạn

| Vai trò | Quyền hạn | Cơ chế thực thi |
|---|---|---|
| `owner` | `notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, `pause`, `unpause` | Modifier `onlyOwner`, gắn với 1 địa chỉ ví duy nhất xác lập lúc deploy |
| Người dùng (bất kỳ địa chỉ nào) | `stake`, `unstake`, `claimReward` | Không giới hạn quyền truy cập |

**Tình trạng hiện tại:** Quyền `owner` được gán cho một ví đơn (EOA — Externally Owned Account), không phải multisig hay timelock contract. Đây là rủi ro đã ghi nhận tại mục 6 của `05-threat-model.md`. Toàn bộ nội dung từ mục 3 trở đi giả định vai trò `owner` do một cá nhân/nhóm nhỏ nắm giữ private key trực tiếp.

## 3. Giám sát định kỳ (Monitoring)

Hệ thống hiện không có backend giám sát tự động — việc theo dõi cần thực hiện thủ công hoặc qua các script có sẵn (`scripts/read-deployment-state.ts`) theo tần suất khuyến nghị dưới đây.

| Hạng mục theo dõi | Tần suất khuyến nghị | Ngưỡng cần chú ý |
|---|---|---|
| `fundingCoveragePercent` (khả năng chi trả reward) | Hàng tuần | Dưới 100% — pool không đủ trả hết nghĩa vụ đã hứa |
| `periodFinish` (thời điểm chu kỳ thưởng kết thúc) | Hàng tuần | Còn dưới 24 giờ mà chưa có kế hoạch gia hạn |
| `totalStaked` | Khi có biến động bất thường | Giảm đột ngột lớn (dấu hiệu rút hàng loạt, cần tìm nguyên nhân) |
| Số dư Sepolia ETH của ví `owner` | Hàng tháng | Không đủ để trả gas cho các thao tác quản trị tiếp theo |
| Trạng thái `paused` | Sau mỗi thao tác quản trị | Xác nhận đúng trạng thái dự kiến (không quên `unpause` sau khi xử lý xong sự cố) |

## 4. Quy trình sử dụng `pause()`

### 4.1 Khi nào NÊN pause

- Phát hiện một lỗ hổng có khả năng bị khai thác trong contract đang chạy, cần thời gian điều tra trước khi có kết luận.
- Ghi nhận hành vi giao dịch bất thường có dấu hiệu tấn công đang diễn ra.
- Chuẩn bị nâng cấp/di chuyển sang contract mới, cần ngăn giao dịch mới trong lúc chuyển đổi.

### 4.2 Khi nào KHÔNG nên pause

- Biến động giá token thị trường — không thuộc phạm vi kiểm soát của contract, `pause()` không giải quyết được.
- **Lưu ý quan trọng:** `pause()` **không chặn** `claimReward()` (theo thiết kế có chủ đích — xem `05-threat-model.md`, T-03). Vì vậy, `pause()` không phải công cụ để "khóa" toàn bộ tài sản người dùng — chỉ ngăn giao dịch stake/unstake mới.

### 4.3 Các bước thực hiện

1. Xác nhận quyết định pause với ít nhất một người có thẩm quyền khác (nếu vận hành theo nhóm) trước khi thực thi.
2. Gọi `pause()` từ ví `owner`.
3. Xác nhận trạng thái `paused = true` qua `scripts/read-deployment-state.ts`.
4. Ghi lại thời điểm, lý do pause vào nhật ký sự cố (xem mục 5).
5. Thông báo tới người dùng qua kênh giao tiếp chính thức (nếu có).

## 5. Quy trình xử lý sự cố (Incident Response)

| Bước | Hành động | Trách nhiệm |
|---|---|---|
| 1. Phát hiện | Ghi nhận dấu hiệu bất thường (từ giám sát định kỳ hoặc báo cáo từ người dùng) | Người vận hành |
| 2. Đánh giá | Xác định mức độ nghiêm trọng (xem bảng phân loại mục 6) | Người vận hành / kỹ thuật |
| 3. Ngăn chặn | Nếu mức độ Cao/Nghiêm trọng: thực hiện `pause()` theo quy trình mục 4 | Người giữ quyền `owner` |
| 4. Điều tra | Xác định nguyên nhân gốc (root cause) — sử dụng dữ liệu on-chain, log giao dịch | Người vận hành / kỹ thuật |
| 5. Khắc phục | Theo `08-deployment-runbook.md` mục 5 (không có rollback — có thể cần deploy contract mới) | Người vận hành / kỹ thuật |
| 6. Khôi phục | `unpause()` nếu nguyên nhân đã được xử lý và xác nhận an toàn | Người giữ quyền `owner` |
| 7. Rút kinh nghiệm | Ghi lại toàn bộ sự cố, nguyên nhân, cách xử lý vào tài liệu nội bộ | Người vận hành |

## 6. Bảng phân loại mức độ sự cố

| Mức độ | Ví dụ | Thời gian phản hồi khuyến nghị |
|---|---|---|
| Nghiêm trọng | Phát hiện lỗ hổng có thể rút cạn tài sản; dấu hiệu tấn công đang diễn ra | Ngay lập tức — pause trong vòng vài phút |
| Cao | Pool thưởng sắp cạn (`fundingCoveragePercent` giảm nhanh); phát hiện lỗ hổng chưa bị khai thác | Trong ngày |
| Trung bình | Chu kỳ thưởng sắp hết hạn cần gia hạn; RPC provider không ổn định | Trong tuần |
| Thấp | Sai lệch nhỏ trong hiển thị giao diện, không ảnh hưởng dữ liệu on-chain | Theo chu kỳ phát triển thông thường |

## 7. Quy trình gia hạn chu kỳ thưởng

Liên quan tới rủi ro kinh tế E-01 đã ghi nhận trong `07-tokenomics-note.md` (thưởng thất thoát nếu không ai stake), trước khi gọi `notifyRewardAmount` cho chu kỳ mới:

1. Kiểm tra `totalStaked > 0` — nếu bằng 0, cân nhắc trì hoãn kích hoạt chu kỳ mới cho tới khi có người stake, tránh lãng phí thưởng trong khoảng thời gian không ai hưởng.
2. Xác nhận số dư `rewardsToken` trong contract đủ cho lượng `reward` dự định cấp.
3. Thực hiện theo đúng thứ tự: chuyển token trước, `notifyRewardAmount` sau (xem `07-tokenomics-note.md` mục 5).
4. Xác nhận `rewardRate > 0` sau khi gọi — nếu bằng 0 (do làm tròn, xem `05-threat-model.md` T-04), lượng `reward` cấp lần đó không đủ so với `rewardsDuration`, cần cấp lại với số lượng lớn hơn.

## 8. Quản lý khóa (Key Management)

- Private key của ví `owner` không được lưu dưới dạng plaintext trong bất kỳ file nào commit vào Git (đã tuân thủ — xem `.env.example` trong `08-deployment-runbook.md`).
- Khuyến nghị sao lưu (backup) seed phrase ở nơi an toàn, tách biệt khỏi thiết bị dùng để vận hành hàng ngày.
- Khuyến nghị dài hạn: chuyển quyền `owner` sang ví multisig (yêu cầu nhiều chữ ký để thực thi 1 giao dịch quản trị) trước khi vận hành với tài sản giá trị thật — xem khuyến nghị P3 trong `05-threat-model.md`.

## 9. Khuyến nghị

| Mức ưu tiên | Khuyến nghị |
|---|---|
| P2 | Thiết lập giám sát tự động (script định kỳ hoặc dịch vụ bên thứ ba) thay vì kiểm tra thủ công theo bảng mục 3 |
| P2 | Xây dựng kênh thông báo chính thức tới người dùng trước khi cần dùng tới trong tình huống thực tế |
| P3 | Chuyển quyền `owner` sang multisig trước khi vận hành với tài sản giá trị thật |
| P3 | Diễn tập quy trình Incident Response (mục 5) ít nhất 1 lần trên môi trường testnet trước khi triển khai mainnet |

---
*Đây là tài liệu cuối cùng trong bộ tài liệu kỹ thuật đi kèm báo cáo: `00-requirements-spec.md`, `01-system-design.md`, `02-smart-contract-functional-spec.md`, `03-test-plan.md`, `05-threat-model.md`, `06-onchain-offchain-data-map.md`, `07-tokenomics-note.md`, `08-deployment-runbook.md`, `09-operational-runbook.md`.*
