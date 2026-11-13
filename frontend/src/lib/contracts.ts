import { parseAbi, type Address } from 'viem';

export const AGENT_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

export const ZHUZHU_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_ZHUZHU_TOKEN_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

export const PIG_BADGE_ADDRESS = (process.env.NEXT_PUBLIC_PIG_BADGE_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

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
