'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { formatEther, parseEther } from 'viem';
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  LEVELS,
  PIG_BADGE_ABI,
  PIG_BADGE_ADDRESS,
  ZHUZHU_ABI,
  ZHUZHU_TOKEN_ADDRESS,
} from '@/lib/contracts';

const MINT_COST = parseEther('500');

export default function BadgePage() {
  const { address } = useAccount();

  const { data: isAgentWallet } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isAgentWallet',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: balance, refetch: refetchBal } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'allowance',
    args: address ? [address, PIG_BADGE_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: myIds, refetch: refetchIds } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'tokensOfOwner',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const badgeReads = useReadContracts({
    contracts: (myIds || []).map((id) => ({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'badges',
      args: [id],
    })),
    query: { enabled: Boolean(myIds && myIds.length > 0) },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      refetchBal();
      refetchAllowance();
      refetchIds();
      badgeReads.refetch();
    }
  }, [isSuccess, refetchAllowance, refetchBal, refetchIds, badgeReads]);

  const needsApprove = !allowance || allowance < MINT_COST;
  const hasEnough = balance !== undefined && balance >= MINT_COST;
  const badgeCount = myIds ? myIds.length : 0;

  const handleApprove = () => {
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'approve',
      args: [PIG_BADGE_ADDRESS, parseEther('1000000')],
    });
  };

  const handleMintBadge = () => {
    writeContract({
      address: PIG_BADGE_ADDRESS,
      abi: PIG_BADGE_ABI,
      functionName: 'mint',
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-12">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-pig-400">
          Pig Pen Badge · ERC721
        </span>
        <h1 className="text-3xl font-extrabold">领取你的猪舍工牌 · Get Your Pig Pen Badge</h1>
        <p className="text-sm text-slate-400">
          燃烧 500 ZHUZHU，换一张链上工牌。工牌就是你的猪场编制，每个钱包最多持有 3 张。
        </p>
      </div>

      {/* Mint Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-bold text-lg">铸造新工牌（燃烧 500 $ZHUZHU）</p>
          <p className="text-xs text-slate-400">
            我的余额：{balance ? Number(formatEther(balance)).toLocaleString() : '0'} ZHUZHU · 已持有工牌：{badgeCount} / 3
          </p>
        </div>
        <div className="flex gap-3">
          {needsApprove ? (
            <button
              onClick={handleApprove}
              disabled={!address || isPending || isConfirming}
              className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {isPending || isConfirming ? '授权中...' : '1. Approve ZHUZHU'}
            </button>
          ) : (
            <button
              onClick={handleMintBadge}
              disabled={
                !address ||
                isAgentWallet === false ||
                !hasEnough ||
                badgeCount >= 3 ||
                isPending ||
                isConfirming
              }
              className="rounded-2xl bg-pig-500 px-6 py-3 text-sm font-bold text-white hover:bg-pig-600 disabled:opacity-50"
            >
              {isAgentWallet === false
                ? '请先绑定 .ai Agent ID'
                : isPending || isConfirming
                  ? '铸造中...'
                  : badgeCount >= 3
                    ? '已达 3 张上限'
                    : !hasEnough
                      ? 'ZHUZHU 余额不足'
                      : '2. 燃烧 500 铸造工牌'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">操作失败：{error.message.slice(0, 120)}</p>}

      {/* My Badges */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">我的工牌墙</h2>
          <Link href="/farm" className="text-xs font-semibold text-pig-400 hover:text-pig-300">
            去工作台委托 Agent →
          </Link>
        </div>

        {!address ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
            连接钱包查看你的猪舍工牌
          </p>
        ) : badgeCount === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
            你还没有猪舍工牌，先去上方燃烧 500 ZHUZHU 领取一张吧！
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(myIds || []).map((id, idx) => {
              const res = badgeReads.data?.[idx]?.result as
                | readonly [number, number, number, number, bigint, `0x${string}`, boolean]
                | undefined;
              const lvl = res ? Number(res[0]) : 1;
              const xp = res ? Number(res[1]) : 0;
              const pigs = res ? Number(res[2]) : 1;
              const agent = res ? res[5] : '0x0000000000000000000000000000000000000000';
              const meta = LEVELS[lvl - 1] ?? LEVELS[0];
              const xpPct = meta.xpToNext > 0 ? Math.min(100, (xp / meta.xpToNext) * 100) : 100;
              const hasAgent = agent !== '0x0000000000000000000000000000000000000000';

              return (
                <div
                  key={id.toString()}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{meta.emoji}</span>
                    <span className="rounded-full bg-pig-500/20 px-2.5 py-0.5 text-xs font-bold text-pig-300">
                      #{id.toString()} · Lv{lvl}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold">{meta.name}</p>
                    <p className="text-xs text-slate-400">{meta.en} · {meta.mult}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>经验 XP</span>
                      <span>{meta.xpToNext > 0 ? `${xp} / ${meta.xpToNext}` : `${xp} (MAX)`}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-pig-500" style={{ width: `${xpPct}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>猪仔数：{pigs} 🐷</span>
                    <span className={hasAgent ? 'text-emerald-400' : 'text-amber-400'}>
                      {hasAgent ? '🤖 Agent 已上岗' : '⏳ 待委托'}
                    </span>
                  </div>
                  <Link
                    href={`/farm?id=${id.toString()}`}
                    className="block rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-semibold hover:bg-white/10"
                  >
                    进入工作台管理
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
