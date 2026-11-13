import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'ZhuZhu Agent 猪猪币 | 你躺平，Agent 养猪',
  description: 'BSC 上第一个 AI 代养猪 Meme 实验：铸造 $ZHUZHU，领猪舍工牌，交给 Agent 自动养猪升级。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
