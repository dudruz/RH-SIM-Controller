/**
 * RH Sim — js/materiais.js
 * Cadastro de Materiais + controle de estoque (CRUD + busca + alertas)
 *
 * Persiste em Store 'materials' — MESMO array consumido por app._checkAlerts()
 * e por deductStock(). Por isso o esquema de campos é mantido idêntico ao seed
 * do app.js: { id, nome, cat, un, estoque, minimo, custo }.
 *
 * Regra de alerta: estoque <= minimo  → crítico (vermelho)
 *                  estoque <= minimo*1.5 → atenção (amarelo)
 */

const Materiais = {
  _filtro: '',
  _editId: null,

  /* opções para os selects do formulário */
  CATEGORIAS: ['PVC','Overlay','Adesivo','Chip','Cordão','Outro'],
  UNIDADES:   ['Folhas','Unidades','Metros','Litros','Caixas'],

  load() { return Store.get('materials'); },

  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-box-seam-fill"></i> Materiais</h1>
        <p class="page-subtitle">Controle de estoque e insumos</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Materiais.load(),'materiais')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-primary btn-sm" onclick="Materiais.openForm()">
          <i class="bi bi-plus-lg me-1"></i>Novo Material
        </button>
      </div>
    </div>

    <!-- Cartões de estoque (visão rápida) -->
    <div class="row g-3 mb-4" id="matCards"></div>

    <!-- Busca -->
    <div class="filters-bar">
      <div class="search-bar flex-grow-1">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="matSearch"
               placeholder="Pesquisar por nome ou categoria..."
               oninput="Materiais.search(this.value)">
      </div>
    </div>

    <!-- Tabela detalhada -->
    <div class="card">
      <div class="card-header"><span class="card-title"><i class="bi bi-table me-2"></i>Todos os Materiais</span></div>
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Material</th><th>Categoria</th><th>Unidade</th>
                <th class="text-end">Estoque</th><th class="text-end">Mínimo</th>
                <th class="text-end">Custo Unit.</th><th>Situação</th>
                <th class="text-end">Ações</th>
              </tr>
            </thead>
            <tbody id="matBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    ${this._modal()}`;
  },

  init() {
    this._filtro = '';
    this._renderCards();
    this._renderRows();
  },

  /* classifica a situação do item segundo o estoque */
  _situacao(m) {
    if (m.estoque <= m.minimo)       return { cls:'stock-low',  badge:'badge-danger',  txt:'Crítico' };
    if (m.estoque <= m.minimo * 1.5) return { cls:'stock-warn', badge:'badge-warning', txt:'Atenção' };
    return { cls:'', badge:'badge-success', txt:'OK' };
  },

  /* ── Cartões: mostra apenas itens em alerta (crítico/atenção) ── */
  _renderCards() {
    const wrap = document.getElementById('matCards');
    if (!wrap) return;

    const alertas = this.load()
      .filter(m => m.estoque <= m.minimo * 1.5)
      .sort((a,b) => (a.estoque/a.minimo) - (b.estoque/b.minimo));

    if (!alertas.length) {
      wrap.innerHTML = `
        <div class="col-12">
          <div class="card"><div class="card-body d-flex align-items-center gap-2 text-success">
            <i class="bi bi-check-circle-fill"></i> Todos os materiais estão com estoque saudável.
          </div></div>
        </div>`;
      return;
    }

    wrap.innerHTML = alertas.map(m => {
      const s = this._situacao(m);
      return `
      <div class="col-md-4 col-6">
        <div class="stock-card ${s.cls}">
          <div class="stock-name">${m.nome}</div>
          <div class="stock-qty text-${s.badge==='badge-danger'?'danger':'warning'}">${fmtNum(m.estoque)}</div>
          <div class="stock-min">Mínimo: ${fmtNum(m.minimo)} ${m.un}</div>
        </div>
      </div>`;
    }).join('');
  },

  _renderRows() {
    const termo = this._filtro.toLowerCase();
    const rows  = this.load().filter(m =>
      !termo ||
      (m.nome||'').toLowerCase().includes(termo) ||
      (m.cat||'').toLowerCase().includes(termo)
    );

    const body = document.getElementById('matBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8">
        <div class="empty-state"><i class="bi bi-box-seam"></i>
        <p>Nenhum material encontrado</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(m => {
      const s = this._situacao(m);
      return `
      <tr>
        <td class="fw-semibold">${m.nome}</td>
        <td>${m.cat || '-'}</td>
        <td>${m.un || '-'}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(m.estoque)}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(m.minimo)}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">R$ ${fmtDec(m.custo)}</td>
        <td><span class="badge ${s.badge}">${s.txt}</span></td>
        <td class="text-end">
          <button class="btn-icon-act text-primary" title="Editar" onclick="Materiais.edit('${m.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Materiais.delete('${m.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  search(v) { this._filtro = v || ''; this._renderRows(); },

  _modal() {
    return `
    <div class="modal fade" id="matModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="matModalTitle">Novo Material</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" id="matNome">
              </div>
              <div class="col-md-6">
                <label class="form-label">Categoria</label>
                <select class="form-select" id="matCat">${buildOptions(this.CATEGORIAS)}</select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Unidade</label>
                <select class="form-select" id="matUn">${buildOptions(this.UNIDADES)}</select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Estoque Atual</label>
                <input type="number" min="0" step="any" class="form-control" id="matEstoque">
              </div>
              <div class="col-md-4">
                <label class="form-label">Estoque Mínimo</label>
                <input type="number" min="0" step="any" class="form-control" id="matMinimo">
              </div>
              <div class="col-md-4">
                <label class="form-label">Custo Unitário (R$)</label>
                <input type="number" min="0" step="any" class="form-control" id="matCusto">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-primary" onclick="Materiais.save()">
              <i class="bi bi-check-lg me-1"></i>Salvar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  openForm() {
    this._editId = null;
    document.getElementById('matModalTitle').textContent = 'Novo Material';
    document.getElementById('matNome').value    = '';
    document.getElementById('matCat').value     = this.CATEGORIAS[0];
    document.getElementById('matUn').value      = this.UNIDADES[0];
    document.getElementById('matEstoque').value = '';
    document.getElementById('matMinimo').value  = '';
    document.getElementById('matCusto').value   = '';
    new bootstrap.Modal(document.getElementById('matModal')).show();
  },

  edit(id) {
    const m = this.load().find(x => x.id === id);
    if (!m) return;
    this._editId = id;
    document.getElementById('matModalTitle').textContent = 'Editar Material';
    document.getElementById('matNome').value    = m.nome    || '';
    document.getElementById('matCat').value      = m.cat     || this.CATEGORIAS[0];
    document.getElementById('matUn').value       = m.un      || this.UNIDADES[0];
    document.getElementById('matEstoque').value  = m.estoque ?? 0;
    document.getElementById('matMinimo').value   = m.minimo  ?? 0;
    document.getElementById('matCusto').value    = m.custo   ?? 0;
    new bootstrap.Modal(document.getElementById('matModal')).show();
  },

  async save() {
    const nome = document.getElementById('matNome').value.trim();
    if (!nome) return toast('Informe o nome do material', 'warning');

    const reg = {
      nome,
      cat:     document.getElementById('matCat').value,
      un:      document.getElementById('matUn').value,
      estoque: parseFloat(document.getElementById('matEstoque').value) || 0,
      minimo:  parseFloat(document.getElementById('matMinimo').value)  || 0,
      custo:   parseFloat(document.getElementById('matCusto').value)   || 0
    };

    try {
      if (this._editId) { reg.id = this._editId; await Store.update('materials', reg); }
      else              { await Store.insert('materials', reg); }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('matModal')).hide();
    toast(this._editId ? 'Material atualizado!' : 'Material cadastrado!');
    this._editId = null;
    App._checkAlerts();
    this._renderCards();
    this._renderRows();
  },

  delete(id) {
    confirm('Deseja excluir este material?', async () => {
      try { await Store.remove('materials', id); }
      catch { return toast('Erro ao excluir', 'danger'); }
      toast('Material excluído', 'warning');
      App._checkAlerts();
      this._renderCards();
      this._renderRows();
    });
  }
};
