import type { Theme } from '@shared';

import type { CategoryNode } from '@nav/features/categories/tree';

import { Dialog } from '@base-ui/react/dialog';
import { LayoutDashboard, LogIn, LogOut, Monitor, Moon, Sun, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BrandIcon } from '@nav/features/layout/BrandIcon';

import { CategoryNavTree } from './CategoryNavTree';
import { FrontButton } from './controls';

/** 移动端 / 平板端（< lg）左侧滑出分类抽屉，完整保留两级分类树与快捷操作。 */
export function FrontCategoryDrawer({
  open,
  onOpenChange,
  roots,
  totals,
  activeRoot,
  defaultRootSlug,
  selectedCategory,
  searching,
  onSelectCategory,
  theme,
  setTheme,
  authed,
  loggingOut,
  onAdmin,
  onLogin,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roots: CategoryNode[];
  totals: Map<number, number>;
  activeRoot?: string;
  defaultRootSlug?: string;
  selectedCategory?: string;
  searching: boolean;
  onSelectCategory: (slug?: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  authed: boolean;
  loggingOut: boolean;
  onAdmin: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label="分类导航抽屉"
          className="front-surface glass-surface fixed inset-y-0 left-0 z-50 flex h-svh w-[min(20rem,88vw)] flex-col border-r border-border bg-popover text-popover-foreground shadow-2xl transition-transform duration-200 ease-out outline-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full"
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandIcon className="size-8 shrink-0" />
              <div className="min-w-0">
                <Dialog.Title className="truncate font-display text-sm font-semibold">
                  书签柜
                </Dialog.Title>
                <span className="block truncate text-[11px] text-muted-foreground">
                  两级分类导航
                </span>
              </div>
            </div>
            <Dialog.Close
              render={<FrontButton aria-label="关闭分类抽屉" className="size-11 p-0" />}
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
            <CategoryNavTree
              label="抽屉分类导航"
              roots={roots}
              totals={totals}
              activeRoot={activeRoot}
              defaultRootSlug={defaultRootSlug}
              selectedCategory={selectedCategory}
              searching={searching}
              onSelectCategory={(slug) => {
                onSelectCategory(slug);
                onOpenChange(false);
              }}
            />
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div
              role="group"
              aria-label="抽屉主题切换"
              className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1"
            >
              {(
                [
                  { value: 'light', label: '亮色', icon: Sun },
                  { value: 'dark', label: '暗色', icon: Moon },
                  { value: 'system', label: '系统', icon: Monitor },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <FrontButton
                  key={value}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'min-h-9 gap-1.5 rounded-lg px-2 py-1 text-xs',
                    theme === value
                      ? 'bg-card font-semibold text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                </FrontButton>
              ))}
            </div>
            {authed ? (
              <div className="grid grid-cols-2 gap-1.5">
                <FrontButton
                  tone="subtle"
                  onClick={() => {
                    onOpenChange(false);
                    onAdmin();
                  }}
                  className="min-h-10 justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium"
                >
                  <LayoutDashboard className="size-3.5 shrink-0" />
                  <span>管理后台</span>
                </FrontButton>
                <FrontButton
                  tone="subtle"
                  disabled={loggingOut}
                  onClick={() => {
                    onOpenChange(false);
                    onLogout();
                  }}
                  className="min-h-10 justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                >
                  <LogOut className="size-3.5 shrink-0" />
                  <span>{loggingOut ? '退出中…' : '退出登录'}</span>
                </FrontButton>
              </div>
            ) : (
              <FrontButton
                tone="subtle"
                onClick={() => {
                  onOpenChange(false);
                  onLogin();
                }}
                className="min-h-10 w-full justify-center gap-2 rounded-xl px-3 text-xs font-medium"
              >
                <LogIn className="size-3.5 shrink-0" />
                <span>管理员登录</span>
              </FrontButton>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
