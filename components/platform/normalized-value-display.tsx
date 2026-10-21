/** Shows value plus "as printed" and "normalized" variants when they differ. */

interface NormalizedValueDisplayProps {
  rawText?: string | null;
  normalizedValue?: string | number | null;
  value: string | number | null;
}

export function NormalizedValueDisplay({ rawText, normalizedValue, value }: NormalizedValueDisplayProps) {
  const showNormalized = normalizedValue !== null && normalizedValue !== undefined && normalizedValue !== value;
  const showRaw = rawText && rawText !== normalizedValue && rawText !== value;

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{value ?? 'Not found'}</div>
      {showNormalized && (
        <div className="text-xs text-muted-foreground">
          Normalized: {normalizedValue}
        </div>
      )}
      {showRaw && (
        <div className="text-xs text-muted-foreground">
          As printed: {rawText}
        </div>
      )}
    </div>
  );
}
