// Контекст авторизации: текущий пользователь, вход, выход.
// Используется шапкой (кнопка «Войти», меню шестерёнки) и страницами.
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { CurrentUser, UserRole } from './types';
import { getApi } from './api';

interface AuthCtx {
  user: CurrentUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string },
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  ready: false,
  signIn: async () => false,
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getApi()
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  async function signIn(email: string, password: string): Promise<boolean> {
    const u = await getApi().signIn(email, password);
    if (u) setUser(u);
    return !!u;
  }

  async function signUp(
    email: string,
    password: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string },
  ) {
    await getApi().signUp(email, password, role, contacts);
    // После регистрации сразу входим
    const u = await getApi().signIn(email, password);
    if (u) setUser(u);
  }

  async function signOut() {
    await getApi().signOut();
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, ready, signIn, signUp, signOut }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
