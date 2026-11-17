import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { Role, User } from '../entities';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Opt a route out of authentication (login, CSRF token, health check). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a resolver/route to the given roles. No decorator = any signed-in staff. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export function requestFrom(ctx: ExecutionContext): Request {
  if (ctx.getType<string>() === 'graphql') return GqlExecutionContext.create(ctx).getContext().req;
  return ctx.switchToHttp().getRequest<Request>();
}

/** Injects the signed-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return (requestFrom(ctx) as any).user;
});

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    /** OAuth `state` value, checked on the GitHub callback. */
    oauthState?: string;
    /** Marks an anonymous session as persisted so its CSRF token stays valid. */
    anon?: boolean;
  }
}
