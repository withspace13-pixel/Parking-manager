import dynamic from "next/dynamic";

const ParkingPageClient = dynamic(() => import("./ParkingPageClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[var(--bg)] p-8">
      <p className="text-[var(--text-muted)]">로딩 중...</p>
    </div>
  ),
});

export default function ParkingPage() {
  return <ParkingPageClient />;
}
