'use client';
/** Copies the full invoice result JSON to the clipboard, showing a "Copied" state for 2 seconds. */


import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { copyJsonToClipboard } from '@/lib/utils';
import { InvoiceResult } from '@/lib/types';

interface CopyResultJsonButtonProps {
  result: InvoiceResult;
}

export function CopyResultJsonButton({ result }: CopyResultJsonButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyJsonToClipboard(result);
      setCopied(true);
      toast.success('Result JSON copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy JSON');
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy result JSON'}
    </Button>
  );
}
