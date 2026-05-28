import ImageEditTool from '../_shared/ImageEditTool';

export const dynamic = 'force-dynamic';

export default function RecolorPage() {
  return (
    <ImageEditTool
      slug="recolor"
      title="AI 一键变色"
      description="保留物体形状 + 材质 + 光线，仅替换主色调"
      promptHint="必填：写明把什么从什么颜色变成什么颜色"
      promptPlaceholder="例如：把这件 T 恤从白色变成深蓝色；把包装盒主色变成莫兰迪粉"
      requireInstruction
    />
  );
}
