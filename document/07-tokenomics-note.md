# Tokenomics Note: StakingRewards Reward Model

| | |
|---|---|
| **Mã tài liệu** | ECON-TN-007 |
| **Phiên bản** | 1.0 |
| **Trạng thái** | Rà soát nội bộ |
| **Đối tượng mô tả** | Cơ chế phát thưởng của `contracts/StakingRewards.sol` |
| **Mức độ bảo mật** | Nội bộ |
| **Phục vụ cho** | Báo cáo thực tập — Dự án DApp Blockchain |

---

## 1. Mục đích tài liệu

Tài liệu kỹ thuật (`report/staking-contract-capstone-report.md`) mô tả **contract làm gì**. Tài liệu này mô tả **vì sao các tham số kinh tế được chọn như vậy**, và những hệ quả kinh tế phát sinh từ cách vận hành đó — nội dung không thể suy ra chỉ bằng cách đọc code, cần hiểu ý đồ thiết kế.

## 2. Tổng quan mô hình

Contract áp dụng mô hình **phát thưởng theo tốc độ cố định trong 1 khoảng thời gian xác định** (fixed-rate emission over a period), theo chuẩn Synthetix `StakingRewards`. Đặc điểm cốt lõi:

- Owner nạp một lượng token thưởng cụ thể (`reward`) và kích hoạt 1 "chu kỳ" (`rewardsDuration`).
- Trong chu kỳ đó, tổng lượng thưởng được chia đều theo **thời gian** và theo **tỷ lệ đóng góp** (số token đang stake) của từng người dùng.
- Không có cơ chế đấu giá, không có biến động theo cung-cầu như AMM — tốc độ phát thưởng là **hằng số đã biết trước** trong suốt chu kỳ.

## 3. Các tham số kinh tế chính

| Tham số | Giá trị hiện tại | Ý nghĩa | Ai điều chỉnh được |
|---|---|---|---|
| `rewardsDuration` | 7 ngày (mặc định) | Thời gian 1 chu kỳ phát thưởng | Owner (`setRewardsDuration`), chỉ khi chu kỳ trước đã kết thúc |
| `rewardRate` | `reward ÷ rewardsDuration` | Tốc độ phát thưởng (token/giây), suy ra tự động | Không điều chỉnh trực tiếp — phụ thuộc `reward` và `rewardsDuration` |
| Giới hạn số lượng stake tối thiểu/tối đa | Không có | Bất kỳ ai cũng stake được bất kỳ lượng nào > 0 | — |
| Thời gian khóa (lock-up) | Không có | Có thể `unstake()` ngay lập tức, không có thời gian chờ hay phí phạt | — |
| `PRECISION` | 10^18 | Hệ số nhân dùng trong phép chia để giảm sai số làm tròn | Cố định |

**Nhận định:** Đây là mô hình **không có cơ chế khóa hay phạt rút sớm** — khác với nhiều mô hình staking thực tế có "vesting" hoặc "cooldown period". Lựa chọn này đơn giản hóa trải nghiệm người dùng nhưng có hệ quả kinh tế cần lưu ý ở mục 6.

## 4. Công thức APR hiển thị (Nominal APR)

Giao diện hiển thị chỉ số ước tính lợi suất hàng năm, tính theo công thức:

```
APR ước tính (%) = (rewardRate × 31,536,000 giây) ÷ totalStaked × 100
```

**Lưu ý quan trọng về bản chất chỉ số này:**

1. Đây là **APR** (Annual Percentage Rate — lãi suất đơn theo năm), **không phải APY** (Annual Percentage Yield — có gộp lãi kép). Contract không tự động gộp phần thưởng đã nhận vào gốc để tính lãi kép; người dùng muốn có hiệu ứng kép phải tự tay unstake, gộp thêm vào gốc, rồi stake lại. Giao diện hiện đang gắn nhãn biến số là "Nominal APY" — cần lưu ý đây là cách gọi phổ biến trong ngành nhưng không hoàn toàn chính xác về mặt tài chính.
2. **Chỉ số này biến động theo `totalStaked` — không phải một con số cố định.** Vì `totalStaked` nằm ở mẫu số, khi có người mới stake thêm, APR hiển thị cho *tất cả mọi người* giảm xuống ngay lập tức (dù mỗi người vẫn đang nhận đúng phần của mình theo Accumulator Pattern). Ngược lại, khi có người rút, APR hiển thị tăng lên. Đây không phải lỗi — là bản chất toán học của mô hình chia sẻ theo tỷ lệ.

## 5. Vòng đời một chu kỳ phát thưởng

1. Owner chuyển token thưởng vào contract (`rewardsToken.transfer`).
2. Owner gọi `notifyRewardAmount(reward)` — contract kiểm tra số token thực tế đã có trong ví contract có đủ để đảm bảo `rewardRate` mới không vượt quá khả năng chi trả.
3. Trong suốt `rewardsDuration`, `rewardRate` không đổi.
4. Nếu owner gọi `notifyRewardAmount` **một lần nữa trước khi chu kỳ cũ kết thúc**, phần thưởng còn lại chưa phát hết của chu kỳ cũ (`leftover`) được cộng dồn vào chu kỳ mới — không bị mất.
5. Sau khi chu kỳ kết thúc (`block.timestamp ≥ periodFinish`), `rewardRate` vẫn giữ nguyên giá trị cũ trong storage nhưng không còn hiệu lực (vì `lastTimeRewardApplicable()` bị chặn tại `periodFinish`) — không phát sinh thêm thưởng cho tới khi owner khởi động chu kỳ mới.

## 6. Rủi ro và hệ quả kinh tế

### 6.1 Thưởng "thất thoát" khi không ai stake trong một khoảng thời gian

Nếu tại một thời điểm trong chu kỳ, `totalStaked = 0` (không ai đang stake), công thức `rewardPerToken()` **không cộng dồn thêm** trong khoảng thời gian đó (vì phép chia cho `totalStaked = 0` được né bằng cách giữ nguyên giá trị cũ). Tuy nhiên, đồng hồ chu kỳ (`lastUpdateTime`) **vẫn tiến tới**, và không có cơ chế "bù" lại khoảng thời gian đó cho người stake sau. Hệ quả: lượng token thưởng tương ứng với khoảng thời gian không ai stake vẫn nằm trong contract, nhưng **không được ghi nhận là của bất kỳ ai** — vĩnh viễn, trừ khi owner chủ động cấp lại một chu kỳ mới có tính đến số dư còn thừa.

### 6.2 Không có thời gian khóa → rủi ro "farm and dump" ngắn hạn

Vì `unstake()` không có thời gian chờ hay phí phạt, người dùng có thể stake ngay trước khi reward accrual thuận lợi, rút ngay sau khi nhận thưởng, không có ràng buộc gắn bó dài hạn. Đây là đánh đổi thiết kế có chủ đích để đơn giản hóa UX, phù hợp phạm vi capstone, nhưng không phù hợp trực tiếp cho mô hình khuyến khích gắn bó dài hạn nếu triển khai thực tế.

### 6.3 Không giới hạn tỷ trọng — rủi ro "cá voi" (whale dominance)

Không có giới hạn tối đa số lượng 1 địa chỉ được stake. Một địa chỉ duy nhất có thể stake một lượng token áp đảo, chiếm phần lớn tổng `totalStaked`, từ đó nhận phần lớn reward pool, làm giảm động lực tham gia của người dùng nhỏ lẻ.

### 6.4 APR hiển thị không phải cam kết cố định

Như đã nêu ở mục 4, APR hiển thị chỉ là ảnh chụp tại một thời điểm — không nên được diễn giải như một mức lợi suất được đảm bảo, vì phụ thuộc vào hành vi stake/unstake của toàn bộ người dùng khác.

## 7. Bảng tổng hợp rủi ro kinh tế

| Mã | Vấn đề | Mức ảnh hưởng | Có phải lỗi kỹ thuật? |
|---|---|---|---|
| E-01 | Thưởng thất thoát khi `totalStaked = 0` | Trung bình | Không — là đặc tính công thức, cần quy trình vận hành bù trừ |
| E-02 | Không có thời gian khóa | Thấp (theo phạm vi hiện tại) | Không — là lựa chọn thiết kế có chủ đích |
| E-03 | Không giới hạn tỷ trọng cá nhân | Trung bình nếu mở rộng thực tế | Không — cần bổ sung nếu triển khai thực tế |
| E-04 | APR hiển thị biến động, dễ hiểu lầm là cố định | Thấp | Không — cần làm rõ hơn ở tầng UI/copy |

## 8. Khuyến nghị

| Mức ưu tiên | Khuyến nghị |
|---|---|
| P2 | Bổ sung quy trình vận hành: kiểm tra `totalStaked` trước khi kích hoạt chu kỳ mới, tránh khởi động chu kỳ khi biết trước sẽ có khoảng thời gian trống không ai stake |
| P3 | Nếu phát triển thành sản phẩm thực tế, cân nhắc bổ sung cơ chế thời gian khóa tối thiểu hoặc phí rút sớm để khuyến khích gắn bó dài hạn |
| P3 | Cân nhắc giới hạn tỷ trọng tối đa mỗi địa chỉ nếu mục tiêu là phân phối công bằng cho nhiều người dùng nhỏ |
| P3 | Đổi nhãn hiển thị "Nominal APY" thành "APR ước tính" ở tầng giao diện để tránh hiểu lầm về bản chất tài chính |

---
*Tham chiếu chéo: công thức chi tiết tương ứng với `rewardPerToken()`, `earned()`, `notifyRewardAmount()` trong `contracts/StakingRewards.sol`, và các biến hiển thị trong `frontend/src/App.tsx`.*
