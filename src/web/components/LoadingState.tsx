import { Skeleton } from '@/components/ui/primitives';

export function LoadingState({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3" aria-busy="true" aria-label="加载中">
      <Skeleton className="h-5 w-36 max-w-full" />
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full border border-border" />
        ))}
      </div>
    </div>
  );
}
