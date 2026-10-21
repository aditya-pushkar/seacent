'use client';
/** "View in PDF" action; renders nothing when a source location is unavailable. */


import { FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldSourceLocation } from '@/lib/types';
import { hasSource } from '@/lib/utils';

interface ProvenanceActionProps {
  source?: FieldSourceLocation | null;
  onClick: () => void;
  label?: string;
}

export function ProvenanceAction({ source, onClick, label = 'View in PDF' }: ProvenanceActionProps) {
  if (!hasSource(source)) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="gap-1 h-7 px-2">
      <FileSearch className="h-3 w-3" />
      {label}
    </Button>
  );
}
