import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session } from '../api';
import type { Child, User } from '../types/models';

type AppContextValue = {
  user: User | null;
  children: Child[];
  child: Child | null;
  loading: boolean;
  refresh: () => Promise<void>;
  selectChild: (child: Child) => void;
  logout: () => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children: content }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(() => Boolean(session.token));

  const refresh = useCallback(async () => {
    if (!session.token) {
      setLoading(false);
      return;
    }
    try {
      const { user: currentUser } = await api<{ user: User }>('/auth/me');
      const linkedChildren = currentUser.role === 'PARENT'
        ? await api<Child[]>('/parents/me/children')
        : [await api<Child>('/students/me/mobile')];
      setUser(currentUser);
      setChildren(linkedChildren);
      setChild(current => linkedChildren.find(item => item.id === current?.id) ?? linkedChildren[0] ?? null);
    } catch {
      session.token = null;
      setUser(null);
      setChildren([]);
      setChild(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(() => {
    session.token = null;
    setUser(null);
    setChildren([]);
    setChild(null);
  }, []);

  const value = useMemo(() => ({
    user, children, child, loading, refresh, selectChild: setChild, logout,
  }), [user, children, child, loading, refresh, logout]);

  return <AppContext.Provider value={value}>{content}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
