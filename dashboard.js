/**
 * RH Sim — js/dashboard.js
 * Executive dashboard: KPIs + Charts + Stock alerts
 */

const Dashboard = {
  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title"><i class="bi bi-grid-1x2-fill"></i> Dashboard</h1>
        <p class="page-subtitle">Visão executiva da operação</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline-secondary btn-sm" onclick="Dashboard.init()">
          <i class="bi bi-arrow-clockwise me-1"></i>Atualizar
        </button>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid" id="kpiGrid"></div>

    <!-- Stock Alerts -->
    <div id="alertsSection"></div>

    <!-- Charts Row 1 -->
    <div class="row g-4 mb-4">
      <div class="col-xl-8 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-bar-chart-line me-2"></i>Produção por Mês — ${new Date().getFullYear()}</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chMes"></canvas></div>
          </div>
        </div>
      </div>
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-pie-chart me-2"></i>Por Categoria</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chCategoria"></canvas></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row 2 -->
    <div class="row g-4 mb-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-building me-2"></i>Top 10 Empresas</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chEmpresas"></canvas></div>
          </div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-person-badge me-2"></i>Por Operador</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chOperador"></canvas></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row 3 -->
    <div class="row g-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-layers me-2"></i>Consumo de PVC por Mês</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chPVC"></canvas></div>
          </div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-cpu me-2"></i>Por Frequência (Chips)</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap"><canvas id="chFreq"></canvas></div>
          </div>
        </div>
      </div>
    </div>`;
  },

  init() {
    const prods = Store.get('productions') || [];
    const mats  = Store.get('materials')   || [];
    this._kpis(prods, mats);
    this._charts(prods);
    this._stockAlerts(mats);
  },

  /* ── KPI Cards ─────────────────────────────────────────── */
  _kpis(prods, mats) {
    const now  = new Date();
    const todayStr = today();
    const ws  = new Date(now); ws.setDate(now.getDate() - now.getDay());
    const mon  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const yr   = `${now.getFullYear()}`;

    const sum  = arr => arr.reduce((s,p) => s + (p.quantidade||0), 0);
    const sumPVC = arr => arr.reduce((s,p) => s + (p.folhasPVC||0), 0);

    const todayP  = sum(prods.filter(p => p.data === todayStr));
    const weekP   = sum(prods.filter(p => new Date(p.data+'T00:00:00') >= ws));
    const monthP  = sum(prods.filter(p => p.data.startsWith(mon)));
    const yearP   = sum(prods.filter(p => p.data.startsWith(yr)));
    const empAtend = new Set(prods.map(p => p.empresa)).size;
    const projAtiv = (Store.get('projects')  || []).filter(p => !['Finalizado','Entregue'].includes(p.status)).length;
    const opAtiv   = (Store.get('operators') || []).filter(o => o.status === 'Ativo').length;
    const pvcMes   = sumPVC(prods.filter(p => p.data.startsWith(mon)));
    const ovlMes   = sumPVC(prods.filter(p => p.data.startsWith(mon) && p.overlay));

    const kpis = [
      { label:'Produção Hoje',      val: fmtNum(todayP), icon:'calendar-day',   color:'primary', sub:'unidades'     },
      { label:'Produção Semana',    val: fmtNum(weekP),  icon:'calendar-week',  color:'info',    sub:'unidades'     },
      { label:'Produção Mês',       val: fmtNum(monthP), icon:'calendar-month', color:'success', sub:'unidades'     },
      { label:'Produção Ano',       val: fmtNum(yearP),  icon:'calendar',       color:'warning', sub:'unidades'     },
      { label:'Empresas Atendidas', val: fmtNum(empAtend),icon:'building',      color:'purple',  sub:'empresas'     },
      { label:'Projetos Ativos',    val: fmtNum(projAtiv),icon:'kanban',        color:'primary', sub:'projetos'     },
      { label:'Operadores Ativos',  val: fmtNum(opAtiv), icon:'people',         color:'success', sub:'operadores'   },
      { label:'PVC Consumido/Mês',  val: fmtDec(pvcMes), icon:'layers',         color:'orange',  sub:'folhas'       },
      { label:'Overlay Consumido',  val: fmtDec(ovlMes), icon:'stack',          color:'danger',  sub:'folhas/mês'   },
    ];

    const grid = document.getElementById('kpiGrid');
    if (!grid) return;
    grid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon kpi-${k.color}"><i class="bi bi-${k.icon}-fill"></i></div>
        <div class="kpi-body">
          <span class="kpi-label">${k.label}</span>
          <span class="kpi-value">${k.val}</span>
          <span class="kpi-sub">${k.sub}</span>
        </div>
      </div>`).join('');
  },

  /* ── Charts ─────────────────────────────────────────────── */
  _charts(prods) {
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const yr = new Date().getFullYear();
    const PALETTE = ['#0D6EFD','#198754','#FFC107','#DC3545','#0DCAF0','#6F42C1','#FD7E14','#20C997','#D63384','#ADB5BD'];

    // Produção por mês
    const byMon = MONTHS.map((_,i) => {
      const k = `${yr}-${String(i+1).padStart(2,'0')}`;
      return prods.filter(p => p.data.startsWith(k)).reduce((s,p)=>s+(p.quantidade||0),0);
    });
    mkChart('chMes','bar', MONTHS, [{
      label:'Produção', data: byMon,
      backgroundColor:'rgba(13,110,253,0.18)', borderColor:'#0D6EFD',
      borderWidth:2, borderRadius:5, borderSkipped:false
    }]);

    // Por categoria
    const byCat = {};
    prods.forEach(p => { byCat[p.categoria] = (byCat[p.categoria]||0) + (p.quantidade||0); });
    const catK = Object.keys(byCat), catV = Object.values(byCat);
    if (catK.length) {
      mkChart('chCategoria','doughnut', catK, [{
        data: catV, backgroundColor: PALETTE.slice(0, catK.length), borderWidth:0
      }], { cutout:'60%' });
    } else {
      this._empty('chCategoria');
    }

    // Top 10 empresas
    const byEmp = {};
    prods.forEach(p => { if(p.empresa) byEmp[p.empresa] = (byEmp[p.empresa]||0)+(p.quantidade||0); });
    const empE = Object.entries(byEmp).sort((a,b)=>b[1]-a[1]).slice(0,10);
    if (empE.length) {
      mkChart('chEmpresas','bar', empE.map(e=>e[0]), [{
        label:'Produção', data: empE.map(e=>e[1]),
        backgroundColor:'rgba(25,135,84,0.18)', borderColor:'#198754',
        borderWidth:2, borderRadius:5, borderSkipped:false
      }], { indexAxis:'y' });
    } else {
      this._empty('chEmpresas');
    }

    // Por operador
    const byOp = {};
    prods.forEach(p => { if(p.operador) byOp[p.operador] = (byOp[p.operador]||0)+(p.quantidade||0); });
    const opK = Object.keys(byOp), opV = Object.values(byOp);
    if (opK.length) {
      mkChart('chOperador','bar', opK, [{
        label:'Produção', data: opV,
        backgroundColor: PALETTE.map(c=>c+'30'), borderColor: PALETTE,
        borderWidth:2, borderRadius:5, borderSkipped:false
      }]);
    } else {
      this._empty('chOperador');
    }

    // PVC por mês
    const byPVC = MONTHS.map((_,i) => {
      const k = `${yr}-${String(i+1).padStart(2,'0')}`;
      return prods.filter(p=>p.data.startsWith(k)).reduce((s,p)=>s+(p.folhasPVC||0),0);
    });
    mkChart('chPVC','line', MONTHS, [{
      label:'Folhas PVC', data: byPVC,
      borderColor:'#FFC107', backgroundColor:'rgba(255,193,7,0.1)',
      fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#FFC107'
    }]);

    // Por frequência
    const byFreq = {};
    prods.forEach(p => { if(p.frequencia) byFreq[p.frequencia]=(byFreq[p.frequencia]||0)+(p.quantidade||0); });
    const fK = Object.keys(byFreq), fV = Object.values(byFreq);
    if (fK.length) {
      mkChart('chFreq','pie', fK, [{
        data: fV, backgroundColor:['#6F42C1','#DC3545','#20C997'], borderWidth:0
      }]);
    } else {
      this._empty('chFreq');
    }
  },

  _empty(id) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const parent = ctx.closest('.chart-wrap') || ctx.parentElement;
    parent.innerHTML = `<div class="empty-state"><i class="bi bi-bar-chart"></i><p>Sem dados para exibir</p></div>`;
  },

  /* ── Stock Alerts ─────────────────────────────────────── */
  _stockAlerts(mats) {
    const low = mats.filter(m => m.estoque <= m.minimo);
    const sec = document.getElementById('alertsSection');
    if (!sec) return;
    if (!low.length) { sec.innerHTML = ''; return; }

    sec.innerHTML = `
    <div class="card mb-4" style="border-color:var(--danger)">
      <div class="card-header" style="background:var(--danger-soft);border-color:#FCA5A5">
        <span class="card-title text-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>Alertas de Estoque (${low.length})</span>
        <button class="btn btn-sm btn-danger" onclick="navigate('materiais')">Ver Materiais</button>
      </div>
      <div class="card-body">
        <div class="row g-2">
          ${low.map(m => `
          <div class="col-md-4 col-6">
            <div class="alert-stock-item">
              <div>
                <div class="fw-semibold" style="font-size:13px">${m.nome}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${m.un}</div>
              </div>
              <div class="text-end">
                <div class="fw-bold text-danger" style="font-family:'DM Mono',monospace">${fmtNum(m.estoque)}</div>
                <div style="font-size:10px;color:var(--text-secondary)">Mín: ${fmtNum(m.minimo)}</div>
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }
};
