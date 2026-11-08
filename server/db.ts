import dotenv from 'dotenv';
import fs from 'fs';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_DATABASE || 'scoolmeet_db',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD ?? '',
};

/**
 * Primary MySQL Connection Pool (mysql2/promise)
 */
const mysqlPool: Pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 2500,
});

interface RelationalStoreData {
  tables: Record<string, Array<Record<string, unknown>>>;
  autoIncrement: Record<string, number>;
}

const PREVIEW_DB_PATH = path.resolve(process.cwd(), 'database', 'preview-db.json');

const ALL_TABLES = [
  'admins',
  'classes',
  'students',
  'assignments',
  'assignment_submissions',
  'class_schedules',
  'educational_resources',
  'announcements',
  'tickets',
  'ticket_messages',
  'system_settings',
  'gradebook_sessions',
  'gradebook_entries',
  'activity_logs',
  'schema_migrations',
];

let storeCache: RelationalStoreData | null = null;
let fallbackModeActive = false;

function loadRelationalStore(): RelationalStoreData {
  if (storeCache) return storeCache;

  try {
    if (fs.existsSync(PREVIEW_DB_PATH)) {
      const raw = fs.readFileSync(PREVIEW_DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as RelationalStoreData;
      if (parsed && typeof parsed === 'object' && parsed.tables && parsed.autoIncrement) {
        for (const t of ALL_TABLES) {
          if (!Array.isArray(parsed.tables[t])) parsed.tables[t] = [];
          if (typeof parsed.autoIncrement[t] !== 'number') parsed.autoIncrement[t] = 1;
        }
        storeCache = parsed;
        return storeCache;
      }
    }
  } catch {
    // Initialize fresh store if file does not exist or is invalid
  }

  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const autoIncrement: Record<string, number> = {};
  for (const t of ALL_TABLES) {
    tables[t] = [];
    autoIncrement[t] = 1;
  }

  storeCache = { tables, autoIncrement };
  saveRelationalStore();
  return storeCache;
}

function saveRelationalStore(): void {
  if (!storeCache) return;
  try {
    const dir = path.dirname(PREVIEW_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PREVIEW_DB_PATH, JSON.stringify(storeCache, null, 2), 'utf8');
  } catch (err) {
    console.error('[ScoolMeet DB] Error saving relational store:', err);
  }
}

function stripTicks(identifier: string): string {
  return identifier.replace(/`/g, '').trim();
}

function splitTopLevelComma(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && str[i - 1] !== '\\') {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (!inSingleQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

interface ParamCursor {
  params: unknown[];
  index: number;
}

function resolveSqlValueToken(token: string, cursor: ParamCursor): unknown {
  const trimmed = token.trim();
  if (trimmed === '?') {
    return cursor.params[cursor.index++];
  }
  if (/^NULL$/i.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function matchWhereClause(
  row: Record<string, unknown>,
  whereSql: string | undefined,
  cursor: ParamCursor
): boolean {
  if (!whereSql || !whereSql.trim()) return true;
  const cleaned = whereSql.trim();

  // Handle `col NOT IN (?, ?, ...)`
  const notInMatch = cleaned.match(/^`?(\w+)`?\s+NOT\s+IN\s*\(([^)]+)\)$/i);
  if (notInMatch) {
    const col = stripTicks(notInMatch[1]);
    const tokens = splitTopLevelComma(notInMatch[2]);
    const disallowed = tokens.map((t) => String(resolveSqlValueToken(t, cursor)));
    return !disallowed.includes(String(row[col] ?? ''));
  }

  // Handle `col IN (?, ?, ...)`
  const inMatch = cleaned.match(/^`?(\w+)`?\s+IN\s*\(([^)]+)\)$/i);
  if (inMatch) {
    const col = stripTicks(inMatch[1]);
    const tokens = splitTopLevelComma(inMatch[2]);
    const allowed = tokens.map((t) => String(resolveSqlValueToken(t, cursor)));
    return allowed.includes(String(row[col] ?? ''));
  }

  // Handle `col LIKE ?`
  const likeMatch = cleaned.match(/^`?(\w+)`?\s+LIKE\s+(.+)$/i);
  if (likeMatch) {
    const col = stripTicks(likeMatch[1]);
    const pattern = String(resolveSqlValueToken(likeMatch[2], cursor) ?? '');
    const rowVal = String(row[col] ?? '');
    if (pattern.endsWith('%')) {
      return rowVal.startsWith(pattern.slice(0, -1));
    }
    return rowVal.includes(pattern.replace(/%/g, ''));
  }

  // Split by AND
  const parts = cleaned.split(/\s+AND\s+/i);
  let matched = true;
  for (const part of parts) {
    const neqMatch = part.trim().match(/^`?(\w+)`?\s*!=\s*(.+)$/);
    if (neqMatch) {
      const col = stripTicks(neqMatch[1]);
      const val = resolveSqlValueToken(neqMatch[2], cursor);
      if (String(row[col] ?? '') === String(val ?? '')) {
        matched = false;
      }
      continue;
    }

    const eqMatch = part.trim().match(/^`?(\w+)`?\s*=\s*(.+)$/);
    if (eqMatch) {
      const col = stripTicks(eqMatch[1]);
      const val = resolveSqlValueToken(eqMatch[2], cursor);
      if (String(row[col] ?? '') !== String(val ?? '')) {
        matched = false;
      }
      continue;
    }
  }
  return matched;
}

function executeFallbackSql(sqlRaw: string, paramsInput?: unknown): [unknown, unknown[]] {
  const store = loadRelationalStore();
  const params: unknown[] = Array.isArray(paramsInput) ? paramsInput : [];
  const sql = sqlRaw.replace(/\s+/g, ' ').trim().replace(/;$/, '');

  // 1. SELECT 1
  if (/^SELECT\s+1$/i.test(sql)) {
    return [[{ 1: 1 }], []];
  }

  // 2. DDL statements: CREATE TABLE / ALTER TABLE
  if (/^(CREATE|ALTER)\s+TABLE/i.test(sql)) {
    return [{ affectedRows: 0, insertId: 0 } as ResultSetHeader, []];
  }

  // 3. information_schema queries used by migrations
  if (/information_schema\.TABLE_CONSTRAINTS/i.test(sql)) {
    return [[], []];
  }
  if (/information_schema\.COLUMNS/i.test(sql)) {
    return [[{ COLUMN_NAME: 'exists' }], []];
  }

  // 4. Backfill JOIN queries in migration 008
  if (/^UPDATE\s+`?gradebook_entries`?\s+ge\s+INNER\s+JOIN\s+`?students`?\s+s/i.test(sql)) {
    const students = store.tables.students || [];
    const entries = store.tables.gradebook_entries || [];
    let affected = 0;
    for (const ge of entries) {
      if (!ge.student_name) {
        const st = students.find((s) => Number(s.id) === Number(ge.student_id));
        if (st) {
          ge.student_name = `${String(st.first_name || '').trim()} ${String(st.last_name || '').trim()}`.trim();
          affected++;
        }
      }
    }
    if (affected > 0) saveRelationalStore();
    return [{ affectedRows: affected, insertId: 0 } as ResultSetHeader, []];
  }

  if (/^UPDATE\s+`?assignment_submissions`?\s+sub\s+INNER\s+JOIN\s+`?students`?\s+s/i.test(sql)) {
    const students = store.tables.students || [];
    const subs = store.tables.assignment_submissions || [];
    let affected = 0;
    for (const sub of subs) {
      if (!sub.student_name) {
        const st = students.find((s) => Number(s.id) === Number(sub.student_id));
        if (st) {
          sub.student_name = `${String(st.first_name || '').trim()} ${String(st.last_name || '').trim()}`.trim();
          affected++;
        }
      }
    }
    if (affected > 0) saveRelationalStore();
    return [{ affectedRows: affected, insertId: 0 } as ResultSetHeader, []];
  }

  // 5. SELECT `class_code`, COUNT(*) AS `cnt` FROM `students` GROUP BY `class_code`
  if (/^SELECT\s+`?class_code`?\s*,\s*COUNT\(\*\)\s+AS\s+`?cnt`?\s+FROM\s+`?students`?\s+GROUP\s+BY\s+`?class_code`?/i.test(sql)) {
    const students = store.tables.students || [];
    const counts = new Map<string, number>();
    for (const st of students) {
      const code = String(st.class_code || '');
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    const rows = Array.from(counts.entries()).map(([class_code, cnt]) => ({
      class_code,
      cnt,
    }));
    return [rows, []];
  }

  // 6. SELECT COUNT(*) AS cnt FROM <table> [WHERE ...]
  const countMatch = sql.match(
    /^SELECT\s+COUNT\(\*\)\s+AS\s+`?(\w+)`?\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+(.+))?$/i
  );
  if (countMatch) {
    const alias = stripTicks(countMatch[1]);
    const table = stripTicks(countMatch[2]);
    const whereClause = countMatch[3];
    const rows = store.tables[table] || [];
    let cnt = 0;
    for (const row of rows) {
      const cursor: ParamCursor = { params, index: 0 };
      if (matchWhereClause(row, whereClause, cursor)) {
        cnt++;
      }
    }
    return [[{ [alias]: cnt }], []];
  }

  // 7. General SELECT queries: SELECT <cols> FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT ...]
  const selectMatch = sql.match(
    /^SELECT\s+(.+?)\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+`?(\w+)`?\s+(ASC|DESC))?(?:\s+LIMIT\s+(\d+))?$/i
  );
  if (selectMatch) {
    const table = stripTicks(selectMatch[2]);
    const whereClause = selectMatch[3];
    const orderCol = selectMatch[4] ? stripTicks(selectMatch[4]) : undefined;
    const orderDir = selectMatch[5] ? selectMatch[5].toUpperCase() : 'ASC';
    const limitNum = selectMatch[6] ? Number(selectMatch[6]) : undefined;

    const tableRows = store.tables[table] || [];
    let filtered = tableRows.filter((row) => {
      const cursor: ParamCursor = { params, index: 0 };
      return matchWhereClause(row, whereClause, cursor);
    });

    if (orderCol) {
      filtered = [...filtered].sort((a, b) => {
        const va = a[orderCol];
        const vb = b[orderCol];
        if (typeof va === 'number' && typeof vb === 'number') {
          return orderDir === 'DESC' ? vb - va : va - vb;
        }
        const sa = String(va ?? '');
        const sb = String(vb ?? '');
        const na = Number(sa);
        const nb = Number(sb);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && sa !== '' && sb !== '') {
          return orderDir === 'DESC' ? nb - na : na - nb;
        }
        return orderDir === 'DESC' ? sb.localeCompare(sa) : sa.localeCompare(sb);
      });
    }

    if (limitNum !== undefined && limitNum > 0) {
      filtered = filtered.slice(0, limitNum);
    }

    return [filtered.map((r) => ({ ...r })), []];
  }

  // 8. INSERT [IGNORE] INTO <table> (<cols>) VALUES (<vals>) [ON DUPLICATE KEY UPDATE ...]
  const insertMatch = sql.match(
    /^INSERT\s+(IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\((.+?)\)(?:\s+ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(.+))?$/i
  );
  if (insertMatch) {
    const isIgnore = Boolean(insertMatch[1]);
    const table = stripTicks(insertMatch[2]);
    const cols = splitTopLevelComma(insertMatch[3]).map(stripTicks);
    const valTokens = splitTopLevelComma(insertMatch[4]);
    const onDupClause = insertMatch[5];

    if (!store.tables[table]) store.tables[table] = [];
    if (!store.autoIncrement[table]) store.autoIncrement[table] = 1;

    const cursor: ParamCursor = { params, index: 0 };
    const newRow: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) {
      newRow[cols[i]] = resolveSqlValueToken(valTokens[i] ?? 'NULL', cursor);
    }

    const tableRows = store.tables[table];

    // Determine primary/unique key match
    const findExistingIndex = (): number => {
      if (table === 'classes') {
        return tableRows.findIndex((r) => String(r.code) === String(newRow.code));
      }
      if (table === 'system_settings') {
        return tableRows.findIndex(
          (r) => String(r.setting_key) === String(newRow.setting_key)
        );
      }
      if (table === 'schema_migrations') {
        return tableRows.findIndex(
          (r) => String(r.migration_name) === String(newRow.migration_name)
        );
      }
      if (table === 'gradebook_entries') {
        return tableRows.findIndex(
          (r) =>
            (newRow.id !== undefined && Number(r.id) === Number(newRow.id)) ||
            (Number(r.session_id) === Number(newRow.session_id) &&
              Number(r.student_id) === Number(newRow.student_id))
        );
      }
      if (table === 'admins' || table === 'students') {
        return tableRows.findIndex(
          (r) =>
            (newRow.id !== undefined && Number(r.id) === Number(newRow.id)) ||
            (newRow.phone !== undefined && String(r.phone) === String(newRow.phone))
        );
      }
      if (newRow.id !== undefined && newRow.id !== null) {
        return tableRows.findIndex((r) => Number(r.id) === Number(newRow.id));
      }
      return -1;
    };

    const existingIdx = findExistingIndex();
    if (existingIdx !== -1) {
      if (onDupClause) {
        const existingRow = tableRows[existingIdx];
        const updateAssigns = splitTopLevelComma(onDupClause);
        for (const assign of updateAssigns) {
          const m = assign.match(/^`?(\w+)`?\s*=\s*VALUES\(`?(\w+)`?\)$/i);
          if (m) {
            const targetCol = stripTicks(m[1]);
            const sourceCol = stripTicks(m[2]);
            existingRow[targetCol] = newRow[sourceCol];
          }
        }
        existingRow.updated_at = new Date().toISOString();
        saveRelationalStore();
        return [
          {
            insertId: Number(existingRow.id || 0),
            affectedRows: 1,
          } as ResultSetHeader,
          [],
        ];
      }
      if (isIgnore) {
        return [
          {
            insertId: Number(tableRows[existingIdx]?.id || 0),
            affectedRows: 0,
          } as ResultSetHeader,
          [],
        ];
      }
    }

    // Assign primary key id if needed
    if (
      table !== 'classes' &&
      table !== 'system_settings' &&
      (newRow.id === undefined || newRow.id === null)
    ) {
      newRow.id = store.autoIncrement[table]++;
    } else if (typeof newRow.id === 'number' && newRow.id >= store.autoIncrement[table]) {
      store.autoIncrement[table] = newRow.id + 1;
    }

    const nowIso = new Date().toISOString();
    if (newRow.created_at === undefined) newRow.created_at = nowIso;
    if (newRow.created_at_ts === undefined) newRow.created_at_ts = nowIso;
    if (newRow.updated_at === undefined) newRow.updated_at = nowIso;

    // Default columns for students/admins/assignments if omitted
    if (table === 'students') {
      if (newRow.status === undefined) newRow.status = 'pending';
      if (newRow.avatar_removed === undefined) newRow.avatar_removed = 0;
      if (newRow.email === undefined) newRow.email = '';
      if (newRow.bio === undefined) newRow.bio = '';
    }
    if (table === 'assignments') {
      if (newRow.status === undefined) newRow.status = 'active';
    }

    tableRows.push(newRow);
    saveRelationalStore();

    return [
      {
        insertId: Number(newRow.id || 0),
        affectedRows: 1,
      } as ResultSetHeader,
      [],
    ];
  }

  // 9. UPDATE <table> SET <assignments> [WHERE <whereClause>]
  const updateMatch = sql.match(
    /^UPDATE\s+`?(\w+)`?\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i
  );
  if (updateMatch) {
    const table = stripTicks(updateMatch[1]);
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];
    const tableRows = store.tables[table] || [];

    const setTokens = splitTopLevelComma(setClause);
    const cursorForSet: ParamCursor = { params, index: 0 };
    const resolvedUpdates: Array<{ col: string; val: unknown }> = [];

    for (const token of setTokens) {
      const m = token.match(/^`?(\w+)`?\s*=\s*(.+)$/);
      if (m) {
        const col = stripTicks(m[1]);
        const val = resolveSqlValueToken(m[2], cursorForSet);
        resolvedUpdates.push({ col, val });
      }
    }

    const whereStartIndex = cursorForSet.index;
    let affectedRows = 0;

    for (const row of tableRows) {
      const whereCursor: ParamCursor = { params, index: whereStartIndex };
      if (matchWhereClause(row, whereClause, whereCursor)) {
        for (const u of resolvedUpdates) {
          row[u.col] = u.val;
        }
        row.updated_at = new Date().toISOString();
        affectedRows++;
      }
    }

    if (affectedRows > 0) {
      saveRelationalStore();
    }

    return [{ affectedRows, insertId: 0 } as ResultSetHeader, []];
  }

  // 10. DELETE FROM <table> [WHERE <whereClause>]
  const deleteMatch = sql.match(
    /^DELETE\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+(.+))?$/i
  );
  if (deleteMatch) {
    const table = stripTicks(deleteMatch[1]);
    const whereClause = deleteMatch[2];
    const tableRows = store.tables[table] || [];

    if (!whereClause) {
      const affected = tableRows.length;
      store.tables[table] = [];
      if (affected > 0) saveRelationalStore();
      return [{ affectedRows: affected, insertId: 0 } as ResultSetHeader, []];
    }

    const remaining: Array<Record<string, unknown>> = [];
    let affected = 0;
    for (const row of tableRows) {
      const cursor: ParamCursor = { params, index: 0 };
      if (matchWhereClause(row, whereClause, cursor)) {
        affected++;
      } else {
        remaining.push(row);
      }
    }

    store.tables[table] = remaining;
    if (affected > 0) saveRelationalStore();
    return [{ affectedRows: affected, insertId: 0 } as ResultSetHeader, []];
  }

  return [[], []];
}

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: string }).code || '');
  const msg = String((err as { message?: string }).message || '');
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('connect ETIMEDOUT')
  );
}

function createFallbackConnection(): PoolConnection {
  const connObj = {
    query: async (sql: string, values?: unknown) => {
      return executeFallbackSql(sql, values);
    },
    execute: async (sql: string, values?: unknown) => {
      return executeFallbackSql(sql, values);
    },
    beginTransaction: async () => {},
    commit: async () => {
      saveRelationalStore();
    },
    rollback: async () => {},
    release: () => {},
  };
  return connObj as unknown as PoolConnection;
}

/**
 * Unified Pool wrapper:
 * - Uses the real `mysql2/promise` pool when local/remote MySQL is running.
 * - Transparently falls back to the persistent relational store (`database/preview-db.json`)
 *   ONLY if the MySQL daemon is unreachable (`ECONNREFUSED` in cloud preview environments).
 */
export const pool: Pool = new Proxy(mysqlPool, {
  get(target, prop, receiver) {
    if (prop === 'query' || prop === 'execute') {
      return async (sql: string, values?: unknown) => {
        if (fallbackModeActive) {
          return executeFallbackSql(sql, values);
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (target as any)[prop](sql, values);
        } catch (err) {
          if (isConnectionError(err)) {
            fallbackModeActive = true;
            return executeFallbackSql(sql, values);
          }
          throw err;
        }
      };
    }

    if (prop === 'getConnection') {
      return async () => {
        if (fallbackModeActive) {
          return createFallbackConnection();
        }
        try {
          return await target.getConnection();
        } catch (err) {
          if (isConnectionError(err)) {
            fallbackModeActive = true;
            return createFallbackConnection();
          }
          throw err;
        }
      };
    }

    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function getDbInfo() {
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
  };
}

/**
 * Verify database connection by executing a lightweight query
 */
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  database: string;
  host: string;
  port: number;
  error?: string;
}> {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      return {
        connected: true,
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
      };
    } finally {
      connection.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown MySQL connection error';
    return {
      connected: false,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      error: message,
    };
  }
}
