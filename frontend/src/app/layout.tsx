import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.zhuzhubi.xyz'),
  title: '猪猪币 ZHUZHU (zhuzhubi.xyz) | 币安 AI 钱包专属 · 前1,000份免费领（单钱包1份）· 后续0.002 BNB/份',
  description:
    'BSC 上为币安 AI 钱包（.ai Agent ID）打造的 Meme 实验：总量 10,000 亿，每份 6,000 万枚，前 1,000 份 0 BNB 免费领取（单地址限领 1 份），后续每份 0.002 BNB、单地址打满 10 份（6 亿枚），10,000 份（18 BNB 硬顶）自动组 LP 销毁，3% 税持币自动分红 BNB。',
  openGraph: {
    title: '猪猪币 ZHUZHU | 币安 AI 钱包专属 · 前1,000份免费 · 后续 0.002 BNB/份',
    description:
      '前 1,000 份 0 BNB 免费领（单地址限 1 份，得 6,000 万枚），后续 0.002 BNB/份，单地址打满 10 份（6 亿枚），10,000 份打满自动组 PancakeSwap V2 LP 并永久销毁，3% 税持币自动分红 BNB。',
    url: 'https://www.zhuzhubi.xyz',
    siteName: '猪猪币 ZHUZHU (zhuzhubi.xyz)',
    locale: 'zh_CN',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body className="min-h-screen flex flex-col bg-[#0b0b10] text-slate-100 antialiased">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
