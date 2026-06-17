(function () {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;

  const resetClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  function activeClient() {
    return window.appSupabaseClient || resetClient;
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

  async function waitForSession(client, attempts = 12, delayMs = 250) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { data } = await client.auth.getSession();
      if (data?.session?.user) return data.session;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return null;
  }

  async function ensurePasswordSession() {
    const client = activeClient();
    const existing = await client.auth.getSession();
    if (existing.data?.session?.user) return { client, session: existing.data.session };

    const params = authParams();
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');

    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (!error && data?.session?.user) return { client, session: data.session };
    }

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data?.session?.user) return { client, session: data.session };
    }

    const session = await waitForSession(client);
    return { client, session };
  }

  friendlyAuthError = function (message = '') {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login') || lower.includes('invalid credentials')) return 'Email or password is incorrect.';
    if (lower.includes('already registered') || lower.includes('already exists')) return 'An account already exists with this email. Try logging in instead.';
    if (lower.includes('password') && lower.includes('characters')) return 'Password is too short. Use at least 6 characters.';
    if (lower.includes('current password')) return 'Current password is required to update your password from Account settings.';
    if (lower.includes('auth session missing') || lower.includes('session missing')) return resetLinkMessage();
    if (lower.includes('email')) return 'Please enter a valid email address.';
    if (lower.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
    return message || 'Something went wrong. Please try again.';
  };

  sendPasswordReset = async function () {
    const email = document.getElementById('loginEmailInput')?.value.trim();
    if (!email) return showAuthMessage('Enter your email first, then tap Forgot password.', 'error');

    const redirectUrl = new URL(window.location.origin + window.location.pathname);
    redirectUrl.searchParams.set('reset-password', '1');

    try {
      localStorage.setItem('somthingreat-password-reset-requested-at', String(Date.now()));
    } catch (error) {}

    showAuthMessage('Sending reset link...', 'info');
    const { error } = await resetClient.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl.toString() });
    if (error) return showAuthMessage(friendlyAuthError(error.message), 'error');
    showAuthMessage('Password reset link sent. Check your email.', 'success');
  };

  updatePasswordFromRecovery = async function () {
    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = true;

    const { client, session } = await ensurePasswordSession();
    if (!session?.user) return showAuthMessage(resetLinkMessage(), 'error');
    if (typeof currentUser !== 'undefined') currentUser = session.user;

    const password = document.getElementById('resetPasswordInput')?.value;
    const confirmPassword = document.getElementById('resetConfirmPasswordInput')?.value;
    if (!password || !confirmPassword) return showAuthMessage('Enter and confirm your new password.', 'error');
    if (password.length < 6) return showAuthMessage('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return showAuthMessage('Passwords do not match.', 'error');

    showAuthMessage('Updating password...', 'info');
    const { error } = await client.auth.updateUser({ password });
    if (error) return showAuthMessage(friendlyAuthError(error.message), 'error');

    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = false;
    if (typeof clearRecoveryBootFlag === 'function') clearRecoveryBootFlag();
    try { localStorage.removeItem('somthingreat-password-reset-requested-at'); } catch (error) {}
    if (typeof clearAuthUrlParams === 'function') clearAuthUrlParams();
    if (typeof currentProfileId !== 'undefined') currentProfileId = null;
    if (typeof currentUser !== 'undefined' && currentUser && typeof loadCloudState === 'function') await loadCloudState();
    if (typeof clearAuthFields === 'function') clearAuthFields();
    showAuthMessage('Password updated. You are logged in.', 'success');
    if (typeof renderAll === 'function') renderAll();
  };

  changePasswordFromAccount = async function () {
    if (typeof currentUser === 'undefined' || !currentUser) return;

    const client = activeClient();
    const message = document.getElementById('accountPasswordMessage');
    const currentPassword = document.getElementById('accountCurrentPasswordInput')?.value;
    const password = document.getElementById('accountNewPasswordInput')?.value;
    const confirmPassword = document.getElementById('accountConfirmPasswordInput')?.value;
    if (message) message.textContent = '';
    if (!currentPassword || !password || !confirmPassword) {
      if (message) message.textContent = 'Enter your current password, then your new password twice.';
      return;
    }
    if (password.length < 6) {
      if (message) message.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (password !== confirmPassword) {
      if (message) message.textContent = 'Passwords do not match.';
      return;
    }

    const email = currentUser.email;
    if (!email) {
      if (message) message.textContent = 'Log in again before changing your password.';
      return;
    }

    if (message) message.textContent = 'Updating password...';
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      if (message) message.textContent = 'Current password is incorrect.';
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) {
      if (message) message.textContent = 'Log in again before changing your password.';
      return;
    }

    currentUser = sessionData.session.user;
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      if (message) message.textContent = friendlyAuthError(error.message);
      return;
    }

    document.getElementById('accountCurrentPasswordInput').value = '';
    document.getElementById('accountNewPasswordInput').value = '';
    document.getElementById('accountConfirmPasswordInput').value = '';
    if (message) message.textContent = 'Password updated.';
  };

  if (typeof isPasswordRecoveryUrl === 'function' && isPasswordRecoveryUrl()) {
    if (typeof passwordRecoveryMode !== 'undefined') passwordRecoveryMode = true;
    if (typeof setAuthMode === 'function') setAuthMode('reset');
    ensurePasswordSession().then(({ session }) => {
      if (session?.user && typeof currentUser !== 'undefined') currentUser = session.user;
      if (typeof renderAll === 'function') renderAll();
    });
  }
})();