'use client';
/** Draws a bounding-box highlight from normalized [x1,y1,x2,y2] provenance coordinates. */


import { FieldSourceLocation } from '@/lib/types';
import { hasSource } from '@/lib/utils';

interface SourceHighlightOverlayProps {
  source?: FieldSourceLocation | null;
  isActive: boolean;
}

export function SourceHighlightOverlay({ source, isActive }: SourceHighlightOverlayProps) {
  if (!isActive || !hasSource(source)) return null;

  const [x1, y1, x2, y2] = source!.bbox;
  const left = Math.min(x1, x2) * 100;
  const top = Math.min(y1, y2) * 100;
  const width = Math.abs(x2 - x1) * 100;
  const height = Math.abs(y2 - y1) * 100;

  return (
    <div
      className="absolute pointer-events-none border-2 border-destructive bg-destructive/10 rounded-sm"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    />
  );
}
