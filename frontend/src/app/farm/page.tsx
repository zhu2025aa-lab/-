'use client';

import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  LEVELS,
  PIG_BADGE_ABI,
  PIG_BADGE_ADDRESS,
} from '@/lib/contracts';

export default function FarmPage() {
  const { address } = useAccount();
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [agentInput, setAgentInput] = useState('');

  const { data: myIds, refetch: refetchIds } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'tokensOfOwner',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
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
    query: { enabled: selectedId !== null },
  });

  const { data: workStatus, refetch: refetchWork } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'canWork',
    args: selectedId !== null ? [selectedId] : undefined,
    query: { enabled: selectedId !== null },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      refetchIds();
      refetchBadge();
      refetchWork();
    }
  }, [isSuccess, refetchBadge, refetchIds, refetchWork]);

  const level = badgeData ? Number(badgeData[0]) : 1;
  const xp = badgeData ? Number(badgeData[1]) : 0;
  const pigs = badgeData ? Number(badgeData[2]) : 0;
  const streak = badgeData ? Number(badgeData[3]) : 0;
  const lastWorkAt = badgeData ? Number(badgeData[4]) : 0;
  const assignedAgent = badgeData ? badgeData[5] : '0x0000000000000000000000000000000000000000';
  const verifiedAgent = badgeData ? badgeData[6] : false;

  const hasAgent = assignedAgent !== '0x0000000000000000000000000000000000000000';
  const meta = LEVELS[level - 1] ?? LEVELS[0];
  const canUpgrade = level < 5 && xp >= meta.xpToNext;

  const nextWorkAt = workStatus ? Number(workStatus[1]) : 0;
  const readyToWork = workStatus ? workStatus[0] : false;
  const nowSec = Math.floor(Date.now() / 1000);
  const remainSec = Math.max(0, nextWorkAt - nowSec);
  const remainText = readyToWork
    ? '可立即打卡'
    : `${Math.floor(remainSec / 3600)}h ${Math.floor((remainSec % 3600) / 60)}m`;

  const handleAssign = () => {
    if (selectedId === null || !isAddress(agentInput)) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'assignAgent',
      args: [selectedId, agentInput],
    });
  };

  const handleRevoke = () => {
    if (selectedId === null) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'revokeAgent',
      args: [selectedId],
    });
  };

  const handleLevelUp = () => {
    if (selectedId === null) return;
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'levelUp',
      args: [selectedId],
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
                    认证状态：{verifiedAgent ? '✅ .ai Agent ID 已认证 (+10%)' : '普通地址委托'}
                  </p>
                </>
              ) : (
                <p className="text-amber-400">猪饿了，但你的 Agent 还没上班。</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">
                输入 Agent 钱包地址（如 Binance Agentic Wallet 地址）
              </label>
              <input
                type="text"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-pig-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAssign}
                disabled={!isAddress(agentInput) || isPending || isConfirming}
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
              安全提示：委托仅授予 <code>work(tokenId)</code> 打卡权限，Agent 无法转移你的工牌，所有奖励直接进入你的地址。
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

            {/* Visual Pig Pen */}
            <div className="flex min-h-[140px] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-4">
              {Array.from({ length: Math.min(pigs, 24) }).map((_, i) => (
                <span key={i} className="text-2xl animate-bounce" style={{ animationDelay: `${(i % 5) * 120}ms` }}>
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
                <p className="text-slate-400">猪仔总数</p>
                <p className="mt-1 text-lg font-bold">{pigs} 头</p>
              </div>
              <div className="rounded-xl bg-black/40 p-3">
                <p className="text-slate-400">下次打卡</p>
                <p className="mt-1 text-lg font-bold text-pig-300">
                  {hasAgent ? remainText : '未委托'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>当前经验</span>
                <span>{meta.xpToNext > 0 ? `${xp} / ${meta.xpToNext} XP` : `${xp} XP (MAX)`}</span>
              </div>
              <button
                onClick={handleLevelUp}
                disabled={!canUpgrade || isPending || isConfirming}
                className={`w-full rounded-xl py-2.5 text-xs font-bold transition ${
                  canUpgrade
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                    : 'border border-white/10 bg-white/5 text-slate-400'
                }`}
              >
                {level >= 5
                  ? '已达终极猪皇'
                  : canUpgrade
                    ? `升级到 Lv${level + 1}（燃烧 ${meta.upgradeBurn} ZHUZHU）`
                    : `还差 ${Math.max(0, meta.xpToNext - xp)} XP 可升级`}
              </button>
            </div>
          </div>

          {/* Right: Agent Work Status & Runner Tip */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <h2 className="font-bold">2. Agent 运行状态</h2>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="rounded-xl bg-black/40 p-3 space-y-1">
                <p className="text-slate-400">最近一次打卡时间</p>
                <p>{lastWorkAt > 0 ? new Date(lastWorkAt * 1000).toLocaleString('zh-CN') : '尚未打过卡'}</p>
              </div>
              <div className="rounded-xl bg-black/40 p-3 space-y-1">
                <p className="text-slate-400">当前产出倍率</p>
                <p className="font-bold text-pig-300">
                  {meta.mult}（+ 最高 20% 连续打卡加成）
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs space-y-2">
              <p className="font-semibold text-slate-200">🤖 如何让 Agent 自动上班？</p>
              <p className="text-slate-400 leading-relaxed">
                在 Binance Agentic Wallet 中导入 <code>agent-runner/tool.json</code>，或运行仓库中的{' '}
                <code>agent-runner</code> 定时脚本，Agent 会在 8 小时冷却结束时自动调用{' '}
                <code>work({selectedId?.toString()})</code>。
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400">交易失败：{error.message.slice(0, 100)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
