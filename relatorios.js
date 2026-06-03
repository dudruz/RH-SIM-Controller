/**
 * RH Sim — relatorios.js
 * Análise de produção e consumo.
 *
 * Filtros (data/empresa/projeto/operador/categoria) + destaques +
 * tabela DIA × CATEGORIA + consumo de material no período + gráficos.
 * Folhas SEMPRE arredondadas para cima (inteiro). Exporta para Excel.
 */

const Relatorios = {
  PALETTE: ['#0D6EFD','#198754','#FFC107','#DC3545','#0DCAF0','#6F42C1','#FD7E14','#20C997','#D63384','#ADB5BD'],

  load() { return Store.get('productions') || []; },

  render() {
    const empresas   = Store.get('companies')  || [];
    const projetos   = Store.get('projects')   || [];
    const operadores = Store.get('operators')  || [];

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-bar-chart-fill"></i> Relatórios</h1>
        <p class="page-subtitle">Análise de produção e consumo</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="Relatorios.exportarTabela()">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar tabela
        </button>
        <button class="btn btn-outline-secondary btn-sm" onclick="Relatorios.exportar()">
          <i class="bi bi-download me-1"></i>Exportar bruto
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="filters-bar">
      <div>
        <label class="form-label mb-1">Data Inicial</label>
        <input type="date" class="form-control form-control-sm" id="relDtIni" onchange="Relatorios.apply()">
      </div>
      <div>
        <label class="form-label mb-1">Data Final</label>
        <input type="date" class="form-control form-control-sm" id="relDtFim" onchange="Relatorios.apply()">
      </div>
      <div>
        <label class="form-label mb-1">Empresa</label>
        <select class="form-select form-select-sm" id="relEmpresa" onchange="Relatorios.apply()">
          <option value="">Todas</option>${buildOptions(empresas,'nome','nome')}
        </select>
      </div>
      <div>
        <label class="form-label mb-1">Projeto</label>
        <select class="form-select form-select-sm" id="relProjeto" onchange="Relatorios.apply()">
          <option value="">Todos</option>${buildOptions(projetos,'nome','nome')}
        </select>
      </div>
      <div>
        <label class="form-label mb-1">Operador</label>
        <select class="form-select form-select-sm" id="relOperador" onchange="Relatorios.apply()">
          <option value="">Todos</option>${buildOptions(operadores,'nome','nome')}
        </select>
      </div>
      <div>
        <label class="form-label mb-1">Categoria</label>
        <select class="form-select form-select-sm" id="relCategoria" onchange="Relatorios.apply()">
          <option value="">Todas</option>${buildOptions(CATEGORIAS)}
        </select>
      </div>
      <div class="d-flex align-items-end">
        <button class="btn btn-outline-secondary btn-sm" onclick="Relatorios.limpar()">
          <i class="bi bi-x-circle me-1"></i>Limpar
        </button>
      </div>
    </div>

    <!-- Destaques -->
    <div class="row g-3 mb-4" id="relDestaques"></div>

    <!-- Indicadores numéricos -->
    <div class="row g-3 mb-4" id="relStats"></div>

    <!-- Tabela dia × categoria -->
    <div class="card mb-4">
      <div class="card-header"><span class="card-title"><i class="bi bi-table me-2"></i>Produção por dia e categoria</span></div>
      <div class="card-body p-0">
        <div class="table-wrap">
          <table class="table table-sm mb-0" id="relTabela">
            <thead id="relTabHead"></thead>
            <tbody id="relTabBody"></tbody>
            <tfoot id="relTabFoot"></tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Gráficos -->
    <div class="row g-4 mb-4">
      <div class="col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-bar-chart-line me-2"></i>Produção por dia (empilhado por categoria)</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChDia"></canvas></div></div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-pie-chart me-2"></i>Por Categoria</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChCat"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-building me-2"></i>Por Empresa</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChEmp"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-person-badge me-2"></i>Por Operador</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChOp"></canvas></div></div>
        </div>
      </div>
    </div>`;
  },

  init() { this.apply(); },

  _filtrar() {
    const ini = document.getElementById('relDtIni')?.value || '';
    const fim = document.getElementById('relDtFim')?.value || '';
    const emp = document.getElementById('relEmpresa')?.value || '';
    const prj = document.getElementById('relProjeto')?.value || '';
    const opr = document.getElementById('relOperador')?.value || '';
    const cat = document.getElementById('relCategoria')?.value || '';

    return this.load().filter(p => {
      if (ini && (p.data||'') < ini) return false;
      if (fim && (p.data||'') > fim) return false;
      if (emp && p.empresa  !== emp) return false;
      if (prj && p.projeto  !== prj) return false;
      if (opr && p.operador !== opr) return false;
      if (cat && p.categoria!== cat) return false;
      return true;
    });
  },

  apply() {
    App.destroyCharts();
    const dados = this._filtrar();
    this._destaques(dados);
    this._stats(dados);
    this._tabela(dados);
    this._charts(dados);
  },

  limpar() {
    ['relDtIni','relDtFim','relEmpresa','relProjeto','relOperador','relCategoria']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    this.apply();
  },

  /* soma agrupando por um campo, devolve [ [chave, total], ... ] ordenado desc */
  _agrupar(dados, field) {
    const map = {};
    dados.forEach(p => { const k = p[field]; if (k) map[k] = (map[k]||0) + (p.quantidade||0); });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  },

  /* consumo total de folhas (sempre inteiro, arredondado p/ cima por lançamento) */
  _consumo(dados) {
    let pvc = 0, overlay = 0, chips = 0, folhasChip = 0;
    dados.forEach(p => {
      const f = Math.ceil(p.folhasPVC || 0);   // já vem inteiro, mas garante
      pvc += f;
      if (p.overlay) overlay += f;
      chips += (p.chips || 0);
      folhasChip += Math.ceil((p.frequencia && p.frequencia!=='Sem Chip') ? (p.quantidade||0)/10 : 0);
    });
    return { pvc, overlay, chips, folhasChip };
  },

  /* ── Destaques (categoria/empresa líder) ──────────────────── */
  _destaques(dados) {
    const wrap = document.getElementById('relDestaques');
    if (!wrap) return;

    const catTop = this._agrupar(dados, 'categoria')[0];
    const empTop = this._agrupar(dados, 'empresa')[0];
    const opTop  = this._agrupar(dados, 'operador')[0];

    const card = (icon, label, nome, val, cor) => `
      <div class="col-md-4 col-12">
        <div class="report-stat" style="border-left:4px solid ${cor}">
          <div class="report-stat-label"><i class="bi ${icon} me-1"></i>${label}</div>
          <div class="report-stat-value" style="font-size:20px">${nome || '—'}</div>
          <div class="report-stat-sub">${val ? fmtNum(val)+' unidades' : 'sem dados'}</div>
        </div>
      </div>`;

    wrap.innerHTML =
      card('bi-trophy-fill','Categoria mais produzida', catTop?.[0], catTop?.[1], '#0D6EFD') +
      card('bi-building-fill','Empresa com mais produção', empTop?.[0], empTop?.[1], '#198754') +
      card('bi-person-badge-fill','Operador mais produtivo', opTop?.[0], opTop?.[1], '#FD7E14');
  },

  /* ── Indicadores (consumo do período, sempre inteiro) ─────── */
  _stats(dados) {
    const totalProd  = dados.reduce((s,p) => s + (p.quantidade||0), 0);
    const c = this._consumo(dados);
    const nEmpresas  = new Set(dados.map(p => p.empresa).filter(Boolean)).size;

    const stats = [
      { label:'Produção Total',  val: fmtNum(totalProd),     sub:'unidades' },
      { label:'Registros',       val: fmtNum(dados.length),  sub:'lançamentos' },
      { label:'Empresas',        val: fmtNum(nEmpresas),     sub:'atendidas' },
      { label:'Consumo PVC',     val: fmtNum(c.pvc),         sub:'folhas' },
      { label:'Consumo Overlay', val: fmtNum(c.overlay),     sub:'folhas' },
      { label:'Folhas de Chip',  val: fmtNum(c.folhasChip),  sub:'folhas' },
    ];

    const wrap = document.getElementById('relStats');
    if (!wrap) return;
    wrap.innerHTML = stats.map(s => `
      <div class="col-md-4 col-6">
        <div class="report-stat">
          <div class="report-stat-label">${s.label}</div>
          <div class="report-stat-value">${s.val}</div>
          <div class="report-stat-sub">${s.sub}</div>
        </div>
      </div>`).join('');
  },

  /* categorias presentes nos dados (mantém ordem de CATEGORIAS) */
  _catsPresentes(dados) {
    const set = new Set(dados.map(p => p.categoria).filter(Boolean));
    return CATEGORIAS.filter(c => set.has(c));
  },

  /* matriz dia × categoria -> { dias:[...], cats:[...], m:{dia:{cat:qtd}}, totDia, totCat, total } */
  _matriz(dados) {
    const cats = this._catsPresentes(dados);
    const m = {}, totDia = {}, totCat = {};
    let total = 0;
    dados.forEach(p => {
      const d = p.data || '—', c = p.categoria || '—', q = p.quantidade || 0;
      (m[d] = m[d] || {});
      m[d][c] = (m[d][c] || 0) + q;
      totDia[d] = (totDia[d] || 0) + q;
      totCat[c] = (totCat[c] || 0) + q;
      total += q;
    });
    const dias = Object.keys(m).sort();
    return { dias, cats, m, totDia, totCat, total };
  },

  /* ── Tabela dia × categoria ───────────────────────────────── */
  _tabela(dados) {
    const head = document.getElementById('relTabHead');
    const body = document.getElementById('relTabBody');
    const foot = document.getElementById('relTabFoot');
    if (!head) return;

    if (!dados.length) {
      head.innerHTML = ''; foot.innerHTML = '';
      body.innerHTML = `<tr><td><div class="empty-state"><i class="bi bi-table"></i><p>Sem dados no período</p></div></td></tr>`;
      return;
    }

    const { dias, cats, m, totDia, totCat, total } = this._matriz(dados);

    head.innerHTML = `<tr>
      <th>Dia</th>
      ${cats.map(c => `<th class="text-end">${c}</th>`).join('')}
      <th class="text-end">Total</th>
    </tr>`;

    body.innerHTML = dias.map(d => `
      <tr>
        <td>${fmtDate(d)}</td>
        ${cats.map(c => `<td class="text-end" style="font-family:'DM Mono',monospace">${m[d][c] ? fmtNum(m[d][c]) : '-'}</td>`).join('')}
        <td class="text-end fw-semibold" style="font-family:'DM Mono',monospace">${fmtNum(totDia[d])}</td>
      </tr>`).join('');

    foot.innerHTML = `<tr class="fw-semibold" style="border-top:2px solid var(--border)">
      <td>TOTAL</td>
      ${cats.map(c => `<td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(totCat[c]||0)}</td>`).join('')}
      <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(total)}</td>
    </tr>`;
  },

  /* ── Gráficos ─────────────────────────────────────────────── */
  _charts(dados) {
    // empilhado por dia × categoria
    const { dias, cats, m } = this._matriz(dados);
    if (dias.length) {
      const datasets = cats.map((c, i) => ({
        label: c,
        data: dias.map(d => m[d][c] || 0),
        backgroundColor: this.PALETTE[i % this.PALETTE.length],
        borderWidth: 0
      }));
      mkChart('relChDia', 'bar', dias.map(d => fmtDate(d)), datasets, {
        scales: { x: { stacked: true }, y: { stacked: true } }
      });
    } else {
      this._vazio('relChDia');
    }

    this._grouped('relChCat','doughnut', dados, 'categoria', { cutout:'60%' });
    this._grouped('relChEmp','bar', dados, 'empresa', { indexAxis:'y' });
    this._grouped('relChOp','bar', dados, 'operador', {});
  },

  _vazio(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (ctx) {
      const parent = ctx.closest('.chart-wrap') || ctx.parentElement;
      parent.innerHTML = `<div class="empty-state"><i class="bi bi-bar-chart"></i><p>Sem dados para exibir</p></div>`;
    }
  },

  _grouped(canvasId, type, dados, field, opts) {
    const entries = this._agrupar(dados, field).slice(0, 10);
    if (!entries.length) { this._vazio(canvasId); return; }

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const isRound = ['pie','doughnut'].includes(type);

    mkChart(canvasId, type, labels, [{
      label: 'Produção',
      data: values,
      backgroundColor: isRound ? this.PALETTE.slice(0, labels.length)
                               : this.PALETTE.map(c => c + '30'),
      borderColor: isRound ? '#fff' : this.PALETTE,
      borderWidth: isRound ? 0 : 2,
      borderRadius: isRound ? 0 : 5,
      borderSkipped: false
    }], opts);
  },

  /* ── Exportações ──────────────────────────────────────────── */
  /* exporta a tabela dia × categoria (o relatório formatado) */
  exportarTabela() {
    const dados = this._filtrar();
    if (!dados.length) return toast('Sem dados para exportar', 'warning');

    const { dias, cats, m, totDia, totCat, total } = this._matriz(dados);
    const linhas = dias.map(d => {
      const linha = { Dia: fmtDate(d) };
      cats.forEach(c => linha[c] = m[d][c] || 0);
      linha['Total'] = totDia[d];
      return linha;
    });
    // linha de total
    const totalRow = { Dia: 'TOTAL' };
    cats.forEach(c => totalRow[c] = totCat[c] || 0);
    totalRow['Total'] = total;
    linhas.push(totalRow);

    // consumo de material como aba/linhas extras
    const c = this._consumo(dados);
    linhas.push({});
    linhas.push({ Dia: 'CONSUMO DE MATERIAL', Total: '' });
    linhas.push({ Dia: 'Folhas PVC', Total: c.pvc });
    linhas.push({ Dia: 'Folhas Overlay', Total: c.overlay });
    linhas.push({ Dia: 'Folhas de Chip', Total: c.folhasChip });
    linhas.push({ Dia: 'Chips (un)', Total: c.chips });

    const ws = XLSX.utils.json_to_sheet(linhas, { header: ['Dia', ...cats, 'Total'] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
    XLSX.writeFile(wb, 'relatorio_producao.xlsx');
  },

  /* exporta os lançamentos brutos filtrados */
  exportar() {
    exportExcel(this._filtrar(), 'producao_bruto');
  }
};
