import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Env } from '../config/env';
import { Role, User } from '../entities';
import { dummyPasswordHash, verifyPassword } from './password';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  githubLinked: boolean;
}

export function toSessionUser(u: User): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, githubLinked: !!u.githubId };
}

export type GithubOutcome = { kind: 'ok'; user: User } | { kind: 'pending' } | { kind: 'error'; reason: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Verifies credentials. Same generic error for "no such user", "wrong password" and "inactive". */
  async login(email: string, password: string): Promise<User> {
    // passwordHash is `select: false` on the entity, so it's requested explicitly.
    const user = await this.users.findOne({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, role: true, isActive: true, githubId: true, passwordHash: true },
    });

    const hash = user?.passwordHash ?? (await dummyPasswordHash());
    const ok = await verifyPassword(hash, password);
    if (!user || !user.passwordHash || !ok || !user.isActive) {
      // The user always gets the same message; the log says why (useful to spot attacks or locked-out staff).
      const reason = !user ? 'unknown email' : !user.passwordHash ? 'account has no password (GitHub-only)' : !ok ? 'wrong password' : 'account deactivated';
      this.logger.warn(`Failed sign-in for "${email.toLowerCase()}": ${reason}`);
      throw new UnauthorizedException('Invalid email or password.');
    }
    this.logger.log(`User ${user.id} signed in`);
    await this.users.update(user.id, { lastLoginAt: new Date() });
    return user;
  }

  // ---------------- GitHub OAuth (authorization-code flow) ----------------

  githubEnabled(): boolean {
    return !!(this.config.get('GITHUB_CLIENT_ID', { infer: true }) && this.config.get('GITHUB_CLIENT_SECRET', { infer: true }));
  }

  githubAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get('GITHUB_CLIENT_ID', { infer: true })!,
      redirect_uri: `${this.config.get('PUBLIC_URL', { infer: true })}/auth/github/callback`,
      scope: 'read:user user:email',
      state,
      allow_signup: 'false',
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }

  /**
   * Exchanges the code, then finds the staff account by GitHub id, or links
   * an existing account with the same verified email. Unknown people get an
   * INACTIVE librarian account that an admin must approve, so OAuth never
   * grants access on its own.
   */
  async githubCallback(code: string): Promise<GithubOutcome> {
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.get('GITHUB_CLIENT_ID', { infer: true }),
          client_secret: this.config.get('GITHUB_CLIENT_SECRET', { infer: true }),
          code,
          redirect_uri: `${this.config.get('PUBLIC_URL', { infer: true })}/auth/github/callback`,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) return { kind: 'error', reason: 'token_exchange_failed' };

      const gh = async <T>(path: string): Promise<T> => {
        const r = await fetch(`https://api.github.com${path}`, {
          headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'book-lending-library' },
        });
        if (!r.ok) throw new Error(`GitHub ${path} -> ${r.status}`);
        return r.json() as Promise<T>;
      };
      const profile = await gh<{ id: number; login: string; name: string | null }>('/user');
      const emails = await gh<Array<{ email: string; primary: boolean; verified: boolean }>>('/user/emails');
      const email = emails.find((e) => e.primary && e.verified)?.email?.toLowerCase();
      const githubId = String(profile.id);

      let user = await this.users.findOneBy({ githubId });
      if (!user && email) {
        user = await this.users.findOneBy({ email });
        if (user) {
          user.githubId = githubId;
          await this.users.save(user);
        }
      }
      if (!user) {
        if (!email) return { kind: 'error', reason: 'no_verified_email' };
        await this.users.save(
          this.users.create({ email, name: profile.name || profile.login, githubId, role: Role.LIBRARIAN, isActive: false }),
        );
        this.logger.log(`New GitHub sign-up ${email} is waiting for admin approval`);
        return { kind: 'pending' };
      }
      if (!user.isActive) return { kind: 'pending' };

      await this.users.update(user.id, { lastLoginAt: new Date() });
      return { kind: 'ok', user };
    } catch (err) {
      this.logger.warn(`GitHub sign-in failed: ${err}`);
      return { kind: 'error', reason: 'github_unavailable' };
    }
  }
}
