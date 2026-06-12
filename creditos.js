/**
 * RH Sim — creditos.js
 * Extrato de crédito por empresa (saldo único, estilo conta bancária).
 *
 * Persiste em Store 'credit_movements': { id, empresa, data, tipo, quantidade, descricao }
 *   tipo: 'credito' (entrada) | 'saida' (consumo por produção)
 *
 * Saldo = soma(creditos) - soma(saidas).
 * Integra com: Empresas (botão de extrato) e Produção (baixa ao confirmar).
 * Importa planilha no formato: DATA | CRÉDITO | SAÍDA (uma aba/cliente por arquivo).
 * Exporta extrato no mesmo layout para enviar ao cliente.
 */

const Creditos = {
  _empresaAtual: null,

  /* movimentos de uma empresa, ordenados por data */
  movimentos(empresa) {
    return Store.get('credit_movements')
      .filter(m => m.empresa === empresa)
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  },

  /* saldo atual da empresa */
  saldo(empresa) {
    return this.movimentos(empresa).reduce((s, m) =>
      s + (m.tipo === 'credito' ? (m.quantidade || 0) : -(m.quantidade || 0)), 0);
  },

  /* ===== Modal do extrato ===== */
  _modal() {
    return `
    <div class="modal fade" id="credModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0" id="credTitle">Extrato de Crédito</h5>
              <small class="text-secondary" id="credSaldo"></small>
            </div>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- ações -->
            <div class="d-flex flex-wrap gap-2 mb-3">
              <div class="input-group input-group-sm" style="max-width:260px">
                <input type="number" min="1" class="form-control" id="credAddQtd" placeholder="Adicionar crédito">
                <button class="btn btn-success" onclick="Creditos.addCredito()">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
              <button class="btn btn-outline-secondary btn-sm" onclick="Creditos.exportar()">
                <i class="bi bi-download me-1"></i>Exportar extrato
              </button>
            </div>

            <div class="table-wrap">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Data</th><th class="text-end">Crédito</th>
                    <th class="text-end">Saída</th><th class="text-end">Saldo</th>
                    <th>Descrição</th><th></th>
                  </tr>
                </thead>
                <tbody id="credBody"></tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  /* abre o extrato de uma empresa */
  open(empresa) {
    this._empresaAtual = empresa;
    // garante que o modal existe no DOM (injeta uma vez)
    if (!document.getElementById('credModal')) {
      document.body.insertAdjacentHTML('beforeend', this._modal());
    }
    document.getElementById('credTitle').textContent = `Extrato — ${empresa}`;
    document.getElementById('credAddQtd').value = '';
    this._renderExtrato();
    new bootstrap.Modal(document.getElementById('credModal')).show();
  },

  _renderExtrato() {
    const emp  = this._empresaAtual;
    const movs = this.movimentos(emp);
    const body = document.getElementById('credBody');
    const saldoFinal = this.saldo(emp);

    document.getElementById('credSaldo').innerHTML =
      `Saldo atual: <strong class="${saldoFinal < 0 ? 'text-danger' : 'text-success'}">${fmtNum(saldoFinal)}</strong> peças`;

    if (!movs.length) {
      body.innerHTML = `<tr><td colspan="6">
        <div class="empty-state"><i class="bi bi-wallet2"></i>
        <p>Sem movimentos. Adicione crédito ou importe a planilha.</p></div></td></tr>`;
      return;
    }

    // calcula saldo corrente linha a linha
    let saldo = 0;
    body.innerHTML = movs.map(m => {
      const cred = m.tipo === 'credito' ? (m.quantidade || 0) : 0;
      const said = m.tipo === 'saida'   ? (m.quantidade || 0) : 0;
      saldo += cred - said;
      return `
      <tr>
        <td>${fmtDate(m.data)}</td>
        <td class="text-end text-success">${cred ? '+'+fmtNum(cred) : '-'}</td>
        <td class="text-end text-danger">${said ? '-'+fmtNum(said) : '-'}</td>
        <td class="text-end fw-semibold" style="font-family:'DM Mono',monospace">${fmtNum(saldo)}</td>
        <td class="text-secondary" style="font-size:13px">${m.descricao || '-'}</td>
        <td class="text-end">
          <button class="btn-icon-act text-danger" title="Excluir movimento" onclick="Creditos.delMov('${m.id}')">
            <i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  /* adiciona crédito manual */
  async addCredito() {
    const qtd = parseInt(document.getElementById('credAddQtd').value) || 0;
    if (qtd <= 0) return toast('Informe a quantidade de crédito', 'warning');
    try {
      await Store.insert('credit_movements', {
        empresa: this._empresaAtual, data: today(),
        tipo: 'credito', quantidade: qtd, descricao: 'Crédito adicionado'
      });
    } catch { return toast('Erro ao adicionar crédito', 'danger'); }
    document.getElementById('credAddQtd').value = '';
    logAtividade('adicionou crédito', `${this._empresaAtual} · +${fmtNum(qtd)}`);
    toast('Crédito adicionado!');
    this._renderExtrato();
  },

  /* registra uma saída (chamado pela Produção ao confirmar) */
  async registrarSaida(empresa, qtd, descricao) {
    if (!empresa || qtd <= 0) return;
    await Store.insert('credit_movements', {
      empresa, data: today(), tipo: 'saida',
      quantidade: qtd, descricao: descricao || 'Produção'
    });
  },

  delMov(id) {
    confirm('Excluir este movimento do extrato?', async () => {
      try { await Store.remove('credit_movements', id); }
      catch { return toast('Erro ao excluir', 'danger'); }
      logAtividade('excluiu movimento de crédito', this._empresaAtual);
      toast('Movimento excluído', 'warning');
      this._renderExtrato();
    });
  },

  /* ===== Exportar extrato (layout DATA|CRÉDITO|SAÍDA|SALDO) ===== */
  exportar() {
    const emp  = this._empresaAtual;
    const movs = this.movimentos(emp);
    if (!movs.length) return toast('Sem movimentos para exportar', 'warning');

    let saldo = 0;
    const linhas = movs.map(m => {
      const cred = m.tipo === 'credito' ? (m.quantidade || 0) : 0;
      const said = m.tipo === 'saida'   ? (m.quantidade || 0) : 0;
      saldo += cred - said;
      return { DATA: fmtDate(m.data), 'CRÉDITO': cred || '', 'SAÍDA': said || '', SALDO: saldo };
    });

    const ws = XLSX.utils.json_to_sheet(linhas, { header: ['DATA','CRÉDITO','SAÍDA','SALDO'] });
    // título do cliente no topo
    XLSX.utils.sheet_add_aoa(ws, [[`CLIENTE: ${emp}`], []], { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, linhas, { origin: 'A3', header: ['DATA','CRÉDITO','SAÍDA','SALDO'] });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, emp.slice(0,28) || 'Extrato');
    XLSX.writeFile(wb, `Creditos_${emp.replace(/[^\w]/g,'_')}.xlsx`);
  }
};
