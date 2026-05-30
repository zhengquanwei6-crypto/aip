/**
 * v0.17-SHARE · 图片分享链接存储 + 失效判定
 *
 * 0 schema 改动: 全用 Setting 'share:link:{shareId}' JSON。
 *
 * 失效判定 (多条件 OR, 先到先失效):
 *   失效 = revoked
 *        || (maxViews !== null && viewCount >= maxViews)
 *        || (expiresAt !== null && now > expiresAt)
 *        || (totalSeconds !== null && consumedSeconds >= totalSeconds)
 */
import "server-only";
import { prisma } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  position: "tl" | "tr" | "bl" | "br" | "center";
  opacity: number; // 0-1
}

export interface ShareLink {
  shareId: string;
  assetId: string;
  assetUrl: string;
  watermark: WatermarkConfig;
  maxViews: number | null;        // null = 永久
  viewCount: number;
  perViewSeconds: number | null;  // 每次可看秒数, null = 不限
  totalSeconds: number | null;    // 总可看秒数, null = 不限
  consumedSeconds: number;
  expiresAt: string | null;       // 绝对过期 ISO
  passwordHash: string | null;
  disableDownload: boolean;
  revoked: boolean;
  createdAt: string;
  lastViewedAt: string | null;
  viewLog: { ts: string; ipMasked: string; ua: string }[];
}

const PREFIX = "share:link:";

/** 生成 10 位 url-safe shareId */
export function genShareId(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

export function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

export function maskIp(ip: string): string {
  if (!ip) return "?";
  // IPv4: 保留前两段; IPv6: 保留前两组
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : ip;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 2).join(":") + ":***";
  }
  return ip.slice(0, 6) + "***";
}

export async function getShare(shareId: string): Promise<ShareLink | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: PREFIX + shareId } });
    if (!row?.value) return null;
    return JSON.parse(row.value) as ShareLink;
  } catch {
    return null;
  }
}

export async function saveShare(link: ShareLink): Promise<void> {
  await prisma.setting.upsert({
    where: { key: PREFIX + link.shareId },
    update: { value: JSON.stringify(link) },
    create: { key: PREFIX + link.shareId, value: JSON.stringify(link) },
  });
}

export async function deleteShare(shareId: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: PREFIX + shareId } });
}

export async function listShares(): Promise<ShareLink[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const out: ShareLink[] = [];
  for (const r of rows) {
    try { out.push(JSON.parse(r.value) as ShareLink); } catch { /* skip */ }
  }
  return out;
}

export type ExpiryReason =
  | "ok"
  | "revoked"
  | "max_views"
  | "expired"
  | "total_time";

/** 判定当前是否失效, 返回原因。不修改状态。 */
export function checkExpiry(link: ShareLink): ExpiryReason {
  if (link.revoked) return "revoked";
  if (link.maxViews !== null && link.viewCount >= link.maxViews) return "max_views";
  if (link.expiresAt !== null && Date.now() > new Date(link.expiresAt).getTime()) return "expired";
  if (link.totalSeconds !== null && link.consumedSeconds >= link.totalSeconds) return "total_time";
  return "ok";
}

export const EXPIRY_MESSAGE: Record<ExpiryReason, string> = {
  ok: "",
  revoked: "该分享链接已被创建者撤销",
  max_views: "该分享链接的可浏览次数已用尽",
  expired: "该分享链接已过期",
  total_time: "该分享链接的总浏览时长已用尽",
};
