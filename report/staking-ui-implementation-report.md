# Báo cáo triển khai giao diện Staking Core

## 1. Tóm tắt triển khai

Giao diện `Staking Core` đã được triển khai như một frontend Web3 chạy bằng React, TypeScript, Vite và `viem`. Giao diện lấy thiết kế từ file export của Google Stitch làm nguồn tham khảo, sau đó được xây lại thành ứng dụng thật có khả năng kết nối ví, đọc dữ liệu on-chain từ Sepolia và gửi giao dịch đến các contract đã deploy.

Phạm vi triển khai hiện tại gồm 2 nền tảng:

| Nền tảng | Trạng thái | Ghi chú |
|---|---|---|
| Desktop Web | Đã triển khai | Dùng layout dashboard có top bar, sidebar, các màn Dashboard/Rewards/Admin riêng. |
| Mobile Web Responsive | Đã triển khai | Dùng layout responsive, nội dung xếp dọc, có bottom navigation riêng cho Dashboard/Rewards/Admin. |

Đây là giao diện web responsive, không phải ứng dụng native iOS/Android. Khi mở trên điện thoại, app chạy qua trình duyệt mobile hoặc mobile wallet browser.

## 2. Nguồn thiết kế từ Google Stitch

File thiết kế được người dùng cung cấp dưới dạng zip:

```text
stitch_erc20_staking_rewards_dashboard.zip
```

File zip đã được giải nén vào:

```text
stitch-export/
```

Nội dung Stitch export là các màn hình HTML tĩnh và ảnh preview, không phải code production hoàn chỉnh. Vì vậy, phần HTML từ Stitch không được dùng trực tiếp để chạy app thật. Frontend hiện tại được viết lại bằng React/TypeScript, còn Stitch được dùng làm tài liệu tham khảo về layout, màu sắc, spacing, state và responsive behavior.

Các màn hình Stitch đã được đối chiếu:

| Màn hình trong Stitch | Đã áp dụng vào frontend |
|---|---|
| Dashboard desktop | Có, triển khai thành view `Dashboard`. |
| Dashboard mobile | Có, áp dụng responsive layout và bottom navigation. |
| Disconnected state | Có, hỗ trợ cả state thật và preview URL. |
| Wrong network state | Có, hỗ trợ cả state thật và preview URL. |
| Transaction success state | Có, triển khai transaction overlay và preview URL. |
| Transaction error/failed state | Có, triển khai transaction overlay lỗi và preview URL. |
| Admin panel desktop | Có, triển khai view `Admin`, chỉ mở cho owner. |
| Admin panel mobile | Có, responsive theo mobile web layout. |

## 3. Công nghệ sử dụng

Frontend nằm trong thư mục:

```text
frontend/
```

Stack thực tế:

| Thành phần | Công nghệ |
|---|---|
| Framework UI | React `18.3.1` |
| Ngôn ngữ | TypeScript |
| Build tool | Vite `8.0.16` |
| Web3 client | `viem ^2.33.0` |
| Icon | `lucide-react ^0.468.0` |
| Styling | CSS thuần trong `frontend/src/styles.css` |
| Wallet | Injected EIP-1193 wallet, ví dụ MetaMask |
| Network | Sepolia |

Đã chọn `viem` trực tiếp thay vì `wagmi` để giảm dependency, tránh kéo nhiều wallet connector/tooling không cần thiết và giữ `npm audit` sạch hơn.

## 4. Cấu trúc frontend

```text
frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    styles.css
    config/
      abis.ts
      contracts.ts
    lib/
      format.ts
      time.ts
```

| File | Vai trò |
|---|---|
| `frontend/src/App.tsx` | Component chính, quản lý ví, network, state đọc contract, write transaction, view switching và preview state. |
| `frontend/src/main.tsx` | Mount React app vào DOM. |
| `frontend/src/styles.css` | Toàn bộ style desktop/mobile, sidebar, bottom nav, cards, forms, overlays. |
| `frontend/src/config/contracts.ts` | Lưu địa chỉ contract Sepolia và Etherscan base URL. |
| `frontend/src/config/abis.ts` | ABI tối giản cho `ERC20` và `StakingRewards`. |
| `frontend/src/lib/format.ts` | Format token, address, percent và parse amount input. |
| `frontend/src/lib/time.ts` | Format countdown, datetime và reward period progress. |

## 5. Kết nối contract thực tế

Frontend đang trỏ đến các contract Sepolia đã triển khai:

| Contract | Địa chỉ |
|---|---|
| `StakingRewards` | `0x8B30864bEF5B75C39D19Af249D6bbC4210B55963` |
| `StakingToken` | `0x69F9e365D78dCB684DDe29ea6A05854273917db8` |
| `RewardsToken` | `0x20bF1B78E8B13B3273a27979725Faf1B74902e07` |

Network mục tiêu:

```text
Sepolia chain id: 11155111
```

Frontend dùng `createPublicClient` để đọc dữ liệu public từ Sepolia và `createWalletClient` với `custom(window.ethereum)` để gửi giao dịch từ ví người dùng.

## 6. Chức năng đọc dữ liệu on-chain

Frontend đọc các dữ liệu sau:

| Dữ liệu UI | Contract/function |
|---|---|
| Owner contract | `StakingRewards.owner()` |
| STK đang stake của user | `StakingRewards.stakedBalance(user)` |
| Reward đang chờ claim | `StakingRewards.earned(user)` |
| Tổng STK đang stake | `StakingRewards.totalStaked()` |
| Reward rate | `StakingRewards.rewardRate()` |
| Reward duration | `StakingRewards.rewardsDuration()` |
| Reward period finish | `StakingRewards.periodFinish()` |
| Trạng thái pause | `StakingRewards.paused()` |
| STK balance của user | `StakingToken.balanceOf(user)` |
| RWD balance của user | `RewardsToken.balanceOf(user)` |
| STK allowance | `StakingToken.allowance(user, StakingRewards)` |
| RWD balance trong staking contract | `RewardsToken.balanceOf(StakingRewards)` |
| STK balance trong staking contract | `StakingToken.balanceOf(StakingRewards)` |

Dữ liệu được refresh:

- Khi user connect wallet.
- Khi user đổi account.
- Khi user đổi network.
- Sau mỗi transaction hoàn tất.
- Theo interval 10 giây khi ví đang kết nối đúng Sepolia.

## 7. Chức năng ghi transaction

Các hành động write đã triển khai:

| Hành động UI | Contract/function |
|---|---|
| Approve STK | `StakingToken.approve(StakingRewards, amount)` |
| Stake STK | `StakingRewards.stake(amount)` |
| Unstake STK | `StakingRewards.unstake(amount)` |
| Claim RWD | `StakingRewards.claimReward()` |
| Fund reward pool | `RewardsToken.transfer(StakingRewards, amount)` |
| Notify reward amount | `StakingRewards.notifyRewardAmount(amount)` |
| Set reward duration | `StakingRewards.setRewardsDuration(duration)` |
| Pause staking | `StakingRewards.pause()` |
| Unpause staking | `StakingRewards.unpause()` |

Mỗi transaction có state:

| State | Ý nghĩa |
|---|---|
| `wallet` | Đang chờ user xác nhận trong ví. |
| `confirming` | Transaction đã gửi, đang chờ xác nhận on-chain. |
| `success` | Transaction confirmed thành công. |
| `failed` | Transaction bị reject, revert hoặc thất bại. |

Sau khi transaction thành công, frontend gọi lại `loadState()` để refresh số dư và trạng thái mới.

## 8. Nền tảng Desktop Web

Desktop web được thiết kế theo dạng dashboard công cụ, không phải landing page.

### 8.1 Layout desktop

| Khu vực | Mô tả |
|---|---|
| Top bar | Hiển thị brand, trạng thái network/contract, nút refresh, ví đang kết nối. |
| Sidebar | Điều hướng giữa `Dashboard`, `Rewards`, `Admin`, và link Etherscan. |
| Content area | Hiển thị view hiện tại theo sidebar. |
| Transaction panel | Hiển thị action, status, hash, success/error. |
| Transaction overlay | Modal success/failed giống state trong Stitch. |

### 8.2 View Dashboard

Dashboard tập trung vào tổng quan tài khoản và thao tác stake/unstake.

Nội dung:

- `STK Balance`.
- `RWD Balance`.
- `Your Staked STK`.
- `Pending Rewards`.
- `Global Protocol Stats`.
- `Total staked`.
- `Reward rate`.
- `Reward period ends`.
- `Contract balances`.
- `Period progress`.
- Form `Stake`.
- Form `Unstake`.
- Kiểm tra allowance trước khi stake.

### 8.3 View Rewards

Rewards là màn hình riêng, không còn giống Dashboard.

Nội dung:

- `Pending RWD`.
- Nút `Claim Reward`.
- Thông tin reward period.
- Reward pool health.
- Contract RWD balance.
- RWD balance của user.
- Reward duration.
- Time left.

### 8.4 View Admin

Admin là màn hình riêng, chỉ mở đầy đủ nếu ví đang kết nối là owner contract.

Nếu ví không phải owner:

- Hiển thị `Owner-only admin`.
- Hiển thị contract owner dạng rút gọn.
- Có nút quay về Dashboard.

Nếu ví là owner:

- Hiển thị trạng thái contract `Active` hoặc `Paused`.
- Nút `Pause Staking` hoặc `Unpause`.
- Input reward duration theo ngày.
- Form `Fund reward pool`.
- Form `Notify reward amount`.

## 9. Nền tảng Mobile Web Responsive

Mobile đã được triển khai dưới dạng responsive web, chạy trong trình duyệt mobile hoặc browser trong ví.

### 9.1 Điều chỉnh layout mobile

Khi màn hình nhỏ hơn breakpoint tablet:

- Sidebar desktop bị ẩn.
- Nội dung chuyển sang 1 cột.
- Stat cards chuyển sang grid 2 cột trên mobile rộng vừa, rồi tự stack khi cần.
- Main grid, rewards grid và admin grid chuyển thành 1 cột.
- Form input và transaction info không bị ép ngang.
- Content có padding dưới lớn hơn để không bị bottom navigation che.

### 9.2 Mobile bottom navigation

Mobile có bottom navigation riêng:

| Tab | Chức năng |
|---|---|
| `Dashboard` | Mở tổng quan và stake/unstake. |
| `Rewards` | Mở màn hình reward/claim. |
| `Admin` | Mở owner admin hoặc owner-only state. |

Bottom nav được cố định ở đáy màn hình, có active state rõ ràng, nền trắng blur nhẹ và bo góc theo style từ Stitch.

### 9.3 Các state mobile

Các state đã hỗ trợ trên mobile:

| State | Cách hiển thị |
|---|---|
| Disconnected | Card trung tâm yêu cầu connect wallet. |
| Wrong network | Card cảnh báo yêu cầu switch sang Sepolia. |
| Dashboard | Nội dung xếp dọc, bottom nav điều hướng. |
| Rewards | Claimable reward và pool health xếp dọc. |
| Admin owner | Admin controls xếp dọc. |
| Admin non-owner | Owner-only state. |
| Transaction success | Overlay modal success. |
| Transaction failed | Overlay modal failed. |

## 10. State preview để kiểm thử UI

Để kiểm thử các state giống trong Stitch mà không cần tạo lỗi thật, frontend hỗ trợ query param `preview`.

Các URL preview:

```text
http://127.0.0.1:5173/?preview=disconnected
http://127.0.0.1:5173/?preview=wrong-network
http://127.0.0.1:5173/?preview=tx-success
http://127.0.0.1:5173/?preview=tx-error
```

Mục đích:

| Preview URL | Màn hình |
|---|---|
| `?preview=disconnected` | Xem state chưa kết nối ví. |
| `?preview=wrong-network` | Xem state sai network. |
| `?preview=tx-success` | Xem modal transaction thành công. |
| `?preview=tx-error` | Xem modal transaction thất bại. |

Các preview này hoạt động độc lập với ví thật để thuận tiện kiểm thử UI desktop/mobile.

## 11. Cách chạy và kiểm thử

Chạy frontend:

```bash
cd frontend
npm run dev
```

URL local:

```text
http://127.0.0.1:5173/
```

Build production:

```bash
cd frontend
npm run build
```

Kiểm tra audit:

```bash
cd frontend
npm audit --audit-level=moderate
```

Kết quả kiểm tra hiện tại:

| Lệnh | Kết quả |
|---|---|
| `npm run build` | Pass, TypeScript và Vite build thành công. |
| `npm audit --audit-level=moderate` | Pass, `found 0 vulnerabilities`. |
| `http://127.0.0.1:5173/?preview=tx-success` | HTTP `200 OK`. |

Build output mới nhất:

| File | Kích thước |
|---|---:|
| `dist/index.html` | 0.39 kB |
| `dist/assets/index-DboioVXC.css` | 11.45 kB |
| `dist/assets/ccip-CRNZODIU.js` | 2.83 kB |
| `dist/assets/index-BXErnIFa.js` | 437.55 kB |

## 12. Cách kiểm thử chức năng thật

### 12.1 Kiểm thử ví và network

| Test | Kỳ vọng |
|---|---|
| Mở app khi chưa connect ví | Hiển thị màn connect wallet. |
| Connect MetaMask | Hiển thị address rút gọn trên top bar. |
| Connect sai network | Hiển thị wrong network state. |
| Switch sang Sepolia | App đọc dữ liệu contract thật. |

### 12.2 Kiểm thử Dashboard

| Test | Kỳ vọng |
|---|---|
| Vào `Dashboard` | Hiển thị balances, staked amount, pending rewards, protocol stats. |
| Nhập amount stake | Form nhận số token. |
| Allowance chưa đủ | `Approve STK` bật, `Stake STK` bị chặn. |
| Approve thành công | Allowance refresh, có thể stake. |
| Stake thành công | Transaction overlay success, dữ liệu refresh. |
| Chuyển tab `Unstake` | Form unstake hiện ra. |
| Unstake quá số đang stake | Nút bị disabled. |

### 12.3 Kiểm thử Rewards

| Test | Kỳ vọng |
|---|---|
| Vào `Rewards` | Màn hình khác Dashboard, tập trung reward. |
| Pending reward bằng 0 | `Claim Reward` disabled. |
| Pending reward > 0 | `Claim Reward` enabled. |
| Claim thành công | Overlay success, RWD balance refresh. |

### 12.4 Kiểm thử Admin

| Test | Kỳ vọng |
|---|---|
| Ví không phải owner vào `Admin` | Hiển thị owner-only state. |
| Ví owner vào `Admin` | Hiển thị admin controls. |
| Pause/unpause | Gửi transaction tới `pause()` hoặc `unpause()`. |
| Set duration | Gửi transaction tới `setRewardsDuration(duration)`. |
| Fund reward pool | Gửi `RWD.transfer(StakingRewards, amount)`. |
| Notify reward amount | Gửi `notifyRewardAmount(amount)`. |

### 12.5 Kiểm thử mobile

| Test | Kỳ vọng |
|---|---|
| Bật Chrome DevTools mobile viewport | Sidebar biến mất, bottom nav xuất hiện. |
| Bấm `Dashboard` trên bottom nav | Mở màn Dashboard. |
| Bấm `Rewards` trên bottom nav | Mở màn Rewards. |
| Bấm `Admin` trên bottom nav | Mở admin hoặc owner-only state. |
| Mở preview state trên mobile viewport | Các card/overlay không bị vỡ layout. |

## 13. Các điểm đã cải thiện so với export tĩnh

| Điểm | Thực tế đã triển khai |
|---|---|
| Dữ liệu mock | Đã thay bằng dữ liệu đọc từ Sepolia contract thật. |
| HTML tĩnh | Đã chuyển thành React app có state và transaction handling. |
| Sidebar desktop | Đã có navigation thật giữa 3 view. |
| Mobile navigation | Đã có bottom navigation riêng. |
| Transaction success | Đã có overlay modal success. |
| Transaction error | Đã có overlay modal failed. |
| Wrong network | Đã có state thật và preview state. |
| Owner admin | Đã khóa theo `owner()` từ contract thật. |
| Dependency audit | Frontend hiện `0 vulnerabilities` ở mức audit moderate. |

## 14. Giới hạn hiện tại

| Giới hạn | Ghi chú |
|---|---|
| Không phải native mobile app | Mobile hiện là responsive web/mobile web. |
| Chưa có WalletConnect | Hiện dùng injected wallet như MetaMask. |
| Chưa có routing URL thật | View switching đang quản lý bằng React state, chưa dùng React Router. |
| Chưa có transaction history dài hạn | Transaction panel chỉ lưu trạng thái phiên hiện tại. |
| Chưa có chart lịch sử reward | Hiện có progress và metric, chưa có historical chart. |
| Admin recover ERC20 chưa có UI riêng | Contract có `recoverERC20`, nhưng giao diện hiện tập trung vào fund/notify/duration/pause. |

## 15. Kết luận

Giao diện đã được triển khai thành một Web3 dashboard có thể dùng thật trên desktop web và mobile web responsive. Desktop có top bar, sidebar và 3 màn hình riêng: Dashboard, Rewards, Admin. Mobile có layout xếp dọc và bottom navigation riêng để thao tác thuận tiện trên màn hình nhỏ. Frontend đã kết nối trực tiếp với các contract Sepolia bằng `viem`, hỗ trợ đọc dữ liệu on-chain, gửi các transaction staking/reward/admin chính, xử lý state sai network, chưa connect ví, transaction success và transaction failed. Build hiện pass và frontend audit không còn vulnerability ở mức kiểm tra hiện tại.

