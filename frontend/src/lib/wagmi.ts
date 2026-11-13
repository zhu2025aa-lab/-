import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  binanceWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rainbowWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet, foundry } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || 'zhuzhu-agent-local-dev';

const connectors = connectorsForWallets(
  [
    {
      groupName: '推荐钱包（BSC / Agentic）',
      wallets: [
        binanceWallet,
        metaMaskWallet,
        okxWallet,
        trustWallet,
        rainbowWallet,
        injectedWallet,
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
  chains: [bsc, bscTestnet, foundry],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
    [foundry.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
