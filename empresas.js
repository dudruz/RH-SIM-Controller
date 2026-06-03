/**
 * RH Sim — js/empresas.js
 * Cadastro de Empresas (CRUD + busca)
 *
 * Segue a arquitetura existente:
 *  - Persiste via Store na chave 'companies' (mesma usada por dashboard/app)
 *  - Usa helpers globais: toast(), confirm(), genId(), buildOptions()
 *  - Renderiza dentro de #pageContent; o router chama Empresas.render() + Empresas.init()
 */

const Empresas = {
  /* estado de UI: termo de busca e id em edição */
  _filtro: '',
  _editId: null,

  /* ── Acesso aos dados (leitura do cache, síncrona) ────────── */
  load() { return Store.get('companies'); },

  /* ── Layout da página ─────────────────────────────────────── */
  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-building-fill"></i> Empresas</h1>
        <p class="page-subtitle">Cadastro de clientes atendidos</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Empresas.load(),'empresas')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-primary btn-sm" onclick="Empresas.openForm()">
          <i class="bi bi-plus-lg me-1"></i>Nova Empresa
        </button>
      </div>
    </div>

    <!-- Barra de busca -->
    <div class="filters-bar">
      <div class="search-bar flex-grow-1">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="empSearch"
               placeholder="Pesquisar por nome, contato ou e-mail..."
               oninput="Empresas.search(this.value)">
      </div>
    </div>

    <!-- Tabela -->
    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Empresa</th><th>Contato</th><th>Telefone</th>
                <th>E-mail</th><th>Cobrança</th><th class="text-end">Ações</th>
              </tr>
            </thead>
            <tbody id="empBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    ${this._modal()}`;
  },

  /* ── Inicialização (chamada pelo router) ──────────────────── */
  init() {
    this._filtro = '';
    this._renderRows();
  },

  /* ── Linhas da tabela (respeita filtro de busca) ──────────── */
  _renderRows() {
    const termo = this._filtro.toLowerCase();
    const rows  = this.load().filter(e =>
      !termo ||
      (e.nome||'').toLowerCase().includes(termo)   ||
      (e.contato||'').toLowerCase().includes(termo)||
      (e.email||'').toLowerCase().includes(termo)
    );

    const body = document.getElementById('empBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">
        <div class="empty-state"><i class="bi bi-building"></i>
        <p>Nenhuma empresa encontrada</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(e => `
      <tr>
        <td class="fw-semibold">${e.nome}</td>
        <td>${e.contato || '-'}</td>
        <td>${e.telefone || '-'}</td>
        <td>${e.email || '-'}</td>
        <td>${e.usa_credito
          ? '<span class="badge badge-success">Crédito</span>'
          : '<span class="badge badge-secondary">Por pedido</span>'}</td>
        <td class="text-end">
          ${e.usa_credito ? `<button class="btn-icon-act text-success" title="Extrato de Crédito" onclick="Creditos.open('${e.nome.replace(/'/g,"\\'")}')">
            <i class="bi bi-wallet2"></i></button>` : ''}
          <button class="btn-icon-act text-primary" title="Editar" onclick="Empresas.edit('${e.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Empresas.delete('${e.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`).join('');
  },

  /* ── Busca ────────────────────────────────────────────────── */
  search(v) { this._filtro = v || ''; this._renderRows(); },

  /* ── Modal de formulário ──────────────────────────────────── */
  _modal() {
    return `
    <div class="modal fade" id="empModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="empModalTitle">Nova Empresa</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" id="empNome">
              </div>
              <div class="col-md-6">
                <label class="form-label">Contato</label>
                <input type="text" class="form-control" id="empContato">
              </div>
              <div class="col-md-6">
                <label class="form-label">Telefone</label>
                <input type="text" class="form-control" id="empTelefone">
              </div>
              <div class="col-12">
                <label class="form-label">E-mail</label>
                <input type="email" class="form-control" id="empEmail">
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="empUsaCredito">
                  <label class="form-check-label" for="empUsaCredito">
                    Esta empresa usa <strong>crédito</strong> (saldo descontado na produção)
                  </label>
                </div>
                <small class="text-secondary">Desligado = paga por pedido (não desconta crédito).</small>
              </div>
              <div class="col-12">
                <label class="form-label">Observações</label>
                <textarea class="form-control" id="empObs" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-primary" onclick="Empresas.save()">
              <i class="bi bi-check-lg me-1"></i>Salvar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  /* ── Abrir form vazio (novo cadastro) ─────────────────────── */
  openForm() {
    this._editId = null;
    document.getElementById('empModalTitle').textContent = 'Nova Empresa';
    ['Nome','Contato','Telefone','Email','Obs'].forEach(f =>
      document.getElementById('emp'+f).value = '');
    document.getElementById('empUsaCredito').checked = false; // padrão: por pedido
    new bootstrap.Modal(document.getElementById('empModal')).show();
  },

  /* ── Abrir form preenchido (edição) ───────────────────────── */
  edit(id) {
    const e = this.load().find(x => x.id === id);
    if (!e) return;
    this._editId = id;
    document.getElementById('empModalTitle').textContent = 'Editar Empresa';
    document.getElementById('empNome').value     = e.nome     || '';
    document.getElementById('empContato').value  = e.contato  || '';
    document.getElementById('empTelefone').value = e.telefone || '';
    document.getElementById('empEmail').value    = e.email    || '';
    document.getElementById('empObs').value      = e.obs      || '';
    document.getElementById('empUsaCredito').checked = !!e.usa_credito;
    new bootstrap.Modal(document.getElementById('empModal')).show();
  },

  /* ── Salvar (cria ou atualiza) ────────────────────────────── */
  async save() {
    const nome = document.getElementById('empNome').value.trim();
    if (!nome) return toast('Informe o nome da empresa', 'warning');

    const reg = {
      nome,
      contato:  document.getElementById('empContato').value.trim(),
      telefone: document.getElementById('empTelefone').value.trim(),
      email:    document.getElementById('empEmail').value.trim(),
      usa_credito: document.getElementById('empUsaCredito').checked,
      obs:      document.getElementById('empObs').value.trim()
    };

    try {
      if (this._editId) {
        reg.id = this._editId;
        await Store.update('companies', reg);
      } else {
        await Store.insert('companies', reg);  // banco gera o id
      }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('empModal')).hide();
    toast(this._editId ? 'Empresa atualizada!' : 'Empresa cadastrada!');
    this._editId = null;
    this._renderRows();
  },

  /* ── Excluir ──────────────────────────────────────────────── */
  delete(id) {
    confirm('Deseja excluir esta empresa?', async () => {
      try { await Store.remove('companies', id); }
      catch { return toast('Erro ao excluir', 'danger'); }
      toast('Empresa excluída', 'warning');
      this._renderRows();
    });
  }
};
