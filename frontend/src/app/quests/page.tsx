'use client';

import { useState } from 'react';

interface Quest {
  id: string;
  category: 'daily' | 'onboarding' | 'achievement';
  title: string;
  desc: string;
  points: number;
}

const QUESTS: Quest[] = [
  { id: 'd1', category: 'daily', title: 'Agent 打卡 3 次', desc: '让你的 AI Agent 今日完成 3 次链上养猪打卡', points: 50 },
  { id: 'd2', category: 'daily', title: '晒出你的猪圈', desc: '将你的猪舍工牌截图分享到 X 并附带 #ZhuZhuAgent', points: 30 },
  { id: 'o1', category: 'onboarding', title: '关注官方 X & 加入 TG', desc: '加入社区获取最新白名单与回购销毁公告', points: 100 },
  { id: 'o2', category: 'onboarding', title: '铸造第 1 个 Pack', desc: '参与公开 Pack 铸造，成为早期猪场股东', points: 150 },
  { id: 'o3', category: 'onboarding', title: '铸造第 1 张猪舍工牌', desc: '燃烧 500 ZHUZHU 获取你的链上工牌 NFT', points: 200 },
  { id: 'o4', category: 'onboarding', title: '完成第一次 Agent 委托', desc: '在工作台绑定你的 Agentic Wallet 地址', points: 200 },
  { id: 'a1', category: 'achievement', title: '连续打卡 7 天', desc: '保持猪圈不断粮，连续打卡不断连', points: 500 },
  { id: 'a2', category: 'achievement', title: '晋升 Lv3 猪场主管', desc: '工牌等级达到 Lv3，享受 1.5x 产出倍率', points: 600 },
  { id: 'a3', category: 'achievement', title: '邀请 5 位猪友', desc: '通过专属推荐链接邀请 5 位有效铸造用户', points: 800 },
];

export default function QuestsPage() {
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const totalPoints = QUESTS.reduce((sum, q) => (claimed[q.id] ? sum + q.points : sum), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-pig-400">
            Quest Board · 链下积分 & 白名单权重
          </span>
          <h1 className="text-3xl font-extrabold">猪场任务板 · Quest Board</h1>
          <p className="text-sm text-slate-400">
            完成任务累积“猪饲料 Feed Points”，用于白名单资格与市场空投池权重分配。
          </p>
        </div>

        <div className="rounded-2xl border border-pig-500/30 bg-pig-500/10 px-5 py-3 text-right">
          <p className="text-xs text-pig-300">我的猪饲料积分</p>
          <p className="text-2xl font-extrabold text-white">{totalPoints} 🌾</p>
        </div>
      </div>

      {(
        [
          { key: 'daily', label: '每日任务 Daily' },
          { key: 'onboarding', label: '新手任务 Onboarding' },
          { key: 'achievement', label: '成就里程碑 Achievements' },
        ] as const
      ).map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-lg font-bold">{group.label}</h2>
          <div className="space-y-2">
            {QUESTS.filter((q) => q.category === group.key).map((q) => {
              const done = Boolean(claimed[q.id]);
              return (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
                >
                  <div>
                    <p className="font-semibold">{q.title}</p>
                    <p className="text-xs text-slate-400">{q.desc}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-pig-400">+{q.points} 🌾</span>
                    <button
                      onClick={() => setClaimed((prev) => ({ ...prev, [q.id]: true }))}
                      disabled={done}
                      className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                        done
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/10 text-white hover:bg-pig-500'
                      }`}
                    >
                      {done ? '已记录 ✓' : '验证领取'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
