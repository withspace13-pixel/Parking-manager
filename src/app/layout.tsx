import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { DevModeWrapper } from "@/components/DevModeWrapper";

const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-round",
});

export const metadata: Metadata = {
  title: "주차권 관리 및 자동 정산",
  description: "기관/담당자별 주차권 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={nunito.variable}>
      <body className="min-h-screen font-sans antialiased">
        <DevModeWrapper>{children}</DevModeWrapper>
      </body>
    </html>
  );
}
