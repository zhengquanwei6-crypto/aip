#!/usr/bin/env node
/**
 * v0.11 B15.7 · Asset 表 cron 清理或归档（软清理）
 *
 * 用途（B13 self-check §十一 #7 + §三 BUG-L12 闭环）：
 *   - VPS 磁盘 88% 缓压力，uploads ~59 MB / ~45 文件，Asset 表无 archived/deletedAt
 *   - 不动 prisma schema · 软清理：超过 N 天 + 未被收藏 + URL 在 /uploads/ 本地的 Asset
 *   - 收藏列表来自 Setting 表 `asset:fav:*` keys（key 形如 `asset:fav:<assetId>` 或 `asset:fav:<assetId>:1`）
 *
 * 使用方式（容器内运行，host 没装 node）：
 *   docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs            ← dry-run（默认）
 *   docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply    ← 真删
 *   docker exec -e DAYS=60 design-ai-ops node /app/scripts/cleanup-assets.mjs ← 改阈值
 *
 * cron（host 上加，容器没 cron）：
 *   crontab -e
 *   0 4 * * 0  docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply >> /var/log/asset-cleanup.log 2>&1
 *
 * 输出：
 *   - dry-run 模式：列出每条 {id, type, url, createdAt, sizeKB} + 「将清理 N 个 / 释放 X MB」
 *   - --apply 模式：fs.unlink 删文件 + prisma.asset.delete，最后报告实际删除数
 *
 * 0 LLM/IMAGE 消耗 · 0 schema · 仅 prisma read/delete + fs.unlink
 *
 * 注：本文件用 CJS require 而不是 ESM import（虽然扩展名是 .mjs），
 * 是因为 Next.js standalone 容器里的 @prisma/client 是 CJS-only 包，
 * 而项目的 package.json 没设 "type":"module"。Node 20 在 .mjs 文件里
 * 也会忠实地按 ESM 解析；为兼容 CJS 导入，下面改为创建用 createRequire 的 hybrid。
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const DAYS = Number.parseInt(process.env.DAYS || '30', 10);
const UPLOADS_DIR = '/app/public/uploads';
const UPLOADS_URL_PREFIX = '/uploads/';
const FAV_KEY_PREFIX = 'asset:fav:';

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1);
}
function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

/**
 * 从 Setting.key（形如 `asset:fav:<id>` 或 `asset:fav:<id>:1`）提取 assetId
 * 截 ':' 第一段（B15.7 任务定义里写明）。
 */
function extractFavAssetId(key) {
  if (!key.startsWith(FAV_KEY_PREFIX)) return null;
  const tail = key.slice(FAV_KEY_PREFIX.length);
  const i = tail.indexOf(':');
  return i >= 0 ? tail.slice(0, i) : tail;
}

/**
 * Asset.url（形如 /uploads/xxx.png）映射到容器内绝对路径 /app/public/uploads/xxx.png
 * 只允许 url 以 /uploads/ 开头；path traversal 防御：解析后必须 startsWith UPLOADS_DIR。
 */
function resolveLocalPath(url) {
  if (!url || !url.startsWith(UPLOADS_URL_PREFIX)) return null;
  const rel = url.slice(UPLOADS_URL_PREFIX.length);
  const abs = path.resolve(UPLOADS_DIR, rel);
  if (!abs.startsWith(UPLOADS_DIR + path.sep) && abs !== UPLOADS_DIR) {
    return null;
  }
  return abs;
}

async function main() {
  const startedAt = new Date();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const mode = APPLY ? 'APPLY (delete files + Asset rows)' : 'DRY-RUN (no changes)';

  console.log('=== v0.11 B15.7 asset cleanup ===');
  console.log(`  startedAt:  ${startedAt.toISOString()}`);
  console.log(`  mode:       ${mode}`);
  console.log(`  DAYS:       ${DAYS}`);
  console.log(`  cutoff:     ${cutoff.toISOString()}  (older than this is cleanup-eligible)`);
  console.log(`  uploadsDir: ${UPLOADS_DIR}`);
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 1) 取出收藏 assetId 列表（Setting 表 asset:fav:* keys）
    const favRows = await prisma.setting.findMany({
      where: { key: { startsWith: FAV_KEY_PREFIX } },
      select: { key: true },
    });
    const favIds = new Set();
    for (const r of favRows) {
      const id = extractFavAssetId(r.key);
      if (id) favIds.add(id);
    }
    console.log(`  fav assetIds (protected):  ${favIds.size}`);

    // 2) 候选 Asset：createdAt < cutoff AND url startsWith /uploads/
    const candidates = await prisma.asset.findMany({
      where: {
        createdAt: { lt: cutoff },
        url: { startsWith: UPLOADS_URL_PREFIX },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, url: true, createdAt: true, fileName: true },
    });
    console.log(`  candidate Asset rows (< ${DAYS}d & /uploads/ local): ${candidates.length}`);
    console.log('');

    if (candidates.length === 0) {
      console.log('  (nothing to clean up — disk usage stable)');
      console.log('=== done ===');
      return 0;
    }

    const toClean = [];
    let totalBytes = 0;
    let skippedFav = 0;
    let skippedMissing = 0;
    let skippedOutside = 0;

    for (const a of candidates) {
      if (favIds.has(a.id)) {
        skippedFav++;
        continue;
      }
      const abs = resolveLocalPath(a.url);
      if (!abs) {
        skippedOutside++;
        continue;
      }
      let sizeBytes = 0;
      let fileExists = false;
      try {
        const st = fs.statSync(abs);
        sizeBytes = st.size;
        fileExists = true;
      } catch {
        skippedMissing++;
        // 文件已不存在 — Asset 行是悬空的，仍可清理 row（但记 sizeBytes=0）
      }
      toClean.push({
        id: a.id,
        type: a.type,
        url: a.url,
        createdAt: a.createdAt.toISOString(),
        absPath: abs,
        sizeBytes,
        fileExists,
      });
      totalBytes += sizeBytes;
    }

    console.log('  ─ details (per row) ─');
    for (const c of toClean) {
      const flag = c.fileExists ? 'FILE' : 'GONE';
      console.log(
        `    [${flag}] id=${c.id}  type=${c.type}  size=${fmtKB(c.sizeBytes).padStart(8)} KB  createdAt=${c.createdAt}  ${c.url}`,
      );
    }
    console.log('');
    console.log('  summary:');
    console.log(`    will clean N rows:        ${toClean.length}`);
    console.log(`    will release ~ MB:        ${fmtMB(totalBytes)}`);
    console.log(`    skipped (favorited):      ${skippedFav}`);
    console.log(`    skipped (file missing):   ${skippedMissing}  (Asset row 已悬空，apply 时仍删 row)`);
    console.log(`    skipped (path traversal): ${skippedOutside}`);
    console.log('');

    if (!APPLY) {
      console.log('  >>> dry-run mode · no changes made <<<');
      console.log('  to actually clean up:');
      console.log('    docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply');
      console.log('=== done ===');
      return 0;
    }

    // --apply 模式
    console.log('  ─ applying changes ─');
    let unlinkedFiles = 0;
    let deletedRows = 0;
    let failedUnlink = 0;
    let failedDelete = 0;

    for (const c of toClean) {
      // 先 unlink 文件（如存在）
      try {
        if (c.fileExists) {
          fs.unlinkSync(c.absPath);
          unlinkedFiles++;
        }
      } catch (e) {
        console.error(`    unlink failed for ${c.absPath}: ${e?.message ?? e}`);
        failedUnlink++;
        // 文件 unlink 失败时仍继续删 row（避免悬空），但记录失败
      }
      // 再删 Asset row
      try {
        await prisma.asset.delete({ where: { id: c.id } });
        deletedRows++;
      } catch (e) {
        console.error(`    asset.delete failed for ${c.id}: ${e?.message ?? e}`);
        failedDelete++;
      }
    }

    console.log('');
    console.log('  apply summary:');
    console.log(`    unlinked files:    ${unlinkedFiles}`);
    console.log(`    deleted Asset rows:${deletedRows}`);
    console.log(`    unlink failures:   ${failedUnlink}`);
    console.log(`    delete failures:   ${failedDelete}`);
    console.log('=== done ===');
    return 0;
  } catch (e) {
    console.error(`[cleanup-assets] fatal: ${e?.message ?? e}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
