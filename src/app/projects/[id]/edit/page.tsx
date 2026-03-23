import dynamic from "next/dynamic";

/** SSR 시 번들/캐시 불일치로 map·chunk 오류가 날 수 있어 클라이언트에서만 로드 */
const EditProjectForm = dynamic(() => import("./EditProjectForm"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[var(--bg)] p-8">
      <p className="text-[var(--text-muted)]">로딩 중...</p>
    </div>
  ),
});

export default function EditProjectPage() {
  return <EditProjectForm />;
}
