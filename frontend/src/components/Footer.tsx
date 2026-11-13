export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 bg-black/40 py-10 text-xs text-slate-400">
      <div className="mx-auto max-w-6xl space-y-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-semibold text-slate-200">
            🐷 猪猪币 ZhuZhu Agent — 你躺平，Agent 养猪 / You lie flat, Agent raises pigs.
          </p>
          <p>BSC Meme · DeFAI · GameFi</p>
        </div>
        <p className="leading-relaxed text-slate-500">
          风险提示：猪猪币（$ZHUZHU）是社区驱动的 Meme 代币，无任何内在价值，也不承诺任何财务收益。
          游戏内奖励仅为链上娱乐机制，不构成投资、法律或税务建议。AI Agent 自动执行的交易由用户自行授权，
          本项目与 Binance 及任何交易所无官方关联或背书。
        </p>
      </div>
    </footer>
  );
}
