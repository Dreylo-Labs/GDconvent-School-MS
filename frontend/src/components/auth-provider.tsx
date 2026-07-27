'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/auth-types';

type AuthContextValue = { user: AuthUser | null; loading: boolean; refreshUser: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!response.ok) { setUser(null); if (pathname !== '/login') router.replace('/login'); return; }
      const data = await response.json(); setUser(data.user);
      if (pathname === '/login') router.replace('/');
    } finally { setLoading(false); }
  }, [pathname, router]);
  useEffect(() => { void refreshUser(); }, [refreshUser]);
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    // A document navigation prevents cached protected route state from
    // surviving after the HTTP-only session cookie is removed.
    window.location.replace('/login');
  }, []);
  const value = useMemo(() => ({ user, loading, refreshUser, logout }), [user, loading, refreshUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
