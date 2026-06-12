/**
 * RH Sim — projetos.js
 * Projetos (CRUD) + ARTES com acompanhamento de produção.
 *
 * Persiste em Store 'projects' e 'project_arts'.
 * Campos novos no projeto: categoria (define itens/folha) e
 * complementos (lista de itens extras, ex.: cordões personalizados).
 *
 * Cada arte (project_arts): { id, project_id, nome, meta, feito }.
 * O sistema calcula: falta = meta - feito; folhas = ceil(falta / itensPorFolha(categoria)).
 * Atualização do "feito" é via botão "+qtd" (soma o que rodou agora).
 */

const Projetos = {
  _editId: null,
  _artsProjId: null,   // projeto cujas artes estão abertas no modal

  load() { return Store.get('projects'); },

  /* artes de um projeto */
  artsOf(projId) {
    return Store.get('project_arts').filter(a => a.project_id === projId);
  },

  render() {
    const empresas = Store.get('companies') || [];

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-kanban-fill"></i> Projetos</h1>
        <p class="page-subtitle">Acompanhamento de projetos e artes</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Projetos.load(),'projetos')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-primary btn-sm" onclick="Projetos.openForm()"
                ${empresas.length ? '' : 'disabled title="Cadastre uma empresa primeiro"'}>
          <i class="bi bi-plus-lg me-1"></i>Novo Projeto
        </button>
      </div>
    </div>

    ${empresas.length ? '' : `
    <div class="card mb-3" style="border-color:var(--warning)">
      <div class="card-body d-flex align-items-center gap-2 text-secondary">
        <i class="bi bi-info-circle text-warning"></i>
        Cadastre ao menos uma empresa em <strong>Empresas</strong> antes de criar projetos.
      </div>
    </div>`}

    <div class="filters-bar">
      <div class="search-bar flex-grow-1">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="projSearch"
               placeholder="Pesquisar por nome ou empresa..."
               oninput="Projetos.search()">
      </div>
      <select class="form-select form-select-sm" id="projStatusFilter" style="max-width:220px"
              onchange="Projetos.search()">
        <option value="">Todos os status</option>
        ${buildOptions(STATUS_PROJ)}
      </select>
    </div>

    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Projeto</th><th>Empresa</th><th>Categoria</th>
                <th>Progresso</th><th>Status</th><th class="text-end">Ações</th>
              </tr>
            </thead>
            <tbody id="projBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    ${this._modal()}
    ${this._artsModal()}`;
  },

  init() {
    this._renderRows();
  },

  _renderRows() {
    const termo  = (document.getElementById('projSearch')?.value || '').toLowerCase();
    const status = document.getElementById('projStatusFilter')?.value || '';

    const rows = this.load().filter(p => {
      const okTexto  = !termo ||
        (p.nome||'').toLowerCase().includes(termo) ||
        (p.empresa||'').toLowerCase().includes(termo);
      const okStatus = !status || p.status === status;
      return okTexto && okStatus;
    });

    const body = document.getElementById('projBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">
        <div class="empty-state"><i class="bi bi-kanban"></i>
        <p>Nenhum projeto encontrado</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(p => {
      const arts  = this.artsOf(p.id);
      const meta  = arts.reduce((s,a) => s + (a.meta||0), 0);
      const feito = arts.reduce((s,a) => s + (a.feito||0), 0);
      const pct   = meta > 0 ? Math.round((feito/meta)*100) : 0;
      const progresso = arts.length
        ? `<div class="d-flex align-items-center gap-2" style="min-width:140px">
             <div class="progress flex-grow-1" style="height:8px">
               <div class="progress-bar ${pct>=100?'bg-success':''}" style="width:${pct}%"></div>
             </div>
             <small class="text-secondary" style="font-family:'DM Mono',monospace">${feito}/${meta}</small>
           </div>`
        : '<small class="text-secondary">sem artes</small>';

      return `
      <tr>
        <td class="fw-semibold">${p.nome}</td>
        <td>${p.empresa || '-'}</td>
        <td>${p.categoria ? `<span class="badge badge-secondary">${p.categoria}</span>` : '-'}</td>
        <td>${progresso}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="text-end" style="white-space:nowrap">
          <button class="btn-icon-act text-success" title="Artes / Produção" onclick="Projetos.openArts('${p.id}')">
            <i class="bi bi-list-check"></i></button>
          <button class="btn-icon-act text-primary" title="Editar" onclick="Projetos.edit('${p.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Projetos.delete('${p.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  search() { this._renderRows(); },

  /* ===================== MODAL: PROJETO ===================== */
  _modal() {
    const empresas = Store.get('companies') || [];
    return `
    <div class="modal fade" id="projModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="projModalTitle">Novo Projeto</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" id="projNome">
              </div>
              <div class="col-md-6">
                <label class="form-label">Empresa *</label>
                <select class="form-select" id="projEmpresa">
                  <option value="">Selecione...</option>
                  ${buildOptions(empresas, 'nome', 'nome')}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Categoria *</label>
                <select class="form-select" id="projCategoria">
                  ${buildOptions(CATEGORIAS)}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Data Início</label>
                <input type="date" class="form-control" id="projInicio">
              </div>
              <div class="col-md-6">
                <label class="form-label">Data Entrega</label>
                <input type="date" class="form-control" id="projEntrega">
              </div>
              <div class="col-12">
                <label class="form-label">Status</label>
                <select class="form-select" id="projStatus">
                  ${buildOptions(STATUS_PROJ)}
                </select>
              </div>

              <!-- Complementos: lista de itens extras -->
              <div class="col-12">
                <label class="form-label">Complementos</label>
                <div class="input-group input-group-sm mb-2">
                  <input type="text" class="form-control" id="projCompInput"
                         placeholder="Ex.: cordões 20mm personalizados"
                         onkeydown="if(event.key==='Enter'){event.preventDefault();Projetos.addComp();}">
                  <button class="btn btn-outline-secondary" type="button" onclick="Projetos.addComp()">
                    <i class="bi bi-plus-lg"></i>
                  </button>
                </div>
                <div id="projCompList" class="d-flex flex-wrap gap-2"></div>
              </div>

              <div class="col-12">
                <label class="form-label">Observações</label>
                <textarea class="form-control" id="projObs" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-primary" onclick="Projetos.save()">
              <i class="bi bi-check-lg me-1"></i>Salvar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  /* lista de complementos em memória enquanto o modal está aberto */
  _comps: [],

  _renderComps() {
    const wrap = document.getElementById('projCompList');
    if (!wrap) return;
    wrap.innerHTML = this._comps.length
      ? this._comps.map((c,i) => `
          <span class="badge badge-secondary d-inline-flex align-items-center gap-1">
            ${c}
            <i class="bi bi-x-lg" style="cursor:pointer" onclick="Projetos.removeComp(${i})"></i>
          </span>`).join('')
      : '<small class="text-secondary">Nenhum complemento</small>';
  },

  addComp() {
    const inp = document.getElementById('projCompInput');
    const v = inp.value.trim();
    if (!v) return;
    this._comps.push(v);
    inp.value = '';
    this._renderComps();
  },

  removeComp(i) {
    this._comps.splice(i, 1);
    this._renderComps();
  },

  openForm() {
    this._editId = null;
    this._comps = [];
    document.getElementById('projModalTitle').textContent = 'Novo Projeto';
    document.getElementById('projNome').value     = '';
    document.getElementById('projEmpresa').value   = '';
    document.getElementById('projCategoria').value = CATEGORIAS[0];
    document.getElementById('projInicio').value    = today();
    document.getElementById('projEntrega').value   = '';
    document.getElementById('projStatus').value    = STATUS_PROJ[0];
    document.getElementById('projObs').value       = '';
    this._renderComps();
    new bootstrap.Modal(document.getElementById('projModal')).show();
  },

  edit(id) {
    const p = this.load().find(x => x.id === id);
    if (!p) return;
    this._editId = id;
    this._comps = Array.isArray(p.complementos) ? [...p.complementos] : [];
    document.getElementById('projModalTitle').textContent = 'Editar Projeto';
    document.getElementById('projNome').value     = p.nome      || '';
    document.getElementById('projEmpresa').value   = p.empresa   || '';
    document.getElementById('projCategoria').value = p.categoria || CATEGORIAS[0];
    document.getElementById('projInicio').value    = p.inicio    || '';
    document.getElementById('projEntrega').value   = p.entrega   || '';
    document.getElementById('projStatus').value    = p.status    || STATUS_PROJ[0];
    document.getElementById('projObs').value       = p.obs       || '';
    this._renderComps();
    new bootstrap.Modal(document.getElementById('projModal')).show();
  },

  async save() {
    const nome    = document.getElementById('projNome').value.trim();
    const empresa = document.getElementById('projEmpresa').value;
    if (!nome)    return toast('Informe o nome do projeto', 'warning');
    if (!empresa) return toast('Selecione a empresa', 'warning');

    const reg = {
      nome,
      empresa,
      categoria:    document.getElementById('projCategoria').value,
      inicio:       document.getElementById('projInicio').value || null,
      entrega:      document.getElementById('projEntrega').value || null,
      status:       document.getElementById('projStatus').value,
      complementos: this._comps,
      obs:          document.getElementById('projObs').value.trim()
    };

    try {
      if (this._editId) { reg.id = this._editId; await Store.update('projects', reg); }
      else              { await Store.insert('projects', reg); }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('projModal')).hide();
    logAtividade(this._editId ? 'editou projeto' : 'cadastrou projeto', `${reg.nome} (${reg.empresa})`);
    toast(this._editId ? 'Projeto atualizado!' : 'Projeto cadastrado!');
    this._editId = null;
    this._renderRows();
  },

  delete(id) {
    confirm('Excluir este projeto e todas as suas artes?', async () => {
      try {
        // remove as artes do projeto e depois o projeto
        for (const a of this.artsOf(id)) await Store.remove('project_arts', a.id);
        await Store.remove('projects', id);
      } catch { return toast('Erro ao excluir', 'danger'); }
      logAtividade('excluiu projeto', id);
      toast('Projeto excluído', 'warning');
      this._renderRows();
    });
  },

  /* ===================== MODAL: ARTES ===================== */
  _artsModal() {
    return `
    <div class="modal fade" id="artsModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0" id="artsModalTitle">Artes</h5>
              <small class="text-secondary" id="artsModalSub"></small>
            </div>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- adicionar arte -->
            <div class="row g-2 align-items-end mb-3">
              <div class="col">
                <label class="form-label">Nome da arte</label>
                <input type="text" class="form-control form-control-sm" id="artNome" placeholder="Ex.: 01 Participante">
              </div>
              <div class="col-auto" style="max-width:120px">
                <label class="form-label">Meta</label>
                <input type="number" min="1" class="form-control form-control-sm" id="artMeta">
              </div>
              <div class="col-auto">
                <button class="btn btn-primary btn-sm" onclick="Projetos.addArt()">
                  <i class="bi bi-plus-lg me-1"></i>Adicionar
                </button>
              </div>
            </div>

            <div id="artsList"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  openArts(projId) {
    const p = this.load().find(x => x.id === projId);
    if (!p) return;
    this._artsProjId = projId;
    document.getElementById('artsModalTitle').textContent = `Artes — ${p.nome}`;
    document.getElementById('artsModalSub').textContent =
      `${p.empresa || ''} · Categoria: ${p.categoria || '—'} (${itensPorFolha(p.categoria)||'?'} por folha)`;
    document.getElementById('artNome').value = '';
    document.getElementById('artMeta').value = '';
    this._renderArts();
    new bootstrap.Modal(document.getElementById('artsModal')).show();
  },

  _renderArts() {
    const p = this.load().find(x => x.id === this._artsProjId);
    const arts = this.artsOf(this._artsProjId);
    const wrap = document.getElementById('artsList');
    if (!wrap) return;

    if (!arts.length) {
      wrap.innerHTML = `<div class="empty-state"><i class="bi bi-palette"></i>
        <p>Nenhuma arte cadastrada. Adicione acima.</p></div>`;
      return;
    }

    const porFolha = itensPorFolha(p.categoria);

    wrap.innerHTML = arts.map(a => {
      const meta  = a.meta  || 0;
      const feito = a.feito || 0;
      const falta = Math.max(0, meta - feito);
      const pct   = meta > 0 ? Math.min(100, Math.round((feito/meta)*100)) : 0;
      const folhasFalta = (porFolha > 0 && falta > 0) ? Math.ceil(falta/porFolha) : 0;
      const done = falta === 0 && meta > 0;

      return `
      <div class="card mb-2">
        <div class="card-body py-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-semibold">${a.nome}</span>
            <span>
              ${done
                ? '<span class="badge badge-success">✓ concluída</span>'
                : `<span class="text-secondary" style="font-size:13px">faltam ${falta}${folhasFalta?` · ${folhasFalta} folha${folhasFalta>1?'s':''}`:''}</span>`}
            </span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height:10px">
              <div class="progress-bar ${done?'bg-success':''}" style="width:${pct}%"></div>
            </div>
            <small style="font-family:'DM Mono',monospace;min-width:70px;text-align:right">${feito}/${meta}</small>
          </div>
          <div class="d-flex gap-2 mt-2">
            <div class="input-group input-group-sm" style="max-width:200px">
              <input type="number" min="1" class="form-control" id="add_${a.id}" placeholder="+ qtd produzida">
              <button class="btn btn-outline-success" onclick="Projetos.addFeito('${a.id}')">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
            <button class="btn btn-sm btn-outline-secondary" title="Corrigir produzidas" onclick="Projetos.setFeito('${a.id}')">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" title="Excluir arte" onclick="Projetos.delArt('${a.id}')">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  async addArt() {
    const nome = document.getElementById('artNome').value.trim();
    const meta = parseInt(document.getElementById('artMeta').value) || 0;
    if (!nome)     return toast('Informe o nome da arte', 'warning');
    if (meta <= 0) return toast('Informe a meta (quantidade)', 'warning');

    try {
      await Store.insert('project_arts', {
        project_id: this._artsProjId, nome, meta, feito: 0
      });
    } catch { return toast('Erro ao adicionar arte', 'danger'); }

    document.getElementById('artNome').value = '';
    document.getElementById('artMeta').value = '';
    this._renderArts();
    this._renderRows();
  },

  async addFeito(artId) {
    const inp = document.getElementById('add_'+artId);
    const add = parseInt(inp.value) || 0;
    if (add <= 0) return toast('Informe a quantidade produzida', 'warning');

    const a = this.artsOf(this._artsProjId).find(x => x.id === artId);
    if (!a) return;
    const novo = (a.feito || 0) + add;

    try { await Store.update('project_arts', { id: artId, feito: novo }); }
    catch { return toast('Erro ao atualizar', 'danger'); }

    this._renderArts();
    this._renderRows();
  },

  setFeito(artId) {
    const a = this.artsOf(this._artsProjId).find(x => x.id === artId);
    if (!a) return;
    const v = prompt(`Corrigir total produzido de "${a.nome}" (meta ${a.meta}):`, a.feito || 0);
    if (v === null) return;
    const n = parseInt(v);
    if (isNaN(n) || n < 0) return toast('Valor inválido', 'warning');
    Store.update('project_arts', { id: artId, feito: n })
      .then(() => { this._renderArts(); this._renderRows(); })
      .catch(() => toast('Erro ao atualizar', 'danger'));
  },

  delArt(artId) {
    confirm('Excluir esta arte?', async () => {
      try { await Store.remove('project_arts', artId); }
      catch { return toast('Erro ao excluir', 'danger'); }
      this._renderArts();
      this._renderRows();
    });
  }
};
