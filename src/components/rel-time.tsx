'use client';
import { fmtRelative } from '@/lib/domain';

/** "5 minutes ago" — can differ between server render and hydration, so mismatches are expected. */
export function RelTime({ iso, prefix = '' }: { iso: string; prefix?: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {prefix}{fmtRelative(iso)}
    </time>
  );
}
