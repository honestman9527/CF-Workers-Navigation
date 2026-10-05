import type { Category } from '@shared/api/types';

import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  FolderInput,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CategoryMovePicker } from '@nav/features/categories/CategoryMovePicker';

export function CategoryActions({
  category,
  categories,
  excludedIds,
  busy,
  onCreate,
  onRename,
  onReorder,
  onPermission,
  onMove,
  onDelete,
}: {
  category: Category;
  categories: Category[];
  excludedIds: ReadonlySet<number>;
  busy: boolean;
  onCreate: () => void;
  onRename: () => void;
  onReorder: (direction: -1 | 1) => void;
  onPermission: () => void;
  onMove: (parentId: number | null) => void;
  onDelete: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRequested = useRef(false);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={() => onCreate()}
        aria-label={'在 ' + category.name + ' 下新建子分类'}
        title="新建子分类"
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={() => onRename()}
        aria-label="重命名"
        title="重命名"
      >
        <Pencil />
      </Button>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen && moveRequested.current) {
            moveRequested.current = false;
            setMoveOpen(true);
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              ref={anchorRef}
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={category.name + ' 的更多操作'}
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={busy} onClick={() => onReorder(-1)}>
              <ChevronUp />
              上移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => onReorder(1)}>
              <ChevronDown />
              下移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => onPermission()}>
              <LockKeyhole />
              访问权限
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onClick={() => {
                moveRequested.current = true;
                setMenuOpen(false);
              }}
            >
              <FolderInput />
              移动
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => onDelete()}>
              <Trash2 />
              删除
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryMovePicker
        categories={categories}
        excludedIds={excludedIds}
        value={category.parentId}
        disabled={busy}
        onChange={onMove}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        anchorRef={anchorRef}
      />
    </div>
  );
}
