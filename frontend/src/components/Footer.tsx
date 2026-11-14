import {
  AGENT_ID_REGISTRY_ADDRESS,
  DEAD_ADDRESS,
  DIVIDEND_TRACKER_ADDRESS,
  TARGET_CHAIN_ID,
  ZHUZHU_TOKEN_ADDRESS,
} from '@/lib/contracts';

const EXPLORER =
  TARGET_CHAIN_ID === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 bg-black/50 py-10 text-xs text-slate-400">
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <span className="text-lg">🐷</span>
            <span>猪猪币 ZHUZHU · BNB Chain AI Agent Experiment</span>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px]">
            <a
              href={`${EXPLORER}/address/${ZHUZHU_TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-pig-400"
            >
              Token 合约 ↗
            </a>
            <a
              href={`${EXPLORER}/address/${AGENT_ID_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-pig-400"
            >
              Agent ID 注册表 ↗
            </a>
            <a
              href={`${EXPLORER}/address/${DIVIDEND_TRACKER_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-pig-400"
            >
              BNB 分红合约 ↗
            </a>
            <a
              href={`${EXPLORER}/address/${DEAD_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-pig-400"
            >
              LP 销毁黑洞 ↗
            </a>
          </div>
        </div>
        <p className="leading-relaxed text-slate-500">
          风险提示：猪猪币（$ZHUZHU）是社区驱动的 Meme 实验代币，无任何内在价值，也不承诺任何财务收益。
          所有认购、自动组池与 3% 买卖税 BNB 分红均由链上智能合约公开执行。AI Agent 自动执行的交易由用户自行授权，
          本项目与 Binance 及任何交易所无官方关联或背书。
        </p>
      </div>
    </footer>
  );
}
