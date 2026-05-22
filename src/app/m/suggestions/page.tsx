import { prisma } from '@/lib/db';
import MSuggestionsClient from './MSuggestionsClient';

export const dynamic = 'force-dynamic';

export default async function MSuggestionsPage() {
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
      };
    } catch {
      initial = null;
    }
  }
  return <MSuggestionsClient initial={initial} />;
}
