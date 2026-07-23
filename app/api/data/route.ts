import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDashboardData } from '@/lib/pipedrive/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** El middleware ya validó la sesión antes de llegar aquí. */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    const data = await getDashboardData(force);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[api/data]', message);
    return NextResponse.json({ error: `No se pudo cargar Pipedrive: ${message}` }, { status: 502 });
  }
}
