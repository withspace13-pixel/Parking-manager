// 설문 상단 헤더 미리보기 (이미지·PDF)
import { isSurveyHeaderImage, isSurveyHeaderPdf } from "@/lib/survey/header-media";

type Props = {
  url: string;
  className?: string;
  imageClassName?: string;
  /** 공개 설문: 가로 폭에 맞춰 꽉 채움 */
  variant?: "contain" | "cover";
};

export function SurveyHeaderMedia({
  url,
  className = "",
  imageClassName = "",
  variant = "contain",
}: Props) {
  const isCover = variant === "cover";

  if (isSurveyHeaderPdf(url)) {
    return (
      <div className={className}>
        <object
          data={url}
          type="application/pdf"
          className={
            isCover
              ? "block h-56 w-full bg-white sm:h-64"
              : "mx-auto h-48 w-full max-w-lg rounded border border-[var(--border)] bg-white"
          }
        >
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--primary)] underline"
          >
            PDF 파일 보기
          </a>
        </object>
      </div>
    );
  }

  if (isSurveyHeaderImage(url)) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="설문 상단 이미지"
          className={
            imageClassName ||
            (isCover
              ? "block w-full object-cover object-center"
              : "mx-auto max-h-48 w-full max-w-lg object-contain")
          }
        />
      </div>
    );
  }

  return null;
}
