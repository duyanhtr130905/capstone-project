# Staking Core - ERC20 Staking Rewards Capstone

`Staking Core` là project capstone Web3 triển khai một hệ thống staking reward bằng ERC20. Project gồm smart contract Solidity, deployment trên Sepolia, frontend React/Vite, Faucet STK testnet, onboarding, lịch sử hoạt động on-chain và analytics cho reward pool.

Demo đã deploy:

```text
https://capstone-project-eosin-five.vercel.app
```

Repository GitHub:

```text
https://github.com/duyanhtr130905/capstone-project
```

## 1. Tổng quan

Project cho phép người dùng stake token mock `STK` và nhận reward bằng token mock `RWD`.

Luồng sử dụng chính:

```text
Connect wallet -> Switch Sepolia -> Mint STK -> Approve STK -> Stake STK -> Earn RWD -> Claim RWD
```

Frontend kết nối trực tiếp với các contract đã deploy trên Sepolia. Project hiện không cần backend server.

## 2. Tính năng chính

### 2.1 Smart Contract

- Contract staking reward cho ERC20.
- Tách riêng staking token `STK` và reward token `RWD`.
- Tính reward bằng accumulator pattern.
- Hỗ trợ `stake`, `unstake`, `claimReward`.
- Owner quản lý reward funding và reward duration.
- Hỗ trợ pause/unpause.
- Bảo vệ recovery để không rút nhầm staking token hoặc reward token.
- Dùng custom errors để revert rõ nghĩa hơn.
- Có test cho staking, reward, access control, pause/unpause và edge cases.

### 2.2 Frontend

- React + TypeScript + Vite.
- Đọc/ghi contract bằng `viem`.
- Hỗ trợ MetaMask hoặc injected wallet.
- Hỗ trợ chuyển network sang Sepolia.
- Layout desktop dạng dashboard.
- Responsive mobile với bottom navigation.
- Có các màn: Dashboard, Rewards, Activity, Admin.
- Có transaction status panel và success/error overlay.
- Có link Etherscan cho transaction và contract.

### 2.3 Faucet STK Testnet

- Người dùng có thể mint mock `STK` trực tiếp trên frontend.
- Amount mặc định: `1000 STK`.
- Quick amounts: `100 STK`, `500 STK`, `1000 STK`.
- Giới hạn UI: `10,000 STK` mỗi transaction.
- Faucet chỉ dùng cho môi trường capstone/testnet.

### 2.4 Onboarding

Dashboard có checklist hướng dẫn người dùng mới:

```text
Connect wallet
Switch to Sepolia
Mint STK
Approve STK
Stake STK
Earn rewards
```

### 2.5 Activity History

Màn Activity đọc event logs thật từ Sepolia và hiển thị:

- Mint STK.
- Approve STK.
- Stake STK.
- Unstake STK.
- Claim RWD.
- Fund reward pool.
- Owner notify reward amount.
- Owner update reward duration.
- Owner recover ERC20.

Activity logs được đọc từ deployment block, chia theo block chunk nhỏ và có fallback RPC để tránh lỗi public RPC.

### 2.6 Reward Analytics

Màn Rewards có thêm các chỉ số:

- Nominal APY.
- Daily RWD emission.
- Estimated daily user reward.
- Reward runway.
- Pool status: `Healthy`, `Low`, `Critical`, `Inactive`, `Paused`.
- Scheduled rewards remaining.
- Funding coverage.
- Coverage progress bar.

Các chỉ số này được tính ở frontend từ dữ liệu on-chain.

## 3. Sepolia Deployment

Network:

```text
Sepolia
```

Ngày deploy:

```text
2026-06-06
```

Deployer:

```text
0xBdE29b2fe1B0CD9b0d134D2690D14f787Fc8A985
```

Địa chỉ contract:

| Contract | Address |
|---|---|
| `StakingRewards` | `0x8B30864bEF5B75C39D19Af249D6bbC4210B55963` |
| `StakingToken` / `STK` | `0x69F9e365D78dCB684DDe29ea6A05854273917db8` |
| `RewardsToken` / `RWD` | `0x20bF1B78E8B13B3273a27979725Faf1B74902e07` |

Block deploy:

| Contract | Block |
|---|---:|
| `RewardsToken` | `11001025` |
| `StakingToken` | `11001025` |
| `StakingRewards` | `11001030` |

Etherscan:

| Contract | Link |
|---|---|
| `StakingRewards` | https://sepolia.etherscan.io/address/0x8B30864bEF5B75C39D19Af249D6bbC4210B55963#code |
| `StakingToken` / `STK` | https://sepolia.etherscan.io/address/0x69F9e365D78dCB684DDe29ea6A05854273917db8#code |
| `RewardsToken` / `RWD` | https://sepolia.etherscan.io/address/0x20bF1B78E8B13B3273a27979725Faf1B74902e07#code |

## 4. Tech Stack

### 4.1 Contract

| Hạng mục | Công nghệ |
|---|---|
| Smart contract | Solidity `^0.8.20` |
| Development framework | Hardhat 3 |
| Contract library | OpenZeppelin Contracts |
| Deployment | Hardhat Ignition |
| Test | Hardhat test runner / Mocha style tests |
| Ngôn ngữ script/test | TypeScript |

### 4.2 Frontend

| Hạng mục | Công nghệ |
|---|---|
| UI | React `18.3.1` |
| Ngôn ngữ | TypeScript |
| Build tool | Vite `8.0.16` |
| Web3 client | `viem` |
| Icon | `lucide-react` |
| Styling | CSS thuần |
| Hosting | Vercel |

## 5. Cấu trúc project

```text
.
├── contracts/
│   ├── StakingRewards.sol
│   └── mocks/
│       └── MockERC20.sol
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── config/
│   │   │   ├── abis.ts
│   │   │   └── contracts.ts
│   │   ├── lib/
│   │   │   ├── format.ts
│   │   │   └── time.ts
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── guide/
│   ├── activity-history-guide.md
│   ├── faucet-onboarding-guide.md
│   ├── reward-analytics-guide.md
│   ├── staking-contract-capstone-guide.md
│   └── staking-ui-stitch-guide.md
├── ignition/
│   └── modules/
│       └── StakingRewards.ts
├── report/
│   ├── staking-activity-history-report.md
│   ├── staking-contract-capstone-report.md
│   ├── staking-faucet-onboarding-report.md
│   ├── staking-reward-analytics-report.md
│   └── staking-ui-implementation-report.md
├── scripts/
│   ├── check-sepolia-readiness.ts
│   ├── interact.ts
│   └── read-deployment-state.ts
├── test/
│   └── StakingRewards.test.ts
├── deployed-addresses.txt
├── hardhat.config.ts
├── package.json
└── tsconfig.json
```

Các thư mục generated như `artifacts/`, `cache/`, `coverage/`, `types/`, `node_modules/`, `frontend/dist/` đã được ignore.

## 6. Cài đặt local

### 6.1 Clone repo

```bash
git clone https://github.com/duyanhtr130905/capstone-project.git
cd capstone-project
```

### 6.2 Cài dependency root

```bash
npm install
```

### 6.3 Cài dependency frontend

```bash
cd frontend
npm install
```

## 7. Environment Variables

Nếu muốn chạy script deploy hoặc script tương tác Sepolia ở local, tạo file `.env` ở root project.

Tham khảo `.env.example`:

```text
PRIVATE_KEY=
SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=
STAKING_REWARDS_ADDRESS=
STAKING_TOKEN_ADDRESS=
REWARDS_TOKEN_ADDRESS=
REWARD_POOL_AMOUNT=1000
DEMO_STAKE_AMOUNT=10
```

Lưu ý:

- Không commit `.env`.
- Frontend đã deploy không cần private key.
- Frontend hiện dùng public Sepolia RPC và địa chỉ contract cố định trong source config.

## 8. Lệnh contract

Chạy từ root project.

Compile:

```bash
npm run compile
```

Test:

```bash
npm test
```

Kiểm tra size contract:

```bash
npm run size
```

Đọc state deployment Sepolia:

```bash
npm run read:sepolia
```

Kiểm tra readiness Sepolia:

```bash
npm run check:sepolia
```

Chạy script tương tác Sepolia:

```bash
npm run interact:sepolia
```

## 9. Lệnh frontend

Chạy từ thư mục `frontend/`.

Dev server:

```bash
npm run dev
```

Local URL:

```text
http://127.0.0.1:5173/
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Audit frontend:

```bash
npm audit --audit-level=moderate
```

## 10. Cách dùng bản live

Mở:

```text
https://capstone-project-eosin-five.vercel.app
```

Sau đó:

1. Connect MetaMask.
2. Chuyển network sang Sepolia.
3. Đảm bảo ví có Sepolia ETH để trả gas.
4. Mint test `STK` bằng Faucet.
5. Approve `STK`.
6. Stake `STK`.
7. Chờ reward `RWD` accrue.
8. Claim reward ở màn Rewards.
9. Vào Activity và bấm Reload để xem lịch sử.
10. Xem analytics ở màn Rewards.

## 11. Deploy frontend lên Vercel

Frontend hiện đã deploy trên Vercel:

```text
https://capstone-project-eosin-five.vercel.app
```

Cấu hình Vercel đang phù hợp với project:

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Frontend hiện không cần environment variables trên Vercel.

## 12. Kiểm thử đã thực hiện

Contract:

```text
npm run compile
npm test
npm run size
```

Frontend:

```text
npm run build
npm audit --audit-level=moderate
```

Các lần kiểm tra cuối cho frontend đều build thành công và audit không có vulnerability ở mức moderate.

Lưu ý thêm: root Hardhat dependency tree từng có các cảnh báo low severity từ dependency tooling liên quan tới Hardhat verify. Phần này không được force-fix vì npm đề xuất downgrade tooling có thể gây breaking change với setup Hardhat 3.

## 13. Lưu ý bảo mật

Project này dùng cho capstone và testnet.

Các điểm cần chú ý:

- `MockERC20.mint(address,uint256)` là public.
- Faucet chỉ phù hợp cho token mock trên testnet.
- `STK` và `RWD` không có giá trị thật.
- Không dùng mô hình faucet public hiện tại cho production token.
- Không public private key, mnemonic hoặc API key.
- Luôn giữ `.env` ngoài Git.

## 14. Tài liệu

Guide triển khai nằm trong:

```text
guide/
```

Báo cáo triển khai nằm trong:

```text
report/
```

Thứ tự đọc report đề xuất:

1. `staking-contract-capstone-report.md`
2. `staking-ui-implementation-report.md`
3. `staking-faucet-onboarding-report.md`
4. `staking-activity-history-report.md`
5. `staking-reward-analytics-report.md`

## 15. License

MIT
