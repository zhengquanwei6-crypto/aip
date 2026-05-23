import ContentGeneratorClient from './ContentGeneratorClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

export default function ContentPage() {
  return (
    <>
      <ContentGeneratorClient />
      <AgentLauncher slug="copy-writer" />
    </>
  );
}
