import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export async function POST(request: Request) {
  try {
    const response = await fetch(`${API_URL}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json(data, { status: response.status });
    const result = NextResponse.json({ user: data.user });
    result.cookies.set('gd_session', data.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8,
      path: '/',
    });
    return result;
  } catch {
    return NextResponse.json({ message: 'Authentication service is unavailable.' }, { status: 503 });
  }
}
