'use client';
/** One validation issue: category, severity, explanation and optional source action. */


import { Card, CardContent } from '@/components/ui/card';
import { FieldSourceLocation, ValidationIssue } from '@/lib/types';
import { ProvenanceAction } from './provenance-action';

interface ValidationIssueCardProps {
  issue: ValidationIssue;
  onViewSource: (source: FieldSourceLocation | null) => void;
}

export function ValidationIssueCard({ issue, onViewSource }: ValidationIssueCardProps) {
  return (
    <Card className="p-3 rounded-xl border-l-4 border-l-amber-500">
      <CardContent className="p-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">{issue.message}</div>
            <div className="text-xs text-muted-foreground">
              Type: {issue.type} • Severity: {issue.severity}
            </div>
            {issue.fieldName && <div className="text-xs text-muted-foreground">Field: {issue.fieldName}</div>}
            {issue.lineNumber && <div className="text-xs text-muted-foreground">Line: {issue.lineNumber}</div>}
            {issue.expected && issue.actual && (
              <div className="text-xs text-muted-foreground">
                Expected: {issue.expected} • Actual: {issue.actual}
              </div>
            )}
          </div>
          <ProvenanceAction source={issue.source} onClick={() => onViewSource(issue.source ?? null)} />
        </div>
      </CardContent>
    </Card>
  );
}
