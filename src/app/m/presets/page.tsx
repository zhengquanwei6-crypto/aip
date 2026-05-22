import { prisma } from '@/lib/db';
import MPresetsClient from './MPresetsClient';

export const dynamic = 'force-dynamic';

export default async function MPresetsPage() {
  const list = await prisma.imagePreset.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return (
    <MPresetsClient
      initial={list.map((p) => ({
        id: p.id,
        name: p.name,
        styleKeywords: p.styleKeywords,
        negativePrompt: p.negativePrompt ?? '',
        size: p.size,
        imageType: p.imageType,
        isDefault: p.isDefault,
      }))}
    />
  );
}
