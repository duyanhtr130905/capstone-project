# Requirements Specification: StakingRewards DApp

| | |
|---|---|
| **Mã tài liệu** | REQ-SPEC-001 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Đã chốt phạm vi (baseline) |
| **Đối tượng mô tả** | Toàn bộ hệ thống DApp Staking Rewards trên Ethereum |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích tài liệu

Tài liệu này chốt lại **bài toán cần giải quyết và phạm vi công việc** trước khi đi vào thiết kế kỹ thuật (`01-system-design.md`) và cài đặt. Đây là tài liệu gốc mà các tài liệu kỹ thuật còn lại trong bộ tài liệu (system design, functional spec, test plan, threat model...) đều lấy làm căn cứ đối chiếu khi đánh giá "đã làm đủ chưa".

## 2. Bối cảnh và nguồn gốc yêu cầu

Đề bài gốc của đợt thực tập yêu cầu xây dựng một smart contract staking ERC20 tối thiểu, có ghi nhận số lượng và thời điểm stake, cho phép owner rút token quản trị, triển khai và verify trên testnet. Phần yêu cầu bắt buộc ở Mục 3 bám sát đúng đề bài này; phần yêu cầu mở rộng ở Mục 4 là các tính năng được chủ động bổ sung trong quá trình khảo sát công nghệ, nhằm đưa sản phẩm gần hơn với một staking contract theo chuẩn công nghiệp (Synthetix-style) thay vì dừng ở mức tối thiểu.

## 3. Yêu cầu chức năng bắt buộc (theo đề bài)

| Mã | Yêu cầu | Trạng thái |
|---|---|---|
| FR-01 | Người dùng stake được token ERC20 vào contract | ✅ Hoàn thành — `stake()` |
| FR-02 | Ghi nhận số lượng và thời điểm (timestamp) khi người dùng stake | ✅ Hoàn thành — `stakedBalance`, `stakedAt` |
| FR-03 | Owner rút được token quản trị khỏi contract khi cần | ✅ Hoàn thành — `recoverERC20()` (giới hạn: không áp dụng cho token đang stake/token thưởng) |
| FR-04 | Triển khai được lên một mạng testnet công khai | ✅ Hoàn thành — Sepolia Testnet |
| FR-05 | Xác thực (verify) mã nguồn contract công khai trên block explorer | ✅ Hoàn thành — Etherscan Sepolia |
| FR-06 | Cung cấp được địa chỉ contract đã verify + mã nguồn để đối chiếu | ✅ Hoàn thành — Mục 2.5, báo cáo chính |
| FR-07 | Có bản demo minh hoạ contract hoạt động đúng | ✅ Hoàn thành — video demo + giao diện frontend |

## 4. Yêu cầu chức năng mở rộng (tự đề xuất)

| Mã | Yêu cầu | Lý do bổ sung |
|---|---|---|
| FR-E01 | Cơ chế tính thưởng theo thời gian thực, tỷ lệ thuận với mức đóng góp (Accumulator Pattern) | Yêu cầu bắt buộc chỉ nói "ghi nhận stake"; tự đề xuất cơ chế phân phối thưởng để dự án có giá trị minh hoạ kỹ thuật cao hơn |
| FR-E02 | `claimReward()` — người dùng tự rút thưởng độc lập với hành động stake/unstake | Tách bạch rủi ro và trải nghiệm: rút thưởng không nên phụ thuộc vào có đang stake hay không |
| FR-E03 | `notifyRewardAmount()` — owner cấp vốn và kích hoạt chu kỳ thưởng có kiểm soát | Cần thiết để mô hình phát thưởng theo chu kỳ (Mục 6) hoạt động |
| FR-E04 | Cơ chế tạm dừng khẩn cấp (`pause`/`unpause`) | Giảm thiểu thiệt hại nếu phát hiện sự cố sau khi deploy (không thể sửa contract) |
| FR-E05 | Chống tấn công gọi đệ quy (reentrancy) | Bắt buộc về mặt an toàn khi contract giữ tài sản người dùng |
| FR-E06 | Giao diện người dùng (frontend) tương tác qua ví MetaMask | Yêu cầu bắt buộc không đòi hỏi frontend; bổ sung để có sản phẩm demo hoàn chỉnh, không chỉ dừng ở mức contract + script |
| FR-E07 | Bộ tài liệu vận hành (threat model, tokenomics, runbook) | Mô phỏng quy trình bàn giao ở một sản phẩm Web3 thực tế, không chỉ dừng ở mã nguồn |

## 5. Yêu cầu phi chức năng

| Mã | Yêu cầu | Tiêu chí đo lường |
|---|---|---|
| NFR-01 | An toàn trước các lớp tấn công phổ biến trên smart contract | Không còn lỗ hổng mức Cao/Nghiêm trọng chưa xử lý trong `05-threat-model.md` |
| NFR-02 | Chi phí gas hợp lý, không phụ thuộc số lượng người dùng | Chi phí cập nhật reward là O(1) — xem Mục 2.2 báo cáo chính |
| NFR-03 | Có thể kiểm chứng độc lập bởi bên thứ ba | Contract verify công khai trên Etherscan |
| NFR-04 | Có bộ kiểm thử tự động bao phủ các luồng chính, luồng biên, luồng bảo mật | Xem `03-test-plan.md` |
| NFR-05 | Có quy trình vận hành rõ ràng sau khi triển khai (không chỉ dừng ở lúc deploy) | Xem `08-deployment-runbook.md`, `09-operational-runbook.md` |

## 6. Ngoài phạm vi (không làm trong đợt thực tập này)

- Triển khai lên Ethereum Mainnet (chỉ dừng ở testnet Sepolia).
- Đa dạng hoá loại token thưởng (chỉ hỗ trợ 1 loại `rewardsToken` duy nhất).
- Cơ chế quản trị phi tập trung (DAO/voting) cho các tham số hệ thống.
- Khả năng nâng cấp contract (proxy pattern) — contract triển khai ở dạng bất biến hoàn toàn.
- Dịch vụ indexing chuyên dụng (The Graph hoặc tương đương) cho lịch sử giao dịch.
- Audit bảo mật độc lập bởi bên thứ ba (xem khuyến nghị P3 trong `05-threat-model.md`).

## 7. Tiêu chí nghiệm thu tổng thể (Definition of Done)

| # | Tiêu chí | Xác nhận |
|---|---|---|
| 1 | Toàn bộ FR-01 → FR-07 hoàn thành | ✅ |
| 2 | Bộ test tự động pass 100% trước khi deploy | ✅ 16/16 test case — `03-test-plan.md` |
| 3 | Contract đã verify công khai | ✅ Sepolia Etherscan |
| 4 | Có tài liệu threat model + tokenomics đi kèm | ✅ `05-threat-model.md`, `07-tokenomics-note.md` |
| 5 | Có quy trình deploy và vận hành bằng văn bản | ✅ `08-deployment-runbook.md`, `09-operational-runbook.md` |

## 8. Các bên liên quan (Stakeholders)

| Vai trò | Trách nhiệm |
|---|---|
| Sinh viên thực hiện | Phân tích yêu cầu, thiết kế, cài đặt, kiểm thử, viết tài liệu |
| Giảng viên hướng dẫn | Rà soát tiến độ, góp ý kỹ thuật, đánh giá báo cáo |
| Đơn vị thực tập / người hướng dẫn tại đơn vị | Xác nhận công việc thực hiện đúng như phân công |

---
*Tài liệu tiếp theo trong bộ: `01-system-design.md` (thiết kế kiến trúc), `02-smart-contract-functional-spec.md` (đặc tả chi tiết contract).*
