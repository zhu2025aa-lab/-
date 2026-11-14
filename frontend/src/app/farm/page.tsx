'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, isAddress, parseAbiItem, parseEther } from 'viem';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  LEVELS,
  PIG_BADGE_ABI,
  PIG_BADGE_ADDRESS,
  TARGET_CHAIN_ID,
  ZHUZHU_ABI,
  ZHUZHU_TOKEN_ADDRESS,
  formatContractError,
} from '@/lib/contracts';

interface WorkLogItem {
  txHash: string;
  reward: string;
  xp: number;
  pigs: number;
}

const WORKED_EVENT = parseAbiItem(
  'event Worked(uint256 indexed id, address indexed agent, uint256 reward, uint32 xp, uint32 pigs)'
);

export default function FarmPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [workLogs, setWorkLogs] = useState<WorkLogItem[]>([]);

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  const { data: myIds, refetch: refetchIds } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'tokensOfOwner',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: zhuzhuBal, refetch: refetchBal } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'allowance',
    args: address ? [address, PIG_BADGE_ADDRESS] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: inputIsAgent } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isAgentWallet',
    args: isAddress(agentInput) ? [agentInput] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: isAddress(agentInput) },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam && /^\d+$/.test(idParam)) {
      setSelectedId(BigInt(idParam));
    } else if (myIds && myIds.length > 0 && selectedId === null) {
      setSelectedId(myIds[0]);
    }
  }, [myIds, selectedId]);

  const { data: badgeData, refetch: refetchBadge } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'badges',
    args: selectedId !== null ? [selectedId] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: selectedId !== null },
  });

  const { data: workStatus, refetch: refetchWork } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'canWork',
    args: selectedId !== null ? [selectedId] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: selectedId !== null },
  });

  const fetchLogs = useCallback(async () => {
    if (!publicClient || selectedId === null) return;
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > 5000n ? latest - 5000n : 0n;
      const logs = await publicClient.getLogs({
        address: PIG_BADGE_ADDRESS,
        event: WORKED_EVENT,
        args: { id: selectedId },
        fromBlock,
        toBlock: latest,
      });
      setWorkLogs(
        logs
          .slice(-8)
          .reverse()
          .map((l) => ({
            txHash: l.transactionHash,
            reward: Number(formatEther(l.args.reward ?? 0n)).toFixed(2),
            xp: Number(l.args.xp ?? 0),
            pigs: Number(l.args.pigs ?? 0),
          }))
      );
    } catch {
      // Ignore RPC log query errors on public nodes with narrow ranges
    }
  }, [publicClient, selectedId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: TARGET_CHAIN_ID,
  });

  useEffect(() => {
    if (isSuccess) {
      refetchIds();
      refetchBadge();
      refetchWork();
      refetchBal();
      refetchAllowance();
      fetchLogs();
    }
  }, [
    fetchLogs,
    isSuccess,
    refetchAllowance,
    refetchBadge,
    refetchBal,
    refetchIds,
    refetchWork,
  ]);

  const level = badgeData ? Number(badgeData[0]) : 1;
  const xp = badgeData ? Number(badgeData[1]) : 0;
  const pigs = badgeData ? Number(badgeData[2]) : 0;
  const streak = badgeData ? Number(badgeData[3]) : 0;
  const lastWorkAt = badgeData ? Number(badgeData[4]) : 0;
  const assignedAgent = badgeData ? badgeData[5] : '0x0000000000000000000000000000000000000000';
  const verifiedAgent = badgeData ? badgeData[6] : false;

  const hasAgent = assignedAgent !== '0x0000000000000000000000000000000000000000';
  const isSelfAgent = Boolean(
    address && hasAgent && address.toLowerCase() === assignedAgent.toLowerCase()
  );
  const meta = LEVELS[level - 1] ?? LEVELS[0];
  const canUpgrade = level < 5 && xp >= meta.xpToNext;
  const upgradeCostWei = parseEther(meta.upgradeBurn.toString());
  const needsApprove = canUpgrade && (!allowance || allowance < upgradeCostWei);
  const hasEnoughForUpgrade = zhuzhuBal !== undefined && zhuzhuBal >= upgradeCostWei;
  const herdBonusPct = Math.min(50, Math.floor(pigs / 10));

  const nextWorkAt = workStatus ? Number(workStatus[1]) : 0;
  const readyToWork = workStatus ? workStatus[0] : false;
  const nowSec = Math.floor(Date.now() / 1000);
  const remainSec = Math.max(0, nextWorkAt - nowSec);
  const remainText = readyToWork
    ? '可立即打卡'
    : `${Math.floor(remainSec / 3600)}h ${Math.floor((remainSec % 3600) / 60)}m`;

  const ensureTargetChain = async () => {
    if (!isWrongChain) return true;
    try {
      await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      return true;
    } catch {
      return false;
    }
  };

  const handleAssign = async () => {
    if (selectedId === null || !isAddress(agentInput) || !(await ensureTargetChain())) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'assignAgent',
      args: [selectedId, agentInput],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleRevoke = async () => {
    if (selectedId === null || !(await ensureTargetChain())) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'revokeAgent',
      args: [selectedId],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleApproveUpgrade = async () => {
    if (!(await ensureTargetChain())) return;
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'approve',
      args: [PIG_BADGE_ADDRESS, parseEther('1000000')],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleLevelUp = async () => {
    if (selectedId === null || !(await ensureTargetChain())) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'levelUp',
      args: [selectedId],
      chainId: TARGET_CHAIN_ID,
    });
  };

  const handleWork = async () => {
    if (selectedId === null || !(await ensureTargetChain())) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'work',
      args: [selectedId],
      chainId: TARGET_CHAIN_ID,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-pig-400">
            Agent Farm Console
          </span>
          <h1 className="text-3xl font-extrabold">Agent 养猪工作台</h1>
        </div>

        {myIds && myIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">选择工牌：</span>
            {myIds.map((id) => (
              <button
                key={id.toString()}
                onClick={() => setSelectedId(id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  selectedId === id
                    ? 'bg-pig-500 text-white'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                #{id.toString()}
              </button>
            ))}
          </div>
        )}
      </div>

      {isWrongChain && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/40 bg-red-500/15 p-5">
          <p className="text-xs font-semibold text-red-200">
            ⚠️ 请先将钱包切换至 BSC Testnet (Chain ID {TARGET_CHAIN_ID}) 后再管理工牌或打卡。
          </p>
          <button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            disabled={isSwitching}
            className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {isSwitching ? '切换中...' : `🔄 切换至 BSC Testnet (${TARGET_CHAIN_ID})`}
          </button>
        </div>
      )}

      {!address ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-slate-400">
          请先连接钱包，查看并管理你的猪舍工牌与 Agent 委托状态。
        </div>
      ) : !myIds || myIds.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-slate-400">
          你还没有工牌，请先前往「猪舍工牌」页面铸造一张工牌。
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left: Delegation */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
            <h2 className="font-bold">1. Agent 委托管理</h2>
            <div className="rounded-xl bg-black/40 p-4 text-xs space-y-1.5">
              <p className="text-slate-400">当前委托状态</p>
              {hasAgent ? (
                <>
                  <p className="font-mono text-emerald-400 break-all">{assignedAgent}</p>
                  <p className="text-slate-400">
                    认证状态：{verifiedAgent ? '✅ .ai Agent ID 官方签名 (+10%)' : '🤖 已激活 AI Agent 钱包'}
                  </p>
                </>
              ) : (
                <p className="text-amber-400">猪饿了，但你的 Agent 还没上班。</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Agent 钱包地址</label>
                <button
                  type="button"
                  onClick={() => setAgentInput(address)}
                  className="text-[11px] font-semibold text-pig-400 hover:text-pig-300"
                >
                  填入当前钱包自测
                </button>
              </div>
              <input
                type="text"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-pig-500"
              />
              {isAddress(agentInput) && inputIsAgent === false && (
                <p className="text-[11px] text-red-400">
                  ⚠️ 该地址尚未在 AgentWalletRegistry 激活 .ai ID，委托将被合约拒绝。
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAssign}
                disabled={
                  !isAddress(agentInput) ||
                  inputIsAgent === false ||
                  isPending ||
                  isConfirming
                }
                className="flex-1 rounded-xl bg-pig-500 py-2.5 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-40"
              >
                委托给 Agent
              </button>
              {hasAgent && (
                <button
                  onClick={handleRevoke}
                  disabled={isPending || isConfirming}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                >
                  收回授权
                </button>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              安全提示：仅允许已激活 <code>.ai</code> ID 的 BSC AI Agent 钱包受托执行 <code>work(tokenId)</code>，Agent 无法转走你的工牌。
            </p>
          </div>

          {/* Center: Pig Pen Visual & Upgrade */}
          <div className="rounded-2xl border border-pig-500/20 bg-gradient-to-b from-pig-500/10 to-white/[0.02] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                {meta.emoji} {meta.name} (Lv{level})
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                🔥 连续 {streak} 次
              </span>
            </div>

            <div className="flex min-h-[140px] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-4">
              {Array.from({ length: Math.min(pigs, 24) }).map((_, i) => (
                <span
                  key={i}
                  className="text-2xl animate-bounce"
                  style={{ animationDelay: `${(i % 5) * 120}ms` }}
                >
                  🐷
                </span>
              ))}
              {pigs > 24 && (
                <span className="rounded-full bg-pig-500/20 px-2 py-1 text-xs font-bold text-pig-300">
                  +{pigs - 24} 头
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-black/40 p-3">
                <p className="text-slate-400">猪仔总数 / 猪群加成</p>
                <p className="mt-1 text-lg font-bold">
                  {pigs} 头 <span className="text-xs text-emerald-400">(+{herdBonusPct}%)</span>
                </p>
              </div>
              <div className="rounded-xl bg-black/40 p-3">
                <p className="text-slate-400">下次打卡</p>
                <p className="mt-1 text-lg font-bold text-pig-300">
                  {hasAgent ? remainText : '未委托'}
                </p>
              </div>
            </div>

            {isSelfAgent && (
              <button
                onClick={handleWork}
                disabled={!readyToWork || isPending || isConfirming}
                className="w-full rounded-xl bg-pig-500 py-2.5 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-40"
              >
                {readyToWork ? '🐷 立即喂猪打卡 (work)' : `冷却或未开盘中 (${remainText})`}
              </button>
            )}

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>当前经验</span>
                <span>{meta.xpToNext > 0 ? `${xp} / ${meta.xpToNext} XP` : `${xp} XP (MAX)`}</span>
              </div>

              {level >= 5 ? (
                <button
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-slate-400"
                >
                  已达终极猪皇
                </button>
              ) : !canUpgrade ? (
                <button
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-slate-400"
                >
                  还差 {Math.max(0, meta.xpToNext - xp)} XP 可升级
                </button>
              ) : needsApprove ? (
                <button
                  onClick={handleApproveUpgrade}
                  disabled={isPending || isConfirming}
                  className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  1. Approve ZHUZHU（升级需烧 {meta.upgradeBurn} 枚）
                </button>
              ) : (
                <button
                  onClick={handleLevelUp}
                  disabled={!hasEnoughForUpgrade || isPending || isConfirming}
                  className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {hasEnoughForUpgrade
                    ? `升级到 Lv${level + 1}（燃烧 ${meta.upgradeBurn} ZHUZHU）`
                    : `ZHUZHU 余额不足（需 ${meta.upgradeBurn}）`}
                </button>
              )}
            </div>
          </div>

          {/* Right: Agent Work Status & On-Chain Logs */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <h2 className="font-bold">2. Agent 工作日志</h2>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="rounded-xl bg-black/40 p-3 space-y-1">
                <p className="text-slate-400">最近一次打卡时间</p>
                <p>{lastWorkAt > 0 ? new Date(lastWorkAt * 1000).toLocaleString('zh-CN') : '尚未打过卡'}</p>
              </div>
              <div className="rounded-xl bg-black/40 p-3 space-y-1">
                <p className="text-slate-400">当前综合产出倍率</p>
                <p className="font-bold text-pig-300">
                  {meta.mult} 基础 · 猪群 +{herdBonusPct}% · 连续最高 +20%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">链上打卡记录 (Worked)</p>
              {workLogs.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-500">
                  暂无打卡记录，启动 <code>agent-runner</code> 或委托后即可开始积累产出。
                </p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {workLogs.map((log) => (
                    <div
                      key={log.txHash}
                      className="flex items-center justify-between rounded-xl bg-black/40 px-3 py-2 text-[11px]"
                    >
                      <span className="text-emerald-300">+{log.reward} ZHUZHU</span>
                      <span className="text-slate-400">
                        XP {log.xp} · 🐷 {log.pigs}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-400">交易失败：{formatContractError(error)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
