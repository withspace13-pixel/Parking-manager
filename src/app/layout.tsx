import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Nunito } from "next/font/google";
import "./globals.css";
import { DevCssHealthCheck } from "@/components/DevCssHealthCheck";
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
  /* globals.css 청크 로딩 실패(.next 불일치 등) 시에도 배경·글자색·글꼴이 기본값으로 보이도록 */
  const baseBodyStyle: CSSProperties = {
    backgroundColor: "#F8FAFC",
    color: "#1E293B",
    fontFamily: '"Pretendard", system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
    minHeight: "100vh",
  };

  return (
    <html lang="ko" className={nunito.variable}>
      <body className="min-h-screen font-sans antialiased" style={baseBodyStyle}>
        <DevCssHealthCheck />
        <DevModeWrapper>{children}</DevModeWrapper>
      </body>
    </html>
  );
}
