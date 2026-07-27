import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export async function GET() {
  const token = (await cookies()).get('gd_session')?.value;
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    const response = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await response.json();
    const result = NextResponse.json(data, { status: response.status });
    if (response.status === 401) result.cookies.set('gd_session', '', { httpOnly: true, expires: new Date(0), path: '/' });
    return result;
  } catch {
    return NextResponse.json({ message: 'Authentication service is unavailable' }, { status: 503 });
  }
}
