/**
 * /api/adapters/seed - 种入 5 个内置 adapter 预设
 *
 * 调用：POST 一下即可种入；已存在则 skip（按 slug 去重）
 *
 * 5 个预设：
 *   1. KIE.AI · GPT Image 2 (async-polling)
 *   2. KIE.AI · Flux Kontext Pro (async-polling, successFlag)
 *   3. OpenAI 兼容 · DALL-E 3 (sync)
 *   4. OpenAI 兼容 · GPT-IMG-2 (sync)
 *   5. 通用 OpenAI 兼容（用户改 baseUrl 即用）
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  adapterKey,
  adapterConfigSchema,
  type AdapterConfig,
} from '@/lib/adapter-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRESETS: AdapterConfig[] = [
  // 1. KIE.AI · GPT Image 2
  {
    slug: 'kie-gpt-image-2',
    name: 'KIE.AI · GPT Image 2 文生图',
    baseUrl: 'https://api.kie.ai/api/v1',
    sourceUrl: 'https://docs.kie.ai/',
    description: 'KIE.AI 中转站的 GPT Image 2 文生图，异步轮询。支持 1K/2K/4K 与多种长宽比。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'async-polling',
      submit: {
        endpoint: { method: 'POST', path: '/jobs/createTask' },
        request: {
          contentType: 'application/json',
          bodyTemplate: {
            model: 'gpt-image-2-text-to-image',
            input: {
              prompt: '{prompt}',
              aspect_ratio: '{extra.aspectRatio}',
              resolution: '{extra.resolution}',
              output_format: 'png',
            },
          },
        },
        response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
      },
      poll: {
        endpoint: { method: 'GET', path: '/jobs/recordInfo?taskId={taskId}' },
        intervalMs: 4000,
        timeoutMs: 600000,
        statusPath: 'data.state',
        doneStatuses: ['success'],
        failStatuses: ['fail'],
        imageUrlPath: 'data.resultJson>>resultUrls[*]',
        errorPath: 'data.failMsg',
      },
    },
    enabled: true,
  },

  // 2. KIE.AI · Flux Kontext Pro
  {
    slug: 'kie-flux-kontext-pro',
    name: 'KIE.AI · Flux Kontext Pro',
    baseUrl: 'https://api.kie.ai/api/v1',
    description: 'KIE.AI 中转站的 Flux Kontext Pro，异步轮询，successFlag=1 完成。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'async-polling',
      submit: {
        endpoint: { method: 'POST', path: '/flux/kontext/generate' },
        request: {
          contentType: 'application/json',
          bodyTemplate: {
            prompt: '{prompt}',
            aspectRatio: '{extra.aspectRatio}',
            model: 'flux-kontext-pro',
            outputFormat: 'jpeg',
            enableTranslation: true,
            promptUpsampling: false,
          },
        },
        response: { taskIdPath: 'data.taskId', errorPath: 'msg' },
      },
      poll: {
        endpoint: { method: 'GET', path: '/flux/kontext/record-info?taskId={taskId}' },
        intervalMs: 4000,
        timeoutMs: 300000,
        statusPath: 'data.successFlag',
        doneStatuses: ['1'],
        failStatuses: ['2', '3'],
        imageUrlPath: 'data.response.resultImageUrl',
        errorPath: 'data.errorMessage',
      },
    },
    enabled: true,
  },

  // 3. OpenAI 兼容 · DALL-E 3
  {
    slug: 'openai-dalle-3',
    name: 'OpenAI 兼容 · DALL-E 3',
    baseUrl: 'https://api.openai.com/v1',
    description: '任何兼容 OpenAI /v1/images/generations 接口的中转站都能用，模型设为 dall-e-3。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          model: 'dall-e-3',
          prompt: '{prompt}',
          size: '{size}',
          n: 1,
          quality: 'standard',
        },
      },
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false, // 默认禁用，用户启用并填 baseUrl 后才用
  },

  // 4. OpenAI 兼容 · GPT-IMG-2
  {
    slug: 'openai-gpt-img-2',
    name: 'OpenAI 兼容 · GPT-IMG-2',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 兼容协议下的 gpt-img-2 同步接口。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          model: 'gpt-img-2',
          prompt: '{prompt}',
          size: '{size}',
          n: 1,
        },
      },
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false,
  },

  // 5. 通用 OpenAI 兼容（占位）
  {
    slug: 'generic-openai-compatible',
    name: '通用 OpenAI 兼容（占位）',
    baseUrl: 'https://your-relay.example.com/v1',
    description: '把 baseUrl 改成你的中转站地址即可用。模型名通过 Setting.IMAGE_MODEL 切换。',
    auth: { type: 'bearer', headerName: 'Authorization', valueTemplate: 'Bearer {API_KEY}' },
    flow: {
      type: 'sync',
      endpoint: { method: 'POST', path: '/images/generations' },
      request: {
        contentType: 'application/json',
        bodyTemplate: {
          prompt: '{prompt}',
          size: '{size}',
          n: 1,
        },
      },
      response: {
        imageUrlPath: 'data[*].url',
        errorPath: 'error.message',
      },
    },
    enabled: false,
  },
];

export async function POST() {
  let added = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const preset of PRESETS) {
    const validated = adapterConfigSchema.safeParse(preset);
    if (!validated.success) {
      failed.push(`${preset.slug}: ${JSON.stringify(validated.error.flatten())}`);
      continue;
    }
    const key = adapterKey(preset.slug);
    const exists = await prisma.setting.findUnique({ where: { key } });
    if (exists) {
      skipped += 1;
      continue;
    }
    const final = {
      ...validated.data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await prisma.setting.create({
      data: { key, value: JSON.stringify(final) },
    });
    added += 1;
  }

  return NextResponse.json({ ok: true, added, skipped, total: PRESETS.length, failed });
}

// 列出当前预设清单（仅元数据，不暴露 bodyTemplate 等敏感模板）
export async function GET() {
  return NextResponse.json({
    ok: true,
    presets: PRESETS.map((p) => ({
      slug: p.slug,
      name: p.name,
      baseUrl: p.baseUrl,
      type: p.flow.type,
      enabled: p.enabled,
    })),
  });
}
