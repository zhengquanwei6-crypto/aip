import { PrismaClient } from '@prisma/client';

/**
 * v0.14-z81: Prisma client + 自动向量索引
 *
 * aIOutput.create / aIOutput.upsert / asset.create / asset.upsert 的结果
 * 会被异步索引到 Zilliz (dao_history / dao_assets)。
 *
 * 设计原则：
 *   - 失败不阻塞业务流（错误吞掉只 console.warn）
 *   - fire-and-forget（不 await，不让 LLM/image 链路慢）
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

// 异步索引（不阻塞）
function fireIndexAIOutput(row: any): void {
  if (!row || !row.id) return;
  Promise.resolve().then(async () => {
    try {
      const { indexAIOutputs } = await import('./vector');
      await indexAIOutputs([
        {
          id: row.id,
          type: row.type ?? '',
          input: row.input ?? null,
          output: row.output ?? null,
          model: row.model ?? null,
          createdAt: row.createdAt ?? new Date(),
        },
      ]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[vector/auto-index AIOutput]', (e as Error).message);
    }
  });
}

function fireIndexAsset(row: any): void {
  if (!row || !row.id) return;
  // 没有 prompt 的资产不可索引（embedding 需要文本）
  if (!row.prompt || !String(row.prompt).trim()) return;
  Promise.resolve().then(async () => {
    try {
      const { indexAssets } = await import('./vector');
      await indexAssets([
        {
          id: row.id,
          type: row.type ?? '',
          source: row.source ?? null,
          platform: row.platform ?? null,
          category: row.category ?? null,
          prompt: row.prompt ?? null,
          url: row.url ?? null,
          createdAt: row.createdAt ?? new Date(),
        },
      ]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[vector/auto-index Asset]', (e as Error).message);
    }
  });
}

export const prisma = basePrisma.$extends({
  name: 'vector-auto-index',
  query: {
    aIOutput: {
      async create({ args, query }) {
        const row = await query(args);
        fireIndexAIOutput(row);
        return row;
      },
      async upsert({ args, query }) {
        const row = await query(args);
        fireIndexAIOutput(row);
        return row;
      },
    },
    asset: {
      async create({ args, query }) {
        const row = await query(args);
        fireIndexAsset(row);
        return row;
      },
      async upsert({ args, query }) {
        const row = await query(args);
        fireIndexAsset(row);
        return row;
      },
    },
  },
}) as unknown as PrismaClient;
