'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type EIP1193Provider, getAddress } from 'viem';
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
  BROWSER_PLUGIN_CONNECTOR_ID,
  WATCH_CONNECTOR_ID,
  detectBrowserWallets,
  ensureTargetBscChain,
  formatWalletError,
  inferProviderName,
  setSelectedBrowserPlugin,
  subscribeWalletModal,
  type DetectedBrowserWallet,
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
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [showBindModal, setShowBindModal] = useState(false);
  const [agentName, setAgentName] = useState('piggy-agent');

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<DetectedBrowserWallet[]>([]);
  const [walletModalError, setWalletModalError] = useState('');
  const [isConnectingPlugin, setIsConnectingPlugin] = useState(false);

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  // Clear any legacy watch-mode connector session automatically
  useEffect(() => {
    if (isConnected && connector?.id === WATCH_CONNECTOR_ID) {
      disconnectAsync().catch(() => {});
    }
  }, [isConnected, connector?.id, disconnectAsync]);

  const handleOpenWalletModal = useCallback(() => {
    setWalletModalError('');
    setDetectedWallets(detectBrowserWallets());
    setWalletModalOpen(true);
  }, []);

  useEffect(() => {
    return subscribeWalletModal(handleOpenWalletModal);
  }, [handleOpenWalletModal]);

  useEffect(() => {
    if (!walletModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWalletModalOpen(false);
    };
    const onAnnounce = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          info?: { name?: string; icon?: string; rdns?: string };
          provider?: EIP1193Provider & {
            isOkxWallet?: boolean;
            isMetaMask?: boolean;
            isBinance?: boolean;
            isTrust?: boolean;
          };
        }>
      ).detail;
      if (!detail?.provider) return;
      setDetectedWallets((prev) => {
        if (prev.some((w) => w.provider === detail.provider)) return prev;
        return [
          ...prev,
          {
            provider: detail.provider!,
            name: detail.info?.name || inferProviderName(detail.provider!),
            icon: detail.info?.icon,
            rdns: detail.info?.rdns,
          },
        ];
      });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
    };
  }, [walletModalOpen]);

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

  const handleConnectPlugin = async (wallet: DetectedBrowserWallet) => {
    setWalletModalError('');
    setIsConnectingPlugin(true);
    try {
      await ensureTargetBscChain(wallet.provider, TARGET_CHAIN_ID);
      const accounts = (await wallet.provider.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (!accounts?.length) {
        throw new Error('钱包未返回可用地址');
      }
      const addr = getAddress(accounts[0]);
      setSelectedBrowserPlugin(wallet.provider, addr);
      const pluginConnector = connectors.find((c) => c.id === BROWSER_PLUGIN_CONNECTOR_ID);
      if (!pluginConnector) {
        throw new Error('浏览器钱包连接器未就绪，请刷新页面重试');
      }
      await disconnectAsync().catch(() => {});
      await connectAsync({ connector: pluginConnector });
      setWalletModalOpen(false);
    } catch (err) {
      setWalletModalError(formatWalletError(err));
    } finally {
      setIsConnectingPlugin(false);
    }
  };

  const handleDisconnectWallet = async () => {
    await disconnectAsync().catch(() => {});
    setWalletModalError('');
    setWalletModalOpen(false);
  };

  return (
    <>
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
            {isWrongChain && (
              <button
                onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                disabled={isSwitching}
                className="rounded-xl border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/30 disabled:opacity-50"
              >
                {isSwitching ? '切换中...' : `🔄 切 ${TARGET_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC 主网'}`}
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

            <button
              id="wallet"
              onClick={handleOpenWalletModal}
              className="rounded-xl bg-pig-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-pig-500/25 transition hover:bg-pig-600"
            >
              {isConnected && address
                ? `${address.slice(0, 6)}…${address.slice(-4)}`
                : '连接钱包 ↗'}
            </button>
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

      {walletModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWalletModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            className="w-full max-w-md rounded-3xl border border-pig-500/30 bg-[#12121b] p-6 shadow-2xl shadow-black/70 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="wallet-modal-title" className="text-lg font-extrabold text-white">
                连接钱包
              </h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setWalletModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-slate-300 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              连接 BSC 地址后自动检查官方 .ai Agent ID。核验依据为链上身份，钱包插件名称不作为资格证明。
            </p>

            {isConnected && address && (
              <div className="rounded-2xl border border-white/10 bg-black/45 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">当前已连接地址</span>
                  <span className="font-mono text-white">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                </div>
                <p
                  className={`text-xs font-semibold ${
                    hasAgentId ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {hasAgentId
                    ? `✓ 核验通过 · ${formattedHandle}`
                    : '无 Mint 资格：当前地址未领取 .ai Agent ID'}
                </p>
                <button
                  type="button"
                  onClick={handleDisconnectWallet}
                  className="w-full rounded-xl border border-red-500/35 bg-red-500/15 py-2 text-xs font-bold text-red-200 hover:bg-red-500/25"
                >
                  断开钱包连接
                </button>
              </div>
            )}

            <div id="wallet-options" className="space-y-2">
              {detectedWallets.length === 0 ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-200">
                  未检测到钱包插件。请在安装钱包的 Chrome、Edge 或钱包内置浏览器中打开本站。
                </div>
              ) : (
                detectedWallets.map((w, idx) => (
                  <button
                    key={`${w.name}-${idx}`}
                    type="button"
                    disabled={isConnectingPlugin}
                    onClick={() => handleConnectPlugin(w)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm font-bold text-white transition hover:border-pig-500/50 hover:bg-pig-500/15 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5">
                      {w.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.icon} alt="" className="h-5 w-5 rounded" />
                      )}
                      <span>{w.name}</span>
                    </span>
                    <span className="text-xs text-pig-300">
                      {isConnectingPlugin ? '连接中...' : '连接 ↗'}
                    </span>
                  </button>
                ))
              )}
            </div>

            {walletModalError && (
              <p id="wallet-error" className="text-xs text-red-400">
                {walletModalError}
              </p>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setWalletModalOpen(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
