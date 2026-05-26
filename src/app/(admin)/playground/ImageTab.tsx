'use client';

/**
 * <ImageTab> · v0.13 BUG-M30
 *   重写：4 处出图入口收敛到 <ImageGenerateForm>。
 *   旧版 493 行的尺寸/比例/质量/i2i 各自表单 → 全部由 ImageGenerateForm 接管。
 */

import ImageGenerateForm, { type AdapterOption } from '@/components/image-form/ImageGenerateForm';

interface ApiKeyRow {
  id: string;
  provider: 'llm' | 'image';
  label: string;
  baseUrl: string | null;
  model: string | null;
  active: boolean;
  priority: number;
}

interface AdapterPoolItem {
  slug: string;
  name?: string;
  enabled?: boolean;
  supportsImg2Img?: boolean;
}

interface Props {
  imageKeys: ApiKeyRow[];
  adapters: AdapterPoolItem[];
  defaultAdapter?: string | null;
}

export default function ImageTab({ adapters, defaultAdapter }: Props) {
  const opts: AdapterOption[] = adapters.map((a) => ({
    slug: a.slug,
    name: a.name,
    enabled: a.enabled !== false,
    supportsImg2Img: a.supportsImg2Img === true,
  }));
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        即时调用：选模式 + 模型 + 比例 + 清晰度 + 质量，输入 prompt 直接出图。
      </div>
      <ImageGenerateForm
        adapters={opts}
        defaultAdapter={defaultAdapter ?? undefined}
        keyOverrideScope="playground"
        endpoint="/api/playground/image/generate"
      />
    </div>
  );
}
