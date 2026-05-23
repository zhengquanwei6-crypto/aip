/**
 * 全局 Toast 模块级 emitter（pub/sub）
 *
 * 用法：
 *   import { toast } from '@/lib/toast';
 *   toast.success('保存成功');
 *   toast.error('提交失败');
 *   toast.info('稍等…');
 *
 * Provider 在 src/components/Toast.tsx 中订阅本模块。
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** 自动消失毫秒，0/负数表示不自动消失 */
  duration: number;
}

type Listener = (item: ToastItem) => void;
type DismissListener = (id: number) => void;

let nextId = 1;
const listeners = new Set<Listener>();
const dismissListeners = new Set<DismissListener>();

function emit(kind: ToastKind, message: string, duration = 4000): number {
  const id = nextId++;
  const item: ToastItem = { id, kind, message, duration };
  for (const fn of listeners) {
    try {
      fn(item);
    } catch {
      /* noop */
    }
  }
  return id;
}

export const toast = {
  success(message: string, duration?: number) {
    return emit('success', message, duration ?? 4000);
  },
  error(message: string, duration?: number) {
    return emit('error', message, duration ?? 4000);
  },
  info(message: string, duration?: number) {
    return emit('info', message, duration ?? 4000);
  },
  dismiss(id: number) {
    for (const fn of dismissListeners) {
      try {
        fn(id);
      } catch {
        /* noop */
      }
    }
  },
};

/** 仅供 ToastProvider 使用，业务代码请用 `toast.*` */
export function __subscribeToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 仅供 ToastProvider 使用 */
export function __subscribeDismiss(fn: DismissListener): () => void {
  dismissListeners.add(fn);
  return () => {
    dismissListeners.delete(fn);
  };
}
