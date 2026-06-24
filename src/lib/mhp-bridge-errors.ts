// MHP 브리지 실패 메시지를 확장/MHP 탭/MHP 데이터로 분류

export type MhpBridgeErrorKind = "extension" | "mhp_tab" | "mhp_data" | "unknown";

const KIND_LABEL: Record<MhpBridgeErrorKind, string> = {
  extension: "확장",
  mhp_tab: "MHP 탭",
  mhp_data: "MHP",
  unknown: "연동",
};

export function classifyMhpBridgeError(message: string): { kind: MhpBridgeErrorKind; label: string; text: string } {
  const text = String(message ?? "").trim();
  if (!text) {
    return { kind: "unknown", label: KIND_LABEL.unknown, text: "알 수 없는 오류가 발생했습니다." };
  }

  if (/응답이 없습니다/.test(text)) {
    return {
      kind: "extension",
      label: KIND_LABEL.extension,
      text: "응답이 없습니다. 확장 설치·이 탭 새로고침(F5), MHP 콘솔 탭 열림을 확인하세요.",
    };
  }

  if (/확장|Extension|invalidated|새로고침\(F5\)|다시 로드|통신/.test(text)) {
    return { kind: "extension", label: KIND_LABEL.extension, text };
  }

  if (/MHP 콘솔 탭|MHP 탭|humax-parcs|주차 할인|입력칸을 찾지|스크립트를 넣지/.test(text)) {
    return { kind: "mhp_tab", label: KIND_LABEL.mhp_tab, text };
  }

  if (/차량|번호|찾지 못|입차|주차시간|조회|할인/.test(text)) {
    return { kind: "mhp_data", label: KIND_LABEL.mhp_data, text };
  }

  return { kind: "unknown", label: KIND_LABEL.unknown, text };
}

export function formatMhpBridgeAlert(message: string): string {
  const { label, text } = classifyMhpBridgeError(message);
  return `[${label}] ${text}`;
}
