import dynamicImport from 'next/dynamic';

export const dynamic = 'force-dynamic';

const XhsOperatorClient = dynamicImport(() => import('@/components/xhs-operator/XhsOperatorClient'), { ssr: false });

export default function XiaohongshuWorkspace() {
  return (
    <>
      <header className="page-hero"><h1>小红书运营</h1><p>今日小红书任务进度 + 内容生成 / 发布</p></header>
      <XhsOperatorClient />
    </>
  );
}
