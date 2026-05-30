/**
 * v0.17-CF1 · ComfyUI 出图落地本地
 *
 * 病根修复: 之前 ComfyUI 出的图只留在远程 cloudstudio (/view 现拉),
 * cloudstudio URL 一变就全丢。此模块把出图字节下载到本地 /uploads,
 * 建 Asset 行 —— 让 ComfyUI 出的图变成"自己的"。
 *
 * 向量索引: prisma.asset.create 经 db.ts $extends 自动触发 (v0.14-z81),
 * 只要带 prompt 就会异步索引到 Zilliz, 此处无需手动调。
 *
 * 幂等: 用 Setting 'comfyui:persisted:{promptId}' 标记, 已落地不重复。
 */
import "server-only";
import { prisma } from "@/lib/db";
import { viewImage, type OutputImage } from "@/lib/adapters/comfyui/client";
import { saveUploadedFile } from "@/lib/storage";

export interface PersistedAsset {
  assetId: string;
  url: string;
  filename: string;
  nodeId: string;
}

const PERSIST_MARK_PREFIX = "comfyui:persisted:";

/** 已落地过? 返回落地后的 Asset 列表, 没有则 null */
export async function isPersisted(promptId: string): Promise<PersistedAsset[] | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: PERSIST_MARK_PREFIX + promptId },
    });
    if (!row?.value) return null;
    return JSON.parse(row.value) as PersistedAsset[];
  } catch {
    return null;
  }
}

/**
 * 把一个 prompt 的所有输出图下载落地 + 建 Asset。
 * 幂等: 已落地直接返回缓存结果。
 */
export async function persistComfyOutputs(
  promptId: string,
  outputs: Record<string, OutputImage[]>,
  meta?: { templateSlug?: string; prompt?: string; platform?: string },
): Promise<PersistedAsset[]> {
  const already = await isPersisted(promptId);
  if (already) return already;

  const persisted: PersistedAsset[] = [];

  for (const [nodeId, images] of Object.entries(outputs)) {
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      if (img.type && img.type !== "output") continue;
      try {
        const { buffer } = await viewImage(img.filename, img.subfolder, img.type ?? "output");
        const saved = await saveUploadedFile(buffer, img.filename);
        // prisma.asset.create 经 db.ts $extends 自动向量索引 (带 prompt 时)
        const asset = await prisma.asset.create({
          data: {
            type: "comfyui-output",
            source: "comfyui",
            url: saved.url,
            fileName: saved.fileName,
            platform: meta?.platform ?? null,
            ...(meta?.prompt ? { prompt: meta.prompt.slice(0, 2000) } : {}),
          },
        });
        persisted.push({
          assetId: asset.id,
          url: asset.url,
          filename: img.filename,
          nodeId,
        });
      } catch (e) {
        console.warn("[comfyui/persist]", img.filename, (e as Error).message);
      }
    }
  }

  if (persisted.length > 0) {
    try {
      await prisma.setting.upsert({
        where: { key: PERSIST_MARK_PREFIX + promptId },
        update: { value: JSON.stringify(persisted) },
        create: { key: PERSIST_MARK_PREFIX + promptId, value: JSON.stringify(persisted) },
      });
    } catch {
      /* mark failure non-fatal */
    }
  }

  return persisted;
}
