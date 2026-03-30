import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diet Agent Shanghai",
  description: "个性化饮食计划与上海山姆购物清单推荐 agent"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
