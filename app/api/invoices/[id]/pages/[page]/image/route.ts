import { UUID_RE } from '@/src/db/schema';
import { notFound, toErrorResponse } from '@/lib/server/errors';
import { getPageImage } from '@/lib/server/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; page: string }> },
) {
  try {
    const { id, page } = await context.params;
    if (!UUID_RE.test(id)) throw notFound();

    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw notFound('Page image not found.');
    }

    const data = await getPageImage(id, pageNumber);
    if (!data) throw notFound('Page image not found.');

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(data.length),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
