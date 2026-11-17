import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CleanLower } from '../common/sanitize';
import { User } from '../entities';
import { AuthService, toSessionUser } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { security } from './security';

class LoginDto {
  @CleanLower()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

const regenerate = (req: Request) => new Promise<void>((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
const save = (req: Request) => new Promise<void>((ok, fail) => req.session.save((e) => (e ? fail(e) : ok())));

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Issues a CSRF token. The SPA calls this before its first state-changing request. */
  @Public()
  @Get('csrf')
  async csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!req.session.userId) req.session.anon = true; // persist the session the token is bound to
    await save(req);
    return { csrfToken: security().generateCsrfToken(req, res, { overwrite: true }) };
  }

  @Public()
  @Get('providers')
  providers() {
    return { github: this.auth.githubEnabled() };
  }

  /** Rate-limited: 5 attempts per minute per IP. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(body.email, body.password);
    // New session id on login prevents session fixation.
    await regenerate(req);
    req.session.userId = user.id;
    await save(req);
    return { user: toSessionUser(user), csrfToken: security().generateCsrfToken(req, res, { overwrite: true }) };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await new Promise<void>((ok) => req.session.destroy(() => ok()));
    const { sessionCookieName, csrfCookieName } = security();
    res.clearCookie(sessionCookieName, { path: '/' });
    res.clearCookie(csrfCookieName, { path: '/' });
    return { ok: true };
  }

  /** Current user + a CSRF token (lets the SPA recover after a page reload). */
  @Get('me')
  me(@CurrentUser() user: User, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { user: toSessionUser(user), csrfToken: security().generateCsrfToken(req, res) };
  }

  // ---------------- GitHub OAuth ----------------

  @Public()
  @Get('github')
  async github(@Req() req: Request, @Res() res: Response) {
    if (!this.auth.githubEnabled()) throw new NotFoundException('GitHub sign-in is not configured.');
    const state = randomBytes(24).toString('base64url');
    req.session.oauthState = state;
    await save(req);
    res.redirect(this.auth.githubAuthorizeUrl(state));
  }

  @Public()
  @Get('github/callback')
  async githubCallback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const expected = req.session.oauthState;
    delete req.session.oauthState;
    // `state` ties the callback to the browser that started the flow (OAuth CSRF protection).
    if (!code || !state || !expected || !safeEqual(state, expected)) return res.redirect('/#/login?error=oauth_state');

    const outcome = await this.auth.githubCallback(code);
    if (outcome.kind === 'pending') return res.redirect('/#/login?error=pending_approval');
    if (outcome.kind === 'error') return res.redirect(`/#/login?error=${encodeURIComponent(outcome.reason)}`);

    await regenerate(req);
    req.session.userId = outcome.user.id;
    await save(req);
    res.redirect('/#/');
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
