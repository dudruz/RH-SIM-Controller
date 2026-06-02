/**
 * RH Sim — js/relatorios.js
 * Dashboard analítico com filtros + indicadores + gráficos
 *
 * Lê Store 'productions' (e listas auxiliares para popular filtros).
 * Reaproveita os helpers globais mkChart() e App.charts (limpos pelo router
 * em navigate() via App.destroyCharts()). Sempre que reaplica filtros,
 * destrói os gráficos antigos antes de redesenhar.
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
        <button class="btn btn-outline-secondary btn-sm" onclick="Relatorios.exportar()">
          <i class="bi bi-file-earmark-excel me-1"></i>Exportar Filtrado
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

    <!-- Indicadores -->
    <div class="row g-3 mb-4" id="relStats"></div>

    <!-- Gráficos -->
    <div class="row g-4 mb-4">
      <div class="col-xl-8 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-bar-chart-line me-2"></i>Produção Mensal</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChMes"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-pie-chart me-2"></i>Por Categoria</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChCat"></canvas></div></div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-building me-2"></i>Por Empresa</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChEmp"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-person-badge me-2"></i>Por Operador</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="relChOp"></canvas></div></div>
        </div>
      </div>
    </div>`;
  },

  init() {
    this.apply();
  },

  /* aplica os filtros sobre o conjunto de produções */
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

  /* recalcula tudo: indicadores + gráficos */
  apply() {
    App.destroyCharts();              // limpa gráficos anteriores
    const dados = this._filtrar();
    this._stats(dados);
    this._charts(dados);
  },

  limpar() {
    ['relDtIni','relDtFim','relEmpresa','relProjeto','relOperador','relCategoria']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    this.apply();
  },

  /* ── Indicadores numéricos ────────────────────────────────── */
  _stats(dados) {
    const totalProd    = dados.reduce((s,p) => s + (p.quantidade||0), 0);
    const totalFolhas  = dados.reduce((s,p) => s + (p.folhasPVC||0), 0);
    const totalOverlay = dados.filter(p => p.overlay).reduce((s,p) => s + (p.folhasPVC||0), 0);
    const totalChips   = dados.reduce((s,p) => s + (p.chips||0), 0);
    const nEmpresas    = new Set(dados.map(p => p.empresa).filter(Boolean)).size;
    const nRegistros   = dados.length;

    const stats = [
      { label:'Produção Total',  val: fmtNum(totalProd),    sub:'unidades'  },
      { label:'Registros',       val: fmtNum(nRegistros),   sub:'lançamentos' },
      { label:'Empresas',        val: fmtNum(nEmpresas),    sub:'atendidas' },
      { label:'Consumo PVC',     val: fmtDec(totalFolhas),  sub:'folhas'    },
      { label:'Consumo Overlay', val: fmtDec(totalOverlay), sub:'folhas'    },
      { label:'Consumo Chips',   val: fmtNum(totalChips),   sub:'unidades'  },
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

  /* ── Gráficos ─────────────────────────────────────────────── */
  _charts(dados) {
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const yr = new Date().getFullYear();

    /* Produção mensal (ano corrente) */
    const byMon = MONTHS.map((_, i) => {
      const k = `${yr}-${String(i+1).padStart(2,'0')}`;
      return dados.filter(p => (p.data||'').startsWith(k)).reduce((s,p)=>s+(p.quantidade||0),0);
    });
    mkChart('relChMes','bar', MONTHS, [{
      label:'Produção', data: byMon,
      backgroundColor:'rgba(13,110,253,0.18)', borderColor:'#0D6EFD',
      borderWidth:2, borderRadius:5, borderSkipped:false
    }]);

    /* Por categoria (doughnut) */
    this._grouped('relChCat','doughnut', dados, 'categoria', { cutout:'60%' });

    /* Por empresa (barras horizontais) */
    this._grouped('relChEmp','bar', dados, 'empresa', { indexAxis:'y' });

    /* Por operador (barras verticais) */
    this._grouped('relChOp','bar', dados, 'operador', {});
  },

  /* helper: agrupa por um campo e desenha o gráfico (ou estado vazio) */
  _grouped(canvasId, type, dados, field, opts) {
    const map = {};
    dados.forEach(p => { const k = p[field]; if (k) map[k] = (map[k]||0) + (p.quantidade||0); });
    const entries = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 10);

    if (!entries.length) {
      const ctx = document.getElementById(canvasId);
      if (ctx) {
        const parent = ctx.closest('.chart-wrap') || ctx.parentElement;
        parent.innerHTML = `<div class="empty-state"><i class="bi bi-bar-chart"></i><p>Sem dados para exibir</p></div>`;
      }
      return;
    }

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

  /* exporta o conjunto atualmente filtrado para Excel */
  exportar() {
    exportExcel(this._filtrar(), 'relatorio_producao');
  }
};
