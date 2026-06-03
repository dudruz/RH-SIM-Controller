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
                <select class="form-select" id="prodProjeto" onchange="Producao._fillArtes()">
                  <option value="">Selecione...</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Arte <span class="text-secondary" style="font-weight:400">(opcional)</span></label>
                <select class="form-select" id="prodArte">
                  <option value="">— nenhuma —</option>
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
    this._fillArtes();
  },

  /* preenche o select de ARTES conforme o projeto escolhido.
     As artes pertencem ao projeto; só aparecem quando há projeto. */
  _fillArtes(selectedArtId = '') {
    const sel = document.getElementById('prodArte');
    if (!sel) return;
    const projNome = document.getElementById('prodProjeto').value;
    const empNome  = document.getElementById('prodEmpresa').value;

    // acha o projeto (por nome + empresa) para obter o id
    const proj = (Store.get('projects') || []).find(p =>
      p.nome === projNome && (!empNome || p.empresa === empNome));

    if (!proj) { sel.innerHTML = '<option value="">— nenhuma —</option>'; return; }

    const arts = Store.get('project_arts').filter(a => a.project_id === proj.id);
    sel.innerHTML = '<option value="">— nenhuma —</option>' +
      arts.map(a => {
        const falta = Math.max(0, (a.meta||0) - (a.feito||0));
        const sel2 = a.id === selectedArtId ? 'selected' : '';
        return `<option value="${a.id}" ${sel2}>${a.nome} (${a.feito||0}/${a.meta||0}${falta?`, faltam ${falta}`:', ✓'})</option>`;
      }).join('');
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
    this._fillArtes(p.art_id || '');
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
      art_id:     document.getElementById('prodArte').value || null,
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

    // Em EDIÇÃO: efetiva direto (não reprocessa estoque nem crédito).
    if (this._editId) {
      reg.id = this._editId;
      try { await Store.update('productions', reg); }
      catch { return toast('Erro ao salvar no banco de dados', 'danger'); }
      bootstrap.Modal.getInstance(document.getElementById('prodModal')).hide();
      toast('Produção atualizada!');
      this._editId = null;
      this._renderRows();
      App._checkAlerts();
      return;
    }

    // NOVO lançamento: monta resumo de consumo e pede confirmação.
    this._confirmar(reg);
  },

  /* monta o resumo (estoque + crédito) e abre a confirmação */
  _confirmar(reg) {
    // consumo de estoque
    const consumo = [];
    if (reg.pvc && reg.folhasPVC > 0)      consumo.push([reg.pvc, reg.folhasPVC, 'folhas']);
    if (reg.overlay && reg.folhasPVC > 0)  consumo.push(['Overlay', reg.folhasPVC, 'folhas']);
    if (reg.frequencia === 'Mifare')       consumo.push(['Chip Mifare', reg.chips, 'un']);
    if (reg.frequencia === '125Khz')       consumo.push(['Chip 125Khz', reg.chips, 'un']);
    const folhasChip = calcFolhasChip(reg.frequencia, reg.quantidade);
    if (folhasChip > 0)                    consumo.push(['Folha de Chip', folhasChip, 'folhas']);
    const cordoes = ['Cordão 12mm','Cordão 15mm','Cordão 20mm','Cordão 25mm'];
    if (cordoes.includes(reg.categoria))   consumo.push([reg.categoria, reg.quantidade, 'un']);

    // crédito da empresa — SOMENTE se a empresa estiver marcada como "usa crédito"
    let credInfo = '';
    const empObj = (Store.get('companies') || []).find(c => c.nome === reg.empresa);
    const usaCredito = empObj && empObj.usa_credito;
    if (reg.empresa && usaCredito && typeof Creditos !== 'undefined') {
      const saldoAtual = Creditos.saldo(reg.empresa);
      const aposSaldo  = saldoAtual - reg.quantidade;
      const negativo   = aposSaldo < 0;
      credInfo = `
        <div class="mt-3 pt-2 border-top">
          <div class="fw-semibold mb-1">Crédito — ${reg.empresa}</div>
          <div class="d-flex justify-content-between">
            <span class="text-secondary">Saldo atual</span>
            <span style="font-family:'DM Mono',monospace">${fmtNum(saldoAtual)}</span>
          </div>
          <div class="d-flex justify-content-between">
            <span class="text-secondary">Esta produção</span>
            <span style="font-family:'DM Mono',monospace" class="text-danger">- ${fmtNum(reg.quantidade)}</span>
          </div>
          <div class="d-flex justify-content-between">
            <span class="fw-semibold">Saldo após</span>
            <span style="font-family:'DM Mono',monospace" class="fw-semibold ${negativo?'text-danger':'text-success'}">${fmtNum(aposSaldo)}</span>
          </div>
          ${negativo ? '<div class="text-danger mt-1" style="font-size:13px"><i class="bi bi-exclamation-triangle me-1"></i>Saldo ficará negativo — a produção será registrada mesmo assim.</div>' : ''}
        </div>`;
    }

    const linhasEstoque = consumo.length
      ? consumo.map(([nome,q,un]) => `
          <div class="d-flex justify-content-between">
            <span class="text-secondary">${nome}</span>
            <span style="font-family:'DM Mono',monospace">${fmtNum(q)} ${un}</span>
          </div>`).join('')
      : '<div class="text-secondary" style="font-size:13px">Nenhum material de estoque consumido.</div>';

    // injeta um modal de confirmação dedicado (uma vez)
    let m = document.getElementById('prodConfirmModal');
    if (!m) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="prodConfirmModal" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Confirmar Produção</h5>
                <button class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="prodConfirmBody"></div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button class="btn btn-primary" id="prodConfirmBtn">
                  <i class="bi bi-check-lg me-1"></i>Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>`);
      m = document.getElementById('prodConfirmModal');
    }

    document.getElementById('prodConfirmBody').innerHTML = `
      <div class="mb-2">
        <strong>${fmtNum(reg.quantidade)}</strong> × ${reg.categoria}
        ${reg.empresa ? ' · '+reg.empresa : ''}${reg.projeto ? ' · '+reg.projeto : ''}
      </div>
      <div class="fw-semibold mb-1">Consumo de estoque</div>
      ${linhasEstoque}
      ${credInfo}`;

    const confirmModal = new bootstrap.Modal(m);
    // (re)liga o botão confirmar a este reg específico
    const btn = document.getElementById('prodConfirmBtn');
    btn.onclick = () => { confirmModal.hide(); this._efetivar(reg); };
    confirmModal.show();
  },

  /* grava a produção, baixa estoque, registra saída de crédito e abate na arte */
  async _efetivar(reg) {
    try {
      const saved = await Store.insert('productions', reg);
      await deductStock(reg);
      // saída de crédito — SOMENTE se a empresa usa crédito
      const empObj = (Store.get('companies') || []).find(c => c.nome === reg.empresa);
      if (reg.empresa && empObj && empObj.usa_credito && typeof Creditos !== 'undefined') {
        await Creditos.registrarSaida(reg.empresa, reg.quantidade,
          `Produção ${reg.categoria}${reg.projeto ? ' — '+reg.projeto : ''}`);
      }
      // abate na arte escolhida (se houver): soma ao 'feito'
      if (reg.art_id) {
        const arte = Store.get('project_arts').find(a => a.id === reg.art_id);
        if (arte) {
          await Store.update('project_arts', {
            id: arte.id, feito: (arte.feito || 0) + reg.quantidade
          });
        }
      }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('prodModal'))?.hide();
    toast('Produção registrada!');
    this._editId = null;
    this._renderRows();
    App._checkAlerts();
  },

  delete(id) {
    confirm('Deseja excluir este registro de produção?', async () => {
      // antes de remover, recupera a produção para saber se abateu arte
      const prod = this.load().find(x => x.id === id);
      try {
        await Store.remove('productions', id);
        // se abateu uma arte, desconta de volta (sem deixar negativo)
        if (prod && prod.art_id) {
          const arte = Store.get('project_arts').find(a => a.id === prod.art_id);
          if (arte) {
            await Store.update('project_arts', {
              id: arte.id, feito: Math.max(0, (arte.feito || 0) - (prod.quantidade || 0))
            });
          }
        }
      } catch { return toast('Erro ao excluir', 'danger'); }
      toast('Produção excluída', 'warning');
      this._renderRows();
    });
  }
};
