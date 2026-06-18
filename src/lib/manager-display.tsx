// 담당자 이름·휴대폰 번호 표시·입력 정규화

/** 입력·저장용: 숫자만 (최대 11자리) */
export function sanitizeManagerPhoneDigits(value: string): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function managerPhoneText(phone: string | null | undefined): string {
  return sanitizeManagerPhoneDigits(phone ?? "");
}

/** 화면 표시용: 01012345678 → 010-1234-5678 */
export function formatManagerPhoneDisplay(phone: string | null | undefined): string {
  const digits = managerPhoneText(phone);
  if (!digits) return "";
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith("02")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

type ManagerNameWithPhoneProps = {
  manager: string;
  managerPhone?: string | null;
  /** 이름 앞 구분자 (예: " / ") */
  prefix?: string;
  nameClassName?: string;
  phoneClassName?: string;
};

export function ManagerNameWithPhone({
  manager,
  managerPhone,
  prefix = "",
  nameClassName,
  phoneClassName = "font-normal text-[var(--text-muted)]",
}: ManagerNameWithPhoneProps) {
  const phone = formatManagerPhoneDisplay(managerPhone);
  return (
    <>
      {prefix}
      <span className={nameClassName}>{manager}</span>
      {phone ? <span className={phoneClassName}> {phone}</span> : null}
    </>
  );
}
