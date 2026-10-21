'use client';
/** Drag-and-drop / file-picker dialog with client-side type validation. */


import { useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/utils';

interface UploadInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: File[]) => Promise<void>;
}

const SUPPORTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

export function UploadInvoiceDialog({ open, onOpenChange, onUpload }: UploadInvoiceDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => SUPPORTED_TYPES.includes(f.type) || f.name.endsWith('.pdf') || f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg'));
      const invalidFiles = newFiles.filter(f => !validFiles.includes(f));
      if (invalidFiles.length > 0) {
        toast.error('Some files have unsupported formats');
      }
      setFiles(prev => [...prev, ...validFiles]);
      e.target.value = '';
    }
  };

  const handleRemove = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onUpload(files);
      setFiles([]);
      onOpenChange(false);
      toast.success(files.length === 1 ? 'Invoice uploaded' : `${files.length} invoices uploaded`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload invoices</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) {
                const newFiles = Array.from(e.dataTransfer.files);
                const validFiles = newFiles.filter(f => SUPPORTED_TYPES.includes(f.type));
                setFiles(prev => [...prev, ...validFiles]);
              }
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm">Drag and drop files here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">Supported: PDF, PNG, JPG, JPEG</p>
            <Input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              className="mt-4"
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between rounded-lg border p-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium line-clamp-1">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{file.type}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={files.length === 0 || isSubmitting}
            className="w-full gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Uploading...' : `Upload ${files.length > 0 ? `(${files.length})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
