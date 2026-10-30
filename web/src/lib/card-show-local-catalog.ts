import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { indexCard } from '@/lib/model-index';
import { chooseLocalPrinting } from '@/lib/card-show-printing';
import type { NormalizedCard } from '@/lib/types';

type CatalogRow = {
  id: string; tcg: NormalizedCard['tcg']; name: string; set_name: string | null; set_code: string | null;
  card_number: string | null; language: string; image_url: string | null; prices_json: string | null; source_id: string;
};
interface LocalDatabase {
  prepare(sql: string): { get(...params: string[]): unknown; all(...params: string[]): unknown[] };
  close(): void;
}
// Explicit public card columns only. Never read accounts, portfolios or private costs.
const COLUMNS = 'id, tcg, name, set_name, set_code, card_number, language, image_url, prices_json, source_id';

function fromRow(row: CatalogRow): NormalizedCard {
  return { id: row.id, tcg: row.tcg, name: row.name, setName: row.set_name, setCode: row.set_code, cardNumber: row.card_number,
    language: row.language, imageUrl: row.image_url, sourceId: row.source_id, prices: row.prices_json ? JSON.parse(row.prices_json) ?? {} : {} };
}

/** Local development can read the existing catalog snapshot while Postgres is offline. */
export async function localShowCard(id: string): Promise<NormalizedCard | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  const filename = path.join(process.cwd(), 'data', 'collectr.db');
  if (!existsSync(filename)) return null;
  let database: LocalDatabase | undefined;
  try {
    // Node 22+ optional built-in; older/deployed runtimes do not need this fallback.
    const nativeModule = 'node:sqlite';
    const { DatabaseSync } = createRequire(path.join(process.cwd(), 'package.json'))(nativeModule) as { DatabaseSync: new (file: string, options: { readOnly: boolean }) => LocalDatabase };
    database = new DatabaseSync(filename, { readOnly: true });
    const direct = database.prepare(`SELECT ${COLUMNS} FROM cards WHERE id = ?`).get(id) as CatalogRow | undefined;
    if (direct) return fromRow(direct);
    const scan = indexCard(id);
    if (!scan) return null;
    const language = scan.lang === 'en' ? 'eng' : scan.lang === 'ja' ? 'jap' : scan.lang ?? '';
    const rows = database.prepare(`SELECT ${COLUMNS} FROM cards WHERE tcg = ? AND language = ? AND (lower(set_code) = lower(?) OR lower(set_name) = lower(?)) AND id LIKE 'tp:%'`).all(scan.tcg ?? '', language, scan.set ?? '', scan.setName ?? '') as CatalogRow[];
    return chooseLocalPrinting(rows.map(fromRow), scan);
  } catch { return null; }
  finally { database?.close(); }
}
