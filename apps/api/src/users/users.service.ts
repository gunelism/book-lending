import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { hashPassword } from '../auth/password';
import { DomainError, NotFoundError } from '../common/errors';
import { findPage, likePattern, ListArgs, Page, SortOrder } from '../common/pagination';
import { Session, User } from '../entities';
import { CreateUserInput, UpdateUserInput, UserFilter } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  list(args: ListArgs, filter: UserFilter = {}): Promise<Page<User>> {
    const base: FindOptionsWhere<User> = {};
    if (filter.ids?.length) base.id = In(filter.ids);
    if (filter.role) base.role = filter.role;
    if (filter.isActive !== undefined) base.isActive = filter.isActive;
    const q = filter.q ? ILike(likePattern(filter.q)) : undefined;
    const where = q ? [{ ...base, name: q }, { ...base, email: q }] : base;
    return findPage(this.repo, args, { where, defaultSort: { field: 'name', order: SortOrder.ASC } });
  }

  async get(id: number): Promise<User> {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { password, ...rest } = input;
    const saved = await this.repo.save(this.repo.create({ ...rest, passwordHash: await hashPassword(password) }));
    return this.get(saved.id);
  }

  async update(id: number, input: UpdateUserInput, actor: User): Promise<User> {
    const user = await this.get(id);
    if (id === actor.id && ((input.role && input.role !== user.role) || input.isActive === false)) {
      throw new DomainError('SELF_LOCKOUT', 'You cannot change your own role or deactivate your own account.');
    }
    const securityChange =
      (input.role !== undefined && input.role !== user.role) || input.isActive === false || input.password !== undefined;

    const { password, ...rest } = input;
    this.repo.merge(user, rest);
    if (password) user.passwordHash = await hashPassword(password);
    await this.repo.save(user);

    // Role change, deactivation or password reset ends that user's other sessions.
    if (securityChange && id !== actor.id) await this.revokeSessions(id);
    return this.get(id);
  }

  async delete(id: number, actor: User): Promise<User> {
    if (id === actor.id) throw new DomainError('SELF_LOCKOUT', 'You cannot delete your own account.');
    const user = await this.get(id);
    await this.repo.remove(user);
    await this.revokeSessions(id);
    return { ...user, id };
  }

  /**
   * Deletes every server-side session belonging to the user. QueryBuilder is
   * needed because the user id lives inside the session's JSON column.
   */
  async revokeSessions(userId: number): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .delete()
      .where(`(sess ->> 'userId')::int = :userId`, { userId })
      .execute();
  }
}
