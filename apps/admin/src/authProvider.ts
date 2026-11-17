import type { AuthProvider } from 'react-admin';
import { api, setCsrfToken } from './http';

export type Role = 'ADMIN' | 'LIBRARIAN';

export interface Me {
  id: number;
  email: string;
  name: string;
  role: Role;
  githubLinked: boolean;
}

let me: Me | null = null;

async function loadMe(): Promise<Me> {
  if (me) return me;
  const body = await api('/auth/me');
  setCsrfToken(body.csrfToken);
  me = body.user;
  return me!;
}

export const authProvider: AuthProvider = {
  async login({ username, password }: { username: string; password: string }) {
    const body = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: username, password }) });
    setCsrfToken(body.csrfToken);
    me = body.user;
  },

  async logout() {
    try {
      if (me) await api('/auth/logout', { method: 'POST' });
    } catch {
      /* session may already be gone */
    }
    me = null;
    setCsrfToken(null);
  },

  async checkAuth() {
    await loadMe();
  },

  async checkError(error: { status?: number }) {
    if (error?.status === 401) {
      me = null;
      throw new Error('Session expired');
    }
    // 403 = signed in but not allowed: stay logged in and just show the message.
  },

  async getIdentity() {
    const user = await loadMe();
    return { id: user.id, fullName: `${user.name} · ${user.role === 'ADMIN' ? 'Admin' : 'Librarian'}` };
  },

  async getPermissions() {
    try {
      return (await loadMe()).role;
    } catch {
      return null;
    }
  },
};
