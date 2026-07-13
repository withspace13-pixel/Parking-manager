// 설문 제출 완료 화면 문구 표시 (첫 줄 제목·이후 본문)
type Props = {
  message: string;
  className?: string;
};

export function SurveyCompletionMessageView({ message, className = "" }: Props) {
  const trimmed = message.trim() || "";
  const newline = trimmed.indexOf("\n");
  const title = newline === -1 ? trimmed : trimmed.slice(0, newline).trim();
  const body = newline === -1 ? "" : trimmed.slice(newline + 1).trim();

  return (
    <div className={`text-center ${className}`.trim()}>
      {title ? <h1 className="text-xl font-bold text-[var(--text)]">{title}</h1> : null}
      {body ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
      ) : null}
    </div>
  );
}
