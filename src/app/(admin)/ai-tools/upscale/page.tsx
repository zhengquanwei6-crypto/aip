import ImageEditTool from '../_shared/ImageEditTool';

export const dynamic = 'force-dynamic';

export default function UpscalePage() {
  return (
    <ImageEditTool
      slug="upscale"
      title="AI 无损放大"
      description="把模糊或低分辨率图片放大到 2K / 4K，自动增强细节但保持原始构图"
      promptHint="可选：补充想强调的细节（如「保留人物面部纹理」）"
      promptPlaceholder="（默认放大 2 倍并整体清晰化，可不填）"
    />
  );
}
