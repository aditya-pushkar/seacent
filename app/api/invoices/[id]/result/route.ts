import { UUID_RE } from '@/src/db/schema';
import { notFound, toErrorResponse } from '@/lib/server/errors';
import { toInvoiceDetail } from '@/lib/server/invoice-dto';
import { getInvoiceDetailRows } from '@/lib/server/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) throw notFound();

    const rows = await getInvoiceDetailRows(id);
    if (!rows) throw notFound();
    return Response.json(toInvoiceDetail(rows).result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
