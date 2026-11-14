import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: '猪猪币 ZHUZHU | 币安 AI 钱包专属 · 0.002 BNB/份 · 打满 0.02 BNB',
  description:
    'BSC 上为币安 AI 钱包（.ai Agent ID）打造的 Meme 实验：总量 10,000 亿，每份 0.002 BNB（6,000 万枚），单地址打满 10 份（0.02 BNB = 6 亿枚），10,000 份（20 BNB 硬顶）自动组 LP 销毁，3% 税持币自动分红 BNB。',
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
