'use client';

import Link from 'next/link';
import { formatEther } from 'viem';
import { useReadContract } from 'wagmi';
import {
  LEVELS,
  PIG_BADGE_ABI,
  PIG_BADGE_ADDRESS,
  TARGET_CHAIN_ID,
  ZHUZHU_ABI,
  ZHUZHU_TOKEN_ADDRESS,
} from '@/lib/contracts';

const TOKENOMICS = [
  { label: '公开 Pack 铸造', pct: '50%', amount: '10,000,000', note: '0.01 BNB / 1,000 枚' },
  { label: '流动性 LP（永久销毁）', pct: '20%', amount: '4,000,000', note: '与 80% 募集 BNB 一起加池' },
  { label: '游戏池 Game Pool', pct: '20%', amount: '4,000,000', note: 'Agent 每日养猪产币' },
  { label: '团队（锁 3 月线性 12 月）', pct: '5%', amount: '1,000,000', note: 'Vesting 链上锁定' },
  { label: '市场 / 空投', pct: '5%', amount: '1,000,000', note: '白名单任务、KOL、活动' },
];

export default function HomePage() {
  const { data: packsSold } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'packsSold',
    chainId: TARGET_CHAIN_ID,
  });
  const { data: totalBurned } = useReadContract({
    address: ZHUZHU_TOKEN_ADDRESS,
    abi: ZHUZHU_ABI,
    functionName: 'totalBurned',
    chainId: TARGET_CHAIN_ID,
  });
  const { data: nextId } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'nextId',
    chainId: TARGET_CHAIN_ID,
  });
  const { data: totalPigs } = useReadContract({
    address: PIG_BADGE_ADDRESS,
    abi: PIG_BADGE_ABI,
    functionName: 'totalPigs',
    chainId: TARGET_CHAIN_ID,
  });

  const mintedBadges = nextId ? Number(nextId) - 1 : 0;
  const burnedDisplay = totalBurned ? Number(formatEther(totalBurned)).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0';

  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-pig-500/20 bg-gradient-to-br from-pig-500/15 via-[#13131d] to-[#0b0b10] p-8 md:p-14">
        <div className="max-w-2xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-pig-400/30 bg-pig-500/10 px-3 py-1 text-xs text-pig-300">
            <span>BSC · Meme + DeFAI + GameFi</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl">
            你躺平，Agent 养猪。
          </h1>
          <p className="text-lg font-medium text-pig-300">
            You lie flat, Agent raises pigs.
          </p>
          <p className="leading-relaxed text-slate-300">
            BSC 上第一个 AI 代养猪 Meme 实验。用 Binance Agentic Wallet 铸造{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-pig-300">$ZHUZHU</code>
            ，燃烧换一张猪舍工牌 NFT，再把工牌委托给你的 AI Agent —— 之后你只管躺平，Agent 每 8 小时链上打卡、喂猪、攒经验、产币。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/mint"
              className="rounded-2xl bg-pig-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-pig-500/25 transition hover:bg-pig-600"
            >
              🐷 立即铸造 Mint Now
            </Link>
            <Link
              href="/farm"
              className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              🤖 进入 Agent 工作台
            </Link>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: '已售 Pack', value: `${packsSold ? Number(packsSold) : 0} / 10,000` },
          { label: '已铸工牌', value: `${mintedBadges.toLocaleString()} / 10,000` },
          { label: '全网猪仔总数', value: `${totalPigs ? Number(totalPigs).toLocaleString() : 0} 🐷` },
          { label: '累计销毁 ZHUZHU', value: `${burnedDisplay}` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="text-xs text-slate-400">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </section>

      {/* 3 Steps */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold">三步开启躺平养猪</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: '01',
              title: '铸造猪猪币',
              desc: '0.01 BNB / Pack（1,000 ZHUZHU），单钱包最多 10 Pack。80% BNB 直接进 LP 永久销毁。',
              href: '/mint',
              cta: '去 Mint →',
            },
            {
              step: '02',
              title: '领取猪舍工牌 NFT',
              desc: '燃烧 500 ZHUZHU 铸造工牌，工牌即你的猪场编制。初始 Lv1 养猪学徒 + 1 头猪仔。',
              href: '/badge',
              cta: '去领工牌 →',
            },
            {
              step: '03',
              title: '委托 Agent 上班',
              desc: '把工牌操作权委托给你的 AI Agent 地址。NFT 和奖励归你，Agent 只负责每 8 小时打卡。',
              href: '/farm',
              cta: '去委托 →',
            },
          ].map((c) => (
            <div
              key={c.step}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="space-y-3">
                <span className="text-xs font-bold text-pig-400">STEP {c.step}</span>
                <h3 className="text-lg font-bold">{c.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{c.desc}</p>
              </div>
              <Link
                href={c.href}
                className="mt-6 inline-block text-sm font-semibold text-pig-400 hover:text-pig-300"
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Career Roadmap */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold">职业晋升路线（Lv1 → Lv5）</h2>
        <div className="grid gap-3 md:grid-cols-5">
          {LEVELS.map((lv) => (
            <div
              key={lv.level}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{lv.emoji}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold">
                  Lv{lv.level}
                </span>
              </div>
              <div>
                <p className="font-bold">{lv.name}</p>
                <p className="text-xs text-slate-400">{lv.en}</p>
              </div>
              <div className="pt-2 text-xs text-slate-300 space-y-1">
                <p>产出倍率：<span className="text-pig-400 font-semibold">{lv.mult}</span></p>
                <p>每次打卡：+{lv.pigsPerWork} 猪仔</p>
                <p>
                  升级条件：
                  {lv.xpToNext > 0 ? `${lv.xpToNext} XP + 烧 ${lv.upgradeBurn}` : '已达巅峰'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tokenomics */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold">Tokenomics（总量 20,000,000 $ZHUZHU）</h2>
          <span className="text-xs text-slate-400">买入税 1% 进游戏池 · 卖出税 3%（1.5% 销毁 + 1.5% 游戏池）</span>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {TOKENOMICS.map((t) => (
            <div key={t.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-2xl font-extrabold text-pig-400">{t.pct}</p>
              <p className="mt-1 font-semibold text-sm">{t.label}</p>
              <p className="mt-1 text-xs text-slate-300">{t.amount} 枚</p>
              <p className="mt-2 text-xs text-slate-500">{t.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
