import ShareViewClient from "./ShareViewClient";

export const dynamic = "force-dynamic";

export default function SharePage({ params }: { params: { shareId: string } }) {
  return <ShareViewClient shareId={params.shareId} />;
}
