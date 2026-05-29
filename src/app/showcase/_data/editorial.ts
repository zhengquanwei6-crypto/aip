/**
 * showcase v4 — editorial spine source data.
 *
 * Five dated, first-person Chinese prose blocks that thread between the data
 * sections in `/showcase`. The fifth entry's date is a sentinel
 * (`__TODAY__`) that gets replaced at server-render time with today's UTC
 * date so the page reads as "written today" on every refresh.
 *
 * Voice constraints (Requirement 2.3, 2.5, Property 4):
 *   - First-person Chinese — every body string contains at least one `我`.
 *   - No first-person plurals, no marketing-template phrasing. The exact
 *     forbidden substrings live in `v4-anti-patterns.ts`; this file holds
 *     none of them in either prose or comments.
 *   - Each body holds 2 to 5 sentences (split by `。` or `.`).
 *
 * Pure module: no I/O, no React imports, no v3 anti-pattern markers in any
 * body string. Safe for both server and client.
 *
 * Validates: Requirements 2.1, 2.3
 */

export type Editorial = {
  /** ISO date label, format YYYY-MM-DD. The fifth seed entry uses the
   *  sentinel `"__TODAY__"` which `getEditorialEntries` replaces with the
   *  caller-supplied `now`. */
  date: string;
  /** One-line topic shown next to the date label. */
  topic: string;
  /** 2-to-5 sentence prose body, first-person Chinese. */
  body: string[];
  /** Determines which data section follows this editorial entry in the
   *  reading path. */
  sectionAfter:
    | "ledger"
    | "architecture"
    | "constraints"
    | "demo"
    | "agents"
    | "platforms";
};

/**
 * Sentinel date value on the fifth entry. Replaced at server-render time
 * with today's UTC ISO date (YYYY-MM-DD) by `getEditorialEntries`.
 */
export const TODAY_SENTINEL = "__TODAY__";

/**
 * Five-entry editorial spine, in reading order. The fifth entry's `date` is
 * `TODAY_SENTINEL`; pass the request-time `Date` through
 * `getEditorialEntries` to materialise it.
 */
export const EDITORIAL_ENTRIES: readonly Editorial[] = [
  {
    date: "2026-04-22",
    topic: "为什么我把控制台关掉，只保留一份纸",
    body: [
      "v3 那版我把整个 /showcase 做成了一个终端窗口，黑底等宽字配实时折线。",
      "半年下来我发现，这种界面把读者训练成只扫数字而不读正文。",
      "我决定把控制台关掉，只留一份纸。",
      "我希望来这里的人按段落往下读，看到的是一个具体的人在 SGP1 上一行一行写下来的判断。",
    ],
    sectionAfter: "architecture",
  },
  {
    date: "2026-04-29",
    topic: "一个人能维护到什么程度",
    body: [
      "我一个人在 DigitalOcean SGP1 上跑这套 multi-agent 系统，每个月真实成本就是一台 6 美元的 VPS 加上跑出来的 token 账单。",
      "我能做到的：每周自己改一两个 agent、每天看一遍 prisma 里的输出表、出问题当晚自己排。",
      "我做不到的：客户支持、uptime SLA、把代码拆给第二个人。",
      "这一页右栏的 git ledger 就是我每周到底动了多少东西的实证，不是宣传文。",
    ],
    sectionAfter: "ledger",
  },
  {
    date: "2026-05-04",
    topic: "单 VPS 上跑 LLM 的真实账单",
    body: [
      "上个月我跑通的成本结构：CometAPI 的 gpt-4o-mini 每千 token 走下来一分钱不到，KIE 的 gpt-image-2 一张 1024 图固定 4 美分，30 天文本加图像总账约 11 美元。",
      "我把贵的模型只留给最终输出，中间步骤全部走小模型，这种分层是我两个月反复跑出来的最划算配比。",
      "这页所有 LLM 调用默认 BYOK，访客试跑用的是我个人的额度，所以我才把限频写得很死。",
      "聚合层的公开列表常常大涨小落，我的策略就是只押三家、每家备一个备用 key。",
    ],
    sectionAfter: "agents",
  },
  {
    date: "2026-05-09",
    topic: "把不做什么也写下来",
    body: [
      "做 SaaS 的同行都清楚，限制条件通常写在合同附件里、不写在首页。",
      "我反着来：不做什么这一节我放在试用按钮上面，让你先读完再决定要不要点。",
      "不注册、不上云、不收邮箱、不放分析脚本，每一条对我都是少干一摊活，对你都是少一份顾虑。",
      "愿意公开列出自己不做的事，比公开列出做了什么更难，这一点我想留在页面最显眼的位置。",
    ],
    sectionAfter: "constraints",
  },
  {
    date: TODAY_SENTINEL,
    topic: "你现在可以亲手跑一次",
    body: [
      "下面这块输入框接的是真实的 copy-writer agent，不是录屏，不是占位文。",
      "你输入一句中文，我这边的 api-key 池会真的去 CometAPI 抢一个 token 名额，然后把首字流回来给你看。",
      "匿名访客每 24 小时 3 次，全站合计 100 次，超了我也没办法继续给，免费的代价就是有限。",
      "试完之后这一次调用会被写进右栏 ledger，我下一次刷新就会读到你今天的痕迹。",
    ],
    sectionAfter: "demo",
  },
] as const;

/**
 * Format a `Date` as a UTC `YYYY-MM-DD` string. Uses `toISOString` and
 * trims the time portion so server and client renders agree regardless of
 * VPS timezone.
 */
function formatIsoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Materialise the editorial spine for a given request time. Returns a fresh
 * array — callers may mutate it without affecting subsequent renders.
 *
 * The fifth entry's `date` field is replaced from `TODAY_SENTINEL` to the
 * caller-supplied `now` formatted as UTC `YYYY-MM-DD`. All other entries
 * pass through unchanged (deep-copied so consumers cannot accidentally
 * mutate the seed data).
 */
export function getEditorialEntries(now: Date): Editorial[] {
  const today = formatIsoDate(now);
  return EDITORIAL_ENTRIES.map((entry) => ({
    date: entry.date === TODAY_SENTINEL ? today : entry.date,
    topic: entry.topic,
    body: [...entry.body],
    sectionAfter: entry.sectionAfter,
  }));
}
