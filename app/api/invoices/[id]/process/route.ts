import { UUID_RE } from '@/src/db/schema';
import { notFound, toErrorResponse } from '@/lib/server/errors';
import { toInvoiceDetail } from '@/lib/server/invoice-dto';
import { getInvoiceDetailRows } from '@/lib/server/invoices';
import { processInvoice } from '@/lib/server/process-invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) throw notFound();

    const result = await processInvoice(id);

    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'busy') {
      return Response.json(
        {
          error: {
            code: 'E_PROCESSING',
            message: 'This invoice is already being processed.',
          },
        },
        { status: 409 },
      );
    }

    const rows = await getInvoiceDetailRows(id);
    if (!rows) throw notFound();
    const invoice = toInvoiceDetail(rows);

    if (result.outcome === 'failed') {
      return Response.json(
        {
          error: {
            code: 'E_PROCESSING_FAILED',
            message: result.error,
          },
          invoice,
        },
        { status: 502 },
      );
    }

    return Response.json({ invoice });
  } catch (error) {
    return toErrorResponse(error);
  }
}
