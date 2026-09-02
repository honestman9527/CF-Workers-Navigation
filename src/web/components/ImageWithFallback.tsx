import type { ReactNode } from 'react';

import { useEffect, useState } from 'react';

/** Displays a local fallback when an optional remote image cannot be loaded. */
export function ImageWithFallback({
  src,
  fallback = null,
  className,
  loading,
}: {
  src: string | null | undefined;
  fallback?: ReactNode;
  className?: string;
  loading?: 'eager' | 'lazy';
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return fallback;

  return (
    <img src={src} alt="" className={className} loading={loading} onError={() => setFailed(true)} />
  );
}
