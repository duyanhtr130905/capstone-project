import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Landmark,
  Lock,
  PauseCircle,
  RefreshCw,
  Shield,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import {
  type AbiEvent,
  BaseError,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import { erc20Abi, stakingRewardsAbi } from "./config/abis";
import {
  ETHERSCAN_BASE_URL,
  SEPOLIA_RPC_URLS,
  contracts,
  zeroAddress,
} from "./config/contracts";
import {
  formatPercent,
  formatToken,
  formatTokenWithSymbol,
  parseTokenAmount,
  shortAddress,
} from "./lib/format";
import {
  formatCountdown,
  formatDateTime,
  rewardPeriodProgress,
} from "./lib/time";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & {
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        listener: (...args: unknown[]) => void,
      ) => void;
    };
  }
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: fallback([
    http(SEPOLIA_RPC_URLS[0]),
    http(SEPOLIA_RPC_URLS[1]),
  ]),
});

type TxState = "idle" | "wallet" | "confirming" | "success" | "failed";
type View = "dashboard" | "rewards" | "activity" | "admin";
type PreviewMode = "disconnected" | "wrong-network" | "tx-success" | "tx-error";
const previewAddress = "0xBdE29b2fe1B0CD9b0d134D2690D14f787Fc8A985" as Address;
const maxFaucetAmount = 10_000n * 10n ** 18n;
const activityFromBlock = 11_001_025n;
const activityBlockChunk = 2_000n;

type ActivityType =
  | "mint"
  | "approve"
  | "stake"
  | "unstake"
  | "claim"
  | "fund"
  | "notify"
  | "duration"
  | "recover";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  valueLabel?: string;
  hash: Hash;
  blockNumber: bigint;
  logIndex: number;
  scope: "wallet" | "admin";
};

type PoolHealthTone = "healthy" | "low" | "critical" | "inactive" | "paused";

type PoolHealth = {
  label: string;
  tone: PoolHealthTone;
  description: string;
};

type DecodedActivityLog = {
  args: Record<string, unknown>;
  transactionHash: Hash;
  blockNumber: bigint;
  logIndex: number;
};

type ActivityLogFilter = {
  address: Address;
  event: AbiEvent;
  args?: Record<string, Address>;
};

const stakedEvent = parseAbiItem(
  "event Staked(address indexed user, uint256 amount)",
) as AbiEvent;
const withdrawnEvent = parseAbiItem(
  "event Withdrawn(address indexed user, uint256 amount)",
) as AbiEvent;
const rewardAddedEvent = parseAbiItem(
  "event RewardAdded(uint256 reward)",
) as AbiEvent;
const rewardPaidEvent = parseAbiItem(
  "event RewardPaid(address indexed user, uint256 reward)",
) as AbiEvent;
const rewardsDurationUpdatedEvent = parseAbiItem(
  "event RewardsDurationUpdated(uint256 newDuration)",
) as AbiEvent;
const recoveredEvent = parseAbiItem(
  "event Recovered(address indexed token, uint256 amount)",
) as AbiEvent;
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
) as AbiEvent;
const approvalEvent = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
) as AbiEvent;

type DashboardReads = {
  owner: Address;
  stakedBalance: bigint;
  earnedReward: bigint;
  totalStaked: bigint;
  rewardRate: bigint;
  rewardsDuration: bigint;
  periodFinish: bigint;
  paused: boolean;
  stakingTokenBalance: bigint;
  rewardsTokenBalance: bigint;
  allowance: bigint;
  contractRewardBalance: bigint;
  contractStakeBalance: bigint;
};

const emptyReads: DashboardReads = {
  owner: zeroAddress,
  stakedBalance: 0n,
  earnedReward: 0n,
  totalStaked: 0n,
  rewardRate: 0n,
  rewardsDuration: 0n,
  periodFinish: 0n,
  paused: false,
  stakingTokenBalance: 0n,
  rewardsTokenBalance: 0n,
  allowance: 0n,
  contractRewardBalance: 0n,
  contractStakeBalance: 0n,
};

function sameAddress(a?: string, b?: string) {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function txUrl(hash?: Hash) {
  return hash ? `${ETHERSCAN_BASE_URL}/tx/${hash}` : `${ETHERSCAN_BASE_URL}`;
}

async function getLogsInRange(
  filter: ActivityLogFilter,
  latestBlock: bigint,
) {
  if (latestBlock < activityFromBlock) return [];

  const logs: DecodedActivityLog[] = [];

  for (
    let fromBlock = activityFromBlock;
    fromBlock <= latestBlock;
    fromBlock += activityBlockChunk
  ) {
    const upperBlock = fromBlock + activityBlockChunk - 1n;
    const toBlock = upperBlock > latestBlock ? latestBlock : upperBlock;
    const nextLogs = await getLogsChunk(filter, fromBlock, toBlock);

    logs.push(...nextLogs.map(asActivityLog));
  }

  return logs;
}

async function getLogsChunk(
  filter: ActivityLogFilter,
  fromBlock: bigint,
  toBlock: bigint,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await publicClient.getLogs({
        address: filter.address,
        event: filter.event,
        args: filter.args,
        fromBlock,
        toBlock,
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(450 * (attempt + 1));
    }
  }

  return [];
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function asActivityLog(log: unknown) {
  return log as DecodedActivityLog;
}

function makeActivity(
  log: unknown,
  item: Omit<ActivityItem, "id" | "hash" | "blockNumber" | "logIndex">,
): ActivityItem {
  const decodedLog = asActivityLog(log);

  return {
    id: `${decodedLog.transactionHash}-${decodedLog.logIndex}`,
    hash: decodedLog.transactionHash,
    blockNumber: decodedLog.blockNumber,
    logIndex: decodedLog.logIndex,
    ...item,
  };
}

function compareActivityItems(a: ActivityItem, b: ActivityItem) {
  if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
  return a.blockNumber > b.blockNumber ? -1 : 1;
}

function durationLabel(seconds: bigint) {
  const days = Number(seconds / 86_400n);
  if (days > 0) return `${days} days`;
  const hours = Number(seconds / 3_600n);
  if (hours > 0) return `${hours} hours`;
  return `${seconds.toString()} seconds`;
}

function formatDurationCompact(seconds: bigint) {
  if (seconds <= 0n) return "0m";

  const totalSeconds = Number(seconds);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ratioPercent(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return undefined;
  const scaled = (numerator * 10_000n) / denominator;
  return Number(scaled) / 100;
}

function formatOpenPercent(value?: number, decimals = 1) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(decimals)}%`;
}

function getPoolHealth({
  paused,
  rewardRate,
  timeLeftSeconds,
  scheduledRemaining,
  contractRewardBalance,
  runwaySeconds,
  coveragePercent,
}: {
  paused: boolean;
  rewardRate: bigint;
  timeLeftSeconds: bigint;
  scheduledRemaining: bigint;
  contractRewardBalance: bigint;
  runwaySeconds: bigint;
  coveragePercent?: number;
}): PoolHealth {
  if (paused) {
    return {
      label: "Paused",
      tone: "paused",
      description: "Staking and unstaking are currently paused.",
    };
  }

  if (rewardRate <= 0n || timeLeftSeconds <= 0n) {
    return {
      label: "Inactive",
      tone: "inactive",
      description: "There is no active reward emission period.",
    };
  }

  if (scheduledRemaining > contractRewardBalance) {
    return {
      label: "Critical",
      tone: "critical",
      description: "Reward balance is below the scheduled remaining payout.",
    };
  }

  if (
    runwaySeconds < 86_400n ||
    (coveragePercent !== undefined && coveragePercent < 110)
  ) {
    return {
      label: "Low",
      tone: "low",
      description: "Reward pool is funded, but the safety buffer is thin.",
    };
  }

  return {
    label: "Healthy",
    tone: "healthy",
    description: "Reward pool has enough balance for the active schedule.",
  };
}

function getProvider() {
  return window.ethereum;
}

async function requestAccounts() {
  const provider = getProvider();
  if (!provider) return [];
  return (await provider.request({ method: "eth_requestAccounts" })) as Address[];
}

async function getConnectedAccounts() {
  const provider = getProvider();
  if (!provider) return [];
  return (await provider.request({ method: "eth_accounts" })) as Address[];
}

async function getCurrentChainId() {
  const provider = getProvider();
  if (!provider) return undefined;
  const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hexChainId, 16);
}

async function switchToSepoliaNetwork() {
  const provider = getProvider();
  if (!provider) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${sepolia.id.toString(16)}` }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${sepolia.id.toString(16)}`,
          chainName: "Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [...SEPOLIA_RPC_URLS],
          blockExplorerUrls: [ETHERSCAN_BASE_URL],
        },
      ],
    });
  }
}

function errorMessage(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error) return error.message;
  return "Transaction failed.";
}

export default function App() {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [reads, setReads] = useState<DashboardReads>(emptyReads);
  const [isReading, setIsReading] = useState(false);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [txState, setTxState] = useState<TxState>("idle");
  const [hash, setHash] = useState<Hash>();
  const [activeAction, setActiveAction] = useState("");
  const [error, setError] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("1000");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [notifyAmount, setNotifyAmount] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [view, setView] = useState<View>("dashboard");
  const previewMode = useMemo(() => {
    const mode = new URLSearchParams(window.location.search).get("preview");
    if (
      mode === "disconnected" ||
      mode === "wrong-network" ||
      mode === "tx-success" ||
      mode === "tx-error"
    ) {
      return mode as PreviewMode;
    }

    return undefined;
  }, []);

  const isConnected = address !== undefined;
  const isSepolia = chainId === sepolia.id;
  const canRead = isConnected && isSepolia;
  const isOwner = sameAddress(address, reads.owner);
  const transactionBusy = txState === "wallet" || txState === "confirming";
  const stakeAmountWei = parseTokenAmount(stakeAmount);
  const unstakeAmountWei = parseTokenAmount(unstakeAmount);
  const faucetAmountWei = parseTokenAmount(faucetAmount);
  const fundAmountWei = parseTokenAmount(fundAmount);
  const notifyAmountWei = parseTokenAmount(notifyAmount);
  const needsApproval =
    stakeAmountWei !== null &&
    stakeAmountWei > 0n &&
    reads.allowance < stakeAmountWei;
  const rewardRatePerDay = reads.rewardRate * 86_400n;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const timeLeftSeconds =
    reads.periodFinish > nowSeconds ? reads.periodFinish - nowSeconds : 0n;
  const scheduledRewardsRemaining = reads.rewardRate * timeLeftSeconds;
  const rewardRunwaySeconds =
    reads.rewardRate > 0n ? reads.contractRewardBalance / reads.rewardRate : 0n;
  const annualReward = reads.rewardRate * 31_536_000n;
  const nominalApyPercent = ratioPercent(annualReward, reads.totalStaked);
  const userDailyReward =
    reads.totalStaked > 0n
      ? (reads.stakedBalance * rewardRatePerDay) / reads.totalStaked
      : 0n;
  const fundingCoveragePercent = ratioPercent(
    reads.contractRewardBalance,
    scheduledRewardsRemaining,
  );
  const poolHealth = getPoolHealth({
    paused: reads.paused,
    rewardRate: reads.rewardRate,
    timeLeftSeconds,
    scheduledRemaining: scheduledRewardsRemaining,
    contractRewardBalance: reads.contractRewardBalance,
    runwaySeconds: rewardRunwaySeconds,
    coveragePercent: fundingCoveragePercent,
  });
  const periodProgress = rewardPeriodProgress(
    reads.periodFinish,
    reads.rewardsDuration,
  );
  const connectedPreview =
    previewMode === "tx-success" || previewMode === "tx-error";
  const displayAddress = connectedPreview ? address ?? previewAddress : address;

  const loadState = useCallback(async () => {
    if (!address || chainId !== sepolia.id) return;

    setIsReading(true);
    try {
      const [
        owner,
        stakedBalance,
        earnedReward,
        totalStaked,
        rewardRate,
        rewardsDuration,
        periodFinish,
        paused,
        stakingTokenBalance,
        rewardsTokenBalance,
        allowance,
        contractRewardBalance,
        contractStakeBalance,
      ] = await Promise.all([
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "owner",
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "stakedBalance",
          args: [address],
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "earned",
          args: [address],
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "totalStaked",
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "rewardRate",
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "rewardsDuration",
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "periodFinish",
        }),
        publicClient.readContract({
          address: contracts.stakingRewards,
          abi: stakingRewardsAbi,
          functionName: "paused",
        }),
        publicClient.readContract({
          address: contracts.stakingToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: contracts.rewardsToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: contracts.stakingToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, contracts.stakingRewards],
        }),
        publicClient.readContract({
          address: contracts.rewardsToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [contracts.stakingRewards],
        }),
        publicClient.readContract({
          address: contracts.stakingToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [contracts.stakingRewards],
        }),
      ]);

      setReads({
        owner,
        stakedBalance,
        earnedReward,
        totalStaked,
        rewardRate,
        rewardsDuration,
        periodFinish,
        paused,
        stakingTokenBalance,
        rewardsTokenBalance,
        allowance,
        contractRewardBalance,
        contractStakeBalance,
      });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsReading(false);
    }
  }, [address, chainId]);

  const loadActivity = useCallback(async () => {
    if (!address || chainId !== sepolia.id) return;

    setIsLoadingActivity(true);
    setActivityError("");

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const queryErrors: string[] = [];
      const safeGetLogs = async (filter: ActivityLogFilter) => {
        try {
          return await getLogsInRange(filter, latestBlock);
        } catch (activityLoadError) {
          queryErrors.push(errorMessage(activityLoadError));
          return [] as DecodedActivityLog[];
        }
      };

      const stakedLogs = await safeGetLogs({
        address: contracts.stakingRewards,
        event: stakedEvent,
        args: { user: address },
      });
      const withdrawnLogs = await safeGetLogs({
        address: contracts.stakingRewards,
        event: withdrawnEvent,
        args: { user: address },
      });
      const rewardPaidLogs = await safeGetLogs({
        address: contracts.stakingRewards,
        event: rewardPaidEvent,
        args: { user: address },
      });
      const stkMintLogs = await safeGetLogs({
        address: contracts.stakingToken,
        event: transferEvent,
        args: { from: zeroAddress, to: address },
      });
      const stkApprovalLogs = await safeGetLogs({
        address: contracts.stakingToken,
        event: approvalEvent,
        args: { owner: address, spender: contracts.stakingRewards },
      });
      const rwdFundLogs = await safeGetLogs({
        address: contracts.rewardsToken,
        event: transferEvent,
        args: { from: address, to: contracts.stakingRewards },
      });
      const rewardAddedLogs = isOwner
        ? await safeGetLogs({
            address: contracts.stakingRewards,
            event: rewardAddedEvent,
          })
        : [];
      const durationLogs = isOwner
        ? await safeGetLogs({
            address: contracts.stakingRewards,
            event: rewardsDurationUpdatedEvent,
          })
        : [];
      const recoveredLogs = isOwner
        ? await safeGetLogs({
            address: contracts.stakingRewards,
            event: recoveredEvent,
          })
        : [];

      const nextItems: ActivityItem[] = [
        ...stakedLogs.map((log) => {
          const amount = asActivityLog(log).args.amount as bigint;

          return makeActivity(log, {
            type: "stake",
            title: "Stake STK",
            description: "Deposited STK into the staking contract.",
            valueLabel: formatTokenWithSymbol(amount, "STK"),
            scope: "wallet",
          });
        }),
        ...withdrawnLogs.map((log) => {
          const amount = asActivityLog(log).args.amount as bigint;

          return makeActivity(log, {
            type: "unstake",
            title: "Unstake STK",
            description: "Withdrew STK from the staking contract.",
            valueLabel: formatTokenWithSymbol(amount, "STK"),
            scope: "wallet",
          });
        }),
        ...rewardPaidLogs.map((log) => {
          const reward = asActivityLog(log).args.reward as bigint;

          return makeActivity(log, {
            type: "claim",
            title: "Claim RWD",
            description: "Claimed accrued staking rewards.",
            valueLabel: formatTokenWithSymbol(reward, "RWD"),
            scope: "wallet",
          });
        }),
        ...stkMintLogs.map((log) => {
          const value = asActivityLog(log).args.value as bigint;

          return makeActivity(log, {
            type: "mint",
            title: "Mint STK",
            description: "Received test STK from the faucet token contract.",
            valueLabel: formatTokenWithSymbol(value, "STK"),
            scope: "wallet",
          });
        }),
        ...stkApprovalLogs.map((log) => {
          const value = asActivityLog(log).args.value as bigint;

          return makeActivity(log, {
            type: "approve",
            title: "Approve STK",
            description: "Allowed StakingRewards to spend STK.",
            valueLabel: formatTokenWithSymbol(value, "STK"),
            scope: "wallet",
          });
        }),
        ...rwdFundLogs.map((log) => {
          const value = asActivityLog(log).args.value as bigint;

          return makeActivity(log, {
            type: "fund",
            title: "Fund Reward Pool",
            description: "Transferred RWD into the staking rewards contract.",
            valueLabel: formatTokenWithSymbol(value, "RWD"),
            scope: "wallet",
          });
        }),
        ...rewardAddedLogs.map((log) => {
          const reward = asActivityLog(log).args.reward as bigint;

          return makeActivity(log, {
            type: "notify",
            title: "Notify Reward Amount",
            description: "Started or topped up a reward distribution period.",
            valueLabel: formatTokenWithSymbol(reward, "RWD"),
            scope: "admin",
          });
        }),
        ...durationLogs.map((log) => {
          const newDuration = asActivityLog(log).args.newDuration as bigint;

          return makeActivity(log, {
            type: "duration",
            title: "Update Reward Duration",
            description: "Changed the duration used for future reward periods.",
            valueLabel: durationLabel(newDuration),
            scope: "admin",
          });
        }),
        ...recoveredLogs.map((log) => {
          const decodedLog = asActivityLog(log);
          const token = decodedLog.args.token as Address;
          const amount = decodedLog.args.amount as bigint;

          return makeActivity(log, {
            type: "recover",
            title: "Recover ERC20",
            description: `Recovered tokens from ${shortAddress(token)}.`,
            valueLabel: formatToken(amount),
            scope: "admin",
          });
        }),
      ].sort(compareActivityItems);

      setActivityItems(nextItems);
      if (queryErrors.length > 0) {
        const uniqueErrors = Array.from(new Set(queryErrors));
        setActivityError(
          `Some logs could not be loaded. First error: ${uniqueErrors[0]}`,
        );
      }
    } catch (activityLoadError) {
      setActivityError(errorMessage(activityLoadError));
    } finally {
      setIsLoadingActivity(false);
    }
  }, [address, chainId, isOwner]);

  useEffect(() => {
    async function hydrateWallet() {
      const [firstAccount] = await getConnectedAccounts();
      setAddress(firstAccount);
      setChainId(await getCurrentChainId());
    }

    void hydrateWallet();

    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccount = Array.isArray(accounts) ? (accounts[0] as Address) : undefined;
      setAddress(nextAccount);
    };
    const handleChainChanged = (nextChainId: unknown) => {
      if (typeof nextChainId === "string") {
        setChainId(Number.parseInt(nextChainId, 16));
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    void loadState();
    if (!canRead) return;

    const interval = window.setInterval(() => {
      void loadState();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [canRead, loadState]);

  useEffect(() => {
    if (!canRead) {
      setActivityItems([]);
      setActivityError("");
      return;
    }

    if (view === "activity") {
      void loadActivity();
    }
  }, [canRead, loadActivity, view]);

  const statusText = useMemo(() => {
    if (!isConnected) return "Disconnected";
    if (!isSepolia) return "Wrong network";
    if (reads.paused) return "Paused";
    return "Operational";
  }, [isConnected, isSepolia, reads.paused]);
  const displayStatusText = connectedPreview ? "Operational" : statusText;

  async function connectWallet() {
    setError("");
    setIsConnecting(true);
    try {
      const [firstAccount] = await requestAccounts();
      setAddress(firstAccount);
      setChainId(await getCurrentChainId());
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setIsConnecting(false);
    }
  }

  async function switchNetwork() {
    setError("");
    setIsSwitching(true);
    try {
      await switchToSepoliaNetwork();
      setChainId(await getCurrentChainId());
    } catch (switchError) {
      setError(errorMessage(switchError));
    } finally {
      setIsSwitching(false);
    }
  }

  function disconnectWallet() {
    setAddress(undefined);
    setReads(emptyReads);
  }

  async function execute(label: string, action: () => Promise<Hash>) {
    setActiveAction(label);
    setHash(undefined);
    setError("");
    setTxState("wallet");

    try {
      const nextHash = await action();
      setHash(nextHash);
      setTxState("confirming");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: nextHash,
      });

      setTxState(receipt.status === "success" ? "success" : "failed");
      await loadState();
    } catch (txError) {
      setTxState("failed");
      setError(errorMessage(txError));
    }
  }

  function walletClient() {
    const provider = getProvider();
    if (!provider || !address) {
      throw new Error("Wallet is not connected.");
    }

    return createWalletClient({
      account: address,
      chain: sepolia,
      transport: custom(provider),
    });
  }

  function handleApprove() {
    if (stakeAmountWei === null || stakeAmountWei <= 0n) return;
    void execute("Approve STK", () =>
      walletClient().writeContract({
        address: contracts.stakingToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.stakingRewards, stakeAmountWei],
      }),
    );
  }

  function handleMintStk() {
    if (
      faucetAmountWei === null ||
      faucetAmountWei <= 0n ||
      faucetAmountWei > maxFaucetAmount ||
      !address
    ) {
      return;
    }

    void execute("Mint test STK", () =>
      walletClient().writeContract({
        address: contracts.stakingToken,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, faucetAmountWei],
      }),
    );
  }

  function handleStake() {
    if (stakeAmountWei === null || stakeAmountWei <= 0n || needsApproval) return;
    void execute("Stake STK", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: "stake",
        args: [stakeAmountWei],
      }),
    );
  }

  function handleUnstake() {
    if (unstakeAmountWei === null || unstakeAmountWei <= 0n) return;
    void execute("Unstake STK", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: "unstake",
        args: [unstakeAmountWei],
      }),
    );
  }

  function handleClaim() {
    if (reads.earnedReward <= 0n) return;
    void execute("Claim RWD", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: "claimReward",
      }),
    );
  }

  function handleFundRewardPool() {
    if (fundAmountWei === null || fundAmountWei <= 0n) return;
    void execute("Fund reward pool", () =>
      walletClient().writeContract({
        address: contracts.rewardsToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [contracts.stakingRewards, fundAmountWei],
      }),
    );
  }

  function handleNotifyRewardAmount() {
    if (notifyAmountWei === null || notifyAmountWei <= 0n) return;
    void execute("Notify reward amount", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: "notifyRewardAmount",
        args: [notifyAmountWei],
      }),
    );
  }

  function handleSetDuration() {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 0) return;
    void execute("Set reward duration", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: "setRewardsDuration",
        args: [BigInt(Math.floor(days * 86_400))],
      }),
    );
  }

  function handlePauseToggle() {
    void execute(reads.paused ? "Unpause staking" : "Pause staking", () =>
      walletClient().writeContract({
        address: contracts.stakingRewards,
        abi: stakingRewardsAbi,
        functionName: reads.paused ? "unpause" : "pause",
      }),
    );
  }

  function setMaxStake(percent: number) {
    const value = (reads.stakingTokenBalance * BigInt(percent)) / 100n;
    setStakeAmount(formatToken(value, 18));
  }

  function setMaxUnstake(percent: number) {
    const value = (reads.stakedBalance * BigInt(percent)) / 100n;
    setUnstakeAmount(formatToken(value, 18));
  }

  const accountSummary = (
    <section className="grid stats-grid" aria-label="Account summary">
      <StatCard
        label="STK Balance"
        value={formatToken(reads.stakingTokenBalance)}
        icon={<Coins />}
      />
      <StatCard
        label="RWD Balance"
        value={formatToken(reads.rewardsTokenBalance)}
        icon={<BadgeDollarSign />}
      />
      <StatCard
        label="Your Staked STK"
        value={formatToken(reads.stakedBalance)}
        icon={<Lock />}
        accent="primary"
      />
      <StatCard
        label="Pending Rewards"
        value={`${formatToken(reads.earnedReward)} RWD`}
        icon={<Zap />}
        accent="success"
      />
    </section>
  );

  const protocolStatsPanel = (
    <Panel title="Global Protocol Stats" icon={<BarChart3 />}>
      <div className="two-col">
        <Metric
          label="Total staked"
          value={formatTokenWithSymbol(reads.totalStaked, "STK")}
        />
        <Metric
          label="Reward rate"
          value={`${formatToken(rewardRatePerDay, 6)} RWD/day`}
        />
        <Metric
          label="Reward period ends"
          value={formatDateTime(reads.periodFinish)}
          subValue={formatCountdown(reads.periodFinish)}
        />
        <Metric
          label="Contract balances"
          value={`${formatToken(reads.contractStakeBalance)} STK`}
          subValue={`${formatToken(reads.contractRewardBalance)} RWD funded`}
        />
      </div>
      <div className="progress-row">
        <div className="progress-meta">
          <span>Period progress</span>
          <strong>{formatPercent(periodProgress)}</strong>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: formatPercent(periodProgress) }}
          />
        </div>
      </div>
    </Panel>
  );

  const faucetPanel = (
    <Panel title="Testnet STK Faucet" icon={<Coins />}>
      <div className="faucet-body">
        <p>
          Mint free STK test tokens to try the full staking flow on Sepolia.
          These tokens are only for this capstone testnet deployment.
        </p>
        <div className="quick-buttons" aria-label="Faucet quick amounts">
          {["100", "500", "1000"].map((amount) => (
            <button
              key={amount}
              className={faucetAmount === amount ? "active" : ""}
              onClick={() => setFaucetAmount(amount)}
            >
              {amount} STK
            </button>
          ))}
        </div>
        <div className="amount-input">
          <input
            value={faucetAmount}
            onChange={(event) => setFaucetAmount(event.target.value)}
            inputMode="decimal"
            placeholder="1000"
          />
          <span>STK</span>
        </div>
        <p className="helper-text">
          You still need Sepolia ETH for gas. Max faucet amount:
          {" "}
          {formatTokenWithSymbol(maxFaucetAmount, "STK", 0)} per transaction.
        </p>
        {faucetAmountWei !== null && faucetAmountWei > maxFaucetAmount && (
          <p className="field-warning">Enter 10,000 STK or less.</p>
        )}
        <button
          className="button primary"
          onClick={handleMintStk}
          disabled={
            transactionBusy ||
            faucetAmountWei === null ||
            faucetAmountWei <= 0n ||
            faucetAmountWei > maxFaucetAmount ||
            !address
          }
        >
          Mint STK
        </button>
      </div>
    </Panel>
  );

  const onboardingSteps = [
    {
      label: "Connect wallet",
      description: address ? shortAddress(address) : "Connect an injected wallet.",
      done: address !== undefined,
    },
    {
      label: "Switch to Sepolia",
      description: "Required network: Sepolia chain id 11155111.",
      done: chainId === sepolia.id,
    },
    {
      label: "Mint STK",
      description: "Use the testnet faucet to get staking tokens.",
      done: reads.stakingTokenBalance > 0n,
    },
    {
      label: "Approve STK",
      description: "Allow StakingRewards to transfer your STK.",
      done: reads.allowance > 0n,
    },
    {
      label: "Stake STK",
      description: "Deposit STK into the staking contract.",
      done: reads.stakedBalance > 0n,
    },
    {
      label: "Earn rewards",
      description: "Wait for RWD to accrue, then claim it in Rewards.",
      done:
        reads.earnedReward > 0n ||
        (activeAction === "Claim RWD" && txState === "success"),
    },
  ];

  const onboardingPanel = (
    <Panel title="Getting Started" icon={<CheckCircle2 />}>
      <OnboardingChecklist steps={onboardingSteps} />
    </Panel>
  );

  const stakeControlsPanel = (
    <Panel title="Stake Controls" icon={<Landmark />}>
      <div className="tabs" role="tablist" aria-label="Stake controls">
        <button
          className={activeTab === "stake" ? "active" : ""}
          onClick={() => setActiveTab("stake")}
        >
          Stake
        </button>
        <button
          className={activeTab === "unstake" ? "active" : ""}
          onClick={() => setActiveTab("unstake")}
        >
          Unstake
        </button>
      </div>

      {activeTab === "stake" ? (
        <AmountForm
          token="STK"
          label="Amount"
          value={stakeAmount}
          balanceLabel={`Balance: ${formatToken(reads.stakingTokenBalance)} STK`}
          onChange={setStakeAmount}
          onQuarter={() => setMaxStake(25)}
          onHalf={() => setMaxStake(50)}
          onMax={() => setMaxStake(100)}
        >
          <div className="allowance-box">
            <span>Allowance</span>
            <strong>{formatTokenWithSymbol(reads.allowance, "STK")}</strong>
          </div>
          <button
            className="button outline"
            onClick={handleApprove}
            disabled={
              transactionBusy ||
              stakeAmountWei === null ||
              stakeAmountWei <= 0n ||
              !needsApproval
            }
          >
            Approve STK
          </button>
          <button
            className="button primary"
            onClick={handleStake}
            disabled={
              transactionBusy ||
              stakeAmountWei === null ||
              stakeAmountWei <= 0n ||
              stakeAmountWei > reads.stakingTokenBalance ||
              needsApproval ||
              reads.paused
            }
          >
            Stake STK
          </button>
        </AmountForm>
      ) : (
        <AmountForm
          token="STK"
          label="Amount"
          value={unstakeAmount}
          balanceLabel={`Staked: ${formatToken(reads.stakedBalance)} STK`}
          onChange={setUnstakeAmount}
          onQuarter={() => setMaxUnstake(25)}
          onHalf={() => setMaxUnstake(50)}
          onMax={() => setMaxUnstake(100)}
        >
          <button
            className="button primary"
            onClick={handleUnstake}
            disabled={
              transactionBusy ||
              unstakeAmountWei === null ||
              unstakeAmountWei <= 0n ||
              unstakeAmountWei > reads.stakedBalance ||
              reads.paused
            }
          >
            Unstake STK
          </button>
        </AmountForm>
      )}
    </Panel>
  );

  const walletActivityCount = activityItems.filter(
    (item) => item.scope === "wallet",
  ).length;
  const adminActivityCount = activityItems.filter(
    (item) => item.scope === "admin",
  ).length;

  const activityView = (
    <>
      <section className="page-heading">
        <span className="badge soft">On-chain logs</span>
        <h1>Activity History</h1>
        <p>
          Review wallet activity fetched from Sepolia logs for{" "}
          {shortAddress(address)}. Each row links back to the original
          transaction on Etherscan.
        </p>
      </section>
      <section className="grid stats-grid activity-stats" aria-label="Activity summary">
        <StatCard
          label="Activities"
          value={activityItems.length.toString()}
          icon={<Activity />}
        />
        <StatCard
          label="Wallet Logs"
          value={walletActivityCount.toString()}
          icon={<Wallet />}
          accent="primary"
        />
        <StatCard
          label="Admin Logs"
          value={adminActivityCount.toString()}
          icon={<Shield />}
        />
        <StatCard
          label="From Block"
          value={activityFromBlock.toString()}
          icon={<Clock />}
        />
      </section>
      <Panel title="Recent Activity" icon={<Activity />}>
        <div className="activity-toolbar">
          <p>
            Reading StakingRewards, STK, and RWD events from Sepolia.
          </p>
          <button
            className="button outline"
            onClick={() => void loadActivity()}
            disabled={isLoadingActivity}
          >
            <RefreshCw className={isLoadingActivity ? "spin" : ""} size={16} />
            {isLoadingActivity ? "Loading..." : "Reload"}
          </button>
        </div>
        {activityError && <p className="activity-error">{activityError}</p>}
        <ActivityTimeline items={activityItems} isLoading={isLoadingActivity} />
      </Panel>
    </>
  );

  const nominalApyLabel =
    reads.totalStaked > 0n
      ? formatOpenPercent(nominalApyPercent, 2)
      : "No active stake";
  const runwayLabel =
    reads.rewardRate > 0n
      ? formatDurationCompact(rewardRunwaySeconds)
      : "No active emission";
  const coverageLabel =
    scheduledRewardsRemaining > 0n
      ? formatOpenPercent(fundingCoveragePercent)
      : "No active schedule";

  const rewardAnalyticsPanel = (
    <Panel title="Reward Pool Analytics" icon={<Gauge />}>
      <div className="analytics-grid">
        <Metric
          label="Nominal APY"
          value={nominalApyLabel}
          subValue="RWD emissions over current STK staked"
        />
        <Metric
          label="Daily emission"
          value={`${formatToken(rewardRatePerDay, 6)} RWD/day`}
          subValue="Derived from current contract reward rate"
        />
        <Metric
          label="Your est. daily reward"
          value={`${formatToken(userDailyReward, 6)} RWD/day`}
          subValue={`${formatTokenWithSymbol(reads.stakedBalance, "STK")} currently staked`}
        />
        <Metric
          label="Reward runway"
          value={runwayLabel}
          subValue={`${formatTokenWithSymbol(reads.contractRewardBalance, "RWD")} in contract`}
        />
      </div>
    </Panel>
  );

  const rewardPoolHealthPanel = (
    <Panel title="Reward Pool Health" icon={<Activity />}>
      <div className={`health-banner ${poolHealth.tone}`}>
        <div>
          <span>Pool status</span>
          <strong>{poolHealth.label}</strong>
          <p>{poolHealth.description}</p>
        </div>
        <Gauge size={34} />
      </div>
      <div className="two-col health-metrics">
        <Metric
          label="Contract RWD balance"
          value={formatTokenWithSymbol(reads.contractRewardBalance, "RWD")}
        />
        <Metric
          label="Scheduled remaining"
          value={formatTokenWithSymbol(scheduledRewardsRemaining, "RWD")}
          subValue="Required for the active reward period"
        />
        <Metric
          label="Funding coverage"
          value={coverageLabel}
          subValue="Balance divided by scheduled remaining"
        />
        <Metric
          label="Time left"
          value={formatCountdown(reads.periodFinish)}
          subValue={formatDateTime(reads.periodFinish)}
        />
      </div>
      {fundingCoveragePercent !== undefined && (
        <div className="progress-row coverage-row">
          <div className="progress-meta">
            <span>Coverage progress</span>
            <strong>{coverageLabel}</strong>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill ${poolHealth.tone}`}
              style={{ width: formatPercent(fundingCoveragePercent) }}
            />
          </div>
        </div>
      )}
    </Panel>
  );

  const rewardsView = (
    <>
      <section className="page-heading">
        <span className="badge soft">Rewards</span>
        <h1>Rewards Center</h1>
        <p>
          Track accrued RWD, reward period timing, pool funding, and claimable
          rewards from the deployed Sepolia contract.
        </p>
      </section>
      <section className="grid rewards-grid">
        <Panel title="Claimable Rewards" icon={<BadgeDollarSign />}>
          <div className="reward-hero">
            <span>Pending RWD</span>
            <strong>{formatTokenWithSymbol(reads.earnedReward, "RWD")}</strong>
            <p>
              Rewards are calculated from the accumulator pattern and refresh
              every 10 seconds while this page is open.
            </p>
            <button
              className="button primary"
              onClick={handleClaim}
              disabled={transactionBusy || reads.earnedReward <= 0n}
            >
              Claim Reward
            </button>
          </div>
        </Panel>
        {rewardAnalyticsPanel}
        {protocolStatsPanel}
        {rewardPoolHealthPanel}
      </section>
    </>
  );

  const adminView = isOwner ? (
    <>
      <section className="page-heading">
        <span className="badge">Owner</span>
        <h1>Contract Administration</h1>
        <p>
          Manage reward funding, reward duration, and emergency pause controls.
          This page is only enabled for the deployed contract owner.
        </p>
      </section>
      <section className="admin-grid" id="admin">
        <Panel title="Contract Administration" icon={<Shield />} badge="Owner">
          <div className="admin-status">
            <div>
              <span className="label">Current state</span>
              <strong>{reads.paused ? "Paused" : "Active"}</strong>
            </div>
            <button
              className={reads.paused ? "button primary" : "button danger"}
              onClick={handlePauseToggle}
              disabled={transactionBusy}
            >
              <PauseCircle size={16} />
              {reads.paused ? "Unpause" : "Pause Staking"}
            </button>
          </div>
          <div className="duration-row">
            <label>
              <span>Reward duration</span>
              <input
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <span className="input-suffix">days</span>
            <button
              className="button outline"
              onClick={handleSetDuration}
              disabled={transactionBusy}
            >
              Update
            </button>
          </div>
        </Panel>

        <Panel title="Reward Management" icon={<Gauge />}>
          <AdminAmountRow
            title="Fund reward pool"
            value={fundAmount}
            onChange={setFundAmount}
            buttonLabel="Fund"
            onClick={handleFundRewardPool}
            disabled={transactionBusy || fundAmountWei === null || fundAmountWei <= 0n}
          />
          <AdminAmountRow
            title="Notify reward amount"
            value={notifyAmount}
            onChange={setNotifyAmount}
            buttonLabel="Notify"
            onClick={handleNotifyRewardAmount}
            disabled={
              transactionBusy || notifyAmountWei === null || notifyAmountWei <= 0n
            }
          />
        </Panel>
      </section>
    </>
  ) : (
    <EmptyState
      icon={<Shield />}
      title="Owner-only admin"
      text="The admin panel is only available when the connected wallet is the StakingRewards contract owner."
      detail={`Contract owner: ${shortAddress(reads.owner)}`}
      actionLabel="Back to Dashboard"
      onAction={() => setView("dashboard")}
    />
  );

  const dashboardView = (
    <>
      {accountSummary}
      <section className="grid main-grid">
        <div className="stack">
          {faucetPanel}
          {protocolStatsPanel}
          {onboardingPanel}
        </div>
        {stakeControlsPanel}
      </section>
    </>
  );

  if (previewMode === "wrong-network") {
    return (
      <Shell
        address={address ?? previewAddress}
        statusText="Wrong network"
        onDisconnect={disconnectWallet}
        view={view}
        onViewChange={setView}
      >
        <EmptyState
          tone="warning"
          icon={<AlertTriangle />}
          title="Wrong network"
          text="Switch the connected wallet to Sepolia before reading or writing contract state."
          detail="Preview: current chain id 1"
          actionLabel="Switch to Sepolia"
          onAction={() => void switchNetwork()}
        />
      </Shell>
    );
  }

  if (previewMode === "disconnected" || (!connectedPreview && !isConnected)) {
    return (
      <Shell
        address={previewMode === "disconnected" ? undefined : address}
        statusText={statusText}
        onDisconnect={disconnectWallet}
        onConnect={() => void connectWallet()}
        isConnecting={isConnecting}
        view={view}
        onViewChange={setView}
      >
        <EmptyState
          icon={<Wallet />}
          title="Connect wallet"
          text="Staking Core uses your Sepolia wallet to read balances and submit staking transactions."
          actionLabel={isConnecting ? "Connecting..." : "Connect Wallet"}
          onAction={() => void connectWallet()}
          disabled={isConnecting || getProvider() === undefined}
        />
        {error && <InlineError error={error} />}
      </Shell>
    );
  }

  if (!connectedPreview && !isSepolia) {
    return (
      <Shell
        address={address}
        statusText={statusText}
        onDisconnect={disconnectWallet}
        view={view}
        onViewChange={setView}
      >
        <EmptyState
          tone="warning"
          icon={<AlertTriangle />}
          title="Wrong network"
          text="Switch the connected wallet to Sepolia before reading or writing contract state."
          detail={`Current chain id: ${chainId ?? "unknown"}`}
          actionLabel={isSwitching ? "Switching..." : "Switch to Sepolia"}
          onAction={() => void switchNetwork()}
          disabled={isSwitching}
        />
        {error && <InlineError error={error} />}
      </Shell>
    );
  }

  return (
    <Shell
      address={displayAddress}
      statusText={displayStatusText}
      onDisconnect={disconnectWallet}
      onRefresh={() => void loadState()}
      isReading={isReading}
      view={view}
      onViewChange={setView}
    >
      {view === "dashboard" && dashboardView}
      {view === "rewards" && rewardsView}
      {view === "activity" && activityView}
      {view === "admin" && adminView}

      <TransactionPanel
        activeAction={
          activeAction ||
          (previewMode === "tx-success" || previewMode === "tx-error"
            ? "Stake STK"
            : "")
        }
        hash={hash}
        txState={
          previewMode === "tx-error"
            ? "failed"
            : previewMode === "tx-success"
              ? "success"
              : txState
        }
        error={previewMode === "tx-error" ? "Preview: wallet rejected or contract reverted." : error}
      />
      {(txState === "success" || txState === "failed" || previewMode === "tx-success" || previewMode === "tx-error") && (
        <TransactionOverlay
          state={
            previewMode === "tx-error" || txState === "failed"
              ? "failed"
              : "success"
          }
          action={activeAction || (previewMode === "tx-error" ? "Stake STK" : "Stake STK")}
          hash={hash}
          error={previewMode === "tx-error" ? "Preview: transaction was rejected or reverted." : error}
          onClose={() => {
            setView("dashboard");
            setTxState("idle");
            setActiveAction("");
            setError("");
          }}
        />
      )}
    </Shell>
  );
}

function Shell({
  children,
  address,
  statusText,
  onConnect,
  onDisconnect,
  onRefresh,
  view = "dashboard",
  onViewChange,
  isConnecting,
  isReading,
}: {
  children: React.ReactNode;
  address?: Address;
  statusText: string;
  onConnect?: () => void;
  onDisconnect: () => void;
  onRefresh?: () => void;
  view?: View;
  onViewChange?: (view: View) => void;
  isConnecting?: boolean;
  isReading?: boolean;
}) {
  function changeView(nextView: View) {
    onViewChange?.(nextView);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">SC</div>
          <div>
            <strong>Staking Core</strong>
            <span>Sepolia staking dashboard</span>
          </div>
        </div>
        <div className="top-actions">
          <span className={`status-pill ${statusText === "Operational" ? "ok" : ""}`}>
            <span />
            {statusText}
          </span>
          {onRefresh && (
            <button className="icon-button" onClick={onRefresh} title="Refresh data">
              <RefreshCw className={isReading ? "spin" : ""} size={18} />
            </button>
          )}
          {address ? (
            <button className="wallet-button" onClick={onDisconnect}>
              <Wallet size={16} />
              {shortAddress(address)}
            </button>
          ) : (
            <button className="wallet-button" onClick={onConnect} disabled={isConnecting}>
              <Wallet size={16} />
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>
      <aside className="sidebar">
        <nav>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => changeView("dashboard")}
          >
            <BarChart3 size={18} />
            Dashboard
          </button>
          <button
            className={view === "rewards" ? "active" : ""}
            onClick={() => changeView("rewards")}
          >
            <BadgeDollarSign size={18} />
            Rewards
          </button>
          <button
            className={view === "activity" ? "active" : ""}
            onClick={() => changeView("activity")}
          >
            <Activity size={18} />
            Activity
          </button>
          <button
            className={view === "admin" ? "active" : ""}
            onClick={() => changeView("admin")}
          >
            <Shield size={18} />
            Admin
          </button>
        </nav>
        <div className="sidebar-links">
          <a href={`${ETHERSCAN_BASE_URL}/address/${contracts.stakingRewards}`} target="_blank">
            <ArrowUpRight size={18} />
            Etherscan
          </a>
        </div>
      </aside>
      <main id="dashboard" className="content">
        {children}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => changeView("dashboard")}
        >
          <BarChart3 size={20} />
          Dashboard
        </button>
        <button
          className={view === "rewards" ? "active" : ""}
          onClick={() => changeView("rewards")}
        >
          <BadgeDollarSign size={20} />
          Rewards
        </button>
        <button
          className={view === "activity" ? "active" : ""}
          onClick={() => changeView("activity")}
        >
          <Activity size={20} />
          Activity
        </button>
        <button
          className={view === "admin" ? "active" : ""}
          onClick={() => changeView("admin")}
        >
          <Shield size={20} />
          Admin
        </button>
      </nav>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  detail,
  tone,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  detail?: string;
  tone?: "warning";
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <section className={`empty-state ${tone ?? ""}`}>
      <div className="empty-icon">{icon}</div>
      <h1>{title}</h1>
      <p>{text}</p>
      {detail && <span className="detail-pill">{detail}</span>}
      <button className="button primary" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    </section>
  );
}

function InlineError({ error }: { error: string }) {
  return <p className="inline-error">{error}</p>;
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "primary" | "success";
}) {
  return (
    <article className={`stat-card ${accent ?? ""}`}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        {badge && <span className="badge">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {subValue && <small>{subValue}</small>}
    </div>
  );
}

function AmountForm({
  label,
  token,
  value,
  balanceLabel,
  onChange,
  onQuarter,
  onHalf,
  onMax,
  children,
}: {
  label: string;
  token: string;
  value: string;
  balanceLabel: string;
  onChange: (value: string) => void;
  onQuarter: () => void;
  onHalf: () => void;
  onMax: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="amount-form">
      <div className="amount-meta">
        <label>{label}</label>
        <div>
          <button onClick={onQuarter}>25%</button>
          <button onClick={onHalf}>50%</button>
          <button onClick={onMax}>MAX</button>
        </div>
      </div>
      <div className="amount-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
        <span>{token}</span>
      </div>
      <p className="balance-line">{balanceLabel}</p>
      <div className="form-actions">{children}</div>
    </div>
  );
}

function AdminAmountRow({
  title,
  value,
  onChange,
  buttonLabel,
  onClick,
  disabled,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="admin-row">
      <label>
        <span>{title}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
      </label>
      <button className="button primary" onClick={onClick} disabled={disabled}>
        {buttonLabel}
      </button>
    </div>
  );
}

function OnboardingChecklist({
  steps,
}: {
  steps: Array<{ label: string; description: string; done: boolean }>;
}) {
  const currentIndex = steps.findIndex((step) => !step.done);

  return (
    <ol className="onboarding-list">
      {steps.map((step, index) => {
        const status =
          step.done ? "done" : index === currentIndex ? "current" : "pending";

        return (
          <li key={step.label} className={`onboarding-step ${status}`}>
            <span className="step-index">
              {step.done ? <CheckCircle2 size={16} /> : index + 1}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function activityIcon(type: ActivityType) {
  if (type === "mint") return <Coins size={16} />;
  if (type === "approve") return <CheckCircle2 size={16} />;
  if (type === "stake") return <Lock size={16} />;
  if (type === "unstake") return <ArrowUpRight size={16} />;
  if (type === "claim") return <BadgeDollarSign size={16} />;
  if (type === "fund") return <Gauge size={16} />;
  if (type === "notify") return <Zap size={16} />;
  if (type === "duration") return <Clock size={16} />;
  return <Shield size={16} />;
}

function ActivityTimeline({
  items,
  isLoading,
}: {
  items: ActivityItem[];
  isLoading: boolean;
}) {
  if (isLoading && items.length === 0) {
    return (
      <div className="activity-empty">
        <strong>Loading activity logs...</strong>
        <p>Fetching Sepolia events for the connected wallet.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="activity-empty">
        <strong>No activity found</strong>
        <p>Mint STK, approve, stake, or claim rewards to populate this history.</p>
      </div>
    );
  }

  return (
    <ol className="activity-list">
      {items.map((item) => (
        <li key={item.id} className="activity-item">
          <span className={`activity-icon ${item.type}`}>
            {activityIcon(item.type)}
          </span>
          <div className="activity-main">
            <div className="activity-title-row">
              <strong>{item.title}</strong>
              <span>{item.scope === "admin" ? "Admin" : "Wallet"}</span>
            </div>
            <p>{item.description}</p>
            <div className="activity-meta">
              <span>Block {item.blockNumber.toString()}</span>
              <a href={txUrl(item.hash)} target="_blank">
                {shortAddress(item.hash)}
                <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          {item.valueLabel && (
            <strong className="activity-value">{item.valueLabel}</strong>
          )}
        </li>
      ))}
    </ol>
  );
}

function TransactionPanel({
  activeAction,
  hash,
  txState,
  error,
}: {
  activeAction: string;
  hash?: Hash;
  txState: TxState;
  error?: string;
}) {
  const statusLabel =
    txState === "wallet"
      ? "Waiting for wallet"
      : txState === "confirming"
        ? "Confirming"
        : txState === "success"
          ? "Confirmed"
          : txState === "failed"
            ? "Failed"
            : "Ready";

  return (
    <section className="transaction-panel">
      <div>
        <Clock size={18} />
        <h2>Transaction Status</h2>
      </div>
      {!activeAction && <p>No active transaction.</p>}
      {activeAction && (
        <div className="tx-grid">
          <span>Action</span>
          <strong>{activeAction}</strong>
          <span>Status</span>
          <strong>{statusLabel}</strong>
          {hash && (
            <>
              <span>Hash</span>
              <a href={txUrl(hash)} target="_blank">
                {shortAddress(hash)}
                <ArrowUpRight size={14} />
              </a>
            </>
          )}
          {txState === "success" && (
            <>
              <span>Result</span>
              <strong className="success-text">
                <CheckCircle2 size={16} />
                Success
              </strong>
            </>
          )}
          {error && (
            <>
              <span>Error</span>
              <strong className="error-text">{error}</strong>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TransactionOverlay({
  state,
  action,
  hash,
  error,
  onClose,
}: {
  state: "success" | "failed";
  action: string;
  hash?: Hash;
  error?: string;
  onClose: () => void;
}) {
  const success = state === "success";

  return (
    <div className="tx-overlay" role="dialog" aria-modal="true">
      <div className="tx-modal">
        <div className={`tx-modal-icon ${success ? "success" : "failed"}`}>
          {success ? <CheckCircle2 /> : <XCircle />}
        </div>
        <h2>{success ? "Transaction Successful" : "Transaction Failed"}</h2>
        <p>
          {success
            ? `${action} has been confirmed on Sepolia.`
            : error || `${action} did not complete.`}
        </p>
        <div className="modal-actions">
          <button className="button primary" onClick={onClose}>
            Return to Dashboard
          </button>
          {hash && (
            <a className="modal-link" href={txUrl(hash)} target="_blank">
              <ArrowUpRight size={16} />
              View on Etherscan
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
