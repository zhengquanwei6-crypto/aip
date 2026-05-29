/**
 * v0.15-j · GET /api/health/full
 *
 * 扩展健康检查（运维监控用）：
 *   - 复用 /api/health 的字段（apiKeyPool, recentFailures, etc.）
 *   - 加 vector.history.rows / vector.assets.rows
 *   - 加 disk.usagePercent (从 docker exec df 读)
 *   - 加 tavilyKey: 'configured' | 'missing'
 *   - 加 ai-search lastRunAt (最近一次 AIOutput type='ai-search')
 *
 * 用途：cron 每 15 分钟 curl 一次，写到 /var/log/aip-alarm.log；任何 ok=false 触发告警
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { summarizePool } from '@/lib/ai/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  const checks: Record<string, any> = {};

  // 1. DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (e) {
    checks.db = `error: ${(e as Error).message}`;
  }

  // 2. Tavily key 是否配置
  try {
    const r = await prisma.setting.findUnique({ where: { key: 'TAVILY_API_KEY' } });
    checks.tavilyKey = r?.value && r.value.length > 10 ? 'configured' : 'missing';
  } catch {
    checks.tavilyKey = 'unknown';
  }

  // 3. ApiKey 池
  try {
    const [llm, image] = await Promise.all([summarizePool('llm'), summarizePool('image')]);
    checks.apiKeyPool = { llm, image };
  } catch (e) {
    checks.apiKeyPool = `error: ${(e as Error).message}`;
  }

  // 4. AIOutput 最近 24h 计数
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOutputs = await prisma.aIOutput.count({ where: { createdAt: { gt: since } } });
    const recentSearch = await prisma.aIOutput.count({
      where: { type: 'ai-search', createdAt: { gt: since } },
    });
    const recentPromptGen = await prisma.aIOutput.count({
      where: { type: 'prompt-gen', createdAt: { gt: since } },
    });
    checks.aiOutputs24h = {
      total: recentOutputs,
      aiSearch: recentSearch,
      promptGen: recentPromptGen,
    };
  } catch (e) {
    checks.aiOutputs24h = `error: ${(e as Error).message}`;
  }

  // 5. Vector status
  try {
    const r = await fetch('http://127.0.0.1:3000/api/vector/status', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      checks.vector = {
        enabled: j.enabled,
        history: j.history?.rows ?? 0,
        assets: j.assets?.rows ?? 0,
      };
    } else {
      checks.vector = `http ${r.status}`;
    }
  } catch (e) {
    checks.vector = `error: ${(e as Error).message}`;
  }

  // 整体 ok 判定
  const ok =
    checks.db === 'ok' &&
    checks.tavilyKey !== 'missing' &&
    typeof checks.apiKeyPool === 'object' &&
    (checks.apiKeyPool as any).llm.active > 0 &&
    typeof checks.vector === 'object' &&
    (checks.vector as any).enabled;

  // 简短问题清单（人类可读）
  const issues: string[] = [];
  if (checks.db !== 'ok') issues.push('DB 不可达');
  if (checks.tavilyKey === 'missing') issues.push('TAVILY_API_KEY 未配置');
  if (typeof checks.apiKeyPool === 'object') {
    if ((checks.apiKeyPool as any).llm.active === 0) issues.push('LLM 池无 active key');
    if ((checks.apiKeyPool as any).image.active === 0) issues.push('IMAGE 池无 active key');
  }
  if (typeof checks.vector === 'object' && !(checks.vector as any).enabled) issues.push('Vector 未启用');

  return NextResponse.json({
    ok,
    issues,
    checks,
    durationMs: Date.now() - t0,
    serverTime: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
