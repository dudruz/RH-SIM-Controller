/**
 * RH Sim — store.js  (Supabase + cache em memória)
 * ------------------------------------------------------------------
 * Substitui o Store baseado em LocalStorage que vivia no app.js.
 *
 * COMO FUNCIONA
 *  - Ao iniciar, Store.sync() baixa as 5 tabelas do Supabase para um
 *    espelho em memória (Store._cache).
 *  - LEITURA: Store.get('companies') lê do espelho — SÍNCRONO, igual antes.
 *    Por isso render(), deductStock(), _checkAlerts() etc. não mudam.
 *  - ESCRITA: insert/update/remove falam com o Supabase E atualizam o
 *    espelho. Esses são os únicos pontos que viram async (save/delete).
 *
 * REQUISITOS NO index.html (antes do app.js):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="store.js"></script>
 *
 * Mapeamento de nomes de campo front<->banco: só productions difere
 * (folhasPVC -> folhas_pvc). O resto das colunas tem o mesmo nome.
 * ------------------------------------------------------------------ */

const SUPABASE_URL = 'https://oxipmmaexysfccflvdpp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b7cJpK8WyyIHlMvlQfGsZg_KzdYipc5'; // a que você rotacionou

/* cliente do SDK (variável global `supabase` vem do <script> do CDN) */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* tabelas gerenciadas */
const TABLES = ['companies', 'operators', 'projects', 'materials', 'productions', 'project_arts', 'credit_movements', 'production_runs', 'profiles'];

/* tradução de campos: front (camelCase) <-> banco (snake_case) */
const FIELD_MAP = {
  productions: { folhasPVC: 'folhas_pvc' }
};

const Store = {
  _cache: {},          // espelho em memória: { companies:[...], materials:[...], ... }
  ready: false,        // vira true após o primeiro sync

  /* ---------- BOOT: baixa tudo uma vez ---------- */
  async sync() {
    for (const t of TABLES) {
      const { data, error } = await sb.from(t).select('*').order('created_at', { ascending: true });
      if (error) { console.error(`[Store.sync] ${t}:`, error.message); this._cache[t] = []; }
      else       { this._cache[t] = data.map(r => fromDB(t, r)); }
    }
    this.ready = true;
  },

  /* ---------- LEITURA (síncrona, do cache) ---------- */
  get(table) {
    return this._cache[table] ? [...this._cache[table]] : [];
  },

  /* ---------- ESCRITA (async, banco + cache) ---------- */
  async insert(table, row) {
    const { data, error } = await sb.from(table).insert(toDB(table, row)).select().single();
    if (error) { console.error(`[Store.insert] ${table}:`, error.message); throw error; }
    const saved = fromDB(table, data);
    (this._cache[table] = this._cache[table] || []).push(saved);
    return saved;
  },

  async update(table, row) {
    const { error } = await sb.from(table).update(toDB(table, row)).eq('id', row.id);
    if (error) { console.error(`[Store.update] ${table}:`, error.message); throw error; }
    const arr = this._cache[table] || [];
    const i = arr.findIndex(x => x.id === row.id);
    if (i !== -1) arr[i] = { ...arr[i], ...row };
  },

  async remove(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { console.error(`[Store.remove] ${table}:`, error.message); throw error; }
    this._cache[table] = (this._cache[table] || []).filter(x => x.id !== id);
  },

  /* atualiza vários campos de um registro já no cache, sem ir ao banco
     (usado por deductStock, que persiste em lote com saveBatch) */
  _patchLocal(table, id, patch) {
    const arr = this._cache[table] || [];
    const i = arr.findIndex(x => x.id === id);
    if (i !== -1) arr[i] = { ...arr[i], ...patch };
  },

  /* persiste no banco uma lista de registros já alterados no cache */
  async saveBatch(table, rows) {
    for (const row of rows) {
      const { error } = await sb.from(table).update(toDB(table, row)).eq('id', row.id);
      if (error) console.error(`[Store.saveBatch] ${table}:`, error.message);
    }
  },

  /* usado pelo Backup (exporta tudo do cache) */
  all() {
    const out = {};
    for (const t of TABLES) out[t] = this.get(t);
    return out;
  }
};

/* ---------- helpers de tradução de campos ---------- */
function toDB(table, row) {
  const map = FIELD_MAP[table] || {};
  const out = {};
  for (const k in row) {
    if (k === 'created_at') continue;     // o banco controla
    out[map[k] || k] = row[k];
  }
  return out;
}
function fromDB(table, row) {
  const map = FIELD_MAP[table] || {};
  const inv = Object.fromEntries(Object.entries(map).map(([f, d]) => [d, f]));
  const out = {};
  for (const k in row) out[inv[k] || k] = row[k];
  return out;
}
