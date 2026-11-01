// Creates an administrator account, or promotes an existing user and sets a new password.
// Usage: npm run create-admin -- --email admin@codeshelf.local --password 'long-password' [--name 'Admin']
//        (the password can also be passed in the ADMIN_PASSWORD environment variable)
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createServices } from '../src/app.js';
import { emailSchema, nameSchema, passwordSchema } from '../src/utils/schemas.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Administrator' },
  },
});

const input = z
  .object({ email: emailSchema, password: passwordSchema, name: nameSchema })
  .safeParse({ ...values, password: values.password ?? process.env.ADMIN_PASSWORD });

if (!input.success) {
  for (const issue of input.error.issues) {
    console.error(`--${issue.path.join('.')}: ${issue.message}`);
  }
  console.error(
    'Usage: npm run create-admin -- --email <email> --password <password> [--name <name>]',
  );
  process.exit(1);
}

const { email, password, name } = input.data;
const config = loadConfig();
const db = openDatabase(config.dbPath);
await migrate(db, {
  backupPath: config.backupPath,
  log: (message) => console.log(`[db] ${message}`),
});

const { usersService, authService } = createServices(db, config);
const passwordHash = await authService.hashPassword(password);
const existing = usersService.findAuthByEmail(email);

if (existing) {
  usersService.setRole(existing.user.id, 'admin');
  usersService.setPasswordHash(existing.user.id, passwordHash);
  console.log(`${email} is now an administrator (password updated)`);
} else {
  usersService.create({ name, email, passwordHash, role: 'admin' });
  console.log(`Administrator ${email} created`);
}
db.close();
