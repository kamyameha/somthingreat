(function () {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;

  const resetClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: {
      storageKey: 'somthingreat-password-session-fix',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  function appUser() {
    if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    return window.currentUser || null;
  }

  function setAppUser(user) {
    if (typeof currentUser !== 'undefined') currentUser = user;
    window.currentUser = user;
  }

  function resetLinkMessage() {
    return 'This reset link was not recognised. Please request a new reset link and open it directly from your email.';
  }

  function showAuthMessage(message, type = 'info') {
    if (typeof setAuthMessage === 'function') {
      setAuthMessage(message, type);
      return;
    }
    const el = document.getElementById('authMessage');
    if (el) {
      el.textContent = message || '';
      el.dataset.type = type;
    }
  }

  function authParams() {
    const initialSearch = typeof INITIAL_AUTH_SEARCH !== 'undefined' ? INITIAL_AUTH_SEARCH : '';
    const initialHash = typeof INITIAL_AUTH_HASH !== 'undefined' ? INITIAL_AUTH_HASH : '';
    const combined = [
      initialSearch.replace(/^\?/, ''),
      initialHash.replace(/^#/, ''),
      window.location.search.replace(/^\?/, ''),
      window.location.hash.replace(/^#/, '')
    ].join('&');
    return new URLSearchParams(combined);
  }

  function resetRedirectUrl() {
    const redirectUrl = new URL(window.location.origin + window.location.pathname);
    redirectUrl.searchParams.set('reset-password', '1');
    return redirectUrl.toString();
  }

  async function waitForSession(client, attempts = 12, delayMs = 250) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { data } = await client.auth.getSession();
      if (data?.session?.user) return data.session;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return null;
  }

  async function getExistingSession(client) {
    if (!client?.auth?.getSession) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.user ? data.session : null;
  }

  async function ensurePasswordSession() {
    let session = await getExistingSession(resetClient);
    if (session) return { client: resetClient, session };

    if (window.appSupabaseClient) {
      session = await getExistingSession(window.appSupabaseClient);
      if (session) return { client: window.appSupabaseClient, session };
    }

    const params = authParams();
    if (params.get('error') || params.get('error_code')) return { client: resetClient, session: null };

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');

    if (accessToken && refreshToken) {
      const { data, error } = await resetClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!error && data?.session?.user) return { client: resetClient, session: data.session };
    }

    if (code) {
      const { data, error } = await resetClient.auth.exchangeCodeForSession(code);
      if (!error && data?.session?.user) return { client: resetClient, session: data.session };

      if (window.appSupabaseClient) {
        session = await getExistingSession(window.appSupabaseClient);
        if (session) return { client: window.appSupabaseClient, session };
      }
    }

    session = await waitForSession(resetClient);
    return { client: resetClient, session };
  }

  function accountEmail() {
    const user = appUser();
    return user?.email || document.getElementById('accountEmail')?.textContent.trim() || '';
  }

  function ensureAccountPasswordUi() {
    const view = document.getElementById('accountPasswordView');
    if (!view) return;

    const intro = view.querySelector('p.muted');
    if (intro) intro.textContent = 'We will email you a secure reset link. After choosing a new password, log in again with the new password.';

    view.querySelectorAll('.password-field').forEach(field => field.remove());

    const button = document.getElementById('saveAccountPasswordBtn');
    if (button) button.textContent = 'Email reset link';
  }

  async function syncPrimarySession(client) {
    if (!window.appSupabaseClient || client === window.appSupabaseClient) return;
    const latest = await client.auth.getSession();
    if (latest.data?.session?.access_token && latest.data?.session?.refresh_token) {
      await window.appSupabaseClient.auth.setSession({
        access_token: latest.data.session.access_token,
        refresh_token: latest.data.session.refresh_token
      });
    }
  }

  function friendlyAuthErrorOverride(message = '') {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login') || lower.includes('invalid credentials')) return 'Email or password is incorrect.';
    if (lower.includes('already registered') || lower.includes('already exists')) return 'An account already exists with this email. Try logging in instead.';
    if (lower.includes('password') && lower.includes('characters')) return 'Password is too short. Use at least 6 characters.';
    if (lower.includes('nonce') || lower.includes('otp')) return 'Enter the verification code from your email, then try again.';
    if (lower.includes('current password')) return 'Check your email for the verification code, enter it here, then try again.';
    if (lower.includes('auth session missing') || lower.includes('session missing')) return resetLinkMessage();
    if (lower.includes('email')) return 'Please enter a valid email address.';
    if (lower.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
    return message || 'Something went wrong. Please try again.';
  }

  async function sendPasswordResetToEmail(email, successMessage) {
    if (!email) return { error: new Error('Please enter a valid email address.') };
    try { localStorage.setItem('somthingreat-password-reset-requested-at', String(Date.now())); } catch (error) {}
    const { error } = await resetClient.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectUrl() });
    return { error, successMessage };
  }

  async function sendPasswordResetFixed() {
    const email = document.getElementById('loginEmailInput')?.value.trim();
    if (!email) return showAuthMessage('Enter your email first, then tap Forgot password.', 'error');

    showAuthMessage('Sending reset link...', 'info');
    const { error } = await sendPasswordResetToEmail(email, 'Password reset link sent. Check your email.');
    if (error) return showAuthMessage(friendlyAuthErrorOverride(error.message), 'error');
    showAuthMessage('Password reset link sent. Check your email.', 'success');
  }

  async function finishResetToLogin(client) {
    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = false;
    if (typeof clearRecoveryBootFlag === 'function') clearRecoveryBootFlag();
    try { localStorage.removeItem('somthingreat-password-reset-requested-at'); } catch (error) {}
    if (typeof clearAuthUrlParams === 'function') clearAuthUrlParams();
    if (typeof currentProfileId !== 'undefined') currentProfileId = null;
    setAppUser(null);

    try { await client.auth.signOut(); } catch (error) {}
    if (window.appSupabaseClient && client !== window.appSupabaseClient) {
      try { await window.appSupabaseClient.auth.signOut(); } catch (error) {}
    }
    try { await resetClient.auth.signOut(); } catch (error) {}

    if (typeof clearAuthFields === 'function') clearAuthFields();
    if (typeof setAuthMode === 'function') setAuthMode('login');
    document.getElementById('accountPanel')?.classList.remove('hidden');
    document.getElementById('loggedOutAccount')?.classList.remove('hidden');
    document.getElementById('loggedInAccount')?.classList.add('hidden');
    document.getElementById('accountBtn')?.classList.remove('hidden');
    document.querySelector('.bottom-nav')?.classList.add('hidden');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('auth-locked'));
    showAuthMessage('Password reset. Log in with your new password.', 'success');
  }

  async function updatePasswordFromRecoveryFixed() {
    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = true;

    const { client, session } = await ensurePasswordSession();
    if (!session?.user) return showAuthMessage(resetLinkMessage(), 'error');
    setAppUser(session.user);

    const password = document.getElementById('resetPasswordInput')?.value;
    const confirmPassword = document.getElementById('resetConfirmPasswordInput')?.value;
    if (!password || !confirmPassword) return showAuthMessage('Enter and confirm your new password.', 'error');
    if (password.length < 6) return showAuthMessage('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return showAuthMessage('Passwords do not match.', 'error');

    showAuthMessage('Updating password...', 'info');
    const { error } = await client.auth.updateUser({ password });
    if (error) return showAuthMessage(friendlyAuthErrorOverride(error.message), 'error');

    await finishResetToLogin(client);
  }

  async function changePasswordFromAccountFixed() {
    ensureAccountPasswordUi();
    const message = document.getElementById('accountPasswordMessage');
    const email = accountEmail();
    if (!email) {
      if (message) message.textContent = 'Log in again before changing your password.';
      return;
    }

    if (message) message.textContent = 'Sending reset link...';
    const { error } = await sendPasswordResetToEmail(email, 'Password reset link sent. Check your email.');
    if (error) {
      if (message) message.textContent = friendlyAuthErrorOverride(error.message);
      return;
    }
    if (message) message.textContent = 'Password reset link sent. Check your email.';
  }

  function bindButton(id, handler) {
    const button = document.getElementById(id);
    if (!button || button.dataset.passwordFixBound === '1') return;
    const freshButton = button.cloneNode(true);
    freshButton.dataset.passwordFixBound = '1';
    button.replaceWith(freshButton);
    freshButton.addEventListener('click', event => {
      event.preventDefault();
      handler();
    });
  }

  function bindPasswordHandlers() {
    ensureAccountPasswordUi();
    bindButton('forgotPasswordBtn', sendPasswordResetFixed);
    bindButton('resetPasswordBtn', updatePasswordFromRecoveryFixed);
    bindButton('saveAccountPasswordBtn', changePasswordFromAccountFixed);
  }

  function safeRender(fn) {
    if (typeof fn !== 'function') return;
    try { fn(); } catch (error) { console.error(error); }
  }

  window.friendlyAuthError = friendlyAuthErrorOverride;
  window.sendPasswordReset = sendPasswordResetFixed;
  window.updatePasswordFromRecovery = updatePasswordFromRecoveryFixed;
  window.changePasswordFromAccount = changePasswordFromAccountFixed;

  bindPasswordHandlers();
  document.addEventListener('DOMContentLoaded', bindPasswordHandlers);
  setTimeout(bindPasswordHandlers, 0);

  if (typeof isPasswordRecoveryUrl === 'function' && isPasswordRecoveryUrl()) {
    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = true;
    if (typeof setAuthMode === 'function') setAuthMode('reset');
    ensurePasswordSession().then(({ session }) => {
      if (session?.user) setAppUser(session.user);
      if (typeof renderAll === 'function') renderAll();
    });
  }

  if (typeof renderAll === 'function') {
    renderAll = function () {
      safeRender(typeof renderAccount === 'function' ? renderAccount : null);
      safeRender(typeof renderOnboarding === 'function' ? renderOnboarding : null);
      if (
        typeof passwordRecoveryMode !== 'undefined' &&
        !passwordRecoveryMode &&
        appUser() &&
        typeof hasCompletedProfile === 'function' &&
        hasCompletedProfile()
      ) {
        safeRender(typeof renderToday === 'function' ? renderToday : null);
        safeRender(typeof renderGoals === 'function' ? renderGoals : null);
        safeRender(typeof renderProgress === 'function' ? renderProgress : null);
      }
      safeRender(typeof enforceScreenSeparation === 'function' ? enforceScreenSeparation : null);
      safeRender(typeof updateWelcomeGate === 'function' ? updateWelcomeGate : null);
      bindPasswordHandlers();
    };
  }
})();