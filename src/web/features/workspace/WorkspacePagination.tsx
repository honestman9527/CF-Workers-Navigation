import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationEllipsis,
} from '@/components/ui/pagination';

export function WorkspacePagination({
  page,
  total,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const numbers = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">
        共 {total} 条，当前 {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} 条
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          每页
          <select
            className="h-8 rounded-md border bg-background px-2"
            value={pageSize}
            disabled={loading}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[24, 48, 96].map((size) => (
              <option key={size} value={size}>
                {size} 条
              </option>
            ))}
          </select>
        </label>
        <Pagination aria-label="书签分页" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                上一页
              </Button>
            </PaginationItem>
            {numbers.map((value, index) => (
              <PaginationItem key={value} className="hidden sm:flex">
                {index > 0 && value - numbers[index - 1] > 1 ? <PaginationEllipsis /> : null}
                <Button
                  size="icon-sm"
                  variant={value === page ? 'outline' : 'ghost'}
                  aria-label={`第 ${value} 页`}
                  aria-current={value === page ? 'page' : undefined}
                  disabled={loading}
                  onClick={() => onPageChange(value)}
                >
                  {value}
                </Button>
              </PaginationItem>
            ))}
            <PaginationItem className="px-2 text-sm sm:hidden">
              {page} / {totalPages}
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                下一页
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
