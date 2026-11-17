import * as argon2 from 'argon2';

/** argon2id with OWASP-recommended minimum parameters (19 MiB, 2 passes). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Hash checked when the email doesn't exist, so a failed login takes the same
 * time whether or not the account exists (no user enumeration by timing).
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  return (dummyHash ??= hashPassword('not-a-real-password-' + Math.random()));
}

export const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 128,
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  message: 'Password must be 12–128 characters and include upper-case, lower-case letters and a digit.',
};
