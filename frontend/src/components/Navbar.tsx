'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  TARGET_CHAIN_ID,
  formatContractError,
} from '@/lib/contracts';

const NAV_ITEMS = [
  { href: '/', label: '首页' },
  { href: '/mint', label: 'Mint 猪猪币' },
  { href: '/badge', label: '猪舍工牌' },
  { href: '/farm', label: 'Agent 工作台' },
  { href: '/quests', label: '任务板' },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [showBindModal, setShowBindModal] = useState(false);
  const [agentName, setAgentName] = useState('piggy.ai');

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  const { data: agentId, refetch: refetchAgentId } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'agentIdOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: TARGET_CHAIN_ID,
  });

  useEffect(() => {
    if (isSuccess) {
      refetchAgentId();
      setShowBindModal(false);
    }
  }, [isSuccess, refetchAgentId]);

  const hasAgentId = Boolean(agentId && agentId.length > 0);
  const validAiId = agentName.trim().toLowerCase().endsWith('.ai') && agentName.trim().length >= 4;

  const handleActivate = async () => {
    if (!validAiId) return;
    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        return;
      }
    }
    writeContract({
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'activateAgentWallet',
      args: [agentName.trim(), BigInt(0), '0x'],
      chainId: TARGET_CHAIN_ID,
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0b10]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="text-2xl">🐷</span>
          <span>ZhuZhu Agent</span>
          <span className="rounded bg-pig-500/20 px-1.5 py-0.5 text-xs text-pig-400">
            {TARGET_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC'}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition ${
                  active ? 'font-semibold text-pig-400' : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {isWrongChain && (
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="rounded-xl border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/30 disabled:opacity-50"
            >
              {isSwitching ? '切换中...' : `🔄 切换至 BSC Testnet (${TARGET_CHAIN_ID})`}
            </button>
          )}
          {isConnected && !isWrongChain && (
            hasAgentId ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                🤖 {agentId}
              </span>
            ) : (
              <button
                onClick={() => setShowBindModal((v) => !v)}
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
              >
                🪪 绑定 .ai Agent ID
              </button>
            )
          )}
          <ConnectButton
            label="连接钱包"
            chainStatus="icon"
            showBalance={{ smallScreen: false, largeScreen: true }}
          />
        </div>
      </div>

      {showBindModal && isConnected && !hasAgentId && (
        <div className="border-t border-white/10 bg-[#12121c] px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              <span className="font-bold text-pig-300">BSC AI Agent 钱包准入：</span>
              仅限已激活 <code className="rounded bg-white/10 px-1">.ai</code> Agent ID 的 BSC 钱包参与 Mint 与领工牌。
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="例如 piggy.ai"
                className="rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none focus:border-pig-500"
              />
              <button
                onClick={handleActivate}
                disabled={!validAiId || isPending || isConfirming || isSwitching}
                className="rounded-xl bg-pig-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-40"
              >
                {isPending || isConfirming ? '激活中...' : '上链激活 .ai ID'}
              </button>
              <button
                onClick={() => setShowBindModal(false)}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                关闭
              </button>
            </div>
          </div>
          {error && (
            <p className="mx-auto mt-2 max-w-6xl text-xs text-red-400">
              激活失败：{formatContractError(error)}
            </p>
          )}
        </div>
      )}

      {/* Mobile Nav */}
      <div className="flex items-center gap-4 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap text-xs ${
                active ? 'font-semibold text-pig-400' : 'text-slate-400'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
