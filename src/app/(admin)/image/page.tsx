import ImageStudioClient from './ImageStudioClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

export default function ImagePage() {
  return (
    <>
      <ImageStudioClient />
      <AgentLauncher slug="prompt-coach" />
    </>
  );
}
