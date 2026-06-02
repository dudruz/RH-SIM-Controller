/**
 * RH Sim — js/operadores.js
 * Cadastro de Operadores (CRUD + busca)
 *
 * Persiste em Store 'operators'. O campo `status` usa 'Ativo'/'Inativo',
 * exatamente como o dashboard espera (contagem de operadores ativos) e
 * como statusBadge() já reconhece.
 */

const Operadores = {
  _filtro: '',
  _editId: null,

  /* lista de funções sugeridas para o select */
  FUNCOES: ['Impressão','Laminação','Acabamento','Corte','Conferência','Expedição','Administrativo'],

  load() { return Store.get('operators'); },

  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-people-fill"></i> Operadores</h1>
        <p class="page-subtitle">Equipe responsável pela produção</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="exportExcel(Operadores.load(),'operadores')">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar
        </button>
        <button class="btn btn-primary btn-sm" onclick="Operadores.openForm()">
          <i class="bi bi-plus-lg me-1"></i>Novo Operador
        </button>
      </div>
    </div>

    <div class="filters-bar">
      <div class="search-bar flex-grow-1">
        <i class="bi bi-search"></i>
        <input type="text" class="form-control form-control-sm" id="opSearch"
               placeholder="Pesquisar por nome, função ou e-mail..."
               oninput="Operadores.search(this.value)">
      </div>
    </div>

    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Nome</th><th>Função</th><th>Telefone</th>
                <th>E-mail</th><th>Status</th><th class="text-end">Ações</th>
              </tr>
            </thead>
            <tbody id="opBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    ${this._modal()}`;
  },

  init() {
    this._filtro = '';
    this._renderRows();
  },

  _renderRows() {
    const termo = this._filtro.toLowerCase();
    const rows  = this.load().filter(o =>
      !termo ||
      (o.nome||'').toLowerCase().includes(termo)  ||
      (o.funcao||'').toLowerCase().includes(termo)||
      (o.email||'').toLowerCase().includes(termo)
    );

    const body = document.getElementById('opBody');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">
        <div class="empty-state"><i class="bi bi-people"></i>
        <p>Nenhum operador encontrado</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(o => `
      <tr>
        <td class="fw-semibold">${o.nome}</td>
        <td>${o.funcao || '-'}</td>
        <td>${o.telefone || '-'}</td>
        <td>${o.email || '-'}</td>
        <td>${statusBadge(o.status || 'Ativo')}</td>
        <td class="text-end">
          <button class="btn-icon-act text-primary" title="Editar" onclick="Operadores.edit('${o.id}')">
            <i class="bi bi-pencil"></i></button>
          <button class="btn-icon-act text-danger" title="Excluir" onclick="Operadores.delete('${o.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`).join('');
  },

  search(v) { this._filtro = v || ''; this._renderRows(); },

  _modal() {
    return `
    <div class="modal fade" id="opModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="opModalTitle">Novo Operador</h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" id="opNome">
              </div>
              <div class="col-md-6">
                <label class="form-label">Função</label>
                <select class="form-select" id="opFuncao">
                  <option value="">Selecione...</option>
                  ${buildOptions(this.FUNCOES)}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Status</label>
                <select class="form-select" id="opStatus">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Telefone</label>
                <input type="text" class="form-control" id="opTelefone">
              </div>
              <div class="col-md-6">
                <label class="form-label">E-mail</label>
                <input type="email" class="form-control" id="opEmail">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-primary" onclick="Operadores.save()">
              <i class="bi bi-check-lg me-1"></i>Salvar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  },

  openForm() {
    this._editId = null;
    document.getElementById('opModalTitle').textContent = 'Novo Operador';
    ['Nome','Telefone','Email'].forEach(f => document.getElementById('op'+f).value = '');
    document.getElementById('opFuncao').value = '';
    document.getElementById('opStatus').value = 'Ativo';
    new bootstrap.Modal(document.getElementById('opModal')).show();
  },

  edit(id) {
    const o = this.load().find(x => x.id === id);
    if (!o) return;
    this._editId = id;
    document.getElementById('opModalTitle').textContent = 'Editar Operador';
    document.getElementById('opNome').value     = o.nome     || '';
    document.getElementById('opFuncao').value    = o.funcao   || '';
    document.getElementById('opStatus').value    = o.status   || 'Ativo';
    document.getElementById('opTelefone').value  = o.telefone || '';
    document.getElementById('opEmail').value     = o.email    || '';
    new bootstrap.Modal(document.getElementById('opModal')).show();
  },

  async save() {
    const nome = document.getElementById('opNome').value.trim();
    if (!nome) return toast('Informe o nome do operador', 'warning');

    const reg = {
      nome,
      funcao:   document.getElementById('opFuncao').value,
      status:   document.getElementById('opStatus').value,
      telefone: document.getElementById('opTelefone').value.trim(),
      email:    document.getElementById('opEmail').value.trim()
    };

    try {
      if (this._editId) { reg.id = this._editId; await Store.update('operators', reg); }
      else              { await Store.insert('operators', reg); }
    } catch {
      return toast('Erro ao salvar no banco de dados', 'danger');
    }

    bootstrap.Modal.getInstance(document.getElementById('opModal')).hide();
    toast(this._editId ? 'Operador atualizado!' : 'Operador cadastrado!');
    this._editId = null;
    this._renderRows();
  },

  delete(id) {
    confirm('Deseja excluir este operador?', async () => {
      try { await Store.remove('operators', id); }
      catch { return toast('Erro ao excluir', 'danger'); }
      toast('Operador excluído', 'warning');
      this._renderRows();
    });
  }
};
