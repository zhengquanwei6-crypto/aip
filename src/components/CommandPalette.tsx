'use client';

/**
 * v0.13 BUG-M33: CommandPalette 升级版（cmdk + Radix Dialog）
 *  - ⌘K / Ctrl+K 打开
 *  - 模糊搜索全站页面（NAV_ITEMS）
 *  - 键盘导航（↑↓ Enter Esc）
 *  - 毛玻璃 + spring 动画
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, ArrowRight, Hash, MessageCircle, Image as ImageIcon, BookOpen, Settings, Home, CheckSquare, Sparkles, Wrench, Briefcase, Plug, Users, BarChart3, Tag } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/cn';

const ICON_MAP: Record<string, React.ElementType> = {
  '/dashboard': Home,
  '/today': CheckSquare,
  '/work/xiaohongshu': MessageCircle,
  '/work/xianyu': MessageCircle,
  '/work/qianniu': MessageCircle,
  '/workspace': Briefcase,
  '/clients': Users,
  '/keywords': Tag,
  '/ai-tools': Wrench,
  '/playground': Sparkles,
  '/adapters': Plug,
  '/presets': BookOpen,
  '/imgbed': ImageIcon,
  '/docs': BookOpen,
  '/settings': Settings,
  '/search': Search,
  '/analysis': BarChart3,
  '/analytics': BarChart3,
  '/tools': Wrench,
};

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = React.useMemo(
    () => NAV_ITEMS.map((it) => ({ href: it.href, label: it.label, hidden: it.hidden })),
    [],
  );

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[20%] z-50 w-[90vw] max-w-lg translate-x-[-50%] rounded-2xl shadow-2xl',
            'bg-popover/95 backdrop-blur-xl border border-border/60',
            'data-[state=open]:animate-slide-in-up',
          )}
        >
          <DialogPrimitive.Title className="sr-only">命令面板</DialogPrimitive.Title>

          <Command label="命令面板" className="overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
              <Search size={16} className="text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="跳转到任意页面…（⌘K / Ctrl+K 切换）"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                没找到匹配的页面…
              </Command.Empty>

              <Command.Group heading="导航" className="text-xs text-muted-foreground px-2 [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:font-semibold">
                {items.map((it) => {
                  const Icon = ICON_MAP[it.href] || Hash;
                  return (
                    <Command.Item
                      key={it.href}
                      value={`${it.label} ${it.href}`}
                      onSelect={() => handleSelect(it.href)}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                        'data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/15 data-[selected=true]:to-accent/15',
                        'data-[selected=true]:text-foreground',
                      )}
                    >
                      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon size={13} className="text-muted-foreground" />
                      </div>
                      <span className="flex-1 truncate text-foreground">{it.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{it.href}</span>
                      <ArrowRight size={13} className="text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>

            <div className="px-4 py-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-muted">↑↓</kbd>选择</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-muted">↵</kbd>跳转</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-muted">Esc</kbd>关闭</span>
              </div>
              <span>果冻 AI · 命令面板</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
