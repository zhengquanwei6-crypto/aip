import ConvClient from './ConvClient';
export const dynamic = 'force-dynamic';
export default function ConversationPage({ params }: { params: { id: string } }) {
  return <ConvClient id={params.id} />;
}
