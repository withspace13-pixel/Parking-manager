import { redirect } from "next/navigation";

/** 예전 룸 전용 URL — 기관 정보 수정 화면으로 통합됨 */
export default function ProjectRoomsRedirect({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/edit`);
}
