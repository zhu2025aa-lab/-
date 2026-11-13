'use client';

import { useEffect, useState } from 'react';
import { formatEther, parseEther, isAddress } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { ZHUZHU_ABI, ZHUZHU_TOKEN_ADDRESS } from '@/lib/contracts';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

export default function MintPage() {
  const { address } = useAccount();
  const [packs, setPacks] = useState(1);
  const [refInput, setRefInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && isAddress(ref)) setRefInput(ref);
  }, []);

  const { data: packsSold, refetch: refetchSold } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'packsSold',
  });
  const { data: packsOf, refetch: refetchMine } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'packsOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { data: refReward, refetch: refetchRef } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'refRewards',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { data: tradingOpen } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'tradingOpen',
  });
  const { data: mintEnd } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'mintEnd',
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      refetchSold();
      refetchMine();
      refetchRef();
    }
  }, [isSuccess, refetchMine, refetchRef, refetchSold]);

  const sold = packsSold ? Number(packsSold) : 0;
  const mine = packsOf ? Number(packsOf) : 0;
  const maxRemainingForWallet = Math.max(0, 10 - mine);
  const progressPct = Math.min(100, (sold / 10_000) * 100);
  const costBnb = (packs * 0.01).toFixed(2);

  const handleMint = () => {
    const ref = isAddress(refInput) ? refInput : ZERO_ADDR;
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'mintPacks',
      args: [BigInt(packs), ref],
      value: parseEther((packs * 0.01).toString()),
    });
  };

  const handleClaimRef = () => {
    writeContract({
      address: ZHUZHU_TOKEN_ADDRESS,
      abi: ZHUZHU_ABI,
      functionName: 'claimRefReward',
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
          Pack Mint · 公开公平铸造
        </span>
        <h1 className="text-3xl font-extrabold">
          {tradingOpen ? '已开盘 · Trading Open' : '猪圈开放中 · Pig Pen Open'}
        </h1>
        <p className="text-sm text-slate-400">
          每 Pack = 1,000 ZHUZHU，价格 0.01 BNB，每个钱包最多 10 Pack。80% BNB 直接加池并永久销毁 LP。
        </p>
      </div>

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

      {/* Mint Card */}
      {!tradingOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">选择 Pack 数量</span>
            <span className="text-xs text-slate-400">当前可铸上限：{maxRemainingForWallet} Pack</span>
          </div>

          <div className="flex items-center gap-3">
            {[1, 2, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setPacks(n)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                  packs === n
                    ? 'border-pig-500 bg-pig-500/20 text-pig-300'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {n} Pack
              </button>
            ))}
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
              {(packs * 1000).toLocaleString()} ZHUZHU（应付 {costBnb} BNB）
            </span>
          </div>

          <button
            onClick={handleMint}
            disabled={!address || isPending || isConfirming || maxRemainingForWallet === 0}
            className="w-full rounded-2xl bg-pig-500 py-3.5 text-sm font-bold text-white transition hover:bg-pig-600 disabled:opacity-50"
          >
            {!address
              ? '请先连接钱包'
              : isPending || isConfirming
                ? '交易确认中...'
                : maxRemainingForWallet === 0
                  ? '已达单钱包 10 Pack 上限'
                  : `铸造 ${packs} Pack (${costBnb} BNB)`}
          </button>

          {error && (
            <p className="text-xs text-red-400">交易失败：{error.message.slice(0, 120)}</p>
          )}
          {isSuccess && (
            <p className="text-xs text-emerald-400">🎉 铸造成功！快去领取你的猪舍工牌吧。</p>
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
