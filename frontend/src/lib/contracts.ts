import { parseAbi, type Address } from 'viem';

export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 56);

export const ZHUZHU_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_ZHUZHU_TOKEN_ADDRESS ||
  '0x2b41Ba439E661b751BB1bc11cD0F1d4ADEE36218') as Address;

export const AGENT_ID_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
  '0x9fd5C0a14b71b169C770e6994155117afC680e8f') as Address;

export const DIVIDEND_TRACKER_ADDRESS = (process.env.NEXT_PUBLIC_DIVIDEND_TRACKER_ADDRESS ||
  '0x1F2B7f19D13937008172ECaBB18096047188Db7D') as Address;

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;

export function formatContractError(err: unknown): string {
  if (!err) return '未知错误，请稍后重试';
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('当前为地址免密直连模式')) {
    return raw;
  }
  const msg = raw.toLowerCase();

  if (
    msg.includes('user rejected') ||
    msg.includes('userrevoked') ||
    msg.includes('rejected the request') ||
    msg.includes('user denied')
  ) {
    return '您已在钱包中取消签名或拒绝交易';
  }
  if (
    msg.includes('chainmismatch') ||
    msg.includes('does not match the target chain') ||
    msg.includes('wrong network') ||
    msg.includes('unsupported chain')
  ) {
    return `钱包当前网络不匹配，请先切换至 ${TARGET_CHAIN_ID === 97 ? 'BSC Testnet' : 'BNB Smart Chain 主网'} (Chain ID ${TARGET_CHAIN_ID})`;
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds the balance of the account')) {
    return '钱包 BNB 余额不足以支付认购金额或 Gas 费';
  }
  if (msg.includes('binance ai agent id')) {
    return '仅限已绑定 .ai Agent ID 的币安 AI 钱包参与认购';
  }
  if (msg.includes('wallet cap reached')) {
    return '已达到单钱包上限（最多 10 份 = 0.02 BNB）';
  }
  if (msg.includes('exceeds total lots')) {
    return '剩余可认购份数不足';
  }
  if (msg.includes('mint closed')) {
    return '社区认购已结束（已满额或已自动开盘组池）';
  }
  if (msg.includes('already claimed 1 free lot')) {
    return '该钱包已领取过 1 份免费额度，继续认购需支付 0.002 BNB/份';
  }
  if (msg.includes('incorrect bnb amount')) {
    return '支付的 BNB 金额必须与合约报价一致（含首份免费优惠或 0.002 BNB/份）';
  }
  if (msg.includes('already registered')) {
    return '当前钱包已绑定 .ai 身份，可直接参与认购';
  }
  if (msg.includes('handle taken')) {
    return '该 .ai 名称已被占用，请更换一个名称';
  }
  if (msg.includes('no dividends')) {
    return '当前暂无可领取的 BNB 分红（需持币 ≥ 1,000,000 ZHUZHU 且分红池产生税收）';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('http request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return 'BSC RPC 节点网络波动，请稍后重试';
  }
  return raw.split('\n')[0].slice(0, 120);
}

export const ZHUZHU_ABI = parseAbi([
  'function MINT_START_TIME() view returns (uint256)',
  'function AGENT_ID_REGISTRY() view returns (address)',
  'function DIVIDEND_TRACKER() view returns (address)',
  'function LOT_PRICE() view returns (uint256)',
  'function MAX_LOTS_PER_WALLET() view returns (uint256)',
  'function TOTAL_LOTS() view returns (uint256)',
  'function FREE_LOTS() view returns (uint256)',
  'function FREE_LOTS_PER_WALLET() view returns (uint256)',
  'function TOKENS_PER_LOT() view returns (uint256)',
  'function TOTAL_SUPPLY() view returns (uint256)',
  'function hasAgentId(address account) view returns (bool)',
  'function agentHandleOf(address account) view returns (string)',
  'function mintOpen() view returns (bool)',
  'function tradingLive() view returns (bool)',
  'function lotsMinted() view returns (uint256)',
  'function freeLotsMinted() view returns (uint256)',
  'function mintedLots(address account) view returns (uint256)',
  'function hasClaimedFree(address account) view returns (bool)',
  'function canClaimFree(address account) view returns (bool)',
  'function quoteMintCost(address account, uint256 lots) view returns (uint256 costWei, uint256 freeLotsUsed)',
  'function raisedBnb() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function pair() view returns (address)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function mint(uint256 lots) payable',
]);

export const AGENT_ID_REGISTRY_ABI = parseAbi([
  'function handleOf(address account) view returns (string)',
  'function totalAgents() view returns (uint256)',
  'function register(string handle)',
]);

export const DIVIDEND_TRACKER_ABI = parseAbi([
  'function MIN_BALANCE() view returns (uint256)',
  'function withdrawable(address account) view returns (uint256)',
  'function withdrawn(address account) view returns (uint256)',
  'function totalDistributed() view returns (uint256)',
  'function eligibleSupply() view returns (uint256)',
  'function isEligible(address account) view returns (bool)',
  'function claim() returns (uint256)',
]);
