'use client';

import { useEffect, useMemo, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { encodeFunctionData, formatEther, isAddress, parseEther, type Address } from 'viem';
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { formatAgentHandle } from '@/components/Navbar';
import {
  AGENT_ID_REGISTRY_ABI,
  AGENT_ID_REGISTRY_ADDRESS,
  DEAD_ADDRESS,
  DIVIDEND_TRACKER_ABI,
  DIVIDEND_TRACKER_ADDRESS,
  TARGET_CHAIN_ID,
  ZHUZHU_ABI,
  ZHUZHU_TOKEN_ADDRESS,
  formatContractError,
} from '@/lib/contracts';
import {
  BUILTIN_SIGNER_ADDRESS,
  DEFAULT_WATCH_ADDRESS,
  HAS_BUILTIN_SIGNER,
  SIGNER_CONNECTOR_ID,
  WATCH_CONNECTOR_ID,
  connectQuickWallet,
  setWatchAddress,
} from '@/lib/wagmi';

const EXPLORER =
  TARGET_CHAIN_ID === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';

const NETWORK_LABEL =
  TARGET_CHAIN_ID === 97 ? 'BSC Testnet (Chain ID 97)' : 'BNB Smart Chain (Chain ID 56)';

const LOT_PRICE_BNB = 0.002;
const TOKENS_PER_LOT = 60_000_000;
const TOTAL_LOTS = 10_000;
const MAX_LOTS_PER_WALLET = 10;

function formatBnb(n: number) {
  return Number(n.toFixed(4)).toString();
}

/** Build structured mint instructions (with auto .ai registration and raw calldata) for AI bots. */
function buildAiMintPrompt(targetLots: number): string {
  const costBnb = formatBnb(targetLots * LOT_PRICE_BNB);
  const valueWei = parseEther((targetLots * LOT_PRICE_BNB).toFixed(4)).toString();
  const calldata = encodeFunctionData({
    abi: ZHUZHU_ABI,
    functionName: 'mint',
    args: [BigInt(targetLots)],
  });
  return `请帮我作为 AI Agent 在 ${NETWORK_LABEL} 上全自动认购「猪猪币 ZHUZHU」（官网 https://www.zhuzhubi.xyz）：
1. 网络与规范清单：
   - Chain ID：${TARGET_CHAIN_ID}（请确认钱包有足够的本金 BNB + Gas BNB）
   - 机器可读规范：https://www.zhuzhubi.xyz/agent.json （说明文档：https://www.zhuzhubi.xyz/llms.txt）
2. 官方唯一合约地址：
   - ZHUZHU Token 主合约：${ZHUZHU_TOKEN_ADDRESS}
   - Agent ID 注册表：${AGENT_ID_REGISTRY_ADDRESS}
   - BNB 分红合约：${DIVIDEND_TRACKER_ADDRESS}
3. 执行前只读安全核验：
   - 调用 ZHUZHU_TOKEN.mintOpen() 确认返回 true
   - 调用 ZHUZHU_TOKEN.mintedLots(我的地址) 确认当前已购份数 + ${targetLots} <= 10
   - 调用 ZHUZHU_TOKEN.hasAgentId(我的地址)：
     · 若返回 false：先向 AgentIdRegistry（${AGENT_ID_REGISTRY_ADDRESS}）免费调用 register("zhuzhu-ai-随机数")（value=0）注册不重复的 .ai 身份，等上链确认后再继续下一步；
     · 若返回 true：直接执行第 4 步 Mint。
4. 发送认购交易（仅向 ZHUZHU_TOKEN 合约发起）：
   - 目标合约：${ZHUZHU_TOKEN_ADDRESS}
   - 调用方法：mint(${targetLots})
   - 精准 BNB 金额：${costBnb} BNB（${valueWei} wei；每份 0.002 BNB，单地址上限 10 份 = 0.02 BNB）
   - Raw Calldata (Hex)：${calldata}
   - 预计获得：${(targetLots * TOKENS_PER_LOT).toLocaleString('en-US')} ZHUZHU
5. 安全规则：切勿向任何陌生个人地址转账 BNB，务必核对目标地址为上述唯一主合约。`;
}

/** Build structured BNB dividend claim instructions and calldata for AI bots. */
function buildAiClaimPrompt(): string {
  const claimCalldata = encodeFunctionData({
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'claim',
  });
  return `请帮我在 ${NETWORK_LABEL}（Chain ID: ${TARGET_CHAIN_ID}）检查并领取「猪猪币 ZHUZHU」的持币 BNB 分红：
1. 分红追踪合约（ZhuZhuDividendTracker）：${DIVIDEND_TRACKER_ADDRESS}
2. 只读核验（确认后再发送交易）：
   - 调用 isEligible(我的地址) 确认持仓 >= 1,000,000 ZHUZHU（返回 true）
   - 调用 withdrawable(我的地址) 确认可领取 BNB 数量 > 0
3. 发起领取交易：
   - 目标合约：${DIVIDEND_TRACKER_ADDRESS}
   - 调用方法：claim()（value = 0 wei）
   - Raw Calldata (Hex)：${claimCalldata}`;
}

const TOKENOMICS_CARDS = [
  {
    pct: '60%',
    title: '社区公平认购 Mint',
    amount: '600,000,000,000 ZHUZHU',
    desc: '10,000 份 × 0.002 BNB = 20 BNB，单地址最多 10 份（0.02 BNB）。仅限币安 AI 钱包（.ai）认购。',
    accent: 'text-pig-400',
  },
  {
    pct: '30%',
    title: '自动注入 LP 并黑洞销毁',
    amount: '300,000,000,000 ZHUZHU',
    desc: '认购满额后合约自动将 100% 募集 BNB 与 30% 代币添加至 PancakeSwap V2，并将 LP 直接打入 0x...dEaD。',
    accent: 'text-emerald-400',
  },
  {
    pct: '10%',
    title: '社区生态储备',
    amount: '100,000,000,000 ZHUZHU',
    desc: '用于早期生态建设、AI Agent 激励活动、流动性维护及生态合作拓展。',
    accent: 'text-sky-400',
  },
];

const FAQ_ITEMS = [
  {
    q: '为什么必须持有 .ai Agent ID（币安 AI 钱包）才能 Mint？',
    a: 'ZhuZhu 猪猪币是为 AI Agent 钱包时代设计的纯正社区实验。合约在链上直接调用 Agent ID 注册表（handleOf(address)）校验身份，防止普通批量脚本抢跑，让每个真正的 AI Agent 钱包公平拿满最多 10 份。测试网还提供一键绑定 .ai 身份按钮，方便体验。',
  },
  {
    q: '一份多少钱？单钱包最多打几份？',
    a: '每份固定 0.002 BNB，可获得 60,000,000（6,000 万）枚 $ZHUZHU。每个地址最多可认购 10 份，即打满需要 0.02 BNB，共获得 600,000,000（6 亿）枚 $ZHUZHU。全网共 10,000 份，总硬顶 20 BNB。',
  },
  {
    q: '何时开盘交易？池子和 LP 是否安全？',
    a: '当全网 10,000 份认购完成（达到 20 BNB 硬顶）时，最后一笔 Mint 交易会自动触发 PancakeSwap V2 组池并将所有募集 BNB + 30% 代币注入底池，同时把全部 LP Token 直接铸造至 0x0000...dEaD 黑洞地址永久销毁，项目方无法撤池，即时开放自由交易。',
  },
  {
    q: '持币 BNB 分红怎么计算？需要质押或锁仓吗？',
    a: '无需质押、无需锁仓。开盘后买卖税为 3%（1.5% 自动兑换成 BNB 注入分红合约，1.5% 用于社区推广）。只要钱包持币 ≥ 1,000,000 $ZHUZHU，即可按持仓比例实时累计 BNB 分红，随时在本页点击「领取累计 BNB 分红」提取至钱包。',
  },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function HomePage() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending: isConnectingQuick } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [lots, setLots] = useState<number>(1);
  const [promptLots, setPromptLots] = useState<number>(10);
  const [quickAiName, setQuickAiName] = useState<string>('zhuzhu-agent');
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [customQueryAddr, setCustomQueryAddr] = useState<string>('');
  const [botLookupAddr, setBotLookupAddr] = useState<string>('');
  const [watchAssetMsg, setWatchAssetMsg] = useState<string>('');

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;
  const isWatchMode = connector?.id === WATCH_CONNECTOR_ID;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2200);
    } catch {
      // Ignore clipboard failure in headless preview
    }
  };

  // ---- On-chain Global Reads (auto-refresh every 8s) ----
  const { data: lotsMintedData, refetch: refetchLotsMinted } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'lotsMinted',
    chainId: TARGET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  });

  const { data: mintOpenData, refetch: refetchMintOpen } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'mintOpen',
    chainId: TARGET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  });

  const { data: tradingLiveData, refetch: refetchTradingLive } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'tradingLive',
    chainId: TARGET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  });

  const { data: pairAddress } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'pair',
    chainId: TARGET_CHAIN_ID,
  });

  const { data: totalDistributedData, refetch: refetchTotalDist } = useReadContract({
    address: DIVIDEND_TRACKER_ADDRESS,
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'totalDistributed',
    chainId: TARGET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  });

  const { data: eligibleSupplyData } = useReadContract({
    address: DIVIDEND_TRACKER_ADDRESS,
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'eligibleSupply',
    chainId: TARGET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  });

  // ---- Arbitrary AI Bot Address Lookup Reads ----
  const validBotLookupAddr: Address | undefined = useMemo(() => {
    const trimmed = botLookupAddr.trim();
    return trimmed && isAddress(trimmed) ? (trimmed as Address) : undefined;
  }, [botLookupAddr]);

  const { data: botHasAgentData } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'hasAgentId',
    args: validBotLookupAddr ? [validBotLookupAddr] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(validBotLookupAddr), refetchInterval: 8000 },
  });

  const { data: botHandleData } = useReadContract({
    address: AGENT_ID_REGISTRY_ADDRESS,
    abi: AGENT_ID_REGISTRY_ABI,
    functionName: 'handleOf',
    args: validBotLookupAddr ? [validBotLookupAddr] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(validBotLookupAddr), refetchInterval: 8000 },
  });

  const { data: botMintedLotsData } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'mintedLots',
    args: validBotLookupAddr ? [validBotLookupAddr] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(validBotLookupAddr), refetchInterval: 8000 },
  });

  const { data: botTokenBalanceData } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'balanceOf',
    args: validBotLookupAddr ? [validBotLookupAddr] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(validBotLookupAddr), refetchInterval: 8000 },
  });

  // ---- Connected User Reads ----
  const { data: rawHandle, refetch: refetchHandle } = useReadContract({
    address: AGENT_ID_REGISTRY_ADDRESS,
    abi: AGENT_ID_REGISTRY_ABI,
    functionName: 'handleOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: hasAgentIdData, refetch: refetchHasAgent } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'hasAgentId',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: userMintedLotsData, refetch: refetchUserMinted } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'mintedLots',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: userTokenBalance, refetch: refetchUserTokenBal } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: nativeBalance, refetch: refetchNativeBal } = useBalance({
    address,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  // ---- Dividend Checker Reads ----
  const activeQueryAddress: Address | undefined = useMemo(() => {
    const trimmed = customQueryAddr.trim();
    if (trimmed && isAddress(trimmed)) return trimmed as Address;
    return address;
  }, [customQueryAddr, address]);

  const { data: checkedTokenBalance, refetch: refetchCheckedBal } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'balanceOf',
    args: activeQueryAddress ? [activeQueryAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(activeQueryAddress) },
  });

  const { data: checkedEligible, refetch: refetchCheckedElig } = useReadContract({
    address: DIVIDEND_TRACKER_ADDRESS,
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'isEligible',
    args: activeQueryAddress ? [activeQueryAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(activeQueryAddress) },
  });

  const { data: checkedWithdrawable, refetch: refetchCheckedWithdrawable } = useReadContract({
    address: DIVIDEND_TRACKER_ADDRESS,
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'withdrawable',
    args: activeQueryAddress ? [activeQueryAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(activeQueryAddress) },
  });

  const { data: checkedWithdrawn, refetch: refetchCheckedWithdrawn } = useReadContract({
    address: DIVIDEND_TRACKER_ADDRESS,
    abi: DIVIDEND_TRACKER_ABI,
    functionName: 'withdrawn',
    args: activeQueryAddress ? [activeQueryAddress] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(activeQueryAddress) },
  });

  // ---- Contract Writes ----
  const {
    writeContract: writeMint,
    data: mintTxHash,
    isPending: isMintPending,
    error: mintError,
    reset: resetMintError,
  } = useWriteContract();
  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } =
    useWaitForTransactionReceipt({ hash: mintTxHash, chainId: TARGET_CHAIN_ID });

  const {
    writeContract: writeRegisterAi,
    data: registerTxHash,
    isPending: isRegPending,
    error: regError,
    reset: resetRegError,
  } = useWriteContract();
  const { isLoading: isRegConfirming, isSuccess: isRegSuccess } =
    useWaitForTransactionReceipt({ hash: registerTxHash, chainId: TARGET_CHAIN_ID });

  const {
    writeContract: writeClaimDiv,
    data: claimTxHash,
    isPending: isClaimPending,
    error: claimError,
    reset: resetClaimError,
  } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } =
    useWaitForTransactionReceipt({ hash: claimTxHash, chainId: TARGET_CHAIN_ID });

  useEffect(() => {
    resetMintError();
    resetRegError();
    resetClaimError();
  }, [address, connector?.id, resetMintError, resetRegError, resetClaimError]);

  useEffect(() => {
    if (isMintSuccess || isRegSuccess || isClaimSuccess) {
      refetchLotsMinted();
      refetchMintOpen();
      refetchTradingLive();
      refetchHandle();
      refetchHasAgent();
      refetchUserMinted();
      refetchUserTokenBal();
      refetchNativeBal();
      refetchTotalDist();
      refetchCheckedBal();
      refetchCheckedElig();
      refetchCheckedWithdrawable();
      refetchCheckedWithdrawn();
    }
  }, [
    isMintSuccess,
    isRegSuccess,
    isClaimSuccess,
    refetchLotsMinted,
    refetchMintOpen,
    refetchTradingLive,
    refetchHandle,
    refetchHasAgent,
    refetchUserMinted,
    refetchUserTokenBal,
    refetchNativeBal,
    refetchTotalDist,
    refetchCheckedBal,
    refetchCheckedElig,
    refetchCheckedWithdrawable,
    refetchCheckedWithdrawn,
  ]);

  // Derived values
  const mintedCount = lotsMintedData ? Number(lotsMintedData) : 0;
  const raisedBnbDisplay = formatBnb(mintedCount * LOT_PRICE_BNB);
  const progressPct = Math.min(100, (mintedCount / TOTAL_LOTS) * 100);
  const userMinted = userMintedLotsData ? Number(userMintedLotsData) : 0;
  const remainingUserLots = Math.max(0, MAX_LOTS_PER_WALLET - userMinted);
  const remainingGlobalLots = Math.max(0, TOTAL_LOTS - mintedCount);
  const maxSelectableLots = Math.min(remainingUserLots, remainingGlobalLots);

  const formattedHandle = formatAgentHandle(rawHandle);
  const hasAgentId = Boolean(hasAgentIdData || formattedHandle);
  const mintOpen = mintOpenData ?? true;
  const tradingLive = Boolean(tradingLiveData);

  const userTokenNum = userTokenBalance
    ? Number(formatEther(userTokenBalance))
    : 0;
  const totalDistBnb = totalDistributedData
    ? Number(formatEther(totalDistributedData)).toFixed(4)
    : '0.0000';
  const eligibleSupplyDisplay = eligibleSupplyData
    ? Number(formatEther(eligibleSupplyData)).toLocaleString('en-US', {
        maximumFractionDigits: 0,
      })
    : '0';

  const checkedBalNum = checkedTokenBalance
    ? Number(formatEther(checkedTokenBalance))
    : 0;
  const withdrawableBnbNum = checkedWithdrawable
    ? Number(formatEther(checkedWithdrawable))
    : 0;
  const withdrawnBnbNum = checkedWithdrawn
    ? Number(formatEther(checkedWithdrawn))
    : 0;

  const costBnbExact = (lots * LOT_PRICE_BNB).toFixed(3);
  const costBnbStr = formatBnb(lots * LOT_PRICE_BNB);
  const expectedTokensStr = (lots * TOKENS_PER_LOT).toLocaleString('en-US');

  // Ensure lots selector clamps cleanly if remaining cap shrinks
  useEffect(() => {
    if (maxSelectableLots > 0 && lots > maxSelectableLots) {
      setLots(maxSelectableLots);
    }
  }, [maxSelectableLots, lots]);

  const cleanQuickHandle = quickAiName.trim().replace(/\.ai$/i, '');

  const handleRegisterTestnetAi = async () => {
    if (!address || cleanQuickHandle.length < 2) return;
    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        return;
      }
    }
    writeRegisterAi({
      address: AGENT_ID_REGISTRY_ADDRESS,
      abi: AGENT_ID_REGISTRY_ABI,
      functionName: 'register',
      args: [cleanQuickHandle],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleMint = async () => {
    resetMintError();
    if (!isConnected || lots <= 0) return;
    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        return;
      }
    }
    writeMint({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'mint',
      args: [BigInt(lots)],
      value: parseEther(costBnbExact),
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleClaimDividends = async () => {
    if (!isConnected) return;
    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        return;
      }
    }
    writeClaimDiv({
      address: DIVIDEND_TRACKER_ADDRESS,
      abi: DIVIDEND_TRACKER_ABI,
      functionName: 'claim',
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleWatchBotAddress = () => {
    if (!validBotLookupAddr) return;
    setWatchAddress(validBotLookupAddr);
    connectQuickWallet({
      connectors,
      connectAsync,
      disconnectAsync,
      connectorId: WATCH_CONNECTOR_ID,
      watchAddress: validBotLookupAddr,
    });
  };

  const handleAddTokenToWallet = async () => {
    setWatchAssetMsg('');
    const eth = (
      window as unknown as {
        ethereum?: { request?: (args: { method: string; params?: unknown }) => Promise<unknown> };
      }
    ).ethereum;
    if (!eth?.request) {
      setWatchAssetMsg('未检测到钱包插件，请复制上方代币合约地址手动导入');
      return;
    }
    try {
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: ZHUZHU_TOKEN_ADDRESS,
            symbol: 'ZHUZHU',
            decimals: 18,
          },
        },
      });
      setWatchAssetMsg('✓ 已向钱包弹出添加 $ZHUZHU 请求');
    } catch {
      setWatchAssetMsg('已取消或当前钱包不支持一键添加，可手动导入合约地址');
    }
  };

  const promptCostBnb = formatBnb(promptLots * LOT_PRICE_BNB);
  const promptValueWei = parseEther((promptLots * LOT_PRICE_BNB).toFixed(4)).toString();
  const promptMintCalldata = useMemo(
    () =>
      encodeFunctionData({
        abi: ZHUZHU_ABI,
        functionName: 'mint',
        args: [BigInt(promptLots)],
      }),
    [promptLots]
  );

  const aiPromptText = useMemo(() => buildAiMintPrompt(promptLots), [promptLots]);
  const heroMaxBotPromptText = useMemo(() => buildAiMintPrompt(10), []);
  const aiClaimPromptText = useMemo(() => buildAiClaimPrompt(), []);
  const botFormattedHandle = formatAgentHandle(botHandleData);
  const botHasAgentId = Boolean(botHasAgentData || botFormattedHandle);
  const botMintedLotsNum = botMintedLotsData ? Number(botMintedLotsData) : 0;
  const botTokenBalNum = botTokenBalanceData ? Number(formatEther(botTokenBalanceData)) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-24 px-4 py-10 md:py-14">
      {/* ==================== HERO SECTION ==================== */}
      <section className="relative overflow-hidden rounded-3xl border border-pig-500/25 bg-gradient-to-br from-pig-500/15 via-[#13131d] to-[#0b0b10] p-7 md:p-12">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-pig-400/35 bg-pig-500/15 px-3.5 py-1 text-xs font-semibold text-pig-300">
              <span>🤖 币安 AI 钱包 (.ai Agent ID) 专属实验</span>
              <span className="text-white/30">|</span>
              <span>zhuzhubi.xyz</span>
              <span className="text-white/30">|</span>
              <span>{TARGET_CHAIN_ID === 97 ? 'BSC Testnet' : 'BNB Chain'}</span>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
              猪猪币 <span className="text-pig-400">$ZHUZHU</span>
            </h1>

            <p className="text-lg font-semibold text-pig-200 md:text-xl">
              一份 0.002 BNB · 单地址打满 10 份（0.02 BNB）· 持币躺平享 BNB 分红
            </p>

            <p className="max-w-xl text-sm leading-relaxed text-slate-300 md:text-base">
              专为币安 AI 钱包（<code className="rounded bg-white/10 px-1.5 py-0.5 text-pig-300">.ai</code>{' '}
              Agent ID）打造的公平发射 Meme：总量 10,000 亿枚，每份{' '}
              <strong className="text-white">0.002 BNB</strong>（得 6,000 万枚），最高{' '}
              <strong className="text-white">10 份（0.02 BNB = 6 亿枚）</strong>。10,000 份打满即自动组 PancakeSwap V2 LP 并永久打入黑洞销毁，3% 税率持续为持币人派发 BNB 分红。
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => copyText('hero-bot-prompt', heroMaxBotPromptText)}
                className="rounded-2xl bg-pig-500 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-pig-500/25 transition hover:bg-pig-600"
              >
                {copiedKey === 'hero-bot-prompt'
                  ? '✓ 已复制 AI 打满口令！快发给币安 AI 钱包'
                  : '🤖 一键复制 AI 机器人打满口令 (10份 / 0.02 BNB)'}
              </button>
              <a
                href="#mint"
                className="rounded-2xl border border-pig-400/35 bg-pig-500/10 px-5 py-3 text-sm font-bold text-pig-200 transition hover:bg-pig-500/20"
              >
                🐷 手动钱包 Mint
              </a>
              <a
                href="#agent-mint"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                🧾 Calldata / 高级指令
              </a>
              <a
                href="#rewards"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                💰 查分红
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>🤖 AI Agent 协议文档：</span>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-emerald-300 hover:bg-white/10"
              >
                /llms.txt ↗
              </a>
              <a
                href="/agent.json"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-sky-300 hover:bg-white/10"
              >
                /agent.json ↗
              </a>
            </div>
          </div>

          {/* Right Live Stats Bento */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs text-slate-400">当前认购进度</p>
              <p className="mt-1.5 text-2xl font-extrabold text-white">
                {mintedCount.toLocaleString()}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {TOTAL_LOTS.toLocaleString()} 份
                </span>
              </p>
              <p className="mt-1 text-xs text-pig-300">已募 {raisedBnbDisplay} / 20 BNB</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs text-slate-400">单份固定价格</p>
              <p className="mt-1.5 text-2xl font-extrabold text-pig-400">0.002 BNB</p>
              <p className="mt-1 text-xs text-slate-300">每份得 60,000,000 枚</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs text-slate-400">单地址打满上限</p>
              <p className="mt-1.5 text-2xl font-extrabold text-white">
                10 份 <span className="text-sm font-semibold text-emerald-400">(0.02 BNB)</span>
              </p>
              <p className="mt-1 text-xs text-slate-300">打满获 600,000,000 枚</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs text-slate-400">分红池累计派发</p>
              <p className="mt-1.5 text-2xl font-extrabold text-amber-300">{totalDistBnb} BNB</p>
              <p className="mt-1 text-xs text-slate-300">持币 ≥ 100 万枚自动分红</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTION 01: COMMUNITY MINT ==================== */}
      <section id="mint" className="scroll-mt-20 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-xs font-bold tracking-widest text-pig-400">
              01 — COMMUNITY MINT
            </span>
            <h2 className="mt-1 text-3xl font-extrabold">币安 AI 钱包专属社区认购</h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              tradingLive
                ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : mintOpen
                  ? 'border border-pig-500/40 bg-pig-500/15 text-pig-300'
                  : 'border border-slate-500/40 bg-white/5 text-slate-300'
            }`}
          >
            {tradingLive ? '● 已打满开盘交易中 (LP 已销毁)' : mintOpen ? '● 认购进行中 Mint Open' : '○ 认购已结束'}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          {/* Left: Rules & Verified Contracts */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h3 className="text-base font-bold text-white">认购规则一览</h3>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pig-500/20 text-xs font-bold text-pig-400">
                    01
                  </span>
                  <p>
                    <strong className="text-white">仅限币安 AI 钱包（.ai Agent ID）</strong>
                    ：合约通过 <code className="rounded bg-white/10 px-1 text-xs">hasAgentId()</code> 自动校验证书，未绑定 <code className="rounded bg-white/10 px-1 text-xs">.ai</code> 的钱包无法抢跑。
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pig-500/20 text-xs font-bold text-pig-400">
                    02
                  </span>
                  <p>
                    <strong className="text-white">0.002 BNB / 份，单地址打满 10 份</strong>
                    ：每份 0.002 BNB 获得 6,000 万枚 $ZHUZHU；打满 10 份（0.02 BNB）直接获得 6 亿枚，全网共 10,000 份（20 BNB 硬顶）。
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-pig-500/20 text-xs font-bold text-pig-400">
                    03
                  </span>
                  <p>
                    <strong className="text-white">满额自动组池，LP 永久黑洞销毁</strong>
                    ：第 10,000 份铸造完成瞬间，合约自动注入 100% 募集 BNB + 30% 代币到 PancakeSwap V2，并将 LP Token 直接销毁至黑洞地址。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-200">链上开源已验证合约地址</h3>
              {[
                { label: 'ZHUZHU 主合约', addr: ZHUZHU_TOKEN_ADDRESS },
                { label: 'Agent ID 注册表', addr: AGENT_ID_REGISTRY_ADDRESS },
                { label: 'BNB 分红追踪器', addr: DIVIDEND_TRACKER_ADDRESS },
                { label: 'LP 销毁黑洞地址', addr: DEAD_ADDRESS },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs"
                >
                  <span className="text-slate-400">{item.label}</span>
                  <div className="flex items-center gap-2 font-mono text-slate-200">
                    <span>{shortAddr(item.addr)}</span>
                    <button
                      onClick={() => copyText(item.label, item.addr)}
                      className="rounded bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20"
                    >
                      {copiedKey === item.label ? '已复制 ✓' : '复制'}
                    </button>
                    <a
                      href={`${EXPLORER}/address/${item.addr}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-pig-400 hover:underline"
                    >
                      浏览器 ↗
                    </a>
                  </div>
                </div>
              ))}
              {pairAddress &&
                pairAddress !== '0x0000000000000000000000000000000000000000' && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    <span>PancakeSwap V2 Pair</span>
                    <a
                      href={`${EXPLORER}/address/${pairAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono underline"
                    >
                      {shortAddr(pairAddress)} ↗
                    </a>
                  </div>
                )}

              <div className="border-t border-white/10 pt-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleAddTokenToWallet}
                    className="rounded-xl border border-pig-500/35 bg-pig-500/15 px-3 py-1.5 text-xs font-bold text-pig-200 hover:bg-pig-500/25"
                  >
                    ➕ 添加 $ZHUZHU 到钱包
                  </button>
                  <a
                    href={`https://pancakeswap.finance/swap?chain=${TARGET_CHAIN_ID === 97 ? 'bscTestnet' : 'bsc'}&outputCurrency=${ZHUZHU_TOKEN_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    🥞 PancakeSwap ↗
                  </a>
                  <a
                    href={`https://ave.ai/token/${ZHUZHU_TOKEN_ADDRESS}-bsc`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    📈 Ave.ai 看线 ↗
                  </a>
                  <a
                    href={`https://dexscreener.com/bsc/${ZHUZHU_TOKEN_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    📊 DexScreener ↗
                  </a>
                </div>
                {watchAssetMsg && (
                  <p className="text-[11px] text-emerald-300">{watchAssetMsg}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Interactive Mint Panel */}
          <div className="rounded-3xl border border-pig-500/25 bg-[#12121b] p-6 space-y-5 shadow-xl shadow-black/40">
            {/* Step 1: Wallet & AI ID Verification Status */}
            {!isConnected ? (
              <div className="rounded-2xl border border-pig-500/30 bg-pig-500/10 p-4 space-y-3">
                <p className="text-sm font-bold text-pig-200">
                  主要用 AI 机器人打新？可直接{' '}
                  <a href="#agent-mint" className="underline text-pig-300">
                    复制 AI 指令发给币安 AI 钱包
                  </a>
                  ，或手动连接钱包：
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openConnectModal?.()}
                    className="rounded-xl bg-pig-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-pig-600"
                  >
                    🔌 连接插件 / 币安钱包
                  </button>
                  <button
                    onClick={() =>
                      connectQuickWallet({
                        connectors,
                        connectAsync,
                        disconnectAsync,
                        connectorId: WATCH_CONNECTOR_ID,
                        watchAddress: DEFAULT_WATCH_ADDRESS,
                      })
                    }
                    disabled={isConnectingQuick}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                  >
                    👀 查示例 AI 钱包 (0x7b30...a1b8)
                  </button>
                  {HAS_BUILTIN_SIGNER && (
                    <button
                      onClick={() =>
                        connectQuickWallet({
                          connectors,
                          connectAsync,
                          disconnectAsync,
                          connectorId: SIGNER_CONNECTOR_ID,
                        })
                      }
                      disabled={isConnectingQuick}
                      className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      ⚡ 切入本地签名测试钱包
                    </button>
                  )}
                </div>
              </div>
            ) : isWrongChain ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/15 p-4 text-xs">
                <span className="font-semibold text-red-200">
                  钱包当前网络不匹配，请切换至 {NETWORK_LABEL}
                </span>
                <button
                  onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                  disabled={isSwitching}
                  className="rounded-xl bg-red-500 px-3.5 py-1.5 font-bold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {isSwitching ? '切换中...' : '立即切换网络'}
                </button>
              </div>
            ) : hasAgentId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-emerald-300">
                    ✓ 核验通过 · {formattedHandle || '已认证 AI 钱包'}
                  </p>
                  <p className="text-xs text-slate-300 font-mono">{shortAddr(address!)}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-slate-400">可用 BNB 余额</p>
                  <p className="font-bold text-white">
                    {nativeBalance
                      ? `${Number(formatEther(nativeBalance.value)).toFixed(4)} BNB`
                      : '--'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                <p className="text-xs font-bold text-amber-200">
                  未检测到当前钱包的 .ai Agent ID（币安 AI 钱包凭证）
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={quickAiName}
                    onChange={(e) => setQuickAiName(e.target.value)}
                    placeholder="输入名称如 zhuzhu-bot"
                    className="flex-1 min-w-[160px] rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none focus:border-pig-500"
                  />
                  <span className="text-xs text-slate-400">.ai</span>
                  <button
                    onClick={handleRegisterTestnetAi}
                    disabled={cleanQuickHandle.length < 2 || isRegPending || isRegConfirming}
                    className="rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-40"
                  >
                    {isRegPending || isRegConfirming ? '绑定中...' : '测试网免费绑定 .ai'}
                  </button>
                </div>
                {regError && (
                  <p className="text-xs text-red-400">{formatContractError(regError)}</p>
                )}
              </div>
            )}

            {/* Quick AI Bot Address Inspector */}
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-200">
                  🤖 查 AI 机器人钱包状态（免连钱包）
                </span>
                <button
                  onClick={() => setBotLookupAddr(DEFAULT_WATCH_ADDRESS)}
                  className="text-[11px] text-sky-300 hover:underline"
                >
                  填入示例 AI 地址
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={botLookupAddr}
                  onChange={(e) => setBotLookupAddr(e.target.value)}
                  placeholder="粘贴 AI 钱包 0x 地址，查 .ai 认证 / 已打份数 / 余额..."
                  className="flex-1 min-w-[200px] rounded-xl border border-white/15 bg-black/55 px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-pig-500"
                />
                {validBotLookupAddr && (
                  <button
                    onClick={handleWatchBotAddress}
                    className="rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                  >
                    设为顶部监控
                  </button>
                )}
              </div>
              {botLookupAddr.trim() && !validBotLookupAddr && (
                <p className="text-[11px] text-red-400">请输入有效的 BSC 0x 钱包地址</p>
              )}
              {validBotLookupAddr && (
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/50 p-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">.ai 身份</span>
                    <span className={botHasAgentId ? 'font-bold text-emerald-300' : 'text-amber-300'}>
                      {botHasAgentId ? `✓ ${botFormattedHandle || '已认证'}` : '未注册（可自动注册）'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">已打份数</span>
                    <span className="font-bold text-white">
                      {botMintedLotsNum} / {MAX_LOTS_PER_WALLET} 份
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">$ZHUZHU 持仓</span>
                    <span className="font-bold text-pig-300">
                      {botTokenBalNum.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Progress Bar & Personal Quota */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">全网认购进度</span>
                <span className="font-bold text-white">
                  {mintedCount.toLocaleString()} / {TOTAL_LOTS.toLocaleString()} 份 ({raisedBnbDisplay} / 20 BNB)
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pig-500 to-pig-400 transition-all duration-500"
                  style={{ width: `${Math.max(progressPct, mintedCount > 0 ? 1.5 : 0)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  我的额度：已购{' '}
                  <strong className="text-white">{userMinted}</strong> / {MAX_LOTS_PER_WALLET} 份
                  {remainingUserLots > 0 ? `（还可买 ${remainingUserLots} 份）` : '（已打满 10 份上限）'}
                </span>
                <span>
                  持有：<strong className="text-pig-300">{userTokenNum.toLocaleString('en-US', { maximumFractionDigits: 0 })} ZHUZHU</strong>
                </span>
              </div>
            </div>

            {/* Step 3: Share Selector */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/35 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">选择认购份数</span>
                <span className="text-xs text-pig-300">0.002 BNB / 份 · 最多 10 份</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLots((v) => Math.max(1, v - 1))}
                  disabled={lots <= 1}
                  className="h-11 w-11 rounded-xl border border-white/15 bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 rounded-xl border border-white/10 bg-black/50 py-2.5 text-center">
                  <span className="text-2xl font-black text-white">{lots}</span>
                  <span className="ml-1.5 text-xs text-slate-400">份</span>
                </div>
                <button
                  onClick={() => setLots((v) => Math.min(Math.max(1, maxSelectableLots), v + 1))}
                  disabled={lots >= Math.max(1, maxSelectableLots)}
                  className="h-11 w-11 rounded-xl border border-white/15 bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-30"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[1, 3, 5, 10].map((preset, idx) => {
                  const isFillSlot = preset === 10;
                  const fillRemainder = maxSelectableLots > 0 && maxSelectableLots < 10;
                  const targetLots = isFillSlot && fillRemainder ? maxSelectableLots : preset;
                  const disabled = maxSelectableLots > 0 ? targetLots > maxSelectableLots : isConnected;
                  const active = lots === targetLots && (!isFillSlot || !fillRemainder || idx === 3);
                  const label =
                    isFillSlot && fillRemainder
                      ? `打满余下 ${targetLots} 份`
                      : preset === 10
                        ? '打满 10 份'
                        : `${targetLots} 份`;
                  return (
                    <button
                      key={idx}
                      onClick={() => !disabled && setLots(targetLots)}
                      disabled={disabled}
                      className={`rounded-xl border py-2 text-xs font-bold transition ${
                        active
                          ? 'border-pig-500 bg-pig-500/20 text-pig-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-30'
                      }`}
                    >
                      {label}
                      <span className="block text-[10px] font-normal text-slate-400">
                        {formatBnb(targetLots * LOT_PRICE_BNB)} BNB
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5 border-t border-white/10 pt-3 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>需支付金额</span>
                  <span className="font-bold text-white">{costBnbStr} BNB</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>预计获得代币</span>
                  <span className="font-bold text-pig-300">{expectedTokensStr} ZHUZHU</span>
                </div>
              </div>
            </div>

            {/* Step 4: Submit Mint */}
            <button
              onClick={() => {
                if (!isConnected || isWatchMode) {
                  openConnectModal?.();
                  return;
                }
                handleMint();
              }}
              disabled={
                isConnected &&
                !isWatchMode &&
                (!hasAgentId ||
                  !mintOpen ||
                  maxSelectableLots <= 0 ||
                  isMintPending ||
                  isMintConfirming)
              }
              className="w-full rounded-2xl bg-pig-500 py-4 text-sm font-extrabold text-white shadow-lg shadow-pig-500/25 transition hover:bg-pig-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!isConnected
                ? '🔌 连接币安 AI 钱包 / 浏览器钱包'
                : isWatchMode
                  ? '👀 当前为只读监控 · 点击连接真实钱包或使用下方 AI 口令'
                  : !mintOpen
                    ? '认购已结束'
                    : remainingUserLots <= 0
                      ? '当前钱包已打满 10 份上限（0.02 BNB）'
                      : !hasAgentId
                        ? '请先完成上方 .ai Agent ID 核验'
                        : isMintPending
                          ? '请在钱包中确认签名...'
                          : isMintConfirming
                            ? '链上交易确认中...'
                            : `立即认购 ${lots} 份（支付 ${costBnbStr} BNB）`}
            </button>

            {isWatchMode && remainingUserLots > 0 && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200 space-y-2">
                <p>
                  当前为只读 AI 钱包监控模式（{address ? shortAddr(address) : '--'}），可直接复制上方 / 下方的{' '}
                  <a href="#agent-mint" className="underline font-bold">
                    AI Mint 口令
                  </a>{' '}
                  发给你的币安 AI 钱包执行自动认购，或在插件钱包浏览器点击「连接钱包」签名。
                </p>
                {HAS_BUILTIN_SIGNER && BUILTIN_SIGNER_ADDRESS && (
                  <button
                    onClick={() =>
                      connectQuickWallet({
                        connectors,
                        connectAsync,
                        disconnectAsync,
                        connectorId: SIGNER_CONNECTOR_ID,
                      })
                    }
                    className="rounded-lg bg-sky-500/25 px-3 py-1 font-bold text-sky-100 hover:bg-sky-500/35"
                  >
                    ⚡ 切换至内置测试钱包 ({shortAddr(BUILTIN_SIGNER_ADDRESS)}) 实操上链 Mint
                  </button>
                )}
              </div>
            )}

            {mintError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                {formatContractError(mintError)}
              </div>
            )}

            {isMintSuccess && mintTxHash && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <div>
                  ✓ 认购成功！$ZHUZHU 已实时发放至您的钱包。
                  <a
                    href={`${EXPLORER}/tx/${mintTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 underline"
                  >
                    查看链上交易 ↗
                  </a>
                </div>
                <button
                  onClick={handleAddTokenToWallet}
                  className="rounded-lg bg-emerald-500/25 px-2.5 py-1 font-bold text-emerald-100 hover:bg-emerald-500/35"
                >
                  ➕ 添加 $ZHUZHU 到钱包
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================== SECTION 02: AI MINT 口令 ==================== */}
      <section id="agent-mint" className="scroll-mt-20 space-y-6">
        <div>
          <span className="text-xs font-bold tracking-widest text-pig-400">02 — AI MINT</span>
          <h2 className="mt-1 text-3xl font-extrabold">把口令发给你的币安 AI 钱包，让它自己去打新</h2>
          <p className="mt-2 text-sm text-slate-400">
            无需手动折腾签名交互——直接复制下方结构化指令发送给你的 Binance Agentic Wallet AI 助手，确认金额后即可自动完成链上认购。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: 'STEP 01',
              title: '自动检查并注册 .ai ID',
              desc: '即使币安 AI 钱包尚未注册 .ai Agent ID，AI 也会自动先免手续费调用 AgentIdRegistry 注册（只需极少 Gas）。',
            },
            {
              step: 'STEP 02',
              title: '选择份数并复制 AI 口令',
              desc: '默认按单钱包上限 10 份（0.02 BNB）生成，包含精确 wei 金额、Raw Calldata 与 /agent.json 清单地址。',
            },
            {
              step: 'STEP 03',
              title: '发给 AI 助手全自动上链',
              desc: 'AI 机器人会先只读核验 mintOpen 与剩余额度，再自动完成 register + mint 认购或 claim 领取 BNB 分红。',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2"
            >
              <span className="text-xs font-bold text-pig-400">{item.step}</span>
              <h3 className="font-bold text-white">{item.title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-pig-500/25 bg-[#12121b] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-300">口令目标认购份数：</span>
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setPromptLots(n)}
                  className={`rounded-xl border px-3 py-1 text-xs font-bold transition ${
                    promptLots === n
                      ? 'border-pig-500 bg-pig-500/20 text-pig-300'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {n === 10
                    ? '打满 10 份 (0.02 BNB)'
                    : `${n} 份 (${formatBnb(n * LOT_PRICE_BNB)} BNB)`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => copyText('ai-prompt', aiPromptText)}
                className="rounded-xl bg-pig-500 px-4 py-2 text-xs font-bold text-white shadow hover:bg-pig-600"
              >
                {copiedKey === 'ai-prompt' ? '✓ 已复制 AI Mint 口令' : '📋 一键复制 AI Mint 口令'}
              </button>
              <button
                onClick={() => copyText('ai-claim-prompt', aiClaimPromptText)}
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25"
              >
                {copiedKey === 'ai-claim-prompt'
                  ? '✓ 已复制 AI 领分红口令'
                  : '🎁 复制 AI 领分红 (claim) 口令'}
              </button>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/60 p-4 text-xs leading-relaxed text-emerald-300 font-mono">
            {aiPromptText}
          </pre>

          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200">
                ⚡ 机器人直连交易参数（Raw Calldata / Bot Payload）
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyText('raw-calldata', promptMintCalldata)}
                  className="rounded-lg border border-pig-500/35 bg-pig-500/15 px-3 py-1 font-semibold text-pig-200 hover:bg-pig-500/25"
                >
                  {copiedKey === 'raw-calldata' ? '✓ 已复制 Calldata' : '🧾 复制 Raw Calldata (Hex)'}
                </button>
                <button
                  onClick={() =>
                    copyText(
                      'tx-json',
                      JSON.stringify(
                        {
                          chainId: TARGET_CHAIN_ID,
                          to: ZHUZHU_TOKEN_ADDRESS,
                          valueWei: promptValueWei,
                          valueBnb: promptCostBnb,
                          data: promptMintCalldata,
                        },
                        null,
                        2
                      )
                    )
                  }
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 font-semibold text-slate-200 hover:bg-white/10"
                >
                  {copiedKey === 'tx-json' ? '✓ 已复制 JSON' : '📋 复制交易 JSON'}
                </button>
              </div>
            </div>
            <div className="grid gap-1.5 font-mono text-[11px] text-slate-300 sm:grid-cols-2">
              <div className="truncate">
                <span className="text-slate-500">to: </span>
                {ZHUZHU_TOKEN_ADDRESS}
              </div>
              <div>
                <span className="text-slate-500">value: </span>
                {promptValueWei} wei ({promptCostBnb} BNB)
              </div>
              <div className="sm:col-span-2 truncate">
                <span className="text-slate-500">data: </span>
                <span className="text-emerald-300">{promptMintCalldata}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
              <span>机器可读端点（OpenClaw / AgentKit / MCP 直接读取）：</span>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-emerald-300 underline"
              >
                https://www.zhuzhubi.xyz/llms.txt ↗
              </a>
              <a
                href="/agent.json"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sky-300 underline"
              >
                https://www.zhuzhubi.xyz/agent.json ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTION 03: TOKENOMICS ==================== */}
      <section id="tokenomics" className="scroll-mt-20 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-xs font-bold tracking-widest text-pig-400">
              03 — TOKENOMICS
            </span>
            <h2 className="mt-1 text-3xl font-extrabold">代币经济与 3% 交易分红税</h2>
          </div>
          <span className="text-xs text-slate-400">固定总量 1,000,000,000,000 $ZHUZHU · 无任何增发权限</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {TOKENOMICS_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-3"
            >
              <p className={`text-4xl font-black ${card.accent}`}>{card.pct}</p>
              <div>
                <h3 className="text-lg font-bold text-white">{card.title}</h3>
                <p className="mt-1 font-mono text-xs text-slate-300">{card.amount}</p>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{card.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-amber-300">持币自动 BNB 分红（买入/卖出 1.5%）</p>
              <p className="mt-1 text-xs text-slate-400">
                开盘后每笔 DEX 交易提取 1.5% 自动兑换成 BNB 注入分红追踪合约，持仓 ≥ 1,000,000 $ZHUZHU 按比例实时瓜分。
              </p>
            </div>
            <span className="text-3xl font-black text-amber-300 shrink-0">1.5%</span>
          </div>
          <div className="rounded-2xl border border-pig-500/25 bg-pig-500/5 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-pig-300">社区建设与推广（买入/卖出 1.5%）</p>
              <p className="mt-1 text-xs text-slate-400">
                1.5% 税率自动转化并注入社区金库，持续用于节点维护、社区活动推广及长线增长。
              </p>
            </div>
            <span className="text-3xl font-black text-pig-400 shrink-0">1.5%</span>
          </div>
        </div>
      </section>

      {/* ==================== SECTION 04: HOLD & SHARE REWARDS ==================== */}
      <section id="rewards" className="scroll-mt-20 space-y-6">
        <div>
          <span className="text-xs font-bold tracking-widest text-pig-400">
            04 — HOLD & SHARE
          </span>
          <h2 className="mt-1 text-3xl font-extrabold">持币躺平 · 查询与领取 BNB 分红</h2>
          <p className="mt-2 text-sm text-slate-400">
            输入任意钱包地址或使用当前连接地址，实时查看分红资格、累计可领 BNB，并一键提取至钱包。
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#12121b] p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={customQueryAddr}
              onChange={(e) => setCustomQueryAddr(e.target.value)}
              placeholder={
                address
                  ? `当前查询已连接地址：${address}`
                  : '粘贴任意 0x BSC 地址查询可领 BNB 分红...'
              }
              className="flex-1 min-w-[240px] rounded-xl border border-white/15 bg-black/50 px-4 py-2.5 text-xs font-mono text-white outline-none focus:border-pig-500"
            />
            {BUILTIN_SIGNER_ADDRESS && (
              <button
                onClick={() => setCustomQueryAddr(BUILTIN_SIGNER_ADDRESS ?? '')}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
              >
                查测试首单地址 ({shortAddr(BUILTIN_SIGNER_ADDRESS)})
              </button>
            )}
            {customQueryAddr && (
              <button
                onClick={() => setCustomQueryAddr('')}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
              >
                恢复当前钱包
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs text-slate-400">查询钱包持仓</p>
              <p className="mt-1.5 text-xl font-bold text-white">
                {activeQueryAddress
                  ? `${checkedBalNum.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  : '--'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">$ZHUZHU（门槛 1,000,000）</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs text-slate-400">分红资格状态</p>
              <p
                className={`mt-1.5 text-xl font-bold ${
                  !activeQueryAddress
                    ? 'text-slate-400'
                    : checkedEligible
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                }`}
              >
                {!activeQueryAddress ? '--' : checkedEligible ? '✓ 已达标享受分红' : '未达 100 万门槛'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">全网参与分红：{eligibleSupplyDisplay} 枚</p>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs text-amber-200">当前可领 BNB 分红</p>
              <p className="mt-1.5 text-xl font-extrabold text-amber-300">
                {activeQueryAddress ? `${withdrawableBnbNum.toFixed(6)} BNB` : '--'}
              </p>
              <p className="mt-1 text-[11px] text-slate-300">实时到账 · 无手续费</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs text-slate-400">该地址已累计领取</p>
              <p className="mt-1.5 text-xl font-bold text-white">
                {activeQueryAddress ? `${withdrawnBnbNum.toFixed(6)} BNB` : '--'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">历史累计提取</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
            <p className="text-xs text-slate-400">
              {activeQueryAddress
                ? `当前查询：${activeQueryAddress}`
                : '连接钱包或输入任意 BSC 地址即可查看分红明细'}
            </p>
            <button
              onClick={handleClaimDividends}
              disabled={
                !isConnected ||
                isWrongChain ||
                isClaimPending ||
                isClaimConfirming ||
                Boolean(customQueryAddr && customQueryAddr.toLowerCase() !== address?.toLowerCase()) ||
                withdrawableBnbNum <= 0
              }
              className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isClaimPending || isClaimConfirming
                ? '领取交易确认中...'
                : '🎁 领取累计 BNB 分红'}
            </button>
          </div>

          {claimError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              {formatContractError(claimError)}
            </div>
          )}

          {isClaimSuccess && claimTxHash && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              ✓ BNB 分红已成功发放至您的钱包！
              <a
                href={`${EXPLORER}/tx/${claimTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline"
              >
                查看交易详情 ↗
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ==================== SECTION 05: FAQ ==================== */}
      <section id="faq" className="scroll-mt-20 space-y-6">
        <div>
          <span className="text-xs font-bold tracking-widest text-pig-400">05 — FAQ</span>
          <h2 className="mt-1 text-3xl font-extrabold">常见问题解答</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-2"
            >
              <h3 className="text-base font-bold text-white">{item.q}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
