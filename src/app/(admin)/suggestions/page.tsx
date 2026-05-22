import { prisma } from '@/lib/db';
import SuggestionsClient from './SuggestionsClient';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage() {
  const last = await prisma.aIOutput.findFirst({
    where: { type: 'suggestion' },
    orderBy: { createdAt: 'desc' },
  });
  let initial: any = null;
  if (last) {
    try {
      initial = {
        suggestion: JSON.parse(last.output),
        createdAt: last.createdAt.toISOString(),
        model: last.model,
      };
    } catch {
      initial = null;
    }
  }
  return <SuggestionsClient initial={initial} />;
}
