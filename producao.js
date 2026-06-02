/**
 * RH Sim — js/producao.js
 * Registro de Produções (CRUD + busca + filtros)
 *
 * Persiste em Store 'productions'. O modelo de dados é EXATAMENTE o que o
 * dashboard.js já lê: { data, empresa, projeto, categoria, quantidade, pvc,
 * frequencia, overlay, operador, obs, folhasPVC, chips }.
 *
 * Cálculos derivados (gravados junto com o registro):
 *   folhasPVC      → via calcFolhasPVC(categoria, qtd)   [app.js]
 *   chips          → via calcChips(frequencia, qtd)      [app.js]
 *   overlay        → boolean (Sim/Não)
 *
 * Ao criar uma NOVA produção, o estoque é deduzido automaticamente via
 * deductStock(prod) [app.js]. Em edições o estoque NÃO é reprocessado
 * (evita dupla baixa); ajustes de estoque ficam a cargo do módulo Materiais.
 */

const Producao = {
  _editId: null,

  load() { return Store.get('productions'); },

  render() {
    const empresas  = Store.get('companies') || [];
    const operadores= (Store.get('operators') || []).filter(o => o.status !== 'Inativo');

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-printer-fill"></i> Produções</h1>
        <p class="page-subtitle">Registro diário de produção</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Producao.load(),'producoes')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-primary btn-sm" onclick="Producao.openForm()">
          <i class="bi bi-plus-lg me-1"></i>Nova Produção
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filters-bar">
      <div class="search-bar flex-grow-1" style="min-width:200px">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="prodSearch"
               placeholder="Pesquisar empresa, projeto ou operador..."
               oninput="Producao.search()">
      </div>
      <select class="form-select form-select-sm" id="prodCatFilter" style="max-width:180px" onchange="Producao.search()">
        <option value="">Todas categorias</option>
        ${buildOptions(CATEGORIAS)}
      </select>
      <input type="month" class="form-control form-control-sm" id="prodMonthFilter"
             style="max-width:160px" onchange="Producao.search()">
    </div>

    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th><th>Empresa</th><th>Projeto</th><th>Categoria</th>
                <th class="text-end">Qtd</th><th>PVC</th><th>Freq.</th>
                <th class="text-end">Folhas</th><th class="text-end">Chips</th>
                <th>Overlay</th><th>Operador</th><th class="text-end">Ações</th>
              </tr>
            </thead>
            <tbody id="prodBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    ${this._modal(empresas, operadores)}`;
  },

  init() {
    this._renderRows();
  },

  _renderRows() {
    const termo = (document.getElementById('prodSearch')?.value || '').toLowerCase();
    const cat   = document.getElementById('prodCatFilter')?.value || '';
    const mes   = document.getElementById('prodMonthFilter')?.value || '';

    const rows = this.load()
      .filter(p => {
        const okTexto = !termo ||
          (p.empresa||'').toLowerCase().includes(termo) ||
          (p.projeto||'').toLowerCase().includes(termo) ||
          (p.operador||'').toLowerCase().includes(termo);
        const okCat   = !cat || p.categoria === cat;
        const okMes   = !mes || (p.data||'').startsWith(mes);
        return okTexto && okCat && okMes;
      })
      .sort((a,b) => (b.data||'').localeCompare(a.data||'')); // mais recentes primeiro

    const body = document.getElementById('prodBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="12">
        <div class="empty-state"><i class="bi bi-printer"></i>
        <p>Nenhuma produção registrada</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(p => `
      <tr>
        <td>${fmtDate(p.data)}</td>
        <td class="fw-semibold">${p.empresa || '-'}</td>
        <td>${p.projeto || '-'}</td>
        <td><span class="badge badge-secondary">${p.categoria}</span></td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(p.quantidade)}</td>
        <td>${p.pvc || '-'}</td>
        <td>${p.frequencia || '-'}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtDec(p.folhasPVC)}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(p.chips)}</td>
        <td>${p.overlay ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-secondary">Não</span>'}</td>
        <td>${p.operador || '-'}</td>
        <td class="text-end">
          <button class="btn-icon-act text-primary" title="Editar" onclick="Producao.edit('${p.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Producao.delete('${p.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`).join('');
  },

  search() { this._renderRows(); },

  /* ── Modal de formulário ──────────────────────────────────── */
  _modal(empresas, operadores) {
    return `
    <div class="modal fade" id="prodModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="prodModalTitle">Nova Produção</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label">Data *</label>
                <input type="date" class="form-control" id="prodData">
              </div>
              <div class="col-md-4">
                <label class="form-label">Empresa</label>
                <select class="form-select" id="prodEmpresa" onchange="Producao._fillProjetos()">
                  <option value="">Selecione...</option>
                  ${buildOptions(empresas, 'nome', 'nome')}
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Projeto</label>
                <select class="form-select" id="prodProjeto">
                  <option value="">Selecione...</option>
                </select>
              </div>

              <div class="col-md-4">
                <label class="form-label">Categoria *</label>
                <select class="form-select" id="prodCategoria" onchange="Producao._preview()">
                  ${buildOptions(CATEGORIAS)}
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Quantidade *</label>
                <input type="number" min="0" class="form-control" id="prodQtd"
                       oninput="Producao._preview()">
              </div>
              <div class="col-md-4">
                <label class="form-label">Operador</label>
                <select class="form-select" id="prodOperador">
                  <option value="">Selecione...</option>
                  ${buildOptions(operadores, 'nome', 'nome')}
                </select>
              </div>

              <div class="col-md-4">
                <label class="form-label">PVC</label>
                <select class="form-select" id="prodPvc">
                  <option value="">N/A</option>
                  ${buildOptions(PVC_TYPES)}
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Frequência</label>
                <select class="form-select" id="prodFreq" onchange="Producao._preview()">
                  ${buildOptions(FREQUENCIAS)}
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Overlay</label>
                <select class="form-select" id="prodOverlay">
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </div>

              <div class="col-12">
                <label class="form-label">Observações</label>
                <textarea class="form-control" id="prodObs" rows="2"></textarea>
              </div>

              <!-- Preview de cálculo (reaproveita .calc-preview do style.css) -->
              <div class="col-12">
                <div class="calc-preview">
                  <div class="calc-preview-title">Consumo Calculado</div>
                  <div class="calc-grid">
                    <div class="calc-item">
                      <span class="calc-label">Folhas PVC</span>
                      <span class="calc-value" id="calcFolhas">0,0</span>
                    </div>
                    <div class="calc-item">
                      <span class="calc-label">Chips</span>
                      <span class="calc-value" id="calcChips">0</span>
                    </div>
                    <div class="calc-item">
                      <span class="calc-label">Overlay (folhas)</span>
                      <span class="calc-value" id="calcOverlay">0,0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-primary" onclick="Producao.save()">
              <i class="bi bi-check-lg me-1"></i>Salvar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  /* preenche o select de projetos conforme a empresa escolhida */
  _fillProjetos(selected = '') {
    const emp = document.getElementById('prodEmpresa').value;
    const sel = document.getElementById('prodProjeto');
    const projs = (Store.get('projects') || []).filter(p => !emp || p.empresa === emp);
    sel.innerHTML = '<option value="">Selecione...</option>' +
      buildOptions(projs, 'nome', 'nome', selected);
  },

  /* atualiza o preview de consumo em tempo real */
  _preview() {
    const cat  = document.getElementById('prodCategoria').value;
    const qtd  = parseFloat(document.getElementById('prodQtd').value) || 0;
    const freq = document.getElementById('prodFreq').value;

    const folhas = calcFolhasPVC(cat, qtd);
    const chips  = calcChips(freq, qtd);

    document.getElementById('calcFolhas').textContent  = fmtDec(folhas);
    document.getElementById('calcChips').textContent   = fmtNum(chips);
    // overlay consome a mesma quantidade de folhas, somente se marcado "Sim"
    const overlayOn = document.getElementById('prodOverlay').value === 'sim';
    document.getElementById('calcOverlay').textContent = fmtDec(overlayOn ? folhas : 0);
  },

  openForm() {
    this._editId = null;
    document.getElementById('prodModalTitle').textContent = 'Nova Produção';
    document.getElementById('prodData').value      = today();
    document.getElementById('prodEmpresa').value   = '';
    document.getElementById('prodCategoria').value = CATEGORIAS[0];
    document.getElementById('prodQtd').value        = '';
    document.getElementById('prodOperador').value   = '';
    document.getElementById('prodPvc').value        = '';
    document.getElementById('prodFreq').value       = FREQUENCIAS[0];
    document.getElementById('prodOverlay').value    = 'nao';
    document.getElementById('prodObs').value        = '';
    this._fillProjetos();
    this._preview();
    new bootstrap.Modal(document.getElementById('prodModal')).show();
  },

  edit(id) {
    const p = this.load().find(x => x.id === id);
    if (!p) return;
    this._editId = id;
    document.getElementById('prodModalTitle').textContent = 'Editar Produção';
    document.getElementById('prodData').value      = p.data      || today();
    document.getElementById('prodEmpresa').value   = p.empresa   || '';
    this._fillProjetos(p.projeto || '');
    document.getElementById('prodCategoria').value = p.categoria || CATEGORIAS[0];
    document.getElementById('prodQtd').value        = p.quantidade ?? '';
    document.getElementById('prodOperador').value   = p.operador  || '';
    document.getElementById('prodPvc').value        = p.pvc       || '';
    document.getElementById('prodFreq').value       = p.frequencia|| FREQUENCIAS[0];
    document.getElementById('prodOverlay').value    = p.overlay ? 'sim' : 'nao';
    document.getElementById('prodObs').value        = p.obs       || '';
    this._preview();
    new bootstrap.Modal(document.getElementById('prodModal')).show();
  },

  async save() {
    const data = document.getElementById('prodData').value;
    const qtd  = parseFloat(document.getElementById('prodQtd').value) || 0;
    const cat  = document.getElementById('prodCategoria').value;

    if (!data)    return toast('Informe a data', 'warning');
    if (qtd <= 0) return toast('Informe uma quantidade válida', 'warning');

    const freq      = document.getElementById('prodFreq').value;
    const overlayOn = document.getElementById('prodOverlay').value === 'sim';
    const folhasPVC = calcFolhasPVC(cat, qtd);

    const reg = {
      data,
      empresa:    document.getElementById('prodEmpresa').value,
      projeto:    document.getElementById('prodProjeto').value,
      categoria:  cat,
      quantidade: qtd,
      pvc:        document.getElementById('prodPvc').value,
      frequencia: freq,
      overlay:    overlayOn,
      operador:   document.getElementById('prodOperador').value,
      obs:        document.getElementById('prodObs').value.trim(),
      /* campos derivados (folhasPVC vira folhas_pvc no banco via FIELD_MAP) */
      folhasPVC,
      chips:      calcChips(freq, qtd)
    };

    try {
      if (this._editId) {
        reg.id = this._editId;
        await Store.update('productions', reg);
        // Em edição NÃO reprocessamos estoque (evita dupla baixa).
      } else {
        await Store.insert('productions', reg);
        await deductStock(reg);   // baixa de estoque só em novo lançamento
      }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('prodModal')).hide();
    toast(this._editId ? 'Produção atualizada!' : 'Produção registrada!');
    this._editId = null;
    this._renderRows();
    App._checkAlerts();
  },

  delete(id) {
    confirm('Deseja excluir este registro de produção?', async () => {
      try { await Store.remove('productions', id); }
      catch { return toast('Erro ao excluir', 'danger'); }
      toast('Produção excluída', 'warning');
      this._renderRows();
    });
  }
};
