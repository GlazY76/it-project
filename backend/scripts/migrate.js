// Applies pending migrations to the database (also done automatically when the server starts).
// Usage: npm run db:migrate
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const { applied, version } = await migrate(db, {
  backupPath: config.backupPath,
  log: (message) => console.log(`[db] ${message}`),
});
db.close();

console.log(
  applied.length > 0
    ? `${config.dbPath} migrated to version ${version}`
    : `${config.dbPath} is up to date (version ${version})`,
);
