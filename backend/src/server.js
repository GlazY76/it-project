import { createApp } from './app.js';
import { assertServerConfig, loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';

const config = loadConfig();
assertServerConfig(config);

const db = openDatabase(config.dbPath);
await migrate(db, {
  backupPath: config.backupPath,
  log: (message) => console.log(`[db] ${message}`),
});

const app = createApp({ db, config });
const server = app.listen(config.port, (err) => {
  if (err) throw err;
  console.log(`CodeShelf API listening on http://localhost:${config.port}/api`);
  console.log(`Database: ${config.dbPath}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
