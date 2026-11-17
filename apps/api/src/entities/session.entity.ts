import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Server-side login sessions. Written by express-session (connect-pg-simple);
 * mapped here so the app can query and revoke sessions through TypeORM.
 * Not exposed in GraphQL.
 */
@Entity('session')
export class Session {
  @PrimaryColumn({ type: 'varchar' })
  sid: string;

  @Column({ type: 'json' })
  sess: { userId?: number; [key: string]: unknown };

  @Index('IDX_session_expire')
  @Column({ type: 'timestamp', precision: 6 })
  expire: Date;
}
