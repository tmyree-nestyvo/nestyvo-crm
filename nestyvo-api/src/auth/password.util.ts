import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

// bcryptjs (pure JS), not native bcrypt — this Docker build already had one
// native-module surprise this project (msgpackr-extract's install script,
// see nestyvo-api's Railway build logs); a pure-JS hash lib removes that
// whole class of risk for a few ms of hashing time, which doesn't matter
// here.
const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Used whenever an admin creates or resets a login and doesn't supply their
// own initial password — there's no real email delivery yet (see
// LoggingDeliveryProvider-style stubs elsewhere in this project's sibling
// apps), so the admin relays this to the partner directly (phone, text,
// in person) the same way she already does everything else during
// onboarding. Avoids visually ambiguous characters (0/O, 1/l/I) since a
// human is going to read this off a screen and type it, or read it aloud.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}
