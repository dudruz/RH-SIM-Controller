/**
 * RH Sim — Gestão Operacional
 * js/app.js — Core: router, storage, utils, backup, config
 */

/* ============================================================
   CONSTANTS
   ============================================================ */
const CATEGORIAS  = ['Crachá','Credencial Fina','Credencial Grossa','Cordão 12mm','Cordão 15mm','Cordão 20mm','Cordão 25mm','Cartão RFID','Smartcard'];
const PVC_TYPES   = ['PVC 0,18','PVC 0,30'];
const FREQUENCIAS = ['Sem Chip','125Khz','Mifare'];
const STATUS_PROJ = ['Recebido','Em Desenvolvimento','Produção','Finalizado','Entregue'];

/* ============================================================
   STORAGE
   ============================================================
   O objeto Store agora vive em store.js (Supabase + cache em
   memória) e é carregado ANTES deste arquivo no index.html.
   A leitura (Store.get) continua síncrona, lendo do cache.
   ============================================================ */

/* ============================================================
   CORE APP
   ============================================================ */
const App = {
  charts: {},   // active Chart.js instances

  async init() {
    this._updateDate();
    // Baixa todas as tabelas do Supabase para o cache em memória.
    // A partir daqui, Store.get() é síncrono (lê do cache).
    try {
      await Store.sync();
    } catch (e) {
      console.error('Falha ao sincronizar com o banco:', e);
      toast('Não foi possível conectar ao banco de dados.', 'danger');
    }
    this._checkAlerts();
    this.applyRole();
    navigate(this.roleView === 'producao' ? 'producoes' : 'dashboard');
    setInterval(() => this._updateDate(), 60000);
  },

  /* papel da conta (definido no login) e papel em exibição (simulador) */
  role: 'admin',
  roleView: 'admin',

  /* aplica o papel à interface: produção só vê Produções */
  applyRole() {
    const producao = this.roleView === 'producao';
    document.querySelectorAll('.nav-link-item').forEach(el => {
      const pg = el.dataset.page;
      el.style.display = (producao && pg !== 'producoes') ? 'none' : '';
    });
    // botões da topbar que produção não usa
    const alertBtn = document.getElementById('alertBtn');
    if (alertBtn) alertBtn.style.display = producao ? 'none' : '';
    this._renderSimulador();
  },

  /* botão Simular Acesso (apenas para contas admin) no rodapé da sidebar */
  _renderSimulador() {
    let btn = document.getElementById('btnSimular');
    if (this.role !== 'admin') { if (btn) btn.remove(); return; }
    if (!btn) {
      const footer = document.querySelector('.sidebar-footer');
      if (!footer) return;
      footer.insertAdjacentHTML('afterbegin',
        `<button id="btnSimular" class="btn btn-sm btn-outline-secondary w-100 mb-2" onclick="App.toggleSimulacao()"></button>`);
      btn = document.getElementById('btnSimular');
    }
    btn.innerHTML = this.roleView === 'producao'
      ? '<i class="bi bi-arrow-counterclockwise me-1"></i>Voltar a Admin'
      : '<i class="bi bi-eye me-1"></i>Simular Produção';
  },

  /* alterna a visão entre admin e produção (não troca a conta) */
  toggleSimulacao() {
    this.roleView = this.roleView === 'producao' ? 'admin' : 'producao';
    this.applyRole();
    navigate(this.roleView === 'producao' ? 'producoes' : 'dashboard');
    toast(this.roleView === 'producao' ? 'Visualizando como Produção' : 'De volta como Admin');
  },

  /* O seed inicial de materiais agora é feito UMA vez via SQL no Supabase
     (Fase 3 da migração). Não há mais seed local. */

  _updateDate() {
    const el = document.getElementById('currentDate');
    if (el) el.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday:'long', day:'2-digit', month:'long', year:'numeric'
    });
  },

  _checkAlerts() {
    const mats = Store.get('materials') || [];
    const low  = mats.filter(m => m.estoque <= m.minimo).length;
    const dot  = document.getElementById('alertDot');
    if (dot) dot.style.display = low > 0 ? 'block' : 'none';
  },

  destroyCharts() {
    Object.values(this.charts).forEach(c => { try { c.destroy(); } catch {} });
    this.charts = {};
  }
};

/* ============================================================
   ROUTER
   ============================================================ */
function navigate(page) {
  // papel produção: só a tela de Produções
  if (App.roleView === 'producao' && page !== 'producoes') page = 'producoes';

  // Destroy old charts
  App.destroyCharts();

  // Update active nav link
  document.querySelectorAll('.nav-link-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Breadcrumb
  const labels = {
    dashboard:'Dashboard', producoes:'Produções', materiais:'Materiais',
    empresas:'Empresas', projetos:'Projetos', operadores:'Operadores',
    relatorios:'Relatórios', backup:'Backup', configuracoes:'Configurações'
  };
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.innerHTML = `<li class="breadcrumb-item active">${labels[page] || page}</li>`;

  // Render
  const content = document.getElementById('pageContent');
  switch (page) {
    case 'dashboard':     content.innerHTML = Dashboard.render();    Dashboard.init();    break;
    case 'producoes':     content.innerHTML = Producao.render();     Producao.init();     break;
    case 'materiais':     content.innerHTML = Materiais.render();    Materiais.init();    break;
    case 'empresas':      content.innerHTML = Empresas.render();     Empresas.init();     break;
    case 'projetos':      content.innerHTML = Projetos.render();     Projetos.init();     break;
    case 'operadores':    content.innerHTML = Operadores.render();   Operadores.init();   break;
    case 'relatorios':    content.innerHTML = Relatorios.render();   Relatorios.init();   break;
    case 'backup':        content.innerHTML = renderBackup();        initBackup();        break;
    case 'configuracoes': content.innerHTML = renderConfig();                             break;
    default:              content.innerHTML = '<div class="p-4 text-muted">Página não encontrada.</div>';
  }

  App._checkAlerts();
  content.scrollTop = 0;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('mainWrapper').classList.toggle('expanded');
}

/* ============================================================
   BUSINESS LOGIC HELPERS
   ============================================================ */
/** KIT por RODADA (folha fechada / multilayout).
 *  Cada rodada consome um kit FIXO de folhas, completada ou não:
 *    Crachá:            10 peças/folha · 2 PVC (frente+verso) · 2 overlay
 *    Credencial Fina:    4 peças/folha · 1 PVC (só frente)    · 2 overlay
 *    Credencial Grossa:  4 peças/folha · 2 PVC (frente+verso) · 2 overlay
 *    Cartão RFID/Smart: 10 peças/folha · 2 PVC                · 2 overlay · 1 folha de chip
 *    Cordões: não usam folhas. */
function kitRodada(categoria) {
  switch (categoria) {
    case 'Crachá':            return { pecas:10, pvc:2, overlay:2, chipFolha:1 };
    case 'Credencial Fina':   return { pecas:4,  pvc:1, overlay:2, chipFolha:1 };
    case 'Credencial Grossa': return { pecas:4,  pvc:2, overlay:2, chipFolha:1 };
    case 'Cartão RFID':       return { pecas:10, pvc:2, overlay:2, chipFolha:1 };
    case 'Smartcard':         return { pecas:10, pvc:2, overlay:2, chipFolha:1 };
    default:                  return { pecas:0,  pvc:0, overlay:0, chipFolha:0 }; // cordões
  }
}

/** Quantas RODADAS uma quantidade exige (folhas fechadas, arredonda p/ cima) */
function calcRodadas(categoria, qtd) {
  const kit = kitRodada(categoria);
  if (kit.pecas === 0 || qtd <= 0) return 0;
  return Math.ceil(qtd / kit.pecas);
}

/** Mantido para compatibilidade: quantos itens cabem em uma folha */
function itensPorFolha(categoria) {
  return kitRodada(categoria).pecas;
}

/** Folhas PVC de um lançamento AVULSO (rodada própria, kit cheio).
 *  Ex.: 12 crachás = 2 rodadas = 4 folhas PVC. */
function calcFolhasPVC(categoria, qtd) {
  return calcRodadas(categoria, qtd) * kitRodada(categoria).pvc;
}

/** Folhas de OVERLAY de um lançamento avulso (se overlay ligado) */
function calcFolhasOverlay(categoria, qtd) {
  return calcRodadas(categoria, qtd) * kitRodada(categoria).overlay;
}

/** Folhas de CHIP: 1 por rodada quando a produção tem chip */
function calcFolhasChip(frequencia, qtd, categoria) {
  if (!frequencia || frequencia === 'Sem Chip' || qtd <= 0) return 0;
  const r = calcRodadas(categoria || 'Crachá', qtd);
  return r * (kitRodada(categoria || 'Crachá').chipFolha || 0);
}

/** Chips avulsos utilizados por frequência (1 por peça com chip) */
function calcChips(frequencia, qtd) {
  return (!frequencia || frequencia === 'Sem Chip') ? 0 : qtd;
}

/** Deduz estoque automaticamente após registrar produção.
 *  Agora é async: ajusta os materiais no cache e persiste as
 *  linhas alteradas no Supabase em lote (Store.saveBatch). */
async function deductStock(prod) {
  const mats = Store.get('materials');   // cópia do cache
  const alterados = new Set();           // ids de materiais que mudaram

  const deduct = (nome, qtd) => {
    const m = mats.find(x => x.nome === nome);
    if (m && qtd > 0) {
      m.estoque = Math.max(0, m.estoque - qtd);
      Store._patchLocal('materials', m.id, { estoque: m.estoque }); // reflete no cache
      alterados.add(m.id);
    }
  };

  // PVC (folhas calculadas pelo kit da rodada; 0 para itens de rodada multilayout)
  if (prod.pvc && prod.folhasPVC > 0) deduct(prod.pvc, prod.folhasPVC);

  // Overlay: kit por rodada (ex.: crachá = 2 folhas/rodada), se overlay ligado
  if (prod.overlay && prod.folhasPVC > 0) {
    deduct('Overlay', calcFolhasOverlay(prod.categoria, prod.quantidade));
  }

  // Chips avulsos (1 por peça)
  if (prod.frequencia === 'Mifare')  deduct('Chip Mifare', prod.chips);
  if (prod.frequencia === '125Khz')  deduct('Chip 125Khz', prod.chips);

  // Folha de chip: 1 por rodada quando há chip (e o lançamento carrega folhas)
  if (prod.folhasPVC > 0) {
    const folhasChip = calcFolhasChip(prod.frequencia, prod.quantidade, prod.categoria);
    if (folhasChip > 0) deduct('Folha de Chip', folhasChip);
  }

  // Cordões (1 unidade por peça)
  const cordaoMap = {
    'Cordão 12mm': 'Cordão 12mm', 'Cordão 15mm': 'Cordão 15mm',
    'Cordão 20mm': 'Cordão 20mm', 'Cordão 25mm': 'Cordão 25mm'
  };
  if (cordaoMap[prod.categoria]) deduct(cordaoMap[prod.categoria], prod.quantidade);

  // persiste no banco apenas os materiais que mudaram
  const rows = mats.filter(m => alterados.has(m.id));
  if (rows.length) await Store.saveBatch('materials', rows);
}

/** Baixa de estoque de uma RODADA multilayout (folhas pelo kit, UMA vez).
 *  Os chips avulsos e cordões são baixados por item (deductStock dos itens
 *  com folhasPVC=0), então aqui só saem as FOLHAS. */
async function deductStockRodada(run) {
  const mats = Store.get('materials');
  const alterados = new Set();
  const deduct = (nome, qtd) => {
    const m = mats.find(x => x.nome === nome);
    if (m && qtd > 0) {
      m.estoque = Math.max(0, m.estoque - qtd);
      Store._patchLocal('materials', m.id, { estoque: m.estoque });
      alterados.add(m.id);
    }
  };
  if (run.pvc && run.pvc_folhas > 0)  deduct(run.pvc, run.pvc_folhas);
  if (run.overlay_folhas > 0)         deduct('Overlay', run.overlay_folhas);
  if (run.chip_folhas > 0)            deduct('Folha de Chip', run.chip_folhas);

  const rows = mats.filter(m => alterados.has(m.id));
  if (rows.length) await Store.saveBatch('materials', rows);
}

/* ============================================================
   UTILITIES
   ============================================================ */
const genId = () => Date.now() + Math.floor(Math.random() * 9999);
const today = () => new Date().toISOString().split('T')[0];
const fmtDate = s => { if (!s) return '-'; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; };
const fmtNum  = n => Number(n||0).toLocaleString('pt-BR');
const fmtDec  = n => Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1});

/* ── Toast ───────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const icons = { success:'check-circle-fill', danger:'x-circle-fill', warning:'exclamation-triangle-fill', info:'info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white bg-${type} border-0 show`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body"><i class="bi bi-${icons[type]||'info-circle-fill'}"></i>${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
    </div>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ── Confirm dialog ─────────────────────────────────────── */
function confirm(msg, cb) {
  document.getElementById('confirmMessage').textContent = msg;
  const oldBtn = document.getElementById('confirmBtn');
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
  newBtn.onclick = () => { modal.hide(); cb(); };
  modal.show();
}

/* ── File download helper ───────────────────────────────── */
function dlFile(name, content, mime) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], {type:mime})),
    download: name
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Export helpers ─────────────────────────────────────── */
function exportCSV(data, name) {
  if (!data.length) return toast('Sem dados para exportar', 'warning');
  const h = Object.keys(data[0]);
  const csv = [h.join(','), ...data.map(r => h.map(k => `"${r[k]??''}"`).join(','))].join('\n');
  dlFile(`${name}.csv`, csv, 'text/csv;charset=utf-8');
  toast('CSV exportado!');
}
function exportJSON(data, name) {
  if (!data.length) return toast('Sem dados para exportar', 'warning');
  dlFile(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('JSON exportado!');
}
function exportExcel(data, name) {
  if (!data.length) return toast('Sem dados para exportar', 'warning');
  if (typeof XLSX === 'undefined') return exportCSV(data, name);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${name}.xlsx`);
  toast('Excel exportado!');
}

/* ── Chart factory ──────────────────────────────────────── */
function mkChart(id, type, labels, datasets, opts = {}) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  const isDoughnut = ['pie','doughnut'].includes(type);
  const c = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: isDoughnut ? 'right' : 'top',
          labels: { font: { family: 'Poppins', size: 11 }, color: '#64748B', boxWidth: 11, padding: 14 }
        },
        tooltip: { titleFont: { family:'Poppins' }, bodyFont: { family:'Poppins' } }
      },
      scales: isDoughnut ? {} : {
        x: { grid: { color: '#F1F5F9' }, ticks: { color: '#64748B', font: { family:'Poppins', size:11 } } },
        y: { grid: { color: '#F1F5F9' }, ticks: { color: '#64748B', font: { family:'Poppins', size:11 } } }
      },
      ...opts
    }
  });
  App.charts[id] = c;
  return c;
}

/* ── Status badge HTML ──────────────────────────────────── */
function statusBadge(status) {
  const map = {
    'Recebido':          'badge badge-secondary',
    'Em Desenvolvimento':'badge badge-warning',
    'Produção':          'badge badge-primary',
    'Finalizado':        'badge badge-success',
    'Entregue':          'badge badge-info',
    'Ativo':             'badge badge-success',
    'Inativo':           'badge badge-danger',
  };
  return `<span class="${map[status]||'badge badge-secondary'}">${status}</span>`;
}

/* ── Select options builder ─────────────────────────────── */
function buildOptions(arr, valueField, labelField, selected = '') {
  return arr.map(i => {
    const v = typeof i === 'string' ? i : i[valueField];
    const l = typeof i === 'string' ? i : i[labelField];
    return `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`;
  }).join('');
}

/* ============================================================
   BACKUP MODULE
   ============================================================ */
function renderBackup() {
  return `
  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title"><i class="bi bi-cloud-arrow-up-fill"></i> Backup</h1>
      <p class="page-subtitle">Exportar e restaurar dados do sistema</p>
    </div>
  </div>

  <div class="row g-4 mb-4">
    <div class="col-md-6">
      <div class="backup-option-card" onclick="doExportBackup()">
        <div class="backup-option-icon text-primary"><i class="bi bi-cloud-arrow-down-fill"></i></div>
        <h5>Exportar Backup</h5>
        <p class="text-secondary small mb-3">Salva todos os dados em um arquivo JSON</p>
        <button class="btn btn-primary"><i class="bi bi-download me-2"></i>Exportar Backup</button>
      </div>
    </div>
    <div class="col-md-6">
      <div class="backup-option-card">
        <div class="backup-option-icon text-success"><i class="bi bi-cloud-arrow-up-fill"></i></div>
        <h5>Importar Backup</h5>
        <p class="text-secondary small mb-3">Restaura dados a partir de um arquivo JSON</p>
        <label class="btn btn-success mb-0">
          <i class="bi bi-upload me-2"></i>Importar Backup
          <input type="file" accept=".json" onchange="doImportBackup(this)" style="display:none">
        </label>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title"><i class="bi bi-info-circle me-2"></i>Resumo dos Dados</span></div>
    <div class="card-body">
      <div class="row g-3" id="backupInfo"></div>
    </div>
  </div>`;
}

function initBackup() {
  const keys = ['productions','companies','projects','operators','materials'];
  const labels = { productions:'Produções', companies:'Empresas', projects:'Projetos', operators:'Operadores', materials:'Materiais' };
  const info = document.getElementById('backupInfo');
  if (!info) return;
  info.innerHTML = keys.map(k => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="stat-mini">
        <span class="stat-mini-label">${labels[k]}</span>
        <span class="stat-mini-value">${(Store.get(k)||[]).length}</span>
      </div>
    </div>`).join('');
}

function doExportBackup() {
  dlFile(`backup_rhsim_${today()}.json`,
    JSON.stringify({ version:'1.0', timestamp: new Date().toISOString(), data: Store.all() }, null, 2),
    'application/json');
  toast('Backup exportado com sucesso!');
}

function doImportBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const backup = JSON.parse(e.target.result);
      const data = backup.data || backup;
      confirm('ATENÇÃO: Isso ADICIONA os registros do backup ao banco atual (não apaga os existentes). Continuar?', async () => {
        try {
          // Para cada tabela do backup, insere os registros sem id
          // (o banco gera novos UUIDs). Evita conflito de chave.
          for (const [table, rows] of Object.entries(data)) {
            if (!Array.isArray(rows)) continue;
            for (const row of rows) {
              const { id, created_at, ...rest } = row; // descarta id/created_at antigos
              await Store.insert(table, rest);
            }
          }
          toast('Backup importado com sucesso!');
          initBackup();
          App._checkAlerts();
        } catch (err) {
          console.error(err);
          toast('Erro ao importar parte do backup. Veja o console.', 'danger');
        }
      });
    } catch { toast('Arquivo de backup inválido', 'danger'); }
  };
  reader.readAsText(file);
}

/* ============================================================
   CONFIG MODULE
   ============================================================ */
function renderConfig() {
  return `
  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title"><i class="bi bi-gear-fill"></i> Configurações</h1>
      <p class="page-subtitle">Configurações gerais do sistema</p>
    </div>
  </div>
  <div class="row g-4">
    <div class="col-md-6">
      <div class="card">
        <div class="card-header"><span class="card-title">Dados do Sistema</span></div>
        <div class="card-body">
          <p class="text-secondary small mb-3">Limpar todos os dados operacionais (empresas, projetos, operadores e produções). Os materiais padrão serão restaurados.</p>
          <button class="btn btn-danger" onclick="clearAllData()">
            <i class="bi bi-trash3-fill me-2"></i>Limpar Dados Operacionais
          </button>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card">
        <div class="card-header"><span class="card-title">Sobre o Sistema</span></div>
        <div class="card-body">
          <p class="mb-1"><strong>RH Sim — Gestão Operacional</strong></p>
          <p class="text-secondary small mb-1">Versão 1.0.0</p>
          <p class="text-secondary small">Sistema de controle operacional para fabricação de crachás, credenciais, cartões RFID, smartcards e materiais para eventos.</p>
        </div>
      </div>
    </div>
  </div>`;
}

async function clearAllData() {
  confirm('ATENÇÃO: Isso apagará produções, empresas, projetos e operadores PERMANENTEMENTE do banco de dados (todos os usuários). Os materiais NÃO são afetados. Continuar?', async () => {
    try {
      // Apaga cada registro das tabelas operacionais no Supabase.
      // Materiais são preservados (foram semeados via SQL).
      for (const table of ['productions','companies','projects','operators']) {
        const rows = Store.get(table);
        for (const r of rows) await Store.remove(table, r.id);
      }
      toast('Dados operacionais apagados.', 'warning');
      App._checkAlerts();
      navigate('configuracoes');
    } catch (err) {
      console.error(err);
      toast('Erro ao limpar dados. Veja o console.', 'danger');
    }
  });
}
