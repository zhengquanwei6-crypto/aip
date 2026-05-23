import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5：/pricing 已合入 /clients?tab=pricing。
 * 这里保留 server-component redirect 作为 middleware redirect 的兜底
 * (middleware 已经会先 307; 即便 middleware 配置变更或 cookie 路径绕过, 这里仍然能保证
 *  深链外部访问者落到正确的整合页).
 */
export default function PricingPage(): never {
  redirect('/clients?tab=pricing');
}
