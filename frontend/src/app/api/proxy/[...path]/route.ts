import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get('gd_session')?.value;
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  const { path } = await context.params;
  const target = new URL(`${API_URL}/${path.join('/')}`);
  const source = new URL(request.url);
  source.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const contentType = request.headers.get('content-type') ?? 'application/json';
  const response = await fetch(target, { method: request.method, headers: { Authorization: `Bearer ${token}`, ...(hasBody ? { 'Content-Type': contentType } : {}) }, body: hasBody ? (contentType.includes('multipart/form-data') ? await request.arrayBuffer() : await request.text()) : undefined, cache: 'no-store' });
  const responseContentType = response.headers.get('content-type') ?? 'application/json';
  const headers: Record<string, string> = { 'Content-Type': responseContentType };
  const disposition = response.headers.get('content-disposition');
  if (disposition) headers['Content-Disposition'] = disposition;
  const result = new NextResponse(await response.arrayBuffer(), { status: response.status, headers });
  if (response.status === 401) result.cookies.set('gd_session', '', { httpOnly: true, expires: new Date(0), path: '/' });
  return result;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
