import { badRequest, toErrorResponse } from '@/lib/server/errors';
import { toInvoiceSummary } from '@/lib/server/invoice-dto';
import { createQueuedInvoice, listInvoiceSummaries } from '@/lib/server/invoices';
import { validateUpload } from '@/lib/server/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await listInvoiceSummaries();
    return Response.json({ invoices: rows.map(toInvoiceSummary) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw badRequest('Upload a file in the "file" field.', { code: 'E_FILE_REQUIRED' });
    }

    const upload = await validateUpload(file);
    const id = await createQueuedInvoice(upload);
    return Response.json({ invoiceId: id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
