import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, bscTestnet } from 'viem/chains';

const PIG_BADGE_ABI = parseAbi([
  'function nextId() view returns (uint256)',
  'function badges(uint256 id) view returns (uint8 level, uint32 xp, uint32 pigs, uint32 streak, uint64 lastWorkAt, address agent, bool verifiedAgent)',
  'function canWork(uint256 id) view returns (bool ready, uint256 nextWorkAt)',
  'function work(uint256 id)',
]);

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
const BADGE_ADDRESS = process.env.PIG_BADGE_ADDRESS as Address | undefined;
const USE_TESTNET = process.env.BSC_NETWORK === 'testnet';
const RPC_URL = USE_TESTNET
  ? process.env.BSC_TESTNET_RPC_URL
  : process.env.BSC_RPC_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

if (!PRIVATE_KEY || !BADGE_ADDRESS) {
  console.error('请在 .env 中配置 AGENT_PRIVATE_KEY 与 PIG_BADGE_ADDRESS');
  process.exit(1);
}

const chain = USE_TESTNET ? bscTestnet : bsc;
const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC_URL),
});

async function tick() {
  try {
    const nextId = await publicClient.readContract({
      address: BADGE_ADDRESS!,
      abi: PIG_BADGE_ABI,
      functionName: 'nextId',
    });

    const total = Number(nextId) - 1;
    console.log(`[${new Date().toISOString()}] Agent ${account.address} 巡检中，已铸造工牌数: ${total}`);

    for (let id = 1n; id <= BigInt(total); id++) {
      const badge = await publicClient.readContract({
        address: BADGE_ADDRESS!,
        abi: PIG_BADGE_ABI,
        functionName: 'badges',
        args: [id],
      });

      const assignedAgent = badge[5];
      if (assignedAgent.toLowerCase() !== account.address.toLowerCase()) {
        continue;
      }

      const [ready, nextWorkAt] = await publicClient.readContract({
        address: BADGE_ADDRESS!,
        abi: PIG_BADGE_ABI,
        functionName: 'canWork',
        args: [id],
      });

      if (!ready) {
        const waitMin = Math.max(0, Math.ceil((Number(nextWorkAt) * 1000 - Date.now()) / 60_000));
        console.log(`  工牌 #${id} (Lv${badge[0]}, 猪仔=${badge[2]}) 冷却中，还需约 ${waitMin} 分钟`);
        continue;
      }

      console.log(`  🐷 工牌 #${id} 冷却完成，准备调用 work(${id})...`);
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

console.log(`🐷 ZhuZhu Agent Runner 启动 (网络: ${chain.name}, Agent: ${account.address})`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
