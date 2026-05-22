'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastCtx {
  show: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) {
    return {
      show: (text: string) => {
        if (typeof window !== 'undefined') console.log('[toast]', text);
      },
    };
  }
  return c;
}

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [list, setList] = useState<Toast[]>([]);

  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setList((arr) => [...arr, { id, text, kind }]);
    setTimeout(() => {
      setList((arr) => arr.filter((t) => t.id !== id));
    }, 2200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none">
        {list.map((t) => (
          <div
            key={t.id}
            className={
              'px-4 py-2 rounded-full text-sm shadow-lg max-w-[80%] ' +
              (t.kind === 'success'
                ? 'bg-emerald-600 text-white'
                : t.kind === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-white')
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
