import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5：/prompts 已合入 /presets?tab=content。
 * middleware 已对该路径做 307 重定向；这里保留 server-side redirect 作为兜底。
 */
export default function PromptsPage(): never {
  redirect('/presets?tab=content');
}
