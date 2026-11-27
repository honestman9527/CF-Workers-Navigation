import type { Bookmark, Category } from '@shared/api/types';

import { Popover } from '@base-ui/react/popover';
import { ChevronRight, CopyPlus, LockKeyhole, Search, Star } from 'lucide-react';
import { useId, useMemo, useRef } from 'react';

import { isComposingKey } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { categoryOptions, optionLabel, type SelectOption } from '@nav/features/selection/options';
import { useCategorySelect } from '@nav/features/selection/useCategorySelect';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';
import { COMMON_CATEGORY_SYSTEM_KEY } from '@shared/category-rules';

import { FrontButton, FrontInput } from './controls';

/** 前台卡片「复制到分类」浮层，遵循 Base UI 与无障碍树规范。 */
export function FrontBookmarkCopyPicker({
  bookmark,
  categories,
  disabled = false,
  onCopy,
}: {
  bookmark: Bookmark;
  categories: Category[];
  disabled?: boolean;
  onCopy: (categoryId: number | null) => Promise<boolean> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const privacyNoteId = useId();

  const commonCategory = useMemo(
    () => categories.find((item) => item.systemKey === COMMON_CATEGORY_SYSTEM_KEY),
    [categories],
  );
  const currentSlug = useMemo(() => {
    if (bookmark.categoryId === null) return UNCATEGORIZED_SLUG;
    return categories.find((item) => item.id === bookmark.categoryId)?.slug ?? '';
  }, [bookmark.categoryId, categories]);

  const options = useMemo<SelectOption[]>(() => {
    const base = categoryOptions(categories).map((option) => ({
      ...option,
      disabled: option.value === currentSlug,
      hint: option.value === currentSlug ? '当前' : option.hint,
    }));
    return [
      ...base,
      {
        value: UNCATEGORIZED_SLUG,
        label: '未分类',
        path: '未分类',
        disabled: bookmark.categoryId === null,
        hint: bookmark.categoryId === null ? '当前' : undefined,
      },
    ];
  }, [categories, currentSlug, bookmark.categoryId]);

  const tree = useCategorySelect({
    options,
    value: currentSlug,
    label: `复制到分类：${bookmark.title}`,
    placeholder: '搜索目标分类',
    disabled,
    onChange: (slug) => {
      const targetId =
        slug === UNCATEGORIZED_SLUG ? null : categories.find((item) => item.slug === slug)?.id;
      if (targetId === undefined || targetId === bookmark.categoryId) return;
      void onCopy(targetId);
    },
  });

  const inheritedPrivate =
    bookmark.effectiveVisibility === 'private' && bookmark.visibility === 'public';

  return (
    <Popover.Root open={tree.open} onOpenChange={tree.changeOpen}>
      <Popover.Trigger
        disabled={disabled}
        aria-label={`复制到分类：${bookmark.title}`}
        title="复制到分类"
        render={<FrontButton />}
        className="min-h-11 min-w-11 rounded-lg px-0 sm:hover-capable:min-h-8 sm:hover-capable:w-8 sm:hover-capable:min-w-8"
      >
        <CopyPlus aria-hidden="true" className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={6} className="z-50 max-w-[calc(100vw-2rem)]">
          <Popover.Popup
            aria-label={`复制「${bookmark.title}」到分类`}
            initialFocus={inputRef}
            className="front-surface glass-surface overlay-popup flex max-h-(--available-height) w-[min(19rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col overflow-hidden rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl outline-none"
          >
            {commonCategory && bookmark.categoryId !== commonCategory.id ? (
              <div className="mb-2 border-b border-border/70 pb-2">
                <FrontButton
                  tone="subtle"
                  disabled={disabled}
                  onClick={() => {
                    tree.changeOpen(false);
                    void onCopy(commonCategory.id);
                  }}
                  className="min-h-10 w-full justify-start gap-2 rounded-xl px-2.5 text-sm font-medium text-primary"
                >
                  <Star aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">复制到「{commonCategory.name}」</span>
                </FrontButton>
              </div>
            ) : null}

            <div className="relative mb-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              />
              <FrontInput
                ref={inputRef}
                value={tree.query}
                onChange={(event) => tree.setQuery(event.target.value)}
                aria-label="搜索目标分类"
                placeholder="搜索目标分类"
                className="min-h-10 pl-9 text-sm"
                onKeyDown={(event) => {
                  if (
                    !isComposingKey(event.nativeEvent) &&
                    (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                  ) {
                    event.preventDefault();
                    tree.focus(
                      event.key === 'ArrowDown' ? tree.rows[0] : tree.rows[tree.rows.length - 1],
                    );
                  }
                }}
              />
            </div>

            {inheritedPrivate ? (
              <p
                id={privacyNoteId}
                className="mb-2 rounded-xl border border-primary/20 bg-accent/60 px-2.5 py-1.5 text-xs text-primary"
              >
                当前书签继承了私有权限，复制到公开分类时将自动保持私有。
              </p>
            ) : null}

            {!tree.rows.length ? (
              <p role="status" className="p-4 text-center text-sm text-muted-foreground">
                没有匹配的分类
              </p>
            ) : null}

            <div
              role="tree"
              aria-label="选择目标分类"
              aria-describedby={inheritedPrivate ? privacyNoteId : undefined}
              className="scrollbar-safe max-h-64 min-h-0 overflow-y-auto overscroll-contain"
            >
              {tree.rows.map((option) => (
                <div
                  key={option.value}
                  {...tree.itemProps(option)}
                  title={optionLabel(option)}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-xl py-1 pr-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                    option.disabled
                      ? 'cursor-not-allowed text-muted-foreground/60'
                      : 'cursor-pointer hover:bg-accent focus:bg-accent',
                  )}
                  style={{ paddingLeft: 4 + Math.min(option.depth ?? 0, 1) * 16 }}
                >
                  {tree.hasChildren(option) ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`${tree.isExpanded(option) ? '收起' : '展开'} ${option.label}`}
                      disabled={tree.searching}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        tree.toggle(option);
                      }}
                      className="grid min-h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:cursor-default"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          'size-4 transition-transform',
                          tree.isExpanded(option) && 'rotate-90',
                        )}
                      />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="w-9 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{option.label}</span>
                      {option.private ? (
                        <LockKeyhole
                          aria-label="仅登录可见"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                    </span>
                    {option.depth ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.path}
                      </span>
                    ) : null}
                  </span>
                  {option.hint ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
