import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  binanceWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rainbowWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import {
  type Address,
  type EIP1193Provider,
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  isAddress,
  numberToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { type Connector, createConfig, createConnector, http } from 'wagmi';
import { bsc, bscTestnet, foundry } from 'wagmi/chains';

const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  '3a8170812b534d0ff9d794f19a901d64';

const defaultChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);

const chains =
  defaultChainId === 97
    ? ([bscTestnet] as const)
    : defaultChainId === 31337
      ? ([foundry] as const)
      : ([bsc] as const);

const activeChain = chains[0];

const bscTestnetTransport = fallback([
  http(
    process.env.NEXT_PUBLIC_BSC_TESTNET_RPC ||
      'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
  ),
  http('https://data-seed-prebsc-2-s1.bnbchain.org:8545'),
  http('https://bsc-testnet-rpc.publicnode.com'),
]);

const activeTransport =
  activeChain.id === 97
    ? bscTestnetTransport
    : activeChain.id === 31337
      ? http('http://127.0.0.1:8545')
      : http(process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed.bnbchain.org');

export const WATCH_CONNECTOR_ID = 'zhuzhu-watch-address';
export const SIGNER_CONNECTOR_ID = 'zhuzhu-testnet-signer';
export const DEFAULT_WATCH_ADDRESS: Address = '0x7b3024717969ca7c3dcd5aa681faff7b335da1b8';

const WATCH_STORAGE_KEY = 'zhuzhu_watch_address';
const ACTIVE_CUSTOM_STORAGE_KEY = 'zhuzhu_active_custom_connector';

const DEMO_SIGNER_KEY = process.env.NEXT_PUBLIC_DEMO_SIGNER_KEY;
export const HAS_BUILTIN_SIGNER = Boolean(
  DEMO_SIGNER_KEY && /^0x[0-9a-fA-F]{64}$/.test(DEMO_SIGNER_KEY)
);

const demoAccount = HAS_BUILTIN_SIGNER
  ? privateKeyToAccount(DEMO_SIGNER_KEY as `0x${string}`)
  : null;

export const BUILTIN_SIGNER_ADDRESS: Address | null = demoAccount?.address ?? null;

export function getWatchAddress(): Address {
  if (typeof window === 'undefined') return getAddress(DEFAULT_WATCH_ADDRESS);
  const saved = window.localStorage.getItem(WATCH_STORAGE_KEY);
  return saved && isAddress(saved) ? getAddress(saved) : getAddress(DEFAULT_WATCH_ADDRESS);
}

export function setWatchAddress(addr: string): Address {
  const normalized = isAddress(addr) ? getAddress(addr) : getAddress(DEFAULT_WATCH_ADDRESS);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WATCH_STORAGE_KEY, normalized);
  }
  return normalized;
}

export async function connectQuickWallet({
  connectors,
  connectAsync,
  disconnectAsync,
  connectorId,
  watchAddress,
}: {
  connectors: readonly Connector[];
  connectAsync: (params: { connector: Connector }) => Promise<unknown>;
  disconnectAsync: () => Promise<unknown>;
  connectorId: string;
  watchAddress?: string;
}) {
  if (watchAddress && connectorId === WATCH_CONNECTOR_ID) {
    setWatchAddress(watchAddress);
  }
  const target = connectors.find((c) => c.id === connectorId);
  if (!target) return;
  await disconnectAsync().catch(() => {});
  await connectAsync({ connector: target });
}

function createEip1193Provider(
  handler: (method: string, params: unknown) => Promise<unknown>
): EIP1193Provider {
  const publicClient = createPublicClient({
    chain: activeChain,
    transport: activeTransport,
  });
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
    async request({ method, params }: { method: string; params?: unknown }) {
      if (method === 'eth_chainId') return numberToHex(activeChain.id);
      if (method === 'net_version') return String(activeChain.id);
      const handled = await handler(method, params);
      if (handled !== undefined) return handled;
      return publicClient.request({
        method: method as never,
        params: params as never,
      });
    },
  } as unknown as EIP1193Provider;
}

function makeCustomConnector({
  id,
  name,
  type,
  getAddressForConnect,
  buildProvider,
}: {
  id: string;
  name: string;
  type: string;
  getAddressForConnect: () => Address | null;
  buildProvider: () => EIP1193Provider;
}) {
  let provider: EIP1193Provider | undefined;

  return createConnector<EIP1193Provider>((config) => ({
    id,
    name,
    type,
    async connect({ withCapabilities } = {}) {
      const addr = getAddressForConnect();
      if (!addr) {
        throw new Error('未找到可用钱包地址或测试私钥');
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_CUSTOM_STORAGE_KEY, id);
      }
      const accounts = [addr] as const;
      return {
        accounts: (withCapabilities
          ? accounts.map((address) => ({ address, capabilities: {} }))
          : accounts) as never,
        chainId: activeChain.id,
      };
    },
    async disconnect() {
      if (
        typeof window !== 'undefined' &&
        window.localStorage.getItem(ACTIVE_CUSTOM_STORAGE_KEY) === id
      ) {
        window.localStorage.removeItem(ACTIVE_CUSTOM_STORAGE_KEY);
      }
    },
    async getAccounts() {
      const addr = getAddressForConnect();
      return addr ? [addr] : [];
    },
    async getChainId() {
      return activeChain.id;
    },
    async getProvider() {
      if (!provider) provider = buildProvider();
      return provider;
    },
    async isAuthorized() {
      if (typeof window === 'undefined' || !getAddressForConnect()) return false;
      return window.localStorage.getItem(ACTIVE_CUSTOM_STORAGE_KEY) === id;
    },
    async switchChain({ chainId }) {
      const target = config.chains.find((c) => c.id === chainId) ?? activeChain;
      config.emitter.emit('change', { chainId: target.id });
      return target;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) config.emitter.emit('disconnect');
      else config.emitter.emit('change', { accounts: accounts.map((a) => getAddress(a)) });
    },
    onChainChanged(chainIdHex) {
      config.emitter.emit('change', { chainId: Number(chainIdHex) });
    },
    onDisconnect() {
      config.emitter.emit('disconnect');
    },
  }));
}

function watchAddressConnector() {
  return makeCustomConnector({
    id: WATCH_CONNECTOR_ID,
    name: '地址直连模式 (免扫码)',
    type: 'watch-address',
    getAddressForConnect: () => getWatchAddress(),
    buildProvider: () =>
      createEip1193Provider(async (method) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return [getWatchAddress()];
        }
        if (
          method === 'eth_sendTransaction' ||
          method === 'eth_signTransaction' ||
          method === 'personal_sign' ||
          method === 'eth_sign' ||
          method === 'eth_signTypedData_v4'
        ) {
          throw new Error(
            '当前为地址免密直连模式（无该地址私钥），无法签名发送交易；请点击「⚡ 切换内置可签名测试钱包」直接体验链上交易，或在装有该钱包插件的浏览器中打开页面'
          );
        }
        return undefined;
      }),
  });
}

function builtinSignerConnector() {
  return makeCustomConnector({
    id: SIGNER_CONNECTOR_ID,
    name: '内置测试网 AI 钱包 (可真实发交易)',
    type: 'builtin-signer',
    getAddressForConnect: () => demoAccount?.address ?? null,
    buildProvider: () =>
      createEip1193Provider(async (method, params) => {
        if (!demoAccount) throw new Error('未配置内置测试网签名钱包私钥');
        const walletClient = createWalletClient({
          account: demoAccount,
          chain: activeChain,
          transport: activeTransport,
        });

        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return [demoAccount.address];
        }
        if (method === 'eth_sendTransaction') {
          const tx = ((params as unknown[])?.[0] || {}) as {
            to?: Address;
            data?: `0x${string}`;
            value?: `0x${string}`;
            gas?: `0x${string}`;
          };
          return walletClient.sendTransaction({
            account: demoAccount,
            chain: activeChain,
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            ...(activeChain.id === 97
              ? { gasPrice: 3_000_000_000n, type: 'legacy' as const }
              : {}),
          });
        }
        if (method === 'personal_sign') {
          const [messageHex] = (params as [string, Address]) || [];
          return walletClient.signMessage({
            account: demoAccount,
            message: { raw: messageHex as `0x${string}` },
          });
        }
        if (method === 'eth_signTypedData_v4') {
          const [, typedDataJson] = (params as [Address, string]) || [];
          const parsed =
            typeof typedDataJson === 'string' ? JSON.parse(typedDataJson) : typedDataJson;
          return walletClient.signTypedData({
            account: demoAccount,
            domain: parsed.domain,
            types: parsed.types,
            primaryType: parsed.primaryType,
            message: parsed.message,
          });
        }
        return undefined;
      }),
  });
}

const rainbowConnectors = connectorsForWallets(
  [
    {
      groupName: '推荐钱包（BSC / Agentic）',
      wallets: [
        injectedWallet,
        binanceWallet,
        metaMaskWallet,
        okxWallet,
        trustWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'ZhuZhu Agent 猪猪币',
    projectId,
  }
);

export const config = createConfig({
  connectors: [
    ...rainbowConnectors,
    watchAddressConnector(),
    ...(HAS_BUILTIN_SIGNER ? [builtinSignerConnector()] : []),
  ],
  chains,
  transports: {
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed.bnbchain.org'),
    [bscTestnet.id]: bscTestnetTransport,
    [foundry.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
