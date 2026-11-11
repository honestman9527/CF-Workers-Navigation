import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, LockKeyhole, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  matchOption,
  optionLabel,
  type SelectOption,
  type SearchSelectProps,
} from '@nav/features/selection/options';

import { FrontButton, FrontInput } from './controls';

/** 前台可搜索单选：自持呈现，与后台仅共享选项和匹配规则。 */
export function FrontSearchSelect({
  options,
  value,
  onChange,
  label,
  placeholder,
  disabled,
  id,
  className,
}: SearchSelectProps) {
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(option) => {
        if (option) onChange(option.value);
      }}
      itemToStringLabel={optionLabel}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={matchOption}
      disabled={disabled}
    >
      <Combobox.Trigger
        id={id}
        aria-label={label}
        title={selected ? optionLabel(selected) : undefined}
        render={<FrontButton tone="subtle" />}
        className={cn('min-w-0 justify-between gap-2 font-normal', className)}
      >
        <span className="min-w-0 truncate">{selected ? optionLabel(selected) : label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 max-w-[calc(100vw-2rem)]">
          <Combobox.Popup
            aria-label={label}
            className="front-surface flex max-h-(--available-height) w-[max(20rem,var(--anchor-width))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-card p-2 text-foreground shadow-lg outline-none"
          >
            <div className="relative mb-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              />
              <Combobox.Input
                render={<FrontInput />}
                aria-label={placeholder}
                placeholder={placeholder}
                className="h-10 pl-9"
              />
            </div>
            <Combobox.Empty className="p-4 text-center text-sm text-muted-foreground">
              没有匹配项，请换个关键词
            </Combobox.Empty>
            <Combobox.List className="scrollbar-safe max-h-72 min-h-0 overflow-y-auto overscroll-contain">
              {(option: SelectOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-highlighted:bg-secondary data-highlighted:text-foreground data-selected:font-medium"
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ width: Math.min(option.depth ?? 0, 4) * 12 }}
                  />
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
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={option.path}
                      >
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
                    <Combobox.ItemIndicator>
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
