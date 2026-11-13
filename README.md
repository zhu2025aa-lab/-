# 🐷 ZhuZhu Agent（猪猪币）

> 你躺平，Agent 养猪 · You lie flat, Agent raises pigs.

完整方案见 [docs/PLAN.md](docs/PLAN.md)。

## 目录
- `contracts/`：Foundry 项目（ZhuZhuToken / GamePool / PigBadge）
- `frontend/`：Next.js 前端（待初始化）
- `agent-runner/`：Agent 自动打卡脚本（待实现）

## 快速开始
```bash
cp .env.example .env          # 填入你的 API Key / 私钥（不会被提交）
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge build
```
