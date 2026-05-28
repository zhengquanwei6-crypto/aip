import ImageEditTool from '../_shared/ImageEditTool';

export const dynamic = 'force-dynamic';

export default function RetouchPage() {
  return (
    <ImageEditTool
      slug="retouch"
      title="AI 产品精修"
      description="把产品图修成电商级成片：统一光线 / 阴影 / 高光 / 反射，干净背景"
      promptHint="可选：补充风格或场景偏好"
      promptPlaceholder="例如：白底硬光高反差；木桌面柔光自然；全身金属高光"
    />
  );
}
