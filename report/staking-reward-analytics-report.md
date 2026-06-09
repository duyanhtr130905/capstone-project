# Báo cáo triển khai Analytics / Reward Pool Health nâng cao

## 1. Tóm tắt

Phần mở rộng `Analytics / Reward Pool Health` đã được triển khai trên frontend `Staking Core` để bổ sung các chỉ số phân tích reward pool cho ứng dụng staking.

Trước khi triển khai, màn `Rewards` đã có các thông tin cơ bản như pending rewards, reward rate, reward period, contract balance và time left. Sau khi triển khai, màn `Rewards` có thêm các chỉ số nâng cao:

```text
Nominal APY
Daily emission
Your estimated daily reward
Reward runway
Pool status
Scheduled rewards remaining
Funding coverage
Coverage progress
```

Tính năng này chỉ tính toán ở frontend dựa trên dữ liệu on-chain đã có. Không thay đổi contract, không deploy contract mới và không cần backend.

## 2. Mục tiêu triển khai

Mục tiêu của phần này là giúp staking app có tính ứng dụng hơn:

| Đối tượng | Giá trị nhận được |
|---|---|
| Người dùng thường | Biết reward ước tính mỗi ngày và APY danh nghĩa hiện tại. |
| Owner/admin | Biết reward pool còn đủ chạy bao lâu, có đang thiếu reward không. |
| Người xem demo/báo cáo | Thấy được ứng dụng không chỉ gửi transaction mà còn có phân tích trạng thái protocol. |

Analytics được đặt trong màn `Rewards`, vì đây là nơi phù hợp nhất để theo dõi reward, claimable amount và tình trạng reward pool.

## 3. Dữ liệu on-chain sử dụng

Frontend đã có sẵn cơ chế đọc dữ liệu từ Sepolia bằng `viem`. Phần Analytics tận dụng lại các dữ liệu này:

| Dữ liệu | Nguồn đọc |
|---|---|
| `rewardRate` | `StakingRewards.rewardRate()` |
| `totalStaked` | `StakingRewards.totalStaked()` |
| `stakedBalance` | `StakingRewards.stakedBalance(user)` |
| `earnedReward` | `StakingRewards.earned(user)` |
| `rewardsDuration` | `StakingRewards.rewardsDuration()` |
| `periodFinish` | `StakingRewards.periodFinish()` |
| `paused` | `StakingRewards.paused()` |
| `contractRewardBalance` | `RWD.balanceOf(StakingRewards)` |
| `contractStakeBalance` | `STK.balanceOf(StakingRewards)` |

Các contract đang dùng trên Sepolia:

| Contract | Địa chỉ |
|---|---|
| `StakingRewards` | `0x8B30864bEF5B75C39D19Af249D6bbC4210B55963` |
| `StakingToken` / `STK` | `0x69F9e365D78dCB684DDe29ea6A05854273917db8` |
| `RewardsToken` / `RWD` | `0x20bF1B78E8B13B3273a27979725Faf1B74902e07` |

## 4. Các file đã cập nhật

| File | Nội dung |
|---|---|
| `guide/reward-analytics-guide.md` | Guide triển khai Analytics / Reward Pool Health nâng cao. |
| `frontend/src/App.tsx` | Thêm helper tính toán, derived metrics, panel Analytics và panel Pool Health nâng cấp. |
| `frontend/src/styles.css` | Thêm style cho analytics grid, health banner, coverage progress và responsive mobile. |

Không có thay đổi ở contract Solidity.

## 5. Helper và kiểu dữ liệu đã thêm

Trong `frontend/src/App.tsx`, đã bổ sung các kiểu và helper phục vụ analytics.

### 5.1 Pool health type

```text
PoolHealthTone = healthy | low | critical | inactive | paused
```

Kiểu `PoolHealth` gồm:

| Field | Ý nghĩa |
|---|---|
| `label` | Tên trạng thái hiển thị trên UI. |
| `tone` | Tone CSS để đổi màu banner/progress. |
| `description` | Mô tả ngắn về tình trạng pool. |

### 5.2 Helper format

| Helper | Mục đích |
|---|---|
| `formatDurationCompact(seconds)` | Format runway dạng ngắn như `1d 4h`, `3h 20m`. |
| `ratioPercent(numerator, denominator)` | Tính phần trăm từ hai số `bigint`. |
| `formatOpenPercent(value, decimals)` | Format phần trăm không clamp, dùng cho APY/coverage. |
| `getPoolHealth(...)` | Phân loại trạng thái reward pool. |

Lý do dùng `bigint`: toàn bộ token amount on-chain là số nguyên lớn, phù hợp với cách `viem` trả dữ liệu.

## 6. Công thức tính toán thực tế

### 6.1 Daily emission

```text
rewardRatePerDay = rewardRate * 86400
```

Ý nghĩa: lượng `RWD` đang được phân phối mỗi ngày theo `rewardRate` hiện tại của contract.

### 6.2 Time left

```text
nowSeconds = current unix timestamp
timeLeftSeconds = periodFinish > nowSeconds
  ? periodFinish - nowSeconds
  : 0
```

Ý nghĩa: thời gian còn lại của reward period hiện tại.

### 6.3 Scheduled rewards remaining

```text
scheduledRewardsRemaining = rewardRate * timeLeftSeconds
```

Ý nghĩa: lượng `RWD` còn cần phân phối theo lịch reward period hiện tại.

### 6.4 Reward runway

```text
rewardRunwaySeconds = rewardRate > 0
  ? contractRewardBalance / rewardRate
  : 0
```

Ý nghĩa: nếu giữ nguyên reward rate hiện tại, số dư `RWD` trong staking contract đủ chạy thêm bao lâu.

### 6.5 Nominal APY

```text
annualReward = rewardRate * 31536000
nominalApyPercent = annualReward / totalStaked * 100
```

Ý nghĩa: APY danh nghĩa dựa trên lượng `RWD` phát ra mỗi năm so với tổng `STK` đang stake.

Lưu ý quan trọng:

| Điểm cần hiểu | Giải thích |
|---|---|
| Đây là `Nominal APY` | Không phải APY tài chính thật. |
| `STK` và `RWD` là hai token khác nhau | Không quy đổi giá trị giữa hai token. |
| Không có price oracle | Không tính theo USD hoặc giá thị trường. |
| Token là mock testnet | Chỉ phục vụ capstone/testnet. |

### 6.6 Estimated daily reward của user

```text
userDailyReward = totalStaked > 0
  ? stakedBalance * rewardRatePerDay / totalStaked
  : 0
```

Ý nghĩa: lượng `RWD` ước tính user nhận mỗi ngày theo tỷ lệ stake hiện tại.

### 6.7 Funding coverage

```text
fundingCoveragePercent = contractRewardBalance / scheduledRewardsRemaining * 100
```

Ý nghĩa: reward balance hiện tại cover được bao nhiêu phần trăm lượng reward còn cần phân phối trong period hiện tại.

Nếu không có schedule active:

```text
scheduledRewardsRemaining == 0
```

UI hiển thị:

```text
No active schedule
```

## 7. Logic Pool Health Status

Pool Health được tính bằng helper `getPoolHealth`.

Thứ tự ưu tiên logic:

| Status | Điều kiện |
|---|---|
| `Paused` | `paused == true` |
| `Inactive` | `rewardRate <= 0` hoặc `timeLeftSeconds <= 0` |
| `Critical` | `scheduledRewardsRemaining > contractRewardBalance` |
| `Low` | `rewardRunwaySeconds < 1 ngày` hoặc `fundingCoveragePercent < 110%` |
| `Healthy` | Pool active và đủ cover reward schedule |

Mô tả hiển thị theo từng status:

| Status | Mô tả |
|---|---|
| `Paused` | Staking và unstaking đang bị pause. |
| `Inactive` | Không có reward emission period active. |
| `Critical` | Reward balance thấp hơn scheduled payout còn lại. |
| `Low` | Pool vẫn có reward nhưng safety buffer mỏng. |
| `Healthy` | Pool đủ balance cho active schedule. |

## 8. UI đã triển khai

Màn `Rewards` hiện có cấu trúc:

```text
Rewards Center
  Claimable Rewards
  Reward Pool Analytics
  Global Protocol Stats
  Reward Pool Health
```

### 8.1 Panel Reward Pool Analytics

Panel mới `Reward Pool Analytics` hiển thị:

| Metric | Ý nghĩa |
|---|---|
| `Nominal APY` | APY danh nghĩa theo reward rate và total staked. |
| `Daily emission` | RWD phát ra mỗi ngày theo reward rate. |
| `Your est. daily reward` | RWD/ngày ước tính cho ví đang kết nối. |
| `Reward runway` | Thời gian reward balance đủ chạy theo reward rate hiện tại. |

Các metric dùng layout `analytics-grid`, 2 cột trên desktop và 1 cột trên mobile.

### 8.2 Panel Reward Pool Health

Panel `Reward Pool Health` cũ đã được nâng cấp.

Nội dung hiện tại:

| Thành phần | Ý nghĩa |
|---|---|
| Health banner | Hiển thị status: Healthy/Low/Critical/Inactive/Paused. |
| Contract RWD balance | Số dư RWD trong staking contract. |
| Scheduled remaining | RWD còn cần phân phối trong active period. |
| Funding coverage | Mức cover reward balance so với schedule. |
| Time left | Thời gian còn lại của reward period. |
| Coverage progress | Thanh tiến trình theo funding coverage. |

Health banner đổi màu theo status:

| Tone | Màu/ý nghĩa |
|---|---|
| `healthy` | Xanh, pool ổn. |
| `low` | Vàng, pool có buffer thấp. |
| `critical` | Đỏ, pool thiếu reward so với schedule. |
| `inactive` | Trung tính, không có period active. |
| `paused` | Trung tính, contract đang pause. |

## 9. Responsive/mobile

CSS đã được cập nhật để Analytics hoạt động tốt trên mobile web:

| Khu vực | Điều chỉnh |
|---|---|
| `analytics-grid` | Chuyển từ 2 cột sang 1 cột ở màn nhỏ. |
| `health-banner` | Giữ layout gọn, không tràn text. |
| `health-metrics` | Dùng lại `two-col`, tự chuyển 1 cột theo responsive rule. |
| `coverage-row` | Giữ progress bar full width. |

Không thay đổi bottom navigation hoặc cấu trúc route/view hiện có.

## 10. Trạng thái đặc biệt đã xử lý

| Trường hợp | Cách hiển thị |
|---|---|
| `totalStaked == 0` | `Nominal APY` hiển thị `No active stake`. |
| `rewardRate == 0` | `Reward runway` hiển thị `No active emission`. |
| `scheduledRewardsRemaining == 0` | `Funding coverage` hiển thị `No active schedule`. |
| User chưa stake | `Your est. daily reward` là `0 RWD/day`. |
| Reward period hết hạn | Pool status là `Inactive`. |
| Contract paused | Pool status là `Paused`. |
| Reward balance không đủ schedule | Pool status là `Critical`. |

## 11. Kiểm tra kỹ thuật đã chạy

Sau khi triển khai Analytics, đã chạy các kiểm tra:

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` trong `frontend/` | Thành công |
| TypeScript check | Thành công |
| Vite production build | Thành công |
| `npm audit --audit-level=moderate` | `found 0 vulnerabilities` |
| HTTP check `http://127.0.0.1:5173/` | `200 OK` |
| HTTP check `http://127.0.0.1:5173/?preview=tx-error` | `200 OK` |

Build output sau lần kiểm tra cuối:

```text
dist/index.html
dist/assets/index-CAj3lbSb.css
dist/assets/ccip-DdHY9fw_.js
dist/assets/index-OQJT5OSC.js
```

Dev server đang chạy:

```text
http://127.0.0.1:5173/
```

## 12. Cách test thủ công

Quy trình test:

```text
1. Mở frontend local.
2. Connect ví MetaMask.
3. Đảm bảo ví đang ở Sepolia.
4. Vào tab Rewards.
5. Kiểm tra panel Reward Pool Analytics.
6. Kiểm tra panel Reward Pool Health.
7. Stake thêm STK hoặc claim reward nếu cần.
8. Bấm refresh hoặc chờ polling để dữ liệu cập nhật.
```

Các case nên kiểm tra:

| Case | Kết quả mong đợi |
|---|---|
| Reward period đang active | Có Daily emission, Nominal APY, Reward runway. |
| User đã stake | `Your est. daily reward` lớn hơn 0 nếu reward rate active. |
| User chưa stake | `Your est. daily reward` là 0. |
| Reward pool đủ balance | Pool status là `Healthy` hoặc `Low` tùy coverage. |
| Reward pool thiếu balance | Pool status là `Critical`. |
| Reward period đã hết | Pool status là `Inactive`. |
| Contract bị pause | Pool status là `Paused`. |
| Mobile viewport | Analytics không vỡ layout. |

## 13. Giới hạn hiện tại

| Giới hạn | Ghi chú |
|---|---|
| Không có price oracle | Không tính APY theo USD hoặc giá thị trường. |
| Token là mock testnet | Chỉ phục vụ capstone/testnet. |
| APY là danh nghĩa | Dựa trên `RWD` emission so với `STK` staked. |
| Tính ở frontend | Không phải metric được lưu trong contract. |
| Phụ thuộc dữ liệu mới nhất | Sau transaction cần refresh hoặc chờ polling. |
| Chưa có chart lịch sử | Hiện mới là metric hiện tại, chưa có biểu đồ theo thời gian. |

## 14. Giá trị thực tế cho project

Phần Analytics giúp project tiến gần hơn tới một staking dashboard thực tế:

| Trước khi có Analytics | Sau khi có Analytics |
|---|---|
| Chỉ xem reward rate thô. | Có Daily emission dễ hiểu hơn. |
| Không biết reward pool còn đủ chạy bao lâu. | Có Reward runway. |
| Không có APY ước tính. | Có Nominal APY. |
| Owner khó đánh giá pool thiếu/thừa reward. | Có Pool status và Funding coverage. |
| User không biết reward dự kiến mỗi ngày. | Có Your est. daily reward. |

## 15. Hướng mở rộng sau này

Các hướng có thể phát triển tiếp:

| Hướng mở rộng | Giá trị |
|---|---|
| Chart reward emission theo thời gian | Trực quan hóa lịch sử reward. |
| Cache block timestamp và activity analytics | Kết hợp Activity History với phân tích theo ngày. |
| Filter analytics theo ví | Tập trung vào hiệu suất cá nhân. |
| Alert reward pool low/critical | Cảnh báo owner cần nạp thêm reward. |
| Export report CSV | Hữu ích cho demo/báo cáo. |
| Backend indexer | Ổn định hơn nếu có nhiều người dùng. |

## 16. Kết luận

`Analytics / Reward Pool Health` đã được triển khai đúng với môi trường thực tế của project. Tính năng này tận dụng dữ liệu on-chain đang có, bổ sung các chỉ số phân tích cần thiết cho staking app và không làm thay đổi contract.

Trạng thái cuối cùng:

```text
Guide đã có
Frontend đã triển khai
Build thành công
Audit frontend sạch
Dev server chạy OK
Không thay đổi contract
Không deploy mới
```

Phần mở rộng này giúp màn `Rewards` trở nên hữu ích hơn cho cả user và owner/admin, đồng thời làm project có tính ứng dụng và tính trình bày tốt hơn trong capstone.
