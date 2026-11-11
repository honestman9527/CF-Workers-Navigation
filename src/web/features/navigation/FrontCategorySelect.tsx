import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, ChevronRight, LockKeyhole, Search } from 'lucide-react';
import { useRef } from 'react';

import { cn } from '@/lib/utils';
import { optionLabel, type SearchSelectProps } from '@nav/features/selection/options';
import { useCategorySelect } from '@nav/features/selection/useCategorySelect';

import { FrontButton, FrontInput } from './controls';

/** 分类专用单选树；标签继续使用平级 SearchSelect。 */
export function FrontCategorySelect(props: SearchSelectProps) {
  const { value, label, placeholder, disabled, id, className } = props;
  const tree = useCategorySelect(props);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Popover.Root open={tree.open} onOpenChange={tree.changeOpen}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        aria-label={label}
        title={tree.selected ? optionLabel(tree.selected) : undefined}
        render={<FrontButton tone="subtle" />}
        className={cn('min-h-11 min-w-0 justify-between gap-2 font-normal', className)}
      >
        <span className="min-w-0 truncate">
          {tree.selected ? optionLabel(tree.selected) : label}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} className="z-50 max-w-[calc(100vw-2rem)]">
          <Popover.Popup
            aria-label={label}
            initialFocus={input}
            className="front-surface flex max-h-(--available-height) w-[max(20rem,var(--anchor-width))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-card p-2 text-foreground shadow-lg outline-none"
          >
            <div className="relative mb-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              />
              <FrontInput
                ref={input}
                value={tree.query}
                onChange={(event) => tree.setQuery(event.target.value)}
                aria-label={placeholder}
                placeholder={placeholder}
                className="h-10 pl-9"
                onKeyDown={(event) => {
                  if (
                    !event.nativeEvent.isComposing &&
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
            {!tree.rows.length ? (
              <p role="status" className="p-4 text-center text-sm text-muted-foreground">
                没有匹配项，请换个关键词
              </p>
            ) : null}
            <div
              role="tree"
              aria-label={label}
              className="scrollbar-safe max-h-72 min-h-0 overflow-y-auto overscroll-contain"
            >
              {tree.rows.map((option) => (
                <div
                  key={option.value}
                  {...tree.itemProps(option)}
                  title={optionLabel(option)}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 text-sm outline-none hover:bg-secondary focus:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
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
                      className="grid min-h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:cursor-default"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn('size-4', tree.isExpanded(option) && 'rotate-90')}
                      />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="w-11 shrink-0" />
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
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {option.hint}
                    </span>
                  ) : null}
                  {option.depth !== undefined ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {option.depth + 1} 级
                    </span>
                  ) : null}
                  <span className="grid size-4 shrink-0 place-items-center">
                    {value === option.value ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
