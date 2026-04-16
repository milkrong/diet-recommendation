import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diet Agent Shanghai",
  description: "买菜订单截图识别与个性化菜谱推荐 agent"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
