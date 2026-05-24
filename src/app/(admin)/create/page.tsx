/**
 * v0.12 B3.3 · /create · 创作页面（合并 /content + /image + 全流程发布）
 *
 * 三 tab：
 *   - tab=content（默认）：文案生成（沿用 ContentGeneratorClient）
 *   - tab=image：图片生成（沿用 ImageStudioClient · 支持 ?sourceImage=URL i2i 预填）
 *   - tab=publish：全流程发布（挂载 PublishDirectorDrawer · 一进就打开）
 *
 * 旧 URL 兼容：
 *   /content → 307 → /create?tab=content
 *   /image   → 307 → /create?tab=image
 *
 * 生态打通：
 *   - /workspace?tab=assets 资产卡的「→ 用作 i2i 源图」按钮 → /create?tab=image&sourceImage=<url>
 *   - tab=content 出文案后底部「→ 转 publish-director」按钮已存在（沿用 ContentGeneratorClient
 *     里 PublishDirectorDrawer），无需重写
 */
import CreateClient from './CreateClient';

export const dynamic = 'force-dynamic';

export default function CreatePage({
  searchParams,
}: {
  searchParams?: { tab?: string; sourceImage?: string };
}) {
  const rawTab = searchParams?.tab;
  const tab: 'content' | 'image' | 'publish' =
    rawTab === 'image' || rawTab === 'publish' ? rawTab : 'content';
  const sourceImage = searchParams?.sourceImage ?? '';

  return <CreateClient initialTab={tab} initialSourceImage={sourceImage} />;
}
