'use client';
/** Renders a single confidence score (0-1) as a numeric value plus a coloured progress meter. */


import { getConfidenceLabel } from '@/lib/utils';

interface ConfidenceMeterProps {
  score: number | null | undefined;
}

export function ConfidenceMeter({ score }: ConfidenceMeterProps) {
  const { label, tone } = getConfidenceLabel(score);

  if (score === null || score === undefined || Number.isNaN(score)) {
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  }

  const toneClass = {
    high: 'bg-green-500',
    medium: 'bg-amber-500',
    low: 'bg-red-500',
    neutral: 'bg-muted-foreground',
  }[tone];

  const percent = Math.round(Math.max(0, Math.min(1, score)) * 100);

  return (
    <div className="flex flex-col gap-1 min-w-[90px]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium tabular-nums">{score.toFixed(2)}</span>
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence ${score.toFixed(2)} ${label}`}
      >
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
