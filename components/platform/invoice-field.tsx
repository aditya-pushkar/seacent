'use client';
/** Reusable display for one extracted header field: label, value, normalization, source action. */


import { Card } from '@/components/ui/card';
import { FieldMetadata } from '@/lib/types';
import { NormalizedValueDisplay } from './normalized-value-display';
import { ProvenanceAction } from './provenance-action';

interface InvoiceFieldProps {
  label: string;
  metadata?: FieldMetadata | null;
  value: string | number | null;
  onViewSource: () => void;
}

export function InvoiceField({ label, metadata, value, onViewSource }: InvoiceFieldProps) {
  return (
    <Card className="p-3 rounded-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <NormalizedValueDisplay
            rawText={metadata?.rawText}
            normalizedValue={metadata?.normalizedValue}
            value={value}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <ProvenanceAction source={metadata?.source} onClick={onViewSource} />
          </div>
        </div>
      </div>
    </Card>
  );
}
