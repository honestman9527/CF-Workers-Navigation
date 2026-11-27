import type { Palette, ResolvedTheme, Theme } from '@shared';

import type { CategoryNode } from '@nav/features/categories/tree';

import { Dialog } from '@base-ui/react/dialog';
import { LayoutDashboard, LogIn, LogOut, Moon, Sun, X } from 'lucide-react';

import { runViewTransition } from '@/lib/viewTransition';
import { BrandIcon } from '@nav/features/layout/BrandIcon';

import { AppearancePopover } from './AppearancePopover';
import { CategoryNavTree } from './CategoryNavTree';
import { FrontButton } from './controls';

/** 移动端 / 平板端（< lg）左侧滑出分类抽屉，底部工具栏与桌面展开态统一。 */
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
  resolvedTheme,
  setTheme,
  palette,
  setPalette,
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
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  authed: boolean;
  loggingOut: boolean;
  onAdmin: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const isDark = resolvedTheme === 'dark';

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

          <div className="shrink-0 border-t border-border/70 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex w-full items-center justify-between gap-1">
              {authed ? (
                <FrontButton
                  tone="quiet"
                  onClick={() => {
                    onOpenChange(false);
                    onAdmin();
                  }}
                  aria-label="管理后台"
                  className="min-h-9 gap-2 rounded-xl px-2.5 text-xs font-medium pointer-coarse:min-h-11"
                >
                  <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                  <span>后台</span>
                </FrontButton>
              ) : (
                <FrontButton
                  tone="quiet"
                  onClick={() => {
                    onOpenChange(false);
                    onLogin();
                  }}
                  aria-label="管理员登录"
                  className="min-h-9 gap-2 rounded-xl px-2.5 text-xs font-medium pointer-coarse:min-h-11"
                >
                  <LogIn aria-hidden="true" className="size-4 shrink-0" />
                  <span>登录</span>
                </FrontButton>
              )}

              <div className="flex items-center gap-0.5">
                <FrontButton
                  tone="quiet"
                  aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
                  onClick={(event) =>
                    runViewTransition(() => setTheme(isDark ? 'light' : 'dark'), {
                      kind: 'ripple',
                      origin: event.currentTarget,
                    })
                  }
                  className="size-9 min-h-9 rounded-xl p-0 pointer-coarse:size-11"
                >
                  {isDark ? (
                    <Sun key="dark" aria-hidden="true" className="theme-icon-pop size-4" />
                  ) : (
                    <Moon key="light" aria-hidden="true" className="theme-icon-pop size-4" />
                  )}
                </FrontButton>

                <AppearancePopover
                  theme={theme}
                  resolvedTheme={resolvedTheme}
                  setTheme={setTheme}
                  palette={palette}
                  setPalette={setPalette}
                  side="top"
                  align="end"
                  triggerClassName="size-9 min-h-9 rounded-xl pointer-coarse:size-11"
                />

                {authed ? (
                  <FrontButton
                    tone="quiet"
                    aria-label="退出登录"
                    disabled={loggingOut}
                    onClick={() => {
                      onOpenChange(false);
                      onLogout();
                    }}
                    className="size-9 min-h-9 rounded-xl p-0 text-muted-foreground hover:bg-destructive/12 hover:text-destructive pointer-coarse:size-11"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                  </FrontButton>
                ) : null}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
