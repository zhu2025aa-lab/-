'use client';

import { useEffect, useState } from 'react';
import { formatEther, parseEther, isAddress } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  TARGET_CHAIN_ID,
  ZHUZHU_ABI,
  ZHUZHU_TOKEN_ADDRESS,
  formatContractError,
} from '@/lib/contracts';
import {
  DEFAULT_WATCH_ADDRESS,
  HAS_BUILTIN_SIGNER,
  SIGNER_CONNECTOR_ID,
  WATCH_CONNECTOR_ID,
  connectQuickWallet,
} from '@/lib/wagmi';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

export default function MintPage() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending: isConnectingQuick } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [packs, setPacks] = useState(1);
  const [refInput, setRefInput] = useState('');
  const [agentName, setAgentName] = useState('my-pig.ai');
  const [watchAddrInput, setWatchAddrInput] = useState<string>(DEFAULT_WATCH_ADDRESS);
  const [copied, setCopied] = useState(false);

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;
  const isWatchMode = connector?.id === WATCH_CONNECTOR_ID;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && isAddress(ref)) setRefInput(ref);
  }, []);

  const { data: isAgentWallet, refetch: refetchAgentStatus } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isAgentWallet',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: myAgentId, refetch: refetchAgentId } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'agentIdOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: packsSold, refetch: refetchSold } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'packsSold',
    chainId: TARGET_CHAIN_ID,
  });
  const { data: packsOf, refetch: refetchMine } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'packsOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const { data: refReward, refetch: refetchRef } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'refRewards',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const { data: tradingOpen, refetch: refetchTrading } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'tradingOpen',
    chainId: TARGET_CHAIN_ID,
  });
  const { data: mintEnd } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'mintEnd',
    chainId: TARGET_CHAIN_ID,
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: TARGET_CHAIN_ID,
  });

  useEffect(() => {
    if (isSuccess) {
      refetchAgentStatus();
      refetchAgentId();
      refetchSold();
      refetchMine();
      refetchRef();
      refetchTrading();
    }
  }, [
    isSuccess,
    refetchAgentId,
    refetchAgentStatus,
    refetchMine,
    refetchRef,
    refetchSold,
    refetchTrading,
  ]);

  const sold = packsSold ? Number(packsSold) : 0;
  const mine = packsOf ? Number(packsOf) : 0;
  const maxRemainingForWallet = Math.max(0, 10 - mine);
  const effectivePacks = maxRemainingForWallet === 0 ? 0 : Math.min(packs, maxRemainingForWallet);
  const progressPct = Math.min(100, (sold / 10_000) * 100);
  const costBnb = (effectivePacks * 0.01).toFixed(2);
  const validAiId = agentName.trim().toLowerCase().endsWith('.ai') && agentName.trim().length >= 4;
  const canLaunch =
    !tradingOpen &&
    sold > 0 &&
    (sold >= 10_000 || (mintEnd !== undefined && Date.now() / 1000 >= Number(mintEnd)));

  const ensureTargetChain = async () => {
    if (!isWrongChain) return true;
    try {
      await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      return true;
    } catch {
      return false;
    }
  };

  const handleActivateAgent = async () => {
    if (!validAiId || !(await ensureTargetChain())) return;
    writeContract({
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'activateAgentWallet',
      args: [agentName.trim(), BigInt(0), '0x'],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleMint = async () => {
    if (effectivePacks <= 0 || !(await ensureTargetChain())) return;
    const ref = isAddress(refInput) ? refInput : ZERO_ADDR;
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'mintPacks',
      args: [BigInt(effectivePacks), ref],
      value: parseEther((effectivePacks * 0.01).toString()),
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleLaunch = async () => {
    if (!(await ensureTargetChain())) return;
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'launch',
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleClaimRef = async () => {
    if (!(await ensureTargetChain())) return;
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'claimRefReward',
      chainId: TARGET_CHAIN_ID,
    });
  };

  const shareUrl =
    typeof window !== 'undefined' && address
      ? `${window.location.origin}/mint?ref=${address}`
      : '';

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-pig-400">
          Pack Mint · 仅限 BSC AI Agent 钱包
        </span>
        <h1 className="text-3xl font-extrabold">
          {tradingOpen ? '已开盘 · Trading Open' : '猪圈开放中 · Pig Pen Open'}
        </h1>
        <p className="text-sm text-slate-400">
          每 Pack = 1,000 ZHUZHU，价格 0.01 BNB，每个钱包最多 10 Pack。80% BNB 直接加池并永久销毁 LP；无推荐人时 5% 推荐金 100% 自动注入回购销毁池。
        </p>
      </div>

      {/* Direct Connect Card for Built-In Browser (No Extension / No QR Needed) */}
      {!address && (
        <div className="rounded-2xl border border-sky-500/35 bg-sky-500/10 p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="font-bold text-sky-200">
              🔌 免扫码快速连接钱包（内置浏览器专用）
            </h2>
            <p className="text-xs text-slate-300">
              如果当前浏览器未安装 MetaMask / Binance Wallet 插件，无需扫码可直接输入钱包地址查看链上状态，或一键接入内置测试网 AI Agent 钱包直接签名发交易。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={watchAddrInput}
              onChange={(e) => setWatchAddrInput(e.target.value)}
              placeholder="输入 0x 钱包地址..."
              className="flex-1 min-w-[240px] rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-xs font-mono text-white outline-none focus:border-sky-400"
            />
            <button
              onClick={() =>
                connectQuickWallet({
                  connectors,
                  connectAsync,
                  disconnectAsync,
                  connectorId: WATCH_CONNECTOR_ID,
                  watchAddress: watchAddrInput.trim(),
                })
              }
              disabled={!isAddress(watchAddrInput.trim()) || isConnectingQuick}
              className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
            >
              🔗 输入地址直连
            </button>
          </div>
          {HAS_BUILTIN_SIGNER && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pig-500/30 bg-pig-500/10 px-4 py-3">
              <span className="text-xs text-pig-200">
                想直接体验真实上链铸造（<code>activateAgentWallet</code> / <code>mintPacks</code>）？
              </span>
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
                className="rounded-xl bg-pig-500 px-4 py-2 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-50"
              >
                ⚡ 一键连接内置可交易测试钱包 (zhuzhu-deployer.ai · ~0.48 tBNB)
              </button>
            </div>
          )}
        </div>
      )}

      {address && isWatchMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/35 bg-sky-500/10 px-5 py-3 text-xs">
          <div className="text-sky-200">
            <span className="font-bold">🔗 当前为地址免密直连模式（只读）：</span>
            <span className="font-mono">{address}</span>。无私钥仅可查看链上状态；如需发起签名交易，请切换到内置可签名测试钱包或在钱包插件浏览器打开。
          </div>
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
              className="rounded-xl bg-pig-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-50"
            >
              ⚡ 切换内置可签名测试钱包
            </button>
          )}
        </div>
      )}

      {/* Wrong Network Warning */}
      {isWrongChain && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/40 bg-red-500/15 p-5">
          <div className="space-y-1">
            <p className="font-bold text-red-200">⚠️ 当前钱包不在目标网络 (Chain ID {TARGET_CHAIN_ID})</p>
            <p className="text-xs text-slate-300">
              当前合约部署在 BSC Testnet (Chain ID {TARGET_CHAIN_ID})，请先切换网络后再进行激活或铸造操作。
            </p>
          </div>
          <button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            disabled={isSwitching}
            className="rounded-xl bg-red-500 px-5 py-2 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {isSwitching ? '切换中...' : `🔄 切换至 BSC Testnet (${TARGET_CHAIN_ID})`}
          </button>
        </div>
      )}

      {/* Step 0: BSC AI Agent Wallet Gate */}
      {address && !isWrongChain && isAgentWallet === false && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="font-bold text-amber-300">
              第 0 步：激活 BSC AI Agent 钱包（.ai Agent ID）
            </h2>
            <p className="text-xs text-slate-300">
              合约已开启严格准入校验，仅限已绑定 <code>.ai</code> Agent ID 的 BSC AI Agent 钱包参与 Mint 与养猪。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="输入你的 .ai 标识，如 piggy.ai"
              className="flex-1 rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-sm text-white outline-none focus:border-amber-400"
            />
            <button
              onClick={handleActivateAgent}
              disabled={!validAiId || isPending || isConfirming || isSwitching}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {isPending || isConfirming ? '激活中...' : '激活 .ai Agent ID'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">操作提示：{formatContractError(error)}</p>}
        </div>
      )}

      {address && !isWrongChain && isAgentWallet && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-xs">
          <span className="text-emerald-300 font-semibold">
            ✅ 已验证 BSC AI Agent 钱包：{myAgentId}
          </span>
          <span className="text-slate-400">准入校验通过</span>
        </div>
      )}

      {/* Progress */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span>铸造进度</span>
          <span className="font-bold text-pig-400">
            {sold.toLocaleString()} / 10,000 Packs ({progressPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pig-500 to-pink-400 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>我的已铸：{mine} / 10 Packs</span>
          <span>
            截止时间：
            {mintEnd ? new Date(Number(mintEnd) * 1000).toLocaleString('zh-CN') : '72 小时窗口'}
          </span>
        </div>
      </div>

      {/* Launch CTA when ready */}
      {canLaunch && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-emerald-300">铸造已满额或到期，可立即开盘！</p>
            <p className="text-xs text-slate-300">
              任何人均可触发开盘，LP 将直接注入 PancakePair 并永久打入黑洞。
            </p>
          </div>
          <button
            onClick={handleLaunch}
            disabled={isPending || isConfirming}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
          >
            🚀 触发开盘 Launch
          </button>
        </div>
      )}

      {/* Mint Card */}
      {!tradingOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">选择 Pack 数量</span>
            <span className="text-xs text-slate-400">当前可铸上限：{maxRemainingForWallet} Pack</span>
          </div>

          <div className="flex items-center gap-3">
            {[1, 2, 5, 10].map((n) => {
              const disabledPack = n > maxRemainingForWallet;
              return (
                <button
                  key={n}
                  disabled={disabledPack}
                  onClick={() => setPacks(n)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-30 ${
                    effectivePacks === n
                      ? 'border-pig-500 bg-pig-500/20 text-pig-300'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {n} Pack
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">推荐人地址（可选，首铸绑定后不可更改）</label>
            <input
              type="text"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-pig-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-black/40 px-4 py-3 text-sm">
            <span>您将获得</span>
            <span className="font-bold text-pig-300">
              {(effectivePacks * 1000).toLocaleString()} ZHUZHU（应付 {costBnb} BNB）
            </span>
          </div>

          <button
            onClick={handleMint}
            disabled={
              !address ||
              !isAgentWallet ||
              isPending ||
              isConfirming ||
              maxRemainingForWallet === 0
            }
            className="w-full rounded-2xl bg-pig-500 py-3.5 text-sm font-bold text-white transition hover:bg-pig-600 disabled:opacity-50"
          >
            {!address
              ? '请先连接钱包'
              : !isAgentWallet
                ? '仅限 BSC AI Agent 钱包参与（请先激活上方 .ai ID）'
                : isPending || isConfirming
                  ? '交易确认中...'
                  : maxRemainingForWallet === 0
                    ? '已达单钱包 10 Pack 上限'
                    : `铸造 ${effectivePacks} Pack (${costBnb} BNB)`}
          </button>

          {error && (
            <p className="text-xs text-red-400">交易失败：{formatContractError(error)}</p>
          )}
          {isSuccess && (
            <p className="text-xs text-emerald-400">🎉 链上操作成功！</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-4">
          <p className="text-lg font-bold">🚀 已开盘！LP 已永久打入黑洞</p>
          <a
            href={`https://pancakeswap.finance/swap?outputCurrency=${ZHUZHU_TOKEN_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-bold text-black hover:bg-emerald-400"
          >
            去 PancakeSwap 交易 $ZHUZHU
          </a>
        </div>
      )}

      {/* Referral Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">推荐好友一起养猪</h2>
            <p className="text-xs text-slate-400">
              需自己至少铸过 1 Pack 才会生效，拿好友铸造金额 5% 的 BNB 返佣。
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">可领取奖励</p>
            <p className="font-bold text-pig-400">
              {refReward ? formatEther(refReward) : '0'} BNB
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            value={shareUrl || '连接钱包生成你的专属推荐链接'}
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-300"
          />
          <button
            disabled={!shareUrl}
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
          >
            {copied ? '已复制' : '复制链接'}
          </button>
          <button
            disabled={!refReward || refReward === BigInt(0) || isPending}
            onClick={handleClaimRef}
            className="rounded-xl bg-pig-500 px-4 py-2 text-xs font-semibold text-white hover:bg-pig-600 disabled:opacity-40"
          >
            领取推荐奖励
          </button>
        </div>
      </div>
    </div>
  );
}
