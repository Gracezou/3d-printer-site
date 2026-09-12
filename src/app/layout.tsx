import type { Metadata } from 'next';

import { getSiteOrigin } from '@/lib/seo';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: '书衣｜电子阅读器保护壳',
    template: '%s｜书衣',
  },
  description:
    '为每一台阅读器做一件合身的壳。按单打印，冷门机型与停产老款也做。',
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
