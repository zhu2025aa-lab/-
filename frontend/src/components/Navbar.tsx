'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  AGENT_ID_REGISTRY_ABI,
  AGENT_ID_REGISTRY_ADDRESS,
  TARGET_CHAIN_ID,
  formatContractError,
} from '@/lib/contracts';
import {
  DEFAULT_WATCH_ADDRESS,
  HAS_BUILTIN_SIGNER,
  SIGNER_CONNECTOR_ID,
  WATCH_CONNECTOR_ID,
  connectQuickWallet,
} from '@/lib/wagmi';

const NAV_ITEMS = [
  { href: '/#mint', label: '01 社区认购' },
  { href: '/#agent-mint', label: '02 AI 口令' },
  { href: '/#tokenomics', label: '03 代币经济' },
  { href: '/#rewards', label: '04 持币分红' },
  { href: '/#faq', label: '05 FAQ' },
];

export function formatAgentHandle(handle?: string | null): string {
  if (!handle) return '';
  const trimmed = handle.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('.ai') ? trimmed : `${trimmed}.ai`;
}

export function Navbar() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending: isConnectingQuick } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [showBindModal, setShowBindModal] = useState(false);
  const [agentName, setAgentName] = useState('piggy-agent');

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;
  const isWatchMode = connector?.id === WATCH_CONNECTOR_ID;
  const isBuiltinSigner = connector?.id === SIGNER_CONNECTOR_ID;

  const { data: rawHandle, refetch: refetchHandle } = useReadContract({
    address: AGENT_ID_REGISTRY_ADDRESS,
    abi: AGENT_ID_REGISTRY_ABI,
    functionName: 'handleOf',
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
      refetchHandle();
      setShowBindModal(false);
    }
  }, [isSuccess, refetchHandle]);

  const formattedHandle = formatAgentHandle(rawHandle);
  const hasAgentId = Boolean(formattedHandle);
  const cleanHandleInput = agentName.trim().replace(/\.ai$/i, '');
  const validHandle = cleanHandleInput.length >= 2 && cleanHandleInput.length <= 28;

  const handleRegister = async () => {
    if (!validHandle) return;
    if (isWrongChain) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        return;
      }
    }
    writeContract({
      address: AGENT_ID_REGISTRY_ADDRESS,
      abi: AGENT_ID_REGISTRY_ABI,
      functionName: 'register',
      args: [cleanHandleInput],
      chainId: TARGET_CHAIN_ID,
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0b10]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="text-2xl">🐷</span>
          <span>ZHUZHU</span>
          <span className="rounded-md border border-pig-500/30 bg-pig-500/15 px-1.5 py-0.5 text-[11px] font-bold text-pig-400">
            {TARGET_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet'}
          </span>
        </Link>

        <nav className="hidden items-center gap-3.5 xl:gap-5 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-xs font-medium text-slate-300 transition hover:text-pig-400"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isConnected && (
            <>
              <button
                onClick={() =>
                  connectQuickWallet({
                    connectors,
                    connectAsync,
                    disconnectAsync,
                    connectorId: WATCH_CONNECTOR_ID,
                    watchAddress: DEFAULT_WATCH_ADDRESS,
                  })
                }
                disabled={isConnectingQuick}
                className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
              >
                👀 查 AI 钱包地址
              </button>
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
                  className="rounded-xl border border-pig-500/40 bg-pig-500/15 px-2.5 py-1.5 text-xs font-semibold text-pig-200 hover:bg-pig-500/25 disabled:opacity-50"
                >
                  ⚡ 内置测试钱包
                </button>
              )}
            </>
          )}

          {isConnected && HAS_BUILTIN_SIGNER && !isBuiltinSigner && (
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
              className="hidden sm:inline-flex rounded-xl border border-pig-500/40 bg-pig-500/15 px-2.5 py-1.5 text-xs font-semibold text-pig-200 hover:bg-pig-500/25 disabled:opacity-50"
            >
              ⚡ 切内置钱包
            </button>
          )}

          {isConnected && isBuiltinSigner && (
            <button
              onClick={() =>
                connectQuickWallet({
                  connectors,
                  connectAsync,
                  disconnectAsync,
                  connectorId: WATCH_CONNECTOR_ID,
                })
              }
              disabled={isConnectingQuick}
              className="hidden sm:inline-flex rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
            >
              👀 查 AI 钱包地址
            </button>
          )}

          {isWatchMode && (
            <span className="hidden md:inline-flex items-center rounded-xl border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
              🤖 AI 钱包查询模式
            </span>
          )}

          {isWrongChain && (
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="rounded-xl border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/30 disabled:opacity-50"
            >
              {isSwitching ? '切换中...' : `🔄 切 BSC Testnet`}
            </button>
          )}

          {isConnected && !isWrongChain && (
            hasAgentId ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                ✓ {formattedHandle}
              </span>
            ) : (
              <button
                onClick={() => setShowBindModal((v) => !v)}
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
              >
                🪪 测试网绑定 .ai
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
            <p className="text-xs text-slate-300">
              <span className="font-bold text-pig-300">测试网 .ai 身份自助绑定：</span>
              正式主网自动校验 SPACE ID / 币安 AI 钱包{' '}
              <code className="rounded bg-white/10 px-1">.ai</code>；测试网可一键免费注册体验。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="例如 piggy-agent"
                className="rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none focus:border-pig-500"
              />
              <span className="text-xs text-slate-400">.ai</span>
              <button
                onClick={handleRegister}
                disabled={!validHandle || isPending || isConfirming || isSwitching}
                className="rounded-xl bg-pig-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-pig-600 disabled:opacity-40"
              >
                {isPending || isConfirming ? '注册中...' : '一键绑定 .ai'}
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
              绑定失败：{formatContractError(error)}
            </p>
          )}
        </div>
      )}

      {/* Mobile Anchor Nav */}
      <div className="flex items-center gap-4 overflow-x-auto border-t border-white/5 px-4 py-2 lg:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap text-xs text-slate-400 hover:text-pig-400"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
