import { getDbInfo, pool, testDatabaseConnection } from '../db';
import { runMigrations } from '../migrations';

async function executeMigrationsCli(): Promise<void> {
  const info = getDbInfo();
  console.log(
    `[ScoolMeet Migrations] Connecting to MySQL (${info.user}@${info.host}:${info.port}/${info.database})...`
  );

  const status = await testDatabaseConnection();
  if (!status.connected) {
    console.error(
      `[ScoolMeet Migrations] Cannot connect to MySQL: ${status.error || 'Unknown error'}`
    );
    process.exit(1);
  }

  try {
    const result = await runMigrations();
    if (result.applied.length === 0) {
      console.log(
        `[ScoolMeet Migrations] Database is up to date (${result.totalExecuted} migrations applied).`
      );
    } else {
      console.log(
        `[ScoolMeet Migrations] Successfully applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`
      );
    }
  } catch (err) {
    console.error('[ScoolMeet Migrations] Error applying migrations:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void executeMigrationsCli();
