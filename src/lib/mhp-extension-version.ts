// 웹 앱이 요구하는 MHP 브리지 확장 최소 버전

export const MHP_EXTENSION_REQUIRED_VERSION = "1.3.7";

function parseVersionParts(v: string): number[] {
  return String(v)
    .trim()
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

export function compareExtensionVersion(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function isExtensionVersionUpToDate(installed: string): boolean {
  return compareExtensionVersion(installed, MHP_EXTENSION_REQUIRED_VERSION) >= 0;
}
