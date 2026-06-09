# Guide triển khai Analytics / Reward Pool Health nâng cao

## 1. Mục tiêu

Mục tiêu của phần mở rộng này là bổ sung các chỉ số phân tích cho staking app để người dùng và owner hiểu rõ hơn trạng thái reward pool.

Frontend hiện đã có Dashboard, Rewards, Admin, Faucet, Onboarding và Activity History. Tuy nhiên phần reward analytics hiện mới dừng ở các chỉ số cơ bản như reward rate, contract balance, reward duration và time left.

Phần mở rộng này sẽ bổ sung các chỉ số thực tế hơn:

```text
Nominal APY
Reward runway
Scheduled rewards remaining
Funding coverage
Estimated daily reward
Pool health status
```

Tính năng này chỉ đọc dữ liệu on-chain hiện có, không cần deploy contract mới.

## 2. Dữ liệu on-chain đang có

Frontend hiện đọc các state sau từ `StakingRewards`, `STK` và `RWD`:

| Dữ liệu | Nguồn |
|---|---|
| `totalStaked` | `StakingRewards.totalStaked()` |
| `stakedBalance` | `StakingRewards.stakedBalance(user)` |
| `earnedReward` | `StakingRewards.earned(user)` |
| `rewardRate` | `StakingRewards.rewardRate()` |
| `rewardsDuration` | `StakingRewards.rewardsDuration()` |
| `periodFinish` | `StakingRewards.periodFinish()` |
| `paused` | `StakingRewards.paused()` |
| `contractRewardBalance` | `RWD.balanceOf(StakingRewards)` |
| `contractStakeBalance` | `STK.balanceOf(StakingRewards)` |

Các dữ liệu này đủ để tính analytics ở frontend.

## 3. Công thức tính toán

### 3.1 Reward per day

```text
rewardPerDay = rewardRate * 86400
```

Ý nghĩa: lượng `RWD` phân phối mỗi ngày theo reward rate hiện tại.

### 3.2 Time left

```text
timeLeftSeconds = max(periodFinish - now, 0)
```

Ý nghĩa: thời gian còn lại của reward period hiện tại.

### 3.3 Scheduled rewards remaining

```text
scheduledRemaining = rewardRate * timeLeftSeconds
```

Ý nghĩa: lượng `RWD` còn cần trả theo lịch reward period hiện tại.

### 3.4 Reward runway

```text
runwaySeconds = contractRewardBalance / rewardRate
```

Ý nghĩa: nếu giữ nguyên reward rate hiện tại, số dư `RWD` trong contract đủ chạy trong bao lâu.

Nếu `rewardRate == 0`, không tính runway vì pool chưa có tốc độ phân phối active.

### 3.5 Funding coverage

```text
fundingCoverage = contractRewardBalance / scheduledRemaining * 100
```

Ý nghĩa: reward pool hiện có đủ cover lượng reward đã schedule còn lại hay không.

Nếu `scheduledRemaining == 0`, hiển thị `No active schedule`.

### 3.6 Nominal APY

```text
annualReward = rewardRate * 31536000
nominalApy = annualReward / totalStaked * 100
```

Ý nghĩa: APY danh nghĩa dựa trên reward rate hiện tại và tổng `STK` đang stake.

Lưu ý quan trọng:

| Điểm cần hiểu | Giải thích |
|---|---|
| `STK` và `RWD` là token khác nhau | APY là ước tính reward `RWD` trên lượng `STK` stake. |
| Token đang là mock testnet | Không đại diện giá trị tài chính thật. |
| Không có price oracle | Không quy đổi theo USD. |
| APY thay đổi theo `totalStaked` và `rewardRate` | Khi nhiều người stake hơn hoặc owner đổi reward amount, APY thay đổi. |

Vì vậy nên gọi là `Nominal APY`, không gọi là lợi suất tài chính thật.

### 3.7 Estimated daily reward của user

```text
userDailyReward = totalStaked > 0
  ? stakedBalance / totalStaked * rewardPerDay
  : 0
```

Ý nghĩa: lượng `RWD` ước tính user có thể nhận mỗi ngày theo tỷ lệ stake hiện tại.

## 4. Pool Health Status

Frontend nên phân loại trạng thái pool bằng logic dễ hiểu:

| Status | Điều kiện |
|---|---|
| `Paused` | Contract đang pause. |
| `Inactive` | `rewardRate == 0` hoặc reward period đã kết thúc. |
| `Critical` | `scheduledRemaining > contractRewardBalance`. |
| `Low` | Runway còn dưới 1 ngày hoặc coverage dưới 110%. |
| `Healthy` | Pool active và coverage đủ tốt. |

Mục tiêu là giúp owner nhìn nhanh pool đang khỏe hay cần nạp thêm reward.

## 5. UI đề xuất

Analytics nên được thêm vào màn `Rewards`, vì đây là nơi người dùng theo dõi reward.

Cấu trúc màn Rewards sau khi mở rộng:

```text
Rewards Center
  Claimable Rewards
  Reward Pool Analytics
  Global Protocol Stats
  Reward Pool Health
```

Trong đó `Reward Pool Analytics` là panel mới, còn `Reward Pool Health` hiện có sẽ được nâng cấp.

## 6. Chỉ số hiển thị

Panel `Reward Pool Analytics`:

| Chỉ số | Nội dung |
|---|---|
| Nominal APY | APY danh nghĩa theo reward rate và total staked. |
| Daily emission | `RWD/day`. |
| Your est. daily reward | RWD/ngày ước tính cho ví đang kết nối. |
| Reward runway | Thời gian pool còn đủ chạy theo reward rate hiện tại. |

Panel `Reward Pool Health`:

| Chỉ số | Nội dung |
|---|---|
| Pool status | Healthy/Low/Critical/Inactive/Paused. |
| Scheduled remaining | RWD còn cần phân phối trong period hiện tại. |
| Funding coverage | Mức cover của reward balance so với scheduled remaining. |
| Time left | Thời gian còn lại của reward period. |

## 7. State cần xử lý

| State | Cách xử lý |
|---|---|
| `totalStaked == 0` | APY hiển thị `No active stake`. |
| `rewardRate == 0` | Runway hiển thị `No active emission`. |
| Reward period đã kết thúc | Status `Inactive`. |
| Contract paused | Status `Paused`. |
| Contract reward balance không đủ scheduled remaining | Status `Critical`. |
| User chưa stake | Estimated daily reward là `0 RWD/day`. |

## 8. Responsive

Analytics phải hoạt động tốt trên desktop và mobile web.

| Layout | Yêu cầu |
|---|---|
| Desktop | Các metric nằm dạng grid, dễ scan. |
| Mobile | Grid chuyển 1 cột, không tràn text. |
| Text dài | Dùng label ngắn, value rõ ràng. |
| Badge status | Màu sắc phân biệt Healthy/Low/Critical/Inactive/Paused. |

## 9. Kiểm thử cần chạy

Sau khi triển khai:

```text
npm run build
npm audit --audit-level=moderate
```

Kiểm tra server:

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/?preview=tx-error
```

Kiểm thử thủ công:

| Case | Kết quả mong đợi |
|---|---|
| Có reward period active | Analytics hiển thị APY, daily emission, runway. |
| User đã stake | `Your est. daily reward` lớn hơn 0 nếu rewardRate > 0. |
| User chưa stake | `Your est. daily reward` là 0. |
| Reward period hết hạn | Pool status là `Inactive`. |
| Contract paused | Pool status là `Paused`. |
| Mobile viewport | Không vỡ layout. |

## 10. Giới hạn

| Giới hạn | Ghi chú |
|---|---|
| Không có price oracle | Không tính APY theo USD. |
| Token là mock testnet | Chỉ dùng cho capstone/demo. |
| APY là danh nghĩa | Tính theo `RWD` emission so với `STK` staked. |
| Tính ở frontend | Không phải chỉ số được contract lưu riêng. |
| Phụ thuộc state mới nhất | Khi transaction mới xảy ra, cần refresh hoặc chờ polling. |

## 11. Kết luận

Analytics / Reward Pool Health nâng cao là hướng mở rộng phù hợp vì giúp app staking dễ hiểu và thực tế hơn. Người dùng biết reward ước tính của mình, còn owner biết reward pool còn đủ chạy bao lâu và có cần nạp thêm reward hay không.

Tính năng này không yêu cầu thay đổi contract, chỉ cần bổ sung tính toán và UI ở frontend dựa trên dữ liệu on-chain hiện có.
