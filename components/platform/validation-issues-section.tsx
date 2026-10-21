'use client';
/** Lists all validation/review issues for the current invoice. */


import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldSourceLocation, ValidationIssue } from '@/lib/types';
import { ValidationIssueCard } from './validation-issue-card';

interface ValidationIssuesSectionProps {
  issues: ValidationIssue[];
  onViewSource: (source: FieldSourceLocation | null) => void;
}

export function ValidationIssuesSection({ issues, onViewSource }: ValidationIssuesSectionProps) {
  if (issues.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Validation Issues</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.map((issue) => (
          <ValidationIssueCard key={issue.id} issue={issue} onViewSource={onViewSource} />
        ))}
      </CardContent>
    </Card>
  );
}
