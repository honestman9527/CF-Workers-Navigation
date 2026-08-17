import type { CategoryInput, CategoryNode } from '@nav/api/types';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/primitives';
import { DialogPanel } from '@nav/components/DialogPanel';
import { CategoryPicker } from '@nav/features/categories/CategoryPicker';

export function CategoryForm({
  open,
  categories,
  category,
  onClose,
  onSubmit,
}: {
  open: boolean;
  categories: CategoryNode[];
  category?: CategoryNode;
  onClose: () => void;
  onSubmit: (input: CategoryInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CategoryInput>({
    name: '',
    parentId: null,
    icon: '',
    sortOrder: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (category) {
      setForm({
        name: category.name,
        parentId: category.parentId,
        icon: category.icon ?? '',
        sortOrder: category.sortOrder,
      });
      setError(null);
      return;
    }

    setForm({ name: '', parentId: null, icon: '', sortOrder: 0 });
    setError(null);
  }, [category, open]);

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      labelledBy="category-form-title"
      title={category ? '编辑分类' : '新建分类'}
    >
      <div className="flex flex-col gap-1.5 pr-6">
        <h2 id="category-form-title" className="text-lg font-semibold tracking-tight">
          {category ? '编辑分类' : '新建分类'}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          文件夹用来收纳书签。删掉文件夹会连同里面的书签一起走。
        </p>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!form.name.trim()) {
            setError('请填写分类名称');
            return;
          }
          setLoading(true);
          setError(null);

          try {
            await onSubmit({
              ...form,
              name: form.name.trim(),
              icon: form.icon?.trim() || null,
            });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : '保存失败');
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">名称</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="如：开发工具"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-parent">上级分类</Label>
            <CategoryPicker
              id="cat-parent"
              categories={categories}
              value={form.parentId ?? null}
              onChange={(id) => setForm((current) => ({ ...current, parentId: id }))}
              allowNull
              nullLabel="顶层分类（无上级）"
              excludeId={category?.id}
              placeholder="选择上级分类"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-icon">图标标签</Label>
            <Input
              id="cat-icon"
              value={form.icon ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
              placeholder="docs / tools / code"
            />
            <p className="text-[11px] text-muted-foreground">
              可选：docs、tools、code、video、design、news、social、shop、learn
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-sort">排序</Label>
            <Input
              id="cat-sort"
              type="number"
              value={form.sortOrder ?? 0}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))
              }
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} type="button" variant="ghost">
            取消
          </Button>
          <Button disabled={loading} type="submit" variant="default">
            {loading ? '保存中…' : category ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </DialogPanel>
  );
}
