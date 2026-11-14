import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  binanceWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rainbowWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { fallback } from 'viem';
import { createConfig, http } from 'wagmi';
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

const connectors = connectorsForWallets(
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
  connectors,
  chains,
  transports: {
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || 'https://bsc-dataseed.bnbchain.org'),
    [bscTestnet.id]: fallback([
      http(
        process.env.NEXT_PUBLIC_BSC_TESTNET_RPC ||
          'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
      ),
      http('https://data-seed-prebsc-2-s1.bnbchain.org:8545'),
      http('https://bsc-testnet-rpc.publicnode.com'),
    ]),
    [foundry.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
