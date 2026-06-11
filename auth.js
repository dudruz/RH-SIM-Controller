/**
 * RH Sim — auth.js  (Login e sessão via Supabase Auth)
 * ------------------------------------------------------------------
 * Carregar APÓS store.js e ANTES de app.js no index.html.
 *
 * Fluxo:
 *  - Auth.boot() roda no DOMContentLoaded.
 *  - Se houver sessão ativa, inicia o app direto (App.init).
 *  - Se não houver, injeta a tela de login e só inicia o app
 *    após autenticação bem-sucedida.
 *  - O botão "Sair" (Auth.logout) encerra a sessão e volta ao login.
 *
 * Usa o mesmo cliente `sb` criado em store.js.
 * ------------------------------------------------------------------ */

const Auth = {
  /* ponto de entrada — decide entre login e app */
  async boot() {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      this._startApp();
    } else {
      this._renderLogin();
    }
    // reage a logout/login disparados em outro lugar
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') this._renderLogin();
    });
  },

  /* inicia o sistema (esconde login, mostra layout, roda App.init) */
  async _startApp() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('login-mode');

    // descobre o papel do usuário logado (tabela profiles).
    // Sem perfil cadastrado => 'admin' (para o dono não se trancar fora).
    try {
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      let role = 'admin';
      if (uid) {
        const { data: prof } = await sb.from('profiles').select('role,nome').eq('id', uid).maybeSingle();
        if (prof && prof.role) role = prof.role;
      }
      App.role = role;        // papel real da conta
      App.roleView = role;    // papel em exibição (o simulador altera só este)
    } catch { App.role = 'admin'; App.roleView = 'admin'; }

    App.init();
  },

  /* injeta a tela de login sobre tudo */
  _renderLogin() {
    document.body.classList.add('login-mode');
    // remove overlay anterior se existir
    const old = document.getElementById('loginOverlay');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = 'loginOverlay';
    el.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <div class="login-brand-icon"><i class="bi bi-shield-fill-check"></i></div>
          <div>
            <div class="login-brand-name">RH Sim</div>
            <div class="login-brand-sub">Gestão Operacional</div>
          </div>
        </div>
        <h5 class="login-title">Acesso ao sistema</h5>
        <div class="login-field">
          <label class="form-label">E-mail</label>
          <input type="email" class="form-control" id="loginEmail" autocomplete="username">
        </div>
        <div class="login-field">
          <label class="form-label">Senha</label>
          <input type="password" class="form-control" id="loginPass" autocomplete="current-password">
        </div>
        <div class="login-error" id="loginError"></div>
        <button class="btn btn-primary w-100" id="loginBtn">
          <i class="bi bi-box-arrow-in-right me-1"></i>Entrar
        </button>
      </div>`;
    document.body.appendChild(el);

    const btn   = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail');
    const pass  = document.getElementById('loginPass');

    btn.onclick = () => this.login();
    // Enter envia
    [email, pass].forEach(i => i.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.login();
    }));
    email.focus();
  },

  /* tenta autenticar */
  async login() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    const btn   = document.getElementById('loginBtn');

    errEl.textContent = '';
    if (!email || !pass) { errEl.textContent = 'Preencha e-mail e senha.'; return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Entrando...';

    const { error } = await sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
      errEl.textContent = 'E-mail ou senha incorretos.';
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Entrar';
      return;
    }
    this._startApp();
  },

  /* encerra a sessão */
  async logout() {
    await sb.auth.signOut();
    location.reload();   // estado limpo; o boot mostrará o login
  }
};
