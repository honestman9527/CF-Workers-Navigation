import type { Category } from '@shared/api/types';

import { Check, ChevronDown, Folder } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { categoryIcon } from './icons';
import { buildCategoryTree, flattenCategoryTree } from './tree';

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const flat = useMemo(() => flattenCategoryTree(buildCategoryTree(categories)), [categories]);
  const selected = value !== null ? categories.find((item) => item.id === value) : undefined;
  const SelectedIcon = selected ? categoryIcon(selected.icon) : Folder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full justify-start gap-2 font-normal"
            aria-label="选择分类"
          >
            <SelectedIcon className="size-4 text-primary" />
            <span className="min-w-0 flex-1 truncate text-left">
              {selected ? selected.name : '未分类'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>分类</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={() => onChange(null)}>
          <Folder className="size-4 text-muted-foreground" />
          未分类
          {value === null ? <Check className="ml-auto size-4 text-primary" /> : null}
        </DropdownMenuItem>
        {flat.map((item) => {
          const Icon = categoryIcon(item.icon);
          return (
            <DropdownMenuItem key={item.id} onClick={() => onChange(item.id)} className="gap-2">
              <span style={{ width: `${item.depth * 1}rem` }} />
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', value === item.id && 'font-medium text-foreground')}>
                {item.name}
              </span>
              {value === item.id ? <Check className="ml-auto size-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
