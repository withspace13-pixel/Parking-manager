import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "만족도 설문",
  description: "위드스페이스 만족도 조사",
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return <div className="survey-public-theme">{children}</div>;
}
