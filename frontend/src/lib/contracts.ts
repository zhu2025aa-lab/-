import { parseAbi, type Address } from 'viem';

export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);

export const AGENT_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

export const ZHUZHU_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_ZHUZHU_TOKEN_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

export const PIG_BADGE_ADDRESS = (process.env.NEXT_PUBLIC_PIG_BADGE_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

export function formatContractError(err: unknown): string {
  if (!err) return '未知错误，请稍后重试';
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (msg.includes('user rejected') || msg.includes('userrevoked') || msg.includes('rejected the request') || msg.includes('user denied')) {
    return '您已在钱包中取消签名或拒绝交易';
  }
  if (msg.includes('chainmismatch') || msg.includes('does not match the target chain') || msg.includes('wrong network') || msg.includes('unsupported chain')) {
    return `钱包当前网络不匹配，请先切换至 BSC Testnet (Chain ID ${TARGET_CHAIN_ID})`;
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds the balance of the account')) {
    return '钱包 tBNB 余额不足以支付金额或 Gas 费';
  }
  if (msg.includes('only bsc ai agent wallet')) {
    return '仅限已激活 .ai ID 的 BSC AI Agent 钱包参与，请先完成第 0 步激活';
  }
  if (msg.includes('must end with .ai')) {
    return 'Agent ID 必须以 .ai 结尾（长度 4-32 个字符）';
  }
  if (msg.includes('agentid taken')) {
    return '该 .ai Agent ID 已被其他钱包占用，请换一个名称';
  }
  if (msg.includes('already activated')) {
    return '当前钱包已经激活过 .ai Agent ID';
  }
  if (msg.includes('wallet cap')) {
    return '已达到单钱包铸造/持有上限';
  }
  if (msg.includes('trading not open')) {
    return '尚未开盘（Launch 后才可开始 Agent 养猪打卡）';
  }
  if (msg.includes('pigs are sleeping')) {
    return '猪仔还在休息中，需等待 8 小时冷却结束再打卡';
  }
  if (msg.includes('agent must be ai agent wallet')) {
    return '被委托的 Agent 地址必须先在 AgentWalletRegistry 激活 .ai ID';
  }
  if (msg.includes('bad agent sig') || msg.includes('bad sig') || msg.includes('expired')) {
    return 'Agent 签名无效或已过期';
  }
  if (msg.includes('need more xp')) {
    return '当前经验 XP 不足，无法升级';
  }
  if (msg.includes('exceeds allowance') || msg.includes('insufficient allowance')) {
    return 'ZHUZHU 授权额度不足，请先点击 Approve 授权';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('http request failed') || msg.includes('fetch failed') || msg.includes('network error')) {
    return 'BSC Testnet RPC 节点网络波动，请稍后重试';
  }
  return raw.split('\n')[0].slice(0, 120);
}

export const AGENT_REGISTRY_ABI = parseAbi([
  'function isAgentWallet(address account) view returns (bool)',
  'function agentIdOf(address account) view returns (string)',
  'function totalAgents() view returns (uint256)',
  'function requireSignature() view returns (bool)',
  'function activateAgentWallet(string agentId, uint256 deadline, bytes sig)',
]);

export const ZHUZHU_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function packsSold() view returns (uint256)',
  'function packsOf(address user) view returns (uint256)',
  'function mintEnd() view returns (uint256)',
  'function tradingOpen() view returns (bool)',
  'function refRewards(address user) view returns (uint256)',
  'function buybackBnb() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function pair() view returns (address)',
  'function mintPacks(uint256 packs, address ref) payable',
  'function claimRefReward()',
  'function launch()',
]);

export const PIG_BADGE_ABI = parseAbi([
  'function nextId() view returns (uint256)',
  'function totalPigs() view returns (uint256)',
  'function emittedToday() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokensOfOwner(address owner) view returns (uint256[])',
  'function badges(uint256 id) view returns (uint8 level, uint32 xp, uint32 pigs, uint32 streak, uint64 lastWorkAt, address agent, bool verifiedAgent)',
  'function canWork(uint256 id) view returns (bool ready, uint256 nextWorkAt)',
  'function getAgentBadges(address agent) view returns (uint256[] ids, bool[] readyList, uint256[] nextWorkAtList)',
  'function tokenURI(uint256 id) view returns (string)',
  'function mint() returns (uint256)',
  'function assignAgent(uint256 id, address agent)',
  'function revokeAgent(uint256 id)',
  'function work(uint256 id)',
  'function levelUp(uint256 id)',
  'event Worked(uint256 indexed id, address indexed agent, uint256 reward, uint32 xp, uint32 pigs)',
]);

export const LEVELS = [
  { level: 1, name: '养猪学徒', en: 'Piglet Intern', emoji: '🐽', xpToNext: 100, upgradeBurn: 300, mult: '1.00x', pigsPerWork: 1 },
  { level: 2, name: '猪舍工人', en: 'Pen Worker', emoji: '🧹', xpToNext: 300, upgradeBurn: 800, mult: '1.50x', pigsPerWork: 2 },
  { level: 3, name: '猪场主管', en: 'Farm Supervisor', emoji: '📋', xpToNext: 600, upgradeBurn: 2000, mult: '2.20x', pigsPerWork: 3 },
  { level: 4, name: '区域猪老板', en: 'Regional Pig Boss', emoji: '🏭', xpToNext: 1200, upgradeBurn: 5000, mult: '3.50x', pigsPerWork: 5 },
  { level: 5, name: '终极猪皇', en: 'Pig Emperor', emoji: '👑', xpToNext: 0, upgradeBurn: 0, mult: '6.00x', pigsPerWork: 8 },
] as const;
