'use client';
/** Top navigation bar: product branding on the left, "Upload Invoice" action on the right. */


import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppNavbarProps {
  onUploadClick: () => void;
}

export function AppNavbar({ onUploadClick }: AppNavbarProps) {
  return (
    <nav className="border-b bg-background">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <p className="text-2xl">SeaCent</p>
        </div>
        <Button size="lg" onClick={onUploadClick} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Invoice
        </Button>
      </div>
    </nav>
  );
}
