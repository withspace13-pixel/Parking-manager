// 설문 제출 완료 화면 문구 표시 (첫 줄 제목·이후 본문)
type Props = {
  message: string;
  className?: string;
  variant?: "default" | "mobile";
};

export function SurveyCompletionMessageView({
  message,
  className = "",
  variant = "default",
}: Props) {
  const trimmed = message.trim() || "";
  const newline = trimmed.indexOf("\n");
  const title = newline === -1 ? trimmed : trimmed.slice(0, newline).trim();
  const body = newline === -1 ? "" : trimmed.slice(newline + 1).trim();
  const titleClass =
    variant === "mobile" ? "text-lg font-bold text-[var(--text)]" : "text-xl font-bold text-[var(--text)]";

  const bodyClass =
    variant === "mobile"
      ? "mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]"
      : "mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]";

  return (
    <div className={`text-center ${className}`.trim()}>
      {title ? <h1 className={titleClass}>{title}</h1> : null}
      {body ? <p className={bodyClass}>{body}</p> : null}
    </div>
  );
}
