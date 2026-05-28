import ImageEditTool from '../_shared/ImageEditTool';

export const dynamic = 'force-dynamic';

export default function ErasePage() {
  return (
    <ImageEditTool
      slug="erase"
      title="AI 一键消除"
      description="去掉画面里不想要的元素（路人 / 文字 / 杂物 / 水印），背景智能填充"
      promptHint="必填：用一句话描述要去掉什么"
      promptPlaceholder="例如：去掉画面右下角的水印；去掉背景里的路人"
      requireInstruction
    />
  );
}
