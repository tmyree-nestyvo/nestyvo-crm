import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Provider } from '../src/database/entities/provider.entity';
import { User, UserRole } from '../src/database/entities/user.entity';

const PRACTICE_NAME = 'Westside Mental Health Group';

// Links James Patel + Sarah Torres's Provider rows to a real, dev-loginable
// User account (role=provider) so the provider view can actually be tested
// end to end. The seed never created these — providers had no login at all.
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const ds = new DataSource(
    databaseUrl
      ? {
          type: 'postgres',
          url: databaseUrl,
          ssl: { rejectUnauthorized: false },
          entities: [__dirname + '/../src/database/entities/*.entity.ts'],
          synchronize: false,
        }
      : {
          type: 'postgres',
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT),
          username: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
          entities: [__dirname + '/../src/database/entities/*.entity.ts'],
          synchronize: false,
        },
  );
  await ds.initialize();

  const providerRepo = ds.getRepository(Provider);
  const userRepo = ds.getRepository(User);

  const practiceRow = (await ds.query(`SELECT id FROM practices WHERE name = $1 LIMIT 1`, [PRACTICE_NAME]))[0];
  const providers = await providerRepo.find({ where: { practiceId: practiceRow.id } });

  for (const provider of providers) {
    if (!provider.email) continue;
    let user = await userRepo.findOne({ where: { email: provider.email } });

    if (!user) {
      user = userRepo.create({
        cognitoId: `dev-${provider.email}`,
        email: provider.email,
        firstName: provider.firstName,
        lastName: provider.lastName,
        role: UserRole.PROVIDER,
        practiceId: provider.practiceId,
        isActive: true,
      });
      await userRepo.save(user);
      console.log(`Created provider login for ${provider.firstName} ${provider.lastName} (${provider.email})`);
    } else if (user.role !== UserRole.PROVIDER) {
      // Charlene, Oct 5 2026 — found this as the likely real cause of her
      // account silently losing Administrator access once already (same
      // failure mode: a staff login's email colliding with a Provider
      // row's contact-email field used to cause THIS SCRIPT to silently
      // demote AND rename the existing account to match the provider).
      // Never touch a pre-existing account that isn't already a Provider —
      // log it and move on instead of overwriting someone's real role.
      console.log(`SKIPPED: ${provider.email} already belongs to a ${user.role} account — not overwriting. Resolve the email collision manually if this provider genuinely needs a login.`);
      continue;
    } else {
      console.log(`${provider.email} already correct`);
    }

    if (provider.userId !== user.id) {
      provider.userId = user.id;
      await providerRepo.save(provider);
      console.log(`Linked Provider(${provider.firstName} ${provider.lastName}) → User(${user.email})`);
    }
  }

  await ds.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
