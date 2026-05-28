/**
 * 兼容层：移动端历史代码 import { useToast } from '@/components/m/Toast'。
 * 现在统一走 @/lib/toast 的全局 emitter，保留这个 shim 让旧文件不需要改。
 *
 * 旧代码可能调用：
 *   - toast.success / error / info（新 API）
 *   - toast.show(msg, 'success' | 'error' | 'info')（旧移动端 API）
 * 全部桥接到全局 emitter。
 */
"use client";

import { toast as globalToast, type ToastKind } from "@/lib/toast";

type LegacyToast = typeof globalToast & {
  show(message: string, kind?: ToastKind | string, duration?: number): number;
};

const legacy: LegacyToast = Object.assign(Object.create(null), globalToast, {
  show(message: string, kind?: ToastKind | string, duration?: number): number {
    const k: ToastKind =
      kind === "error" || kind === "info" ? kind : "success";
    return globalToast[k](message, duration);
  },
}) as LegacyToast;

export function useToast() {
  return legacy;
}

export { legacy as toast };
export default legacy;
