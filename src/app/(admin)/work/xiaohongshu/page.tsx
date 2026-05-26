import dynamicImport from 'next/dynamic';

export const dynamic = 'force-dynamic';

const XhsOperatorClient = dynamicImport(() => import('@/components/xhs-operator/XhsOperatorClient'), { ssr: false });

export default function XiaohongshuWorkspace() {
  return <XhsOperatorClient />;
}
