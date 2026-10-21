import 'server-only';

import { createHash } from 'node:crypto';
import path from 'node:path';
import { appError, badRequest } from './errors';
import { getServerEnv } from './env';

export type ValidatedUpload = {
  filename: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  data: Buffer;
  byteSize: number;
  sha256: string;
};

const PDF_MAGIC = Buffer.from('%PDF-');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function magicMime(data: Buffer): ValidatedUpload['mimeType'] | null {
  if (data.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'application/pdf';
  if (data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'image/png';
  if (data.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) return 'image/jpeg';
  return null;
}

function safeFilename(input: string | undefined): string {
  const base = path.basename(input ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base) return 'invoice';
  return base.slice(0, 255);
}

export async function validateUpload(file: File): Promise<ValidatedUpload> {
  const env = getServerEnv();
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw badRequest('A single invoice file is required.', { code: 'E_FILE_REQUIRED' });
  }

  if (file.size === 0) {
    throw badRequest('The uploaded file is empty.', { code: 'E_FILE_EMPTY' });
  }
  if (file.size > env.MAX_UPLOAD_BYTES) {
    throw appError(
      413,
      'E_FILE_TOO_LARGE',
      `The uploaded file exceeds the ${env.MAX_UPLOAD_BYTES} byte limit.`,
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) {
    throw badRequest('The uploaded file is empty.', { code: 'E_FILE_EMPTY' });
  }
  if (data.length > env.MAX_UPLOAD_BYTES) {
    throw appError(
      413,
      'E_FILE_TOO_LARGE',
      `The uploaded file exceeds the ${env.MAX_UPLOAD_BYTES} byte limit.`,
    );
  }

  const mimeType = magicMime(data);
  if (!mimeType) {
    throw appError(415, 'E_FILE_TYPE', 'Only PDF, PNG, and JPEG invoices are supported.');
  }

  return {
    filename: safeFilename(file.name),
    mimeType,
    data,
    byteSize: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
