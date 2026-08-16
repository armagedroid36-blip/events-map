// Контекст авторизации: текущий пользователь, вход, выход, регистрация.
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
  /** Подтверждение регистрации кодом из письма */
  confirmSignup: (
    email: string,
    code: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string },
  ) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  ready: false,
  signIn: async () => false,
  signUp: async () => {},
  confirmSignup: async () => false,
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
    // Только отправка запроса: после signUp нужно подтвердить почту кодом
    await getApi().signUp(email, password, role, contacts);
  }

  async function confirmSignup(
    email: string,
    code: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string },
  ): Promise<boolean> {
    const u = await getApi().confirmSignup(email, code, role, contacts);
    if (u) setUser(u);
    return !!u;
  }

  async function signOut() {
    await getApi().signOut();
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, ready, signIn, signUp, confirmSignup, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
