import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, User } from '../entities';
import { IS_PUBLIC, requestFrom, ROLES } from './decorators';

/**
 * Global guard: every resolver and route requires a valid session unless it
 * is marked @Public(). The user is re-loaded on each request so that
 * deactivating an account or changing its role takes effect immediately.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req: any = requestFrom(ctx);
    if (req.user) return true; // already resolved earlier in this request

    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('You must be signed in.');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      throw new UnauthorizedException('Your session is no longer valid.');
    }
    req.user = user;
    return true;
  }
}

/** Global guard enforcing @Roles(). Runs after SessionAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user: User | undefined = (requestFrom(ctx) as any).user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException(`This action requires the ${roles.join(' or ')} role.`);
    }
    return true;
  }
}
