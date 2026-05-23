/**
 * lib/agents/context.ts — agent 上下文加载器
 *
 * 每个加载器返回 markdown 文本，直接拼到 system message 之后。
 */

import { prisma } from '@/lib/db';
import { adapterConfigSchema, ADAPTER_SETTING_PREFIX } from '@/lib/adapter-types';

// ─────────────────────────────────────────────────────────────────────────────
// API 助手
// ─────────────────────────────────────────────────────────────────────────────

export async function loadAdaptersSummary(): Promise<string> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
      orderBy: { updatedAt: 'desc' },
    });
    if (rows.length === 0) return '(当前没有任何 adapter)';
    const lines: string[] = ['## 当前 adapter 列表'];
    for (const r of rows) {
      try {
        const parsed = adapterConfigSchema.safeParse(JSON.parse(r.value));
        if (!parsed.success) continue;
        const a = parsed.data;
        lines.push(
          `- **${a.slug}** ${a.enabled ? '✓' : '✗'} ${a.name}\n  baseUrl: \`${a.baseUrl}\`  flow: \`${a.flow.type}\``,
        );
      } catch {
        /* skip */
      }
    }
    return lines.join('\n');
  } catch (e) {
    return `(加载 adapter 失败: ${(e as Error).message})`;
  }
}

export async function loadSettingsSummary(): Promise<string> {
  try {
    const keys = [
      'LLM_API_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL',
      'IMAGE_API_BASE_URL', 'IMAGE_API_KEY', 'IMAGE_MODEL', 'IMAGE_DEFAULT_ADAPTER',
    ];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const fmt = (k: string) => {
      const v = map.get(k);
      if (!v) return `${k}: (未配置)`;
      if (k.endsWith('_KEY')) return `${k}: ${v.slice(0, 8)}…${v.slice(-4)} (length=${v.length})`;
      return `${k}: ${v}`;
    };
    return ['## 当前 Settings', ...keys.map(fmt)].join('\n');
  } catch (e) {
    return `(加载 settings 失败: ${(e as Error).message})`;
  }
}

export async function loadRecentFailures(limit = 5): Promise<string> {
  try {
    const rows = await prisma.aIOutput.findMany({
      where: { type: 'image' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const fails: string[] = [];
    for (const r of rows) {
      try {
        const out = JSON.parse(r.output);
        if (Array.isArray(out.urls) && out.urls.length > 0) continue;
        fails.push(
          `- ${r.createdAt.toISOString()} model=${r.model} input=${r.input.slice(0, 120)} output=${r.output.slice(0, 200)}`,
        );
        if (fails.length >= limit) break;
      } catch {
        /* skip */
      }
    }
    if (fails.length === 0) return '## 最近失败记录\n(最近 20 次 image 任务都成功)';
    return ['## 最近失败记录（最多 ' + limit + ' 条）', ...fails].join('\n');
  } catch (e) {
    return `(加载失败记录失败: ${(e as Error).message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 提示词优化（图片相关：当前 IMAGE_MODEL + 最近 prompt 历史）
// ─────────────────────────────────────────────────────────────────────────────

export async function loadImageContext(): Promise<string> {
  try {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ['IMAGE_DEFAULT_ADAPTER', 'IMAGE_MODEL'] } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    const lines: string[] = ['## 当前图片生成配置'];
    lines.push(`- 默认 adapter: ${map.get('IMAGE_DEFAULT_ADAPTER') || '(未设)'}`);
    lines.push(`- model: ${map.get('IMAGE_MODEL') || '(未设)'}`);

    const recent = await prisma.aIOutput.findMany({
      where: { type: 'image' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    if (recent.length > 0) {
      lines.push('\n## 最近 3 次 image 生成（你可以参考用户的偏好）');
      for (const r of recent) {
        try {
          const inp = JSON.parse(r.input);
          if (inp?.prompt) lines.push(`- ${(inp.prompt as string).slice(0, 200)}`);
        } catch {
          /* skip */
        }
      }
    }
    return lines.join('\n');
  } catch (e) {
    return `(加载 image 上下文失败: ${(e as Error).message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 文案写作（关键词 + 价格表 + 最近作品）
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCopyContext(): Promise<string> {
  try {
    const lines: string[] = [];

    const kws = await prisma.keyword.findMany({ take: 30 });
    if (kws.length > 0) {
      lines.push('## 系统里的关键词（按 platform/category 分组）');
      const grouped = new Map<string, string[]>();
      for (const k of kws) {
        const key = `${k.platform}/${k.category}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(k.keyword);
      }
      for (const [k, arr] of grouped) {
        lines.push(`- **${k}**: ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? '…' : ''}`);
      }
    }

    const pps = await prisma.pricePackage.findMany();
    if (pps.length > 0) {
      lines.push('\n## 价格档位');
      for (const p of pps) {
        lines.push(`- [${p.category}] ${p.tier}「${p.name}」${p.priceRange}${p.description ? ' — ' + p.description : ''}`);
      }
    }

    const recentPosts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    if (recentPosts.length > 0) {
      lines.push('\n## 最近 3 条小红书草稿（用户的写作偏好）');
      for (const p of recentPosts) {
        lines.push(`- 「${p.title}」 ${p.body?.slice(0, 100) ?? ''}…`);
      }
    }

    return lines.join('\n') || '(尚无关键词/价格/草稿)';
  } catch (e) {
    return `(加载文案上下文失败: ${(e as Error).message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 价格报价
// ─────────────────────────────────────────────────────────────────────────────

export async function loadPricingContext(): Promise<string> {
  try {
    const pps = await prisma.pricePackage.findMany({ orderBy: [{ category: 'asc' }, { tier: 'asc' }] });
    if (pps.length === 0) return '(尚未设置价格档位，请先去 /pricing 配置)';
    const lines: string[] = ['## 全部价格档位'];
    let lastCategory = '';
    for (const p of pps) {
      if (p.category !== lastCategory) {
        lines.push(`\n### ${p.category}`);
        lastCategory = p.category;
      }
      lines.push(`- **${p.tier}**「${p.name}」${p.priceRange}${p.description ? '\n  ' + p.description : ''}`);
    }
    return lines.join('\n');
  } catch (e) {
    return `(加载价格表失败: ${(e as Error).message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 今日任务合规
// ─────────────────────────────────────────────────────────────────────────────

export async function loadTodayContext(): Promise<string> {
  try {
    const now = new Date();
    const dow = now.getDay() === 0 ? 7 : now.getDay(); // 1-7
    const schedule = await prisma.schedule.findUnique({ where: { dayOfWeek: dow } });

    // Task 表本身没有日期，直接拿当天 createdAt 的 + status != 'recapped'
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { createdAt: { gte: todayStart } },
          { status: { in: ['pending', 'generated'] } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { publishTime: 'asc' }],
      take: 30,
    });

    const lines: string[] = [];
    if (schedule) {
      lines.push(`## 今日主题（周${dow}）：${schedule.theme}`);
      if (schedule.description) lines.push(`- ${schedule.description}`);
    }
    if (tasks.length === 0) {
      lines.push('\n## 今日任务\n(没有待办)');
    } else {
      lines.push('\n## 待办 / 进行中任务（按 priority desc, publishTime asc）');
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const t of tasks.slice(0, 12)) {
        const overdue = t.publishTime && t.publishTime < nowTime && t.status === 'pending';
        lines.push(
          `- [${t.status}${overdue ? ' ⚠超期' : ''}] ${t.publishTime} P${t.priority} ${t.platform}/${t.category} 「${t.title}」`,
        );
      }
    }

    return lines.join('\n');
  } catch (e) {
    return `(加载今日任务失败: ${(e as Error).message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 客户沟通：当前 client + 备注
// ─────────────────────────────────────────────────────────────────────────────

export async function loadClientContext(clientId: string): Promise<string> {
  if (!clientId) {
    return '## 客户上下文\n(没有传入 clientId — 用户应在客户详情页打开此 agent，或在第一条消息里说明客户昵称)';
  }
  try {
    const c = await prisma.client.findUnique({
      where: { id: clientId },
      include: { notes: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!c) return `## 客户上下文\n(找不到 clientId=${clientId})`;
    const lines: string[] = [
      `## 当前客户：${c.nickname}（${c.platform}）`,
      `- status: **${c.status}**`,
      `- 类目偏好: ${c.category || '未填'}`,
      `- 标签: ${c.tags || '无'}`,
      `- 累计订单: ${c.totalOrders}  累计成交: ¥${c.totalRevenue}`,
      `- 上次接触: ${c.lastContact ? c.lastContact.toISOString().slice(0, 10) : '从未'}`,
    ];
    if (c.notes.length > 0) {
      lines.push('\n### 最近备注（10 条）');
      for (const n of c.notes) {
        lines.push(`- [${n.type}] ${n.createdAt.toISOString().slice(0, 10)}${n.amount ? ` ¥${n.amount}` : ''} ${n.content.slice(0, 200)}`);
      }
    }
    return lines.join('\n');
  } catch (e) {
    return `(加载客户上下文失败: ${(e as Error).message})`;
  }
}
