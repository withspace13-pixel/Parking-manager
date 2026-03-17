"use client";

import { DevStoreProvider } from "@/lib/dev-store";

/**
 * 개발자 모드일 때 localStorage 기반 스토어를 제공.
 * Supabase 연동 전까지 UI만 수정·테스트할 때 사용.
 */
export function DevModeWrapper({ children }: { children: React.ReactNode }) {
  return <DevStoreProvider>{children}</DevStoreProvider>;
}
