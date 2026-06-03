/**
 * RH Sim — dashboard.js
 * Visão executiva: KPIs + produção por categoria + estoque/consumo de
 * materiais + rankings (empresas/operadores) + alertas de estoque.
 * Folhas sempre em número inteiro (arredondado p/ cima).
 */

const Dashboard = {
  PALETTE: ['#0D6EFD','#198754','#FFC107','#DC3545','#0DCAF0','#6F42C1','#FD7E14','#20C997','#D63384','#ADB5BD'],

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

    <!-- Produção por categoria (cartões) -->
    <div class="card mb-4">
      <div class="card-header"><span class="card-title"><i class="bi bi-tags me-2"></i>Produção por Categoria (mês)</span></div>
      <div class="card-body"><div class="row g-2" id="catCards"></div></div>
    </div>

    <!-- Charts Row 1: mensal empilhado + rosca categoria -->
    <div class="row g-4 mb-4">
      <div class="col-xl-8 col-12">
        <div class="card h-100">
          <div class="card-header">
            <span class="card-title"><i class="bi bi-bar-chart-line me-2"></i>Produção por Mês e Categoria — ${new Date().getFullYear()}</span>
          </div>
          <div class="card-body"><div class="chart-wrap"><canvas id="chMes"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-pie-chart me-2"></i>Distribuição por Categoria</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="chCategoria"></canvas></div></div>
        </div>
      </div>
    </div>

    <!-- Materiais: estoque + consumo -->
    <div class="row g-4 mb-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-box-seam me-2"></i>Estoque de Materiais</span></div>
          <div class="card-body" id="estoqueWrap"></div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-graph-down me-2"></i>Consumo de Material (mês)</span></div>
          <div class="card-body" id="consumoWrap"></div>
        </div>
      </div>
    </div>

    <!-- Rankings em tabela -->
    <div class="row g-4 mb-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-building me-2"></i>Quem mais pede (Empresas)</span></div>
          <div class="card-body p-0"><div class="table-wrap"><table class="table table-sm mb-0" id="tblEmp"></table></div></div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-person-badge me-2"></i>Quem mais produz (Operadores)</span></div>
          <div class="card-body p-0"><div class="table-wrap"><table class="table table-sm mb-0" id="tblOp"></table></div></div>
        </div>
      </div>
    </div>

    <!-- Charts Row 3: PVC mês + frequência -->
    <div class="row g-4">
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-layers me-2"></i>Consumo de PVC por Mês</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="chPVC"></canvas></div></div>
        </div>
      </div>
      <div class="col-xl-6 col-12">
        <div class="card h-100">
          <div class="card-header"><span class="card-title"><i class="bi bi-cpu me-2"></i>Por Frequência (Chips)</span></div>
          <div class="card-body"><div class="chart-wrap"><canvas id="chFreq"></canvas></div></div>
        </div>
      </div>
    </div>`;
  },

  init() {
    const prods = Store.get('productions') || [];
    const mats  = Store.get('materials')   || [];
    this._kpis(prods, mats);
    this._catCards(prods);
    this._materiais(prods, mats);
    this._rankings(prods);
    this._charts(prods);
    this._stockAlerts(mats);
  },

  _mesAtual() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  },

  /* ── KPIs ─────────────────────────────────────────────────── */
  _kpis(prods, mats) {
    const now = new Date();
    const todayStr = today();
    const ws = new Date(now); ws.setDate(now.getDate() - now.getDay());
    const mon = this._mesAtual();
    const yr  = `${now.getFullYear()}`;

    const sum    = arr => arr.reduce((s,p) => s + (p.quantidade||0), 0);
    const sumPVC = arr => arr.reduce((s,p) => s + Math.ceil(p.folhasPVC||0), 0);

    const todayP = sum(prods.filter(p => p.data === todayStr));
    const weekP  = sum(prods.filter(p => p.data && new Date(p.data+'T00:00:00') >= ws));
    const monthP = sum(prods.filter(p => (p.data||'').startsWith(mon)));
    const yearP  = sum(prods.filter(p => (p.data||'').startsWith(yr)));
    const empAtend = new Set(prods.map(p => p.empresa).filter(Boolean)).size;
    const projAtiv = (Store.get('projects')  || []).filter(p => !['Finalizado','Entregue'].includes(p.status)).length;
    const opAtiv   = (Store.get('operators') || []).filter(o => o.status === 'Ativo').length;
    const pvcMes   = sumPVC(prods.filter(p => (p.data||'').startsWith(mon)));
    const ovlMes   = sumPVC(prods.filter(p => (p.data||'').startsWith(mon) && p.overlay));

    const kpis = [
      { label:'Produção Hoje',      val: fmtNum(todayP),  icon:'calendar-day',   color:'primary', sub:'unidades'   },
      { label:'Produção Semana',    val: fmtNum(weekP),   icon:'calendar-week',  color:'info',    sub:'unidades'   },
      { label:'Produção Mês',       val: fmtNum(monthP),  icon:'calendar-month', color:'success', sub:'unidades'   },
      { label:'Produção Ano',       val: fmtNum(yearP),   icon:'calendar',       color:'warning', sub:'unidades'   },
      { label:'Empresas Atendidas', val: fmtNum(empAtend),icon:'building',       color:'purple',  sub:'empresas'   },
      { label:'Projetos Ativos',    val: fmtNum(projAtiv),icon:'kanban',         color:'primary', sub:'projetos'   },
      { label:'Operadores Ativos',  val: fmtNum(opAtiv),  icon:'people',         color:'success', sub:'operadores' },
      { label:'PVC Consumido/Mês',  val: fmtNum(pvcMes),  icon:'layers',         color:'orange',  sub:'folhas'     },
      { label:'Overlay Consumido',  val: fmtNum(ovlMes),  icon:'stack',          color:'danger',  sub:'folhas/mês' },
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

  /* ── Cartões de produção por categoria (mês atual) ────────── */
  _catCards(prods) {
    const wrap = document.getElementById('catCards');
    if (!wrap) return;
    const mon = this._mesAtual();
    const doMes = prods.filter(p => (p.data||'').startsWith(mon));

    const byCat = {};
    doMes.forEach(p => { if (p.categoria) byCat[p.categoria] = (byCat[p.categoria]||0) + (p.quantidade||0); });
    const cats = CATEGORIAS.filter(c => byCat[c]);

    if (!cats.length) {
      wrap.innerHTML = '<div class="col-12 text-secondary" style="font-size:13px">Nenhuma produção neste mês.</div>';
      return;
    }

    wrap.innerHTML = cats.map((c, i) => `
      <div class="col-md-3 col-6">
        <div class="report-stat" style="border-left:4px solid ${this.PALETTE[CATEGORIAS.indexOf(c) % this.PALETTE.length]}">
          <div class="report-stat-label">${c}</div>
          <div class="report-stat-value" style="font-size:22px">${fmtNum(byCat[c])}</div>
          <div class="report-stat-sub">unidades</div>
        </div>
      </div>`).join('');
  },

  /* ── Materiais: estoque (barras) + consumo do mês ─────────── */
  _materiais(prods, mats) {
    // Estoque atual de cada material com barra relativa ao mínimo
    const est = document.getElementById('estoqueWrap');
    if (est) {
      if (!mats.length) {
        est.innerHTML = '<div class="text-secondary" style="font-size:13px">Nenhum material cadastrado.</div>';
      } else {
        est.innerHTML = mats.map(m => {
          // referência visual: 100% = 2x o mínimo (acima disso, barra cheia)
          const ref = (m.minimo || 0) * 2 || (m.estoque || 1);
          const pct = Math.max(0, Math.min(100, Math.round((m.estoque / ref) * 100)));
          const critico = m.estoque <= m.minimo;
          const atencao = !critico && m.estoque <= m.minimo * 1.5;
          const cor = critico ? 'bg-danger' : (atencao ? 'bg-warning' : 'bg-success');
          return `
          <div class="mb-2">
            <div class="d-flex justify-content-between" style="font-size:13px">
              <span class="fw-semibold">${m.nome}</span>
              <span style="font-family:'DM Mono',monospace">${fmtNum(m.estoque)} <span class="text-secondary">/ mín ${fmtNum(m.minimo)}</span></span>
            </div>
            <div class="progress" style="height:7px"><div class="progress-bar ${cor}" style="width:${pct}%"></div></div>
          </div>`;
        }).join('');
      }
    }

    // Consumo de cada material no mês (deduzido da produção)
    const con = document.getElementById('consumoWrap');
    if (con) {
      const mon = this._mesAtual();
      const doMes = prods.filter(p => (p.data||'').startsWith(mon));
      const consumo = {};
      const add = (nome, q) => { if (q>0) consumo[nome] = (consumo[nome]||0) + q; };

      doMes.forEach(p => {
        const folhas = Math.ceil(p.folhasPVC || 0);
        if (p.pvc) add(p.pvc, folhas);
        if (p.overlay) add('Overlay', folhas);
        if (p.frequencia === 'Mifare') { add('Chip Mifare', p.chips||0); add('Folha de Chip', Math.ceil((p.quantidade||0)/10)); }
        if (p.frequencia === '125Khz') { add('Chip 125Khz', p.chips||0); add('Folha de Chip', Math.ceil((p.quantidade||0)/10)); }
        const cord = ['Cordão 12mm','Cordão 15mm','Cordão 20mm','Cordão 25mm'];
        if (cord.includes(p.categoria)) add(p.categoria, p.quantidade||0);
      });

      const itens = Object.entries(consumo).sort((a,b) => b[1]-a[1]);
      const max = itens.length ? itens[0][1] : 1;

      con.innerHTML = itens.length
        ? itens.map(([nome, q], i) => `
          <div class="mb-2">
            <div class="d-flex justify-content-between" style="font-size:13px">
              <span class="fw-semibold">${nome}</span>
              <span style="font-family:'DM Mono',monospace">${fmtNum(q)}</span>
            </div>
            <div class="progress" style="height:7px"><div class="progress-bar" style="width:${Math.round((q/max)*100)}%;background:${this.PALETTE[i % this.PALETTE.length]}"></div></div>
          </div>`).join('')
        : '<div class="text-secondary" style="font-size:13px">Nenhum consumo neste mês.</div>';
    }
  },

  /* ── Rankings em tabela ───────────────────────────────────── */
  _rankings(prods) {
    const rank = (field) => {
      const map = {};
      prods.forEach(p => { const k = p[field]; if (k) map[k] = (map[k]||0) + (p.quantidade||0); });
      return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8);
    };
    const total = prods.reduce((s,p) => s + (p.quantidade||0), 0) || 1;

    const montaTabela = (entries, rotulo) => {
      if (!entries.length) return `<tbody><tr><td class="text-secondary" style="font-size:13px">Sem dados</td></tr></tbody>`;
      return `
        <thead><tr><th style="width:32px">#</th><th>${rotulo}</th><th class="text-end">Produção</th><th class="text-end">%</th></tr></thead>
        <tbody>${entries.map(([nome, q], i) => `
          <tr>
            <td class="text-secondary">${i+1}</td>
            <td class="fw-semibold">${nome}</td>
            <td class="text-end" style="font-family:'DM Mono',monospace">${fmtNum(q)}</td>
            <td class="text-end text-secondary">${Math.round((q/total)*100)}%</td>
          </tr>`).join('')}</tbody>`;
    };

    const tEmp = document.getElementById('tblEmp');
    const tOp  = document.getElementById('tblOp');
    if (tEmp) tEmp.innerHTML = montaTabela(rank('empresa'),  'Empresa');
    if (tOp)  tOp.innerHTML  = montaTabela(rank('operador'), 'Operador');
  },

  /* ── Charts ───────────────────────────────────────────────── */
  _charts(prods) {
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const yr = new Date().getFullYear();
    const P = this.PALETTE;

    // Produção por mês EMPILHADA por categoria
    const cats = CATEGORIAS.filter(c => prods.some(p => p.categoria === c));
    if (cats.length) {
      const datasets = cats.map((c, i) => ({
        label: c,
        data: MONTHS.map((_, mi) => {
          const k = `${yr}-${String(mi+1).padStart(2,'0')}`;
          return prods.filter(p => (p.data||'').startsWith(k) && p.categoria === c)
                      .reduce((s,p)=>s+(p.quantidade||0),0);
        }),
        backgroundColor: P[CATEGORIAS.indexOf(c) % P.length],
        borderWidth: 0
      }));
      mkChart('chMes','bar', MONTHS, datasets, { scales:{ x:{stacked:true}, y:{stacked:true} } });
    } else {
      this._empty('chMes');
    }

    // Distribuição por categoria (rosca)
    const byCat = {};
    prods.forEach(p => { if(p.categoria) byCat[p.categoria] = (byCat[p.categoria]||0) + (p.quantidade||0); });
    const catK = Object.keys(byCat), catV = Object.values(byCat);
    if (catK.length) {
      mkChart('chCategoria','doughnut', catK, [{ data: catV, backgroundColor: P.slice(0, catK.length), borderWidth:0 }], { cutout:'60%' });
    } else { this._empty('chCategoria'); }

    // PVC por mês (linha) — inteiro
    const byPVC = MONTHS.map((_,i) => {
      const k = `${yr}-${String(i+1).padStart(2,'0')}`;
      return prods.filter(p=>(p.data||'').startsWith(k)).reduce((s,p)=>s+Math.ceil(p.folhasPVC||0),0);
    });
    mkChart('chPVC','line', MONTHS, [{
      label:'Folhas PVC', data: byPVC,
      borderColor:'#FFC107', backgroundColor:'rgba(255,193,7,0.1)',
      fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#FFC107'
    }]);

    // Por frequência (pizza)
    const byFreq = {};
    prods.forEach(p => { if(p.frequencia) byFreq[p.frequencia]=(byFreq[p.frequencia]||0)+(p.quantidade||0); });
    const fK = Object.keys(byFreq), fV = Object.values(byFreq);
    if (fK.length) {
      mkChart('chFreq','pie', fK, [{ data: fV, backgroundColor:['#6F42C1','#DC3545','#20C997','#0DCAF0'], borderWidth:0 }]);
    } else { this._empty('chFreq'); }
  },

  _empty(id) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const parent = ctx.closest('.chart-wrap') || ctx.parentElement;
    parent.innerHTML = `<div class="empty-state"><i class="bi bi-bar-chart"></i><p>Sem dados para exibir</p></div>`;
  },

  /* ── Stock Alerts ─────────────────────────────────────────── */
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