// Zëvendëson @neondatabase/serverless në teste me një Postgres të vërtetë në memorie (PGlite),
// që SQL-i i serverit (transaksione, CTE, jsonb) të provohet realisht, jo me imitime.
import { PGlite } from '@electric-sql/pglite';

let db;
const build = (strings, vals) => {
  let q = strings[0];
  for (let i = 0; i < vals.length; i++) q += '$' + (i + 1) + strings[i + 1];
  return { q, p: vals };
};

export function neon() {
  db = db || new PGlite();
  const sql = async (strings, ...vals) => {
    const { q, p } = typeof strings === 'string' ? { q: strings, p: vals[0] || [] } : build(strings, vals);
    return (await db.query(q, p)).rows;
  };
  sql.transaction = async (fn) => {
    const tx = (strings, ...vals) => (typeof strings === 'string' ? { q: strings, p: vals[0] || [] } : build(strings, vals));
    const list = fn(tx);
    const out = [];
    await db.query('BEGIN');
    try {
      for (const item of list) out.push((await db.query(item.q, item.p)).rows);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    return out;
  };
  return sql;
}
