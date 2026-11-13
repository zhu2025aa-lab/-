import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, bscTestnet, foundry } from 'viem/chains';

const REGISTRY_ABI = parseAbi([
  'function isAgentWallet(address account) view returns (bool)',
  'function activateAgentWallet(string agentId, uint256 deadline, bytes sig)',
]);

const PIG_BADGE_ABI = parseAbi([
  'function badges(uint256 id) view returns (uint8 level, uint32 xp, uint32 pigs, uint32 streak, uint64 lastWorkAt, address agent, bool verifiedAgent)',
  'function getAgentBadges(address agent) view returns (uint256[] ids, bool[] readyList, uint256[] nextWorkAtList)',
  'function work(uint256 id)',
]);

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
const BADGE_ADDRESS = process.env.PIG_BADGE_ADDRESS as Address | undefined;
const REGISTRY_ADDRESS = process.env.AGENT_REGISTRY_ADDRESS as Address | undefined;
const NETWORK = (process.env.BSC_NETWORK ?? 'testnet').toLowerCase();
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const AGENT_ID = process.env.AGENT_ID ?? 'runner-bot.ai';

if (!PRIVATE_KEY || !BADGE_ADDRESS) {
  console.error('请在 .env 中配置 AGENT_PRIVATE_KEY 与 PIG_BADGE_ADDRESS');
  process.exit(1);
}

const chain =
  NETWORK === 'mainnet' ? bsc : NETWORK === 'localhost' ? foundry : bscTestnet;
const rpcUrl =
  NETWORK === 'mainnet'
    ? process.env.BSC_RPC_URL
    : NETWORK === 'localhost'
      ? 'http://127.0.0.1:8545'
      : process.env.BSC_TESTNET_RPC_URL;

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});

async function ensureActivated() {
  if (!REGISTRY_ADDRESS) return;
  const active = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'isAgentWallet',
    args: [account.address],
  });
  if (!active) {
    console.log(`🪪 检测到 Agent 尚未激活 .ai ID，正在自助激活 ${AGENT_ID}...`);
    const hash = await walletClient.writeContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'activateAgentWallet',
      args: [AGENT_ID, BigInt(0), '0x'],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Agent 激活成功: ${AGENT_ID} (${hash})`);
  }
}

async function tick() {
  try {
    const [ids, readyList, nextWorkAtList] = await publicClient.readContract({
      address: BADGE_ADDRESS!,
      abi: PIG_BADGE_ABI,
      functionName: 'getAgentBadges',
      args: [account.address],
    });

    console.log(
      `[${new Date().toISOString()}] Agent ${account.address} 巡检中，名下工牌数: ${ids.length}`
    );

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const ready = readyList[i];
      const nextWorkAt = nextWorkAtList[i];

      if (!ready) {
        const waitMin = Math.max(
          0,
          Math.ceil((Number(nextWorkAt) * 1000 - Date.now()) / 60_000)
        );
        console.log(`  工牌 #${id} 冷却或未开盘中，预计等待约 ${waitMin} 分钟`);
        continue;
      }

      console.log(`  🐷 工牌 #${id} 就绪，准备调用 work(${id})...`);
      const hash = await walletClient.writeContract({
        address: BADGE_ADDRESS!,
        abi: PIG_BADGE_ABI,
        functionName: 'work',
        args: [id],
      });
      console.log(`  ✅ 已发送打卡交易: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  🎉 工牌 #${id} 打卡确认成功！`);
    }
  } catch (err) {
    console.error('[巡检异常]', err);
  }
}

async function main() {
  console.log(`🐷 ZhuZhu Agent Runner 启动 (网络: ${chain.name}, Agent: ${account.address})`);
  await ensureActivated();
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main();
