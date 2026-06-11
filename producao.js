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
        ${App.roleView === 'producao' ? '' : `
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Producao.load(),'producoes')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-success btn-sm" onclick="Producao.openRodada()">
          <i class="bi bi-grid-3x3-gap me-1"></i>Nova Rodada (Multilayout)
        </button>
        <button class="btn btn-primary btn-sm" onclick="Producao.openForm()">
          <i class="bi bi-plus-lg me-1"></i>Lançamento Avulso
        </button>`}
      </div>
    </div>

    <!-- Carteirinhas de estudante prontas (zap para o cliente) -->
    <div id="zapCarteirinhas"></div>

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
                <th class="text-end">Qtd</th><th>PVC</th><th>Freq.</th><th>Furo</th>
                <th class="text-end">Folhas</th><th class="text-end">Chips</th>
                <th>Operador</th><th>Etapa</th><th class="text-end">Ações</th>
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

    const isProd = App.roleView === 'producao';
    body.innerHTML = rows.map(p => `
      <tr>
        <td>${fmtDate(p.data)}</td>
        <td class="fw-semibold">${p.empresa || '-'}</td>
        <td>${p.projeto || '-'}</td>
        <td><span class="badge badge-secondary">${p.categoria}</span></td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(p.quantidade)}</td>
        <td>${p.pvc || '-'}</td>
        <td>${p.frequencia || '-'}</td>
        <td>${p.furo || '-'}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(Math.ceil(p.folhasPVC||0))}</td>
        <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(p.chips)}</td>
        <td>${p.operador || '-'}</td>
        <td>${this._etapaCell(p)}</td>
        <td class="text-end">
          ${isProd ? '' : `
          <button class="btn-icon-act text-primary" title="Editar" onclick="Producao.edit('${p.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Producao.delete('${p.id}')">
            <i class="bi bi-trash3"></i></button>`}
        </td>
      </tr>`).join('');

    this._renderZap();
  },

  /* ── Etapas do fluxo físico ───────────────────────────────── */
  ETAPAS: ['Pendente','Laminado','Cortado','Pronto'],

  _etapaCell(p) {
    const et = p.etapa || 'Pendente';
    const cores = { 'Pendente':'badge-secondary', 'Laminado':'badge-info',
                    'Cortado':'badge-warning', 'Pronto':'badge-success' };
    const i = this.ETAPAS.indexOf(et);
    const proxima = i >= 0 && i < this.ETAPAS.length - 1 ? this.ETAPAS[i+1] : null;
    return `
      <span class="badge ${cores[et] || 'badge-secondary'}">${et}</span>
      ${proxima ? `<button class="btn btn-sm btn-outline-success py-0 px-1 ms-1"
        title="Marcar como ${proxima}" onclick="Producao.avancarEtapa('${p.id}')">
        <i class="bi bi-arrow-right"></i> ${proxima}</button>` : ''}`;
  },

  async avancarEtapa(id) {
    const p = this.load().find(x => x.id === id);
    if (!p) return;
    const i = this.ETAPAS.indexOf(p.etapa || 'Pendente');
    if (i < 0 || i >= this.ETAPAS.length - 1) return;
    const nova = this.ETAPAS[i+1];
    try { await Store.update('productions', { id, etapa: nova }); }
    catch { return toast('Erro ao atualizar etapa', 'danger'); }
    toast(`Marcado como ${nova}`);
    this._renderRows();
  },

  /* ── Carteirinhas de estudante: zap para o cliente ────────── */
  CARTEIRINHAS: ['UEN','UJB','UE','UDBRA','UEB'],

  _renderZap() {
    const wrap = document.getElementById('zapCarteirinhas');
    if (!wrap) return;
    const prods = this.load();
    const empresas = Store.get('companies') || [];

    const prontas = this.CARTEIRINHAS.filter(sigla => {
      // empresas cujo nome contém a sigla (ex.: "UEN" casa "UEN")
      const lanc = prods.filter(p => (p.empresa||'').toUpperCase().trim() === sigla);
      return lanc.length > 0 && lanc.every(p => (p.etapa||'Pendente') === 'Pronto');
    });

    if (!prontas.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = `
      <div class="card mb-3" style="border-color:var(--success)">
        <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
          <span class="fw-semibold text-success"><i class="bi bi-check-circle-fill me-1"></i>Carteirinhas prontas:</span>
          ${prontas.map(sigla => {
            const emp = empresas.find(e => (e.nome||'').toUpperCase().trim() === sigla);
            const tel = (emp?.telefone || '').replace(/\D/g,'');
            const fone = tel ? (tel.startsWith('55') ? tel : '55'+tel) : '';
            return fone
              ? `<a class="btn btn-sm btn-success" target="_blank"
                   href="https://wa.me/${fone}?text=${encodeURIComponent('Carteirinhas prontas!')}">
                   <i class="bi bi-whatsapp me-1"></i>${sigla}</a>`
              : `<span class="badge badge-warning" title="Sem telefone no cadastro">${sigla} (sem telefone)</span>`;
          }).join('')}
        </div>
      </div>`;
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
              <div class="col-md-4">
                <label class="form-label">Furo</label>
                <select class="form-select" id="prodFuro">
                  <option value="">Sem furo</option>
                  <option value="Ovoide">Ovoide</option>
                  <option value="2 Mosquetes">2 Mosquetes</option>
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
    document.getElementById('prodFuro').value       = '';
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
    document.getElementById('prodFuro').value       = p.furo      || '';
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
      furo:       document.getElementById('prodFuro').value || null,
      etapa:      'Pendente',
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
  },

  /* ════════════════ RODADA MULTILAYOUT ════════════════
     Vários itens (empresas) compartilham a(s) mesma(s) folha(s).
     As FOLHAS são cobradas pela rodada (kit × nº de rodadas);
     cada item vira uma produção individual (crédito/arte/chips
     por item) com folhasPVC=0 para não duplicar folhas. */
  _runItens: [],

  _rodadaModal() {
    const empresas   = Store.get('companies') || [];
    const operadores = (Store.get('operators') || []).filter(o => o.status !== 'Inativo');
    return `
    <div class="modal fade" id="runModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Nova Rodada — Multilayout</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label">Data *</label>
                <input type="date" class="form-control form-control-sm" id="runData">
              </div>
              <div class="col-md-3">
                <label class="form-label">Categoria *</label>
                <select class="form-select form-select-sm" id="runCategoria" onchange="Producao._runResumo()">
                  ${buildOptions(CATEGORIAS.filter(c => kitRodada(c).pecas > 0))}
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">PVC</label>
                <select class="form-select form-select-sm" id="runPvc">
                  <option value="">N/A</option>${buildOptions(PVC_TYPES)}
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">Frequência</label>
                <select class="form-select form-select-sm" id="runFreq" onchange="Producao._runResumo()">
                  ${buildOptions(FREQUENCIAS)}
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">Operador</label>
                <select class="form-select form-select-sm" id="runOperador">
                  <option value="">—</option>${buildOptions(operadores,'nome','nome')}
                </select>
              </div>
              <div class="col-md-2">
                <label class="form-label">Furo</label>
                <select class="form-select form-select-sm" id="runFuro">
                  <option value="">Sem furo</option>
                  <option value="Ovoide">Ovoide</option>
                  <option value="2 Mosquetes">2 Mosquetes</option>
                </select>
              </div>
            </div>

            <!-- adicionar item -->
            <div class="card mb-3">
              <div class="card-body py-2">
                <div class="row g-2 align-items-end">
                  <div class="col-md-4">
                    <label class="form-label" style="font-size:12px">Empresa</label>
                    <select class="form-select form-select-sm" id="runItEmpresa" onchange="Producao._runFillProj()">
                      <option value="">Selecione...</option>${buildOptions(empresas,'nome','nome')}
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label" style="font-size:12px">Projeto</label>
                    <select class="form-select form-select-sm" id="runItProjeto" onchange="Producao._runFillArte()">
                      <option value="">—</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label" style="font-size:12px">Arte</label>
                    <select class="form-select form-select-sm" id="runItArte"><option value="">—</option></select>
                  </div>
                  <div class="col-md-1">
                    <label class="form-label" style="font-size:12px">Qtd</label>
                    <input type="number" min="1" class="form-control form-control-sm" id="runItQtd">
                  </div>
                  <div class="col-md-1">
                    <button class="btn btn-primary btn-sm w-100" onclick="Producao.runAddItem()">
                      <i class="bi bi-plus-lg"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- itens da rodada -->
            <div id="runItensList"></div>

            <!-- ocupação / consumo -->
            <div class="calc-preview mt-3">
              <div class="calc-preview-title">Ocupação e Consumo</div>
              <div id="runResumo" class="mt-1" style="font-size:13px"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-success" onclick="Producao.runSalvar()">
              <i class="bi bi-check-lg me-1"></i>Confirmar Rodada
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  openRodada() {
    if (!document.getElementById('runModal')) {
      document.body.insertAdjacentHTML('beforeend', this._rodadaModal());
    }
    this._runItens = [];
    document.getElementById('runData').value = today();
    document.getElementById('runCategoria').value = 'Crachá';
    document.getElementById('runPvc').value = '';
    document.getElementById('runFreq').value = FREQUENCIAS[0];
    document.getElementById('runOperador').value = '';
    document.getElementById('runFuro').value = '';
    document.getElementById('runItQtd').value = '';
    this._runFillProj();
    this._runRenderItens();
    this._runResumo();
    new bootstrap.Modal(document.getElementById('runModal')).show();
  },

  _runFillProj() {
    const emp = document.getElementById('runItEmpresa').value;
    const sel = document.getElementById('runItProjeto');
    const projs = (Store.get('projects') || []).filter(p => !emp || p.empresa === emp);
    sel.innerHTML = '<option value="">—</option>' + buildOptions(projs,'nome','nome');
    this._runFillArte();
  },

  _runFillArte() {
    const sel = document.getElementById('runItArte');
    const projNome = document.getElementById('runItProjeto').value;
    const emp = document.getElementById('runItEmpresa').value;
    const proj = (Store.get('projects') || []).find(p => p.nome === projNome && (!emp || p.empresa === emp));
    if (!proj) { sel.innerHTML = '<option value="">—</option>'; return; }
    const arts = Store.get('project_arts').filter(a => a.project_id === proj.id);
    sel.innerHTML = '<option value="">—</option>' +
      arts.map(a => `<option value="${a.id}">${a.nome} (${a.feito||0}/${a.meta||0})</option>`).join('');
  },

  runAddItem() {
    const empresa = document.getElementById('runItEmpresa').value;
    const qtd = parseInt(document.getElementById('runItQtd').value) || 0;
    if (!empresa) return toast('Selecione a empresa do item', 'warning');
    if (qtd <= 0) return toast('Informe a quantidade do item', 'warning');

    this._runItens.push({
      empresa,
      projeto: document.getElementById('runItProjeto').value,
      art_id:  document.getElementById('runItArte').value || null,
      quantidade: qtd
    });
    document.getElementById('runItQtd').value = '';
    this._runRenderItens();
    this._runResumo();
  },

  runDelItem(i) {
    this._runItens.splice(i, 1);
    this._runRenderItens();
    this._runResumo();
  },

  _runRenderItens() {
    const wrap = document.getElementById('runItensList');
    if (!wrap) return;
    if (!this._runItens.length) {
      wrap.innerHTML = '<div class="text-secondary" style="font-size:13px">Nenhum item. Adicione as empresas e quantidades que vão na folha.</div>';
      return;
    }
    wrap.innerHTML = `
      <table class="table table-sm mb-0">
        <thead><tr><th>Empresa</th><th>Projeto</th><th class="text-end">Qtd</th><th></th></tr></thead>
        <tbody>${this._runItens.map((it,i) => `
          <tr>
            <td>${it.empresa}</td>
            <td class="text-secondary">${it.projeto || '—'}</td>
            <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(it.quantidade)}</td>
            <td class="text-end"><button class="btn-icon-act text-danger" onclick="Producao.runDelItem(${i})"><i class="bi bi-x-lg"></i></button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  },

  /* calcula ocupação/folhas da rodada a partir dos itens */
  _runCalc() {
    const cat  = document.getElementById('runCategoria')?.value || 'Crachá';
    const freq = document.getElementById('runFreq')?.value || 'Sem Chip';
    const kit  = kitRodada(cat);
    const total = this._runItens.reduce((s,it) => s + it.quantidade, 0);
    const rodadas = kit.pecas ? Math.ceil(total / kit.pecas) : 0;
    return {
      cat, freq, kit, total, rodadas,
      pvcF: rodadas * kit.pvc,
      ovlF: rodadas * kit.overlay,
      chipF: (freq !== 'Sem Chip') ? rodadas * (kit.chipFolha||0) : 0,
      vagas: rodadas * kit.pecas - total
    };
  },

  _runResumo() {
    const el = document.getElementById('runResumo');
    if (!el) return;
    const c = this._runCalc();
    if (!c.total) { el.innerHTML = '<span class="text-secondary">Adicione itens para ver o consumo.</span>'; return; }
    el.innerHTML = `
      <div class="d-flex flex-wrap gap-3">
        <span><strong>${fmtNum(c.total)}</strong> peças · <strong>${c.rodadas}</strong> rodada${c.rodadas>1?'s':''}
          ${c.vagas>0 ? `<span class="text-warning">(${c.vagas} vaga${c.vagas>1?'s':''} na folha)</span>` : '<span class="text-success">(folha fechada ✓)</span>'}</span>
        <span>PVC: <strong>${fmtNum(c.pvcF)}</strong> folhas</span>
        <span>Overlay: <strong>${fmtNum(c.ovlF)}</strong> folhas</span>
        ${c.chipF ? `<span>Folha de Chip: <strong>${fmtNum(c.chipF)}</strong></span>` : ''}
        ${c.freq !== 'Sem Chip' ? `<span>Chips: <strong>${fmtNum(c.total)}</strong> un</span>` : ''}
      </div>`;
  },

  async runSalvar() {
    if (!this._runItens.length) return toast('Adicione ao menos um item à rodada', 'warning');
    const data = document.getElementById('runData').value;
    if (!data) return toast('Informe a data', 'warning');

    const c = this._runCalc();
    const pvcTipo = document.getElementById('runPvc').value;
    const operador = document.getElementById('runOperador').value;

    try {
      // 1) grava a rodada (carrega as FOLHAS)
      const run = await Store.insert('production_runs', {
        data, categoria: c.cat, pvc: pvcTipo, frequencia: c.freq,
        overlay: true, operador,
        total_pecas: c.total, rodadas: c.rodadas,
        pvc_folhas: c.pvcF, overlay_folhas: c.ovlF, chip_folhas: c.chipF
      });

      // 2) baixa as folhas UMA vez, pela rodada
      await deductStockRodada(run);

      // 3) cada item vira uma produção (folhasPVC=0; chips por peça)
      for (const it of this._runItens) {
        const reg = {
          data, empresa: it.empresa, projeto: it.projeto, art_id: it.art_id,
          categoria: c.cat, quantidade: it.quantidade,
          pvc: pvcTipo, frequencia: c.freq, overlay: true,
          operador, obs: 'Rodada multilayout',
          furo: document.getElementById('runFuro').value || null,
          etapa: 'Pendente',
          folhasPVC: 0,                       // folhas já cobradas pela rodada
          chips: calcChips(c.freq, it.quantidade),
          run_id: run.id
        };
        await Store.insert('productions', reg);
        await deductStock(reg);               // baixa só chips avulsos/cordões

        // crédito: só empresas que usam crédito
        const empObj = (Store.get('companies') || []).find(x => x.nome === it.empresa);
        if (empObj && empObj.usa_credito && typeof Creditos !== 'undefined') {
          await Creditos.registrarSaida(it.empresa, it.quantidade,
            `Produção ${c.cat} (rodada)${it.projeto ? ' — '+it.projeto : ''}`);
        }
        // arte
        if (it.art_id) {
          const arte = Store.get('project_arts').find(a => a.id === it.art_id);
          if (arte) await Store.update('project_arts', { id: arte.id, feito: (arte.feito||0) + it.quantidade });
        }
      }
    } catch (e) {
      console.error(e);
      return toast('Erro ao salvar a rodada', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('runModal'))?.hide();
    toast(`Rodada registrada: ${fmtNum(c.total)} peças, ${c.rodadas} rodada(s)`);
    this._runItens = [];
    this._renderRows();
    App._checkAlerts();
  }
};
