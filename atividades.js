/**
 * RH Sim — atividades.js
 * Log de atividades (visível apenas para admin via sidebar/guard).
 * Lê Store 'activity_log'; eventos são gravados por logAtividade().
 */

const Atividades = {
  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-clock-history"></i> Atividades</h1>
        <p class="page-subtitle">Quem fez o quê, e quando</p>
      </div>
    </div>

    <div class="filters-bar">
      <div class="search-bar flex-grow-1" style="min-width:200px">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="atvSearch"
               placeholder="Pesquisar por pessoa, ação ou detalhe..."
               oninput="Atividades._renderRows()">
      </div>
      <input type="date" class="form-control form-control-sm" id="atvData"
             style="max-width:170px" onchange="Atividades._renderRows()">
      <button class="btn btn-outline-secondary btn-sm" onclick="Atividades.limpar()">
        <i class="bi bi-x-circle me-1"></i>Limpar
      </button>
    </div>

    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table table-sm">
            <thead>
              <tr><th style="width:160px">Quando</th><th style="width:140px">Quem</th>
                  <th style="width:170px">Ação</th><th>Detalhe</th></tr>
            </thead>
            <tbody id="atvBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;
  },

  init() { this._renderRows(); },

  limpar() {
    const s = document.getElementById('atvSearch'); if (s) s.value = '';
    const d = document.getElementById('atvData');   if (d) d.value = '';
    this._renderRows();
  },

  _renderRows() {
    const termo = (document.getElementById('atvSearch')?.value || '').toLowerCase();
    const dia   = document.getElementById('atvData')?.value || '';

    const rows = (Store.get('activity_log') || [])
      .filter(a => {
        const okTexto = !termo ||
          (a.usuario||'').toLowerCase().includes(termo) ||
          (a.acao||'').toLowerCase().includes(termo) ||
          (a.detalhe||'').toLowerCase().includes(termo);
        const okDia = !dia || (a.created_at||'').startsWith(dia);
        return okTexto && okDia;
      })
      .sort((x,y) => (y.created_at||'').localeCompare(x.created_at||''))
      .slice(0, 300);   // mostra os 300 mais recentes

    const body = document.getElementById('atvBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4">
        <div class="empty-state"><i class="bi bi-clock-history"></i>
        <p>Nenhuma atividade registrada</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(a => `
      <tr>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${this._fmtQuando(a.created_at)}</td>
        <td class="fw-semibold">${a.usuario || '—'}</td>
        <td><span class="badge badge-secondary">${a.acao || '—'}</span></td>
        <td class="text-secondary" style="font-size:13px">${a.detalhe || '—'}</td>
      </tr>`).join('');
  },

  _fmtQuando(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d)) return ts.slice(0, 16).replace('T', ' ');
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
};
