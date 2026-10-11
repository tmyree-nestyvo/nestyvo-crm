import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Provider } from '../src/database/entities/provider.entity';
import { ProviderAvailability } from '../src/database/entities/provider-availability.entity';
import { ProviderAppointmentType } from '../src/database/entities/provider-appointment-type.entity';
import { User, UserRole } from '../src/database/entities/user.entity';
import { hashPassword } from '../src/auth/password.util';

// Creates (or refreshes) a dedicated provider login for the Playwright
// comparison run in nestyvo-e2e/, so automated runs never sign in as — or
// book onto — Gloria's real schedule. Lives in the same practice as Gloria
// (so admin sees it alongside her) and copies her working hours and
// appointment types, so it has real open slots to test against.
//
// Idempotent: re-running keeps the same provider and rotates the password.
// Writes the login straight into nestyvo-e2e/.env.e2e (gitignored).
//
//   DATABASE_URL=<railway public postgres url> npx ts-node scripts/create-e2e-test-provider.ts [--with-admin]
//
// --with-admin also creates/rotates an administrator login (e2e-admin@nestyvo.test,
// no practice, same role as the real admin accounts) for the admin-side checkpoints.

const SOURCE_PROVIDER_FIRST_NAME = 'Gloria';
// There are two Gloria Ortiz providers — one in "Tax Refund 1040" (the one
// Charlene tests with) and one in a near-duplicate "TaxRefund1040" practice.
// Pin the practice so the copy always comes from the right one.
const SOURCE_PRACTICE_NAME = 'Tax Refund 1040';
const TEST_EMAIL = 'e2e-provider@nestyvo.test';
const ADMIN_EMAIL = 'e2e-admin@nestyvo.test';
const WITH_ADMIN = process.argv.includes('--with-admin');
const TEST_FIRST = 'Playwright';
const TEST_LAST = 'Test';
const ENV_FILE = join(__dirname, '..', '..', 'nestyvo-e2e', '.env.e2e');
const ENV_EXAMPLE = join(__dirname, '..', '..', 'nestyvo-e2e', '.env.e2e.example');

function setEnv(text: string, key: string, value: string) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    entities: [__dirname + '/../src/database/entities/*.entity.ts'],
    synchronize: false,
  });
  await ds.initialize();
  const providers = ds.getRepository(Provider);
  const users = ds.getRepository(User);
  const hours = ds.getRepository(ProviderAvailability);
  const types = ds.getRepository(ProviderAppointmentType);

  const source = await providers.findOne({
    where: { firstName: SOURCE_PROVIDER_FIRST_NAME, practice: { name: SOURCE_PRACTICE_NAME } },
    relations: { practice: true },
  });
  if (!source) throw new Error(`No provider named ${SOURCE_PROVIDER_FIRST_NAME} in "${SOURCE_PRACTICE_NAME}"`);

  const password = randomBytes(12).toString('base64url');
  let user = await users.findOne({ where: { email: TEST_EMAIL } });
  if (!user) {
    user = users.create({
      cognitoId: `dev-${TEST_EMAIL}`,
      email: TEST_EMAIL,
      firstName: TEST_FIRST,
      lastName: TEST_LAST,
      role: UserRole.PROVIDER,
      practiceId: source.practiceId,
      isActive: true,
    });
  }
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = false;
  user.isActive = true;
  user.practiceId = source.practiceId;
  user = await users.save(user);

  let provider = await providers.findOne({ where: { userId: user.id } });
  if (!provider) {
    provider = await providers.save(Object.assign(new Provider(), {
      practiceId: source.practiceId,
      userId: user.id,
      firstName: TEST_FIRST,
      lastName: TEST_LAST,
      email: TEST_EMAIL,
      specialty: 'Automated test account (Playwright) — not a real provider',
      isVirtual: source.isVirtual,
      isInPerson: source.isInPerson,
      defaultSlotDurationMin: source.defaultSlotDurationMin,
      schedulingPreferences: source.schedulingPreferences,
    }));
    console.log(`Created provider ${TEST_FIRST} ${TEST_LAST}.`);
  } else if (provider.practiceId !== source.practiceId) {
    provider.practiceId = source.practiceId;
    provider = await providers.save(provider);
    console.log(`Moved provider ${TEST_FIRST} ${TEST_LAST} into "${SOURCE_PRACTICE_NAME}".`);
  } else {
    console.log(`Provider ${TEST_FIRST} ${TEST_LAST} already exists — password rotated.`);
  }

  // Always re-sync hours + appointment types from the source provider, so a
  // re-run picks up any changes to Gloria's setup (the test provider has no
  // appointments of its own referencing these).
  await hours.delete({ providerId: provider.id });
  await types.delete({ providerId: provider.id });
  const srcHours = await hours.find({ where: { providerId: source.id, isActive: true } });
  await hours.save(srcHours.map(({ id, provider: _p, ...h }: any) => Object.assign(new ProviderAvailability(), h, { providerId: provider!.id })));
  const srcTypes = await types.find({ where: { providerId: source.id, isActive: true } });
  await types.save(srcTypes.map(({ id, provider: _p, createdAt, updatedAt, ...t }: any) =>
    Object.assign(new ProviderAppointmentType(), t, { providerId: provider!.id })));
  console.log(`Copied ${srcHours.length} hour rows, ${srcTypes.length} appointment types from ${source.firstName} ${source.lastName}.`);

  const practice = (await ds.query(`SELECT name FROM practices WHERE id = $1`, [source.practiceId]))[0];
  const gloriaCount = (await ds.query(`SELECT count(*)::int AS n FROM providers WHERE "firstName" = $1`, [SOURCE_PROVIDER_FIRST_NAME]))[0].n;
  console.log(`Source: ${source.firstName} ${source.lastName} in practice "${practice?.name}" (${gloriaCount} provider(s) named ${SOURCE_PROVIDER_FIRST_NAME}).`);

  let adminPassword: string | null = null;
  if (WITH_ADMIN) {
    adminPassword = randomBytes(12).toString('base64url');
    let admin = await users.findOne({ where: { email: ADMIN_EMAIL } });
    admin ??= Object.assign(new User(), {
      cognitoId: `dev-${ADMIN_EMAIL}`,
      email: ADMIN_EMAIL,
      firstName: 'Playwright',
      lastName: 'Admin',
      role: UserRole.ADMINISTRATOR,
    });
    admin.passwordHash = await hashPassword(adminPassword);
    admin.mustChangePassword = false;
    admin.isActive = true;
    await users.save(admin);
    console.log(`Admin login ready: ${ADMIN_EMAIL}.`);
  }

  let env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : readFileSync(ENV_EXAMPLE, 'utf8');
  env = setEnv(env, 'PROVIDER_EMAIL', TEST_EMAIL);
  env = setEnv(env, 'PROVIDER_PASSWORD', password);
  env = setEnv(env, 'PROVIDER_NAME', `${TEST_FIRST} ${TEST_LAST}`);
  if (adminPassword) {
    env = setEnv(env, 'ADMIN_EMAIL', ADMIN_EMAIL);
    env = setEnv(env, 'ADMIN_PASSWORD', adminPassword);
  }
  writeFileSync(ENV_FILE, env);
  console.log(`Login written to ${ENV_FILE} (email ${TEST_EMAIL}).`);
  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
