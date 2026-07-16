const INITIAL_AUTH_SEARCH = window.location.search || '';
const INITIAL_AUTH_HASH = window.location.hash || '';
const APP_VERSION = window.SOMTHINGREAT_VERSION || window.APP_VERSION || 'dev';
const SUPABASE_READY = Boolean(
  window.supabase &&
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.includes('PASTE_') &&
  !window.SUPABASE_ANON_KEY.includes('PASTE_')
);

const supabaseClient = SUPABASE_READY
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    })
  : null;
window.appSupabaseClient = supabaseClient;

const recoveryAuthClient = SUPABASE_READY
  ? window.SomthingreatAuth?.createRecoveryClient(window.supabase, window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

let currentUser = null;
let currentProfileId = null;
let syncTimer = null;
let welcomeDismissed = false;
let waitingServiceWorker = null;
let updateBannerReady = false;
let applyingUpdate = false;
let versionUpdateReady = false;
let versionCheckInProgress = false;
let latestKnownVersion = APP_VERSION;
let activeRecoveryClient = null;
let authSessionCheckInProgress = false;
let pendingConfirmAction = null;
let lastFocusedElement = null;
let timerInterval = null;
let timerAutoClose = null;
let activeTimer = null;
let openExerciseTrackKey = null;
let workoutWakeLock = null;
let onboardingStep = 1;
let onboardingConfirmationReady = false;
let accountHistoryDismissedDayKey = null;
let recoveryFormEditing = false;

const ACCOUNT_SUBMENU_VIEWS = new Set(['goal', 'equipment', 'recovery', 'password', 'support', 'admin']);

function clearLegacyPasswordSession() {
  try {
    localStorage.removeItem('somthingreat-password-session');
    localStorage.removeItem('somthingreat-password-session-code-verifier');
  } catch (error) {}
}
clearLegacyPasswordSession();

function clearRecoveryAuthSession() {
  try {
    localStorage.removeItem('somthingreat-recovery-session');
  } catch (error) {}
}

function hasRecoveryBootFlag() {
  return Boolean(window.__SOMTHINGREAT_RECOVERY_BOOT || document.documentElement.classList.contains('recovery-boot'));
}

function clearRecoveryBootFlag() {
  try { sessionStorage.removeItem('somthingreat-recovery-boot'); } catch (error) {}
  document.documentElement.classList.remove('recovery-boot');
  window.__SOMTHINGREAT_RECOVERY_BOOT = false;
}

function hasPendingRecoveryMarker() {
  try {
    const ts = Number(localStorage.getItem('somthingreat-password-reset-requested-at') || 0);
    return ts && Date.now() - ts < 1000 * 60 * 60;
  } catch (error) {
    return false;
  }
}

function isPasswordRecoveryUrl() {
  // Use the original URL captured before Supabase can consume/clean auth params.
  // A password-reset redirect can look like:
  //   ?reset-password=1#access_token=...&type=recovery
  //   ?reset-password=1&code=...
  // Google OAuth also returns ?code=..., so code/access_token alone must not
  // be treated as password recovery.
  const current = `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`;
  const initial = `${INITIAL_AUTH_SEARCH.replace(/^\?/, '')}&${INITIAL_AUTH_HASH.replace(/^#/, '')}`;
  const params = new URLSearchParams(`${initial}&${current}`);
  return (
    hasRecoveryBootFlag() ||
    params.get('reset-password') === '1' ||
    params.get('type') === 'recovery' ||
    params.get('event') === 'PASSWORD_RECOVERY' ||
    window.location.pathname.includes('reset-password')
  );
}

function clearAuthUrlParams() {
  if (!window.location.hash && !window.location.search) return;
  window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
}

function getAuthUrlParams() {
  if (window.SomthingreatAuth?.authUrlParams) {
    return window.SomthingreatAuth.authUrlParams(INITIAL_AUTH_SEARCH, INITIAL_AUTH_HASH);
  }
  const combined = `${INITIAL_AUTH_SEARCH.replace(/^\?/, '')}&${INITIAL_AUTH_HASH.replace(/^#/, '')}&${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`;
  return new URLSearchParams(combined);
}

async function getExistingAuthSession(client) {
  if (window.SomthingreatAuth?.getExistingSession) return await window.SomthingreatAuth.getExistingSession(client);
  if (!client?.auth?.getSession) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user ? data.session : null;
}

async function signOutClient(client, options) {
  if (!client?.auth?.signOut) return;
  try {
    await client.auth.signOut(options);
  } catch (error) {
    try { await client.auth.signOut(); } catch (_) {}
  }
}

async function checkCurrentAuthSession() {
  if (!supabaseClient || !currentUser || passwordRecoveryMode || authSessionCheckInProgress) return;
  authSessionCheckInProgress = true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data?.user) {
      currentUser = null;
      currentProfileId = null;
      await signOutClient(supabaseClient);
      renderAll();
      setAuthMessage('Session expired. Log in again.', 'info');
    }
  } catch (error) {
    // Network hiccups should not log the user out.
  } finally {
    authSessionCheckInProgress = false;
  }
}

async function waitForRecoverySession(client = recoveryAuthClient || supabaseClient) {
  const session = window.SomthingreatAuth?.waitForSession
    ? await window.SomthingreatAuth.waitForSession(client)
    : await getExistingAuthSession(client);
  if (session?.user) currentUser = session.user;
  return session;
}

async function ensureRecoverySession() {
  if (!supabaseClient || !passwordRecoveryMode) return null;

  for (const client of [recoveryAuthClient, supabaseClient].filter(Boolean)) {
    const existing = await getExistingAuthSession(client);
    if (existing?.user) {
      activeRecoveryClient = client;
      currentUser = existing.user;
      return existing;
    }
  }

  const params = getAuthUrlParams();
  if (params.get('error') || params.get('error_code')) return null;

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');

  if (accessToken && refreshToken) {
    const tokenClient = recoveryAuthClient || supabaseClient;
    try {
      const { data, error } = await tokenClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) throw error;
      activeRecoveryClient = tokenClient;
      currentUser = data?.session?.user || currentUser;
      return data?.session || null;
    } catch (error) {
      currentUser = null;
      setAuthMessage(resetSessionErrorMessage(error.message), 'error');
    }
  }

  if (code) {
    try {
      const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
      if (error) throw error;
      activeRecoveryClient = supabaseClient;
      currentUser = data?.session?.user || currentUser;
      return data?.session || null;
    } catch (error) {
      currentUser = null;
    }
    setAuthMessage(resetSessionErrorMessage('Invalid recovery code'), 'error');
  }

  const waited = await waitForRecoverySession(recoveryAuthClient || supabaseClient);
  if (waited?.user) activeRecoveryClient = recoveryAuthClient || supabaseClient;
  return waited;
}

let passwordRecoveryMode = isPasswordRecoveryUrl() || hasRecoveryBootFlag();
let accountHistoryMonth = new Date();
let accountHistorySelectedDay = null;
const ADMIN_EMAILS = ['grascam@gmail.com'];
const accountModule = window.SomthingreatAccount;
const adminModule = window.SomthingreatAdmin;
const renderModule = window.SomthingreatRender;
if (!accountModule || !adminModule || !renderModule) throw new Error('Somthingreat UI modules missing.');

function setWelcomeVisible(visible) {
  const welcome = document.getElementById('welcomeScreen');
  const app = document.querySelector('.app');
  const bottomNav = document.querySelector('.bottom-nav');

  document.documentElement.classList.toggle('welcome-active', visible);
  document.body.classList.toggle('welcome-active', visible);
  if (visible) {
    document.documentElement.classList.remove('onboarding-active', 'confirmation-active', 'account-main-active', 'account-submenu-active', 'workout-active');
    document.body.classList.remove('onboarding-active', 'confirmation-active', 'account-main-active', 'account-submenu-active', 'workout-active');
    document.getElementById('accountPanel')?.classList.remove('account-main-mode');
    hideAccountSubmenuPanel();
    syncScreenThemeColor();
  }
  if (welcome) welcome.classList.toggle('hidden', !visible);
  if (app) app.classList.toggle('hidden', visible);
  // Only force-hide the bottom nav while the welcome screen is open.
  // When the welcome screen closes, renderAccount() decides if the nav should show.
  if (bottomNav && visible) bottomNav.classList.add('hidden');
  if (!visible) syncBottomNavVisibility();
}

function setupStarAnimation() {
  const star = document.getElementById('welcomeStar');
  if (!star) return;

  const frames = [
    'Assets/Animations/start1.png',
    'Assets/Animations/start2.png',
    'Assets/Animations/start3.png'
  ];

  let frame = 0;
  star.src = frames[frame];

  window.setInterval(() => {
    frame = (frame + 1) % frames.length;
    star.src = frames[frame];
  }, 600);
}

function updateWelcomeGate() {
  // Recovery links must bypass the animated welcome screen and go straight
  // to the password reset form. Otherwise the user lands on Welcome instead
  // of seeing the reset fields.
  setWelcomeVisible(!welcomeDismissed && !currentUser && !passwordRecoveryMode);
}


const workoutModule = window.SomthingreatWorkouts;
if (!workoutModule) throw new Error('Somthingreat workout module missing.');

const baseTracks = workoutModule.baseTracks;
const energyOptions = workoutModule.energyOptions;
const sanitizeWorkout = workoutModule.sanitizeWorkout;
const getExerciseHelp = workoutModule.getExerciseHelp;
const modeLabel = workoutModule.modeLabel;
const sessionTotalLabel = workoutModule.sessionTotalLabel;

const goalLabels = {
  pullup: 'Pull-up',
  handstand: 'Handstand',
  lsit: 'L-Sit',
  muscleup: 'Muscle-up',
  general: 'General fitness'
};

const equipmentLabels = {
  none: 'No equipment',
  pullupBar: 'Pull-up bar',
  dipBars: 'Dip bars',
  bands: 'Resistance bands',
  jumpRope: 'Jump rope'
};

const recoveryAreaLabels = {
  headNeck: 'Head & neck',
  leftShoulder: 'Left shoulder',
  rightShoulder: 'Right shoulder',
  leftElbow: 'Left elbow',
  rightElbow: 'Right elbow',
  leftWrist: 'Left wrist',
  rightWrist: 'Right wrist',
  leftKnee: 'Left knee',
  rightKnee: 'Right knee',
  leftAnkle: 'Left ankle',
  rightAnkle: 'Right ankle'
};

const recoveryModeLabels = {
  reduce: 'Reduce load',
  rest: 'Rest completely'
};

const recoveryDurations = {
  '3days': { label: '3 days', days: 3 },
  '1week': { label: '1 week', days: 7 },
  '2weeks': { label: '2 weeks', days: 14 },
  '1month': { label: '1 month', months: 1 },
  untilRemoved: { label: 'Until I remove it', openEnded: true }
};

const stateStore = window.SomthingreatState?.create({
  workoutModule,
  baseTracks,
  energyOptions,
  sanitizeWorkout,
  goalLabels,
  equipmentLabels
});
if (!stateStore) throw new Error('Somthingreat state module missing.');

function getProfile() {
  return state?.profile || null;
}

function getTracks() {
  return workoutModule.getTracks(getProfile());
}

function getRotation() {
  return workoutModule.getRotation(getProfile());
}

function hasCompletedProfile() {
  return Boolean(state.profile?.goal && Array.isArray(state.profile?.equipment) && state.profile.equipment.length && state.profile?.pushups && state.profile?.squats);
}

function getSelectedAddOns() {
  return {
    warmup: Boolean(state.includeWarmup),
    stretch: Boolean(state.includeStretch)
  };
}

function getExtraSessionMinutes(addOns = getSelectedAddOns()) {
  return workoutModule.getExtraSessionMinutes(addOns);
}

function applyWorkoutAddOns(workout, addOns = getSelectedAddOns()) {
  return workoutModule.applyWorkoutAddOns(workout, addOns);
}

function getTodayWorkout(mode = 'normal') {
  return workoutModule.getTodayWorkout({ mode, state, profile: getProfile() });
}

function applyRating(trackKey, rating) {
  workoutModule.applyRating(state.levels, trackKey, rating, getProfile());
}

let state = stateStore.loadState();

function sanitizeState(nextState) {
  return stateStore.sanitizeState(nextState);
}

function defaultState() {
  return stateStore.defaultState();
}

function saveState() {
  state = stateStore.saveState(state);
  queueCloudSave();
}

function saveLocalStateOnly() {
  state = stateStore.writeLocalState(state);
}

function publicState() {
  return stateStore.publicState(state);
}

function queueCloudSave() {
  if (!supabaseClient || !currentUser || !currentProfileId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveCloudState, 500);
}

function normaliseEmail(email = '') {
  return adminModule.normaliseEmail(email);
}

function setMetaContent(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  if (meta.content === content) return;
  meta.content = content;
}

function setThemeColor(color = '#ffffff') {
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
  setMetaContent('theme-color', color);
}

function syncScreenThemeColor() {
  const root = document.documentElement;
  const isBlueScreen = root.classList.contains('onboarding-active') ||
    root.classList.contains('confirmation-active') ||
    root.classList.contains('account-main-active');
  setThemeColor(isBlueScreen ? '#012ded' : '#ffffff');
}

function getRequestedAccountView() {
  const view = new URLSearchParams(window.location.search).get('accountView');
  if (view === 'main' || ACCOUNT_SUBMENU_VIEWS.has(view)) return view;
  return null;
}

function isAccountDocumentRoute() {
  return Boolean(getRequestedAccountView());
}

function hasAccountViewParam() {
  return new URLSearchParams(window.location.search).has('accountView');
}

function clearInitialAccountRouteClasses() {
  document.documentElement.classList.remove('initial-account-main', 'initial-account-submenu');
}

function clearAccountDocumentRouteClasses() {
  clearInitialAccountRouteClasses();
  document.documentElement.classList.remove('account-document-route', 'account-route-content-ready');
}

function removeAccountRouteShell() {
  document.getElementById('accountRouteShell')?.remove();
}

function revealAccountRouteContent(view) {
  const shell = document.getElementById('accountRouteShell');
  hideNormalAppChrome();

  window.requestAnimationFrame(() => {
    clearInitialAccountRouteClasses();

    window.requestAnimationFrame(() => {
      focusAccountRouteHeading(view);
      document.documentElement.classList.add('account-route-content-ready');

      if (!shell) return;
      shell.addEventListener('transitionend', () => shell.remove(), { once: true });
      shell.classList.add('is-hidden');
      window.setTimeout(() => {
        shell.remove();
      }, 260);
    });
  });
}

function showRouteNavigationCover(color) {
  const cover = document.getElementById('routeNavigationCover');
  if (!cover) return;

  cover.classList.remove('is-blue', 'is-white');
  cover.classList.add('is-visible', color === '#012ded' ? 'is-blue' : 'is-white');
  void cover.offsetHeight;
}

function navigateToUrl(url) {
  window.location.assign(url.toString());
}

function navigateToAccountRoute(url, targetColor) {
  hideNormalAppChrome();
  showRouteNavigationCover(targetColor);
  navigateToUrl(url);
}

function navigateToNormalAppRoute(url) {
  hideNormalAppChrome();
  showRouteNavigationCover('#ffffff');
  navigateToUrl(url);
}

function removeRouteNavigationCover() {
  document.getElementById('routeNavigationCover')?.remove();
}

function removeRouteShells() {
  removeAccountRouteShell();
  removeRouteNavigationCover();
}

function clearAccountRouteStartup() {
  clearAccountDocumentRouteClasses();
  removeRouteShells();
}

function removeAccountRouteParam() {
  if (!hasAccountViewParam()) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete('accountView');
  return url;
}

function replaceAccountRouteWithNormalUrl() {
  const url = removeAccountRouteParam();
  if (!url) return;
  window.history.replaceState({}, '', url.toString());
}

function closeAccountRoute() {
  const url = removeAccountRouteParam() || new URL(window.location.href);
  navigateToNormalAppRoute(url);
}

function navigateToAccountMain() {
  const url = new URL(window.location.href);
  url.searchParams.set('accountView', 'main');
  navigateToAccountRoute(url, '#012ded');
}

function navigateToAccountSubmenu(view) {
  if (!ACCOUNT_SUBMENU_VIEWS.has(view)) return;
  const url = new URL(window.location.href);
  url.searchParams.set('accountView', view);
  navigateToAccountRoute(url, '#ffffff');
}

function navigateBackToAccountMain() {
  navigateToAccountMain();
}

function focusAccountRouteHeading(view) {
  const target = view === 'main'
    ? document.querySelector('#accountPanel .account-main-heading')
    : document.querySelector(`#account${view[0].toUpperCase()}${view.slice(1)}View .account-view-title`);
  target?.focus({ preventScroll: true });
}

function hideNormalAppChrome() {
  document.querySelector('.bottom-nav')?.classList.add('hidden');
  document.getElementById('updateBanner')?.classList.add('hidden');
  document.querySelectorAll('.confirm-panel').forEach(panel => panel.classList.add('hidden'));
}

function syncBottomNavVisibility(profileDone = hasCompletedProfile()) {
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav) return;

  if (isAccountDocumentRoute()) {
    bottomNav.classList.add('hidden');
    return;
  }

  const shouldHide = !profileDone ||
    passwordRecoveryMode ||
    !currentUser ||
    document.documentElement.classList.contains('welcome-active') ||
    document.body.classList.contains('workout-active');

  bottomNav.classList.toggle('hidden', shouldHide);
}
function isAdminUser() {
  return adminModule.isAdminUser(currentUser, ADMIN_EMAILS);
}

function authProviders() {
  if (!currentUser) return [];
  const identities = Array.isArray(currentUser.identities) ? currentUser.identities : [];
  const identityProviders = identities.map(identity => identity?.provider).filter(Boolean);
  const appProviders = Array.isArray(currentUser.app_metadata?.providers)
    ? currentUser.app_metadata.providers
    : [currentUser.app_metadata?.provider].filter(Boolean);
  return [...identityProviders, ...appProviders];
}

function isGoogleUser() {
  return authProviders().includes('google');
}

function canChangePassword() {
  return authProviders().includes('email');
}

function getAccountDisplayName() {
  if (!currentUser) return '';
  const metadata = currentUser.user_metadata || {};
  if (isGoogleUser()) {
    return metadata.full_name || metadata.name || metadata.display_name || currentUser.email || '';
  }
  return currentUser.email || '';
}

function getCompletedWorkoutCount(savedState) {
  return adminModule.getCompletedWorkoutCount(savedState);
}

function formatAdminGoal(savedState) {
  return adminModule.formatAdminGoal(savedState, goalLabels);
}

function formatAdminActive(profile, savedState, now = new Date()) {
  return adminModule.formatAdminActive(profile, savedState, now);
}

function escapeHTML(value = '') {
  return adminModule.escapeHTML(value);
}


async function ensureWorkoutProfile() {
  if (!supabaseClient || !currentUser?.email) return null;

  const email = normaliseEmail(currentUser.email);
  const payload = {
    email,
    current_auth_user_id: currentUser.id,
    deleted_at: null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from('workout_profiles')
    .upsert(payload, { onConflict: 'email' })
    .select('id')
    .single();

  if (error) {
    setSyncStatus('Could not connect your recovery profile. Local progress is still saved.');
    return null;
  }

  currentProfileId = data.id;
  return data.id;
}

async function saveCloudState() {
  if (!supabaseClient || !currentUser) return;
  const profileId = currentProfileId || await ensureWorkoutProfile();
  if (!profileId) return;

  setSyncStatus('Saving...');
  const { error } = await supabaseClient
    .from('workout_states_v2')
    .upsert({ profile_id: profileId, state: publicState(), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  setSyncStatus(error ? 'Save failed. Local progress is still saved.' : 'Progress saved.');
}

async function loadLegacyCloudState() {
  if (!supabaseClient || !currentUser) return null;

  const { data, error } = await supabaseClient
    .from('workout_states')
    .select('state')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) return null;
  return data?.state || null;
}

async function loadCloudState() {
  if (!supabaseClient || !currentUser) return;
  setSyncStatus('Loading progress...');

  const profileId = await ensureWorkoutProfile();
  if (!profileId) return;

  const { data, error } = await supabaseClient
    .from('workout_states_v2')
    .select('state')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    setSyncStatus('Could not load progress. Local progress is still available.');
    return;
  }

  const legacyState = !data?.state ? await loadLegacyCloudState() : null;
  const cloudState = data?.state || legacyState;

  if (cloudState) {
    state = sanitizeState({ ...defaultState(), ...cloudState });
    saveLocalStateOnly();
    if (legacyState) await saveCloudState();
    renderAll();
    setSyncStatus(legacyState ? 'Progress recovered and upgraded.' : 'Progress loaded.');
  } else {
    state = defaultState();
    saveLocalStateOnly();
    await saveCloudState();
    renderAll();
    setSyncStatus('New account ready.');
  }
}

function setSyncStatus(message) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = message;
}


function setAuthMessage(message, type = 'info') {
  const el = document.getElementById('authMessage');
  renderModule.setMessage(el, message, type);
}

function setPanelMessage(id, message, type = 'info') {
  renderModule.setMessage(document.getElementById(id), message, type);
}

async function withButtonLoading(buttonId, label, task) {
  const button = document.getElementById(buttonId);
  renderModule.setButtonLoading(button, true, label);
  try {
    return await task();
  } finally {
    renderModule.setButtonLoading(button, false);
  }
}

function blurActiveAuthField() {
  const active = document.activeElement;
  if (active && active.closest?.('#loggedOutAccount') && typeof active.blur === 'function') {
    active.blur();
  }
}

function friendlyAuthError(message = '') {
  if (window.SomthingreatAuth?.friendlyAuthError) return window.SomthingreatAuth.friendlyAuthError(message);
  const lower = message.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('security purposes') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) return 'Email or password is incorrect.';
  if (lower.includes('already registered') || lower.includes('already exists')) return 'An account already exists with this email. Try logging in instead.';
  if (lower.includes('password') && lower.includes('characters')) return 'Password is too short. Use at least 6 characters.';
  if (lower.includes('auth session missing') || lower.includes('session missing')) return 'This reset link was not recognised. Please request a new reset link and open it directly from your email.';
  if (lower.includes('email')) return 'Please enter a valid email address.';
  return message || 'Something went wrong. Please try again.';
}

function resetSessionErrorMessage(message = '') {
  const lower = message.toLowerCase();
  if (
    lower.includes('code verifier') ||
    lower.includes('expired') ||
    lower.includes('invalid') ||
    lower.includes('session') ||
    lower.includes('auth')
  ) {
    return 'This reset link was not recognised. Please request a new reset link and open it directly from your email.';
  }
  return friendlyAuthError(message || 'Could not open this reset link. Please request a new one.');
}

function withTimeout(promise, ms = 12000, message = 'Request timed out. Check your connection and try again.') {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function resetRedirectUrl() {
  if (window.SomthingreatAuth?.resetRedirectUrl) return window.SomthingreatAuth.resetRedirectUrl();
  const redirectUrl = new URL(window.location.origin + window.location.pathname);
  redirectUrl.searchParams.set('reset-password', '1');
  return redirectUrl.toString();
}

async function sendPasswordResetToEmail(email) {
  if (!email) return { error: new Error('Please enter a valid email address.') };
  try {
    localStorage.setItem('somthingreat-password-reset-requested-at', String(Date.now()));
  } catch (error) {}
  const client = recoveryAuthClient || supabaseClient;
  return await client.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectUrl() });
}

async function finishResetToLogin(client = supabaseClient) {
  passwordRecoveryMode = false;
  clearRecoveryBootFlag();
  try { localStorage.removeItem('somthingreat-password-reset-requested-at'); } catch (error) {}
  clearAuthUrlParams();
  currentUser = null;
  currentProfileId = null;

  await signOutClient(client, { scope: 'global' });
  if (recoveryAuthClient && recoveryAuthClient !== client) {
    await signOutClient(recoveryAuthClient);
  }
  if (supabaseClient && supabaseClient !== client) {
    await signOutClient(supabaseClient);
  }
  clearLegacyPasswordSession();
  clearRecoveryAuthSession();
  activeRecoveryClient = null;

  clearAuthFields();
  setAuthMode('login');
  document.getElementById('accountPanel')?.classList.remove('hidden');
  document.getElementById('loggedOutAccount')?.classList.remove('hidden');
  document.getElementById('loggedInAccount')?.classList.add('hidden');
  document.getElementById('accountBtn')?.classList.remove('hidden');
  document.querySelector('.bottom-nav')?.classList.add('hidden');
  document.querySelectorAll('.screen').forEach(screen => screen.classList.add('auth-locked'));
  setAuthMessage('Password reset. Log in with your new password.', 'success');
}

async function loadCloudStateInBackground() {
  if (!currentUser || passwordRecoveryMode) return;
  try {
    await withTimeout(loadCloudState(), 12000, 'Cloud sync is taking too long. Local progress is still available.');
    renderAll();
  } catch (error) {
    setSyncStatus(error.message || 'Could not load progress. Local progress is still available.');
  }
}

function setAuthMode(mode = 'welcome') {
  blurActiveAuthField();
  document.documentElement.classList.remove('account-main-active', 'account-submenu-active', 'workout-active');
  document.body.classList.remove('account-main-active', 'account-submenu-active', 'workout-active');
  document.getElementById('accountPanel')?.classList.remove('account-main-mode');
  hideAccountSubmenuPanel();
  syncScreenThemeColor();
  const welcome = document.getElementById('authWelcome');
  const login = document.getElementById('authLoginForm');
  const reset = document.getElementById('authResetForm');
  if (!welcome || !login || !reset) return;

  const isReset = mode === 'reset';
  document.body.classList.toggle('password-recovery-mode', isReset);

  // Reset password is a standalone flow. It must never share the page with
  // onboarding or app screens, even though Supabase temporarily logs the user in.
  if (isReset) {
    document.body.classList.add('logged-out');
    document.documentElement.classList.add('logged-out');
    document.documentElement.classList.add('recovery-boot');
    setWelcomeVisible(false);
    document.getElementById('accountPanel')?.classList.remove('hidden');
    document.getElementById('onboarding')?.classList.add('hidden');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('auth-locked'));
    document.querySelector('.bottom-nav')?.classList.add('hidden');
    document.getElementById('accountBtn')?.classList.add('hidden');
  }

  welcome.classList.toggle('hidden', mode !== 'welcome');
  login.classList.toggle('hidden', mode !== 'login');
  reset.classList.toggle('hidden', !isReset);
  setAuthMessage('');
}

function clearAuthFields() {
  ['signupEmailInput', 'signupPasswordInput', 'signupConfirmPasswordInput', 'loginEmailInput', 'loginPasswordInput', 'resetPasswordInput', 'resetConfirmPasswordInput'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (input) input.type = 'password';
    button.textContent = '';
    button.classList.add('password-toggle-hidden');
    button.classList.remove('password-toggle-visible');
    button.setAttribute('aria-label', 'Show password');
  });
}

function togglePasswordVisibility(button) {
  const inputId = button?.dataset?.togglePassword;
  const input = inputId ? document.getElementById(inputId) : null;
  if (!input || !button) return;

  const cursorStart = input.selectionStart;
  const cursorEnd = input.selectionEnd;
  const isHidden = input.type === 'password';

  input.type = isHidden ? 'text' : 'password';
  button.textContent = '';
  button.classList.toggle('password-toggle-hidden', !isHidden);
  button.classList.toggle('password-toggle-visible', isHidden);
  button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

  // Mobile browsers often drop focus when the input type changes.
  // Re-focus immediately so the keyboard stays open.
  window.requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    if (cursorStart !== null && cursorEnd !== null) {
      try { input.setSelectionRange(cursorStart, cursorEnd); } catch (_) {}
    }
  });
}

function renderToday() {
  document.documentElement.classList.remove('workout-active');
  document.body.classList.remove('workout-active');
  document.querySelector('.topbar')?.classList.remove('hidden');
  document.getElementById('exerciseList').innerHTML = '';
  document.getElementById('completeBtn').classList.add('hidden');
  hideCustomChecklistViews();

  if (state.customChecklist) {
    document.getElementById('energyCard').classList.remove('hidden');
    document.getElementById('customChecklistCard')?.classList.remove('hidden');
    document.getElementById('customChecklistForm')?.classList.remove('hidden');
    document.getElementById('selectedEnergyCard').classList.add('hidden');
    document.getElementById('generatedWorkoutCard').classList.add('hidden');
    document.getElementById('exercisePreview').classList.add('hidden');
    renderCustomChecklist();
    return;
  }

  if (state.current) {
    document.getElementById('energyCard').classList.add('hidden');
    document.getElementById('selectedEnergyCard').classList.add('hidden');
    document.getElementById('generatedWorkoutCard').classList.add('hidden');
    document.getElementById('exercisePreview').classList.add('hidden');
    renderExercises();
    return;
  }

  if (state.generated) {
    document.getElementById('energyCard').classList.add('hidden');
    document.getElementById('selectedEnergyCard').classList.remove('hidden');
    document.getElementById('generatedWorkoutCard').classList.remove('hidden');
    document.getElementById('exercisePreview').classList.add('hidden');
    renderGeneratedWorkout();
    return;
  }

  if (state.selectedEnergy) {
    renderSelectedEnergy();
    return;
  }

  document.getElementById('energyCard').classList.remove('hidden');
  document.getElementById('customChecklistCard')?.classList.remove('hidden');
  document.getElementById('customChecklistForm')?.classList.remove('hidden');
  document.getElementById('selectedEnergyCard').classList.add('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');

  const emptyState = document.getElementById('todayEmptyState');
  if (emptyState) {
    const shouldShowEmptyState = countableHistory().length === 0 && !state.todayEmptyStateDismissed;
    emptyState.classList.toggle('hidden', !shouldShowEmptyState);
  }
}

function hideCustomChecklistViews() {
  document.getElementById('customChecklistCard')?.classList.add('hidden');
  document.getElementById('customChecklistForm')?.classList.add('hidden');
  document.getElementById('customChecklistActive')?.classList.add('hidden');
  document.getElementById('customChecklistEdit')?.classList.add('hidden');
}

function setCustomChecklistMessage(message = '', type = 'info') {
  const el = document.getElementById('customChecklistMessage');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function setEditCustomChecklistMessage(message = '', type = 'info') {
  const el = document.getElementById('editCustomChecklistMessage');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function openCustomChecklistForm() {
  document.getElementById('energyCard')?.classList.add('hidden');
  document.getElementById('customChecklistCard')?.classList.add('hidden');
  document.getElementById('customChecklistForm')?.classList.remove('hidden');
  setCustomChecklistMessage('');
}

function resetCustomChecklistForm() {
  const name = document.getElementById('customChecklistNameInput');
  const target = document.getElementById('customChecklistTargetInput');
  const rounds = document.querySelector('input[name="customChecklistType"][value="rounds"]');
  if (name) name.value = '';
  if (target) target.value = '';
  if (rounds) rounds.checked = true;
  setCustomChecklistMessage('');
}

function customChecklistUnitLabel(type, target) {
  if (type === 'minutes') return `${target} minute${target === 1 ? '' : 's'}`;
  return `${target} round${target === 1 ? '' : 's'}`;
}

function customChecklistItemLabel(checklist, index) {
  if (checklist.type === 'minutes') {
    const start = index * 5;
    const end = Math.min(checklist.target, start + 5);
    return `${end} min`;
  }
  return `Round ${index + 1}`;
}

function createCustomChecklist() {
  const name = document.getElementById('customChecklistNameInput')?.value.trim() || 'Custom checklist';
  const type = document.querySelector('input[name="customChecklistType"]:checked')?.value || 'rounds';
  const target = Math.round(Number(document.getElementById('customChecklistTargetInput')?.value || 0));
  const max = type === 'minutes' ? 240 : 120;
  if (!target || target < 1) {
    setCustomChecklistMessage(type === 'minutes' ? 'Enter how many minutes to track.' : 'Enter how many rounds to track.', 'error');
    return;
  }
  if (target > max) {
    setCustomChecklistMessage(type === 'minutes' ? 'Keep it to 240 minutes or less.' : 'Keep it to 120 rounds or less.', 'error');
    return;
  }
  const itemCount = type === 'minutes' ? Math.ceil(target / 5) : target;
  state.customChecklist = {
    name: name.slice(0, 40),
    type,
    target,
    items: Array.from({ length: itemCount }, () => false)
  };
  resetCustomChecklistForm();
  saveState();
  renderToday();
}

function renderCustomChecklist() {
  const checklist = state.customChecklist;
  if (!checklist) return;
  const active = document.getElementById('customChecklistActive');
  const title = document.getElementById('customChecklistTitle');
  const meta = document.getElementById('customChecklistMeta');
  const items = document.getElementById('customChecklistItems');
  const complete = document.getElementById('completeCustomChecklistBtn');
  if (!active || !title || !meta || !items || !complete) return;

  active.classList.remove('hidden');
  title.textContent = `${checklist.name} - ${customChecklistUnitLabel(checklist.type, checklist.target)}`;
  meta.textContent = customChecklistUnitLabel(checklist.type, checklist.target);
  items.innerHTML = checklist.items.map((checked, index) => `
    <label class="set-row custom-checklist-row ${checked ? 'completed' : ''}">
      <span>${customChecklistItemLabel(checklist, index)}</span>
      <input type="checkbox" data-custom-check-index="${index}" ${checked ? 'checked' : ''}>
      <i aria-hidden="true"></i>
    </label>
  `).join('');
  complete.disabled = false;
}

function openCustomChecklistEdit() {
  const checklist = state.customChecklist;
  if (!checklist) return;
  const name = document.getElementById('editCustomChecklistNameInput');
  const target = document.getElementById('editCustomChecklistTargetInput');
  const type = document.querySelector(`input[name="editCustomChecklistType"][value="${checklist.type}"]`);
  if (name) name.value = checklist.name;
  if (target) target.value = checklist.target;
  if (type) type.checked = true;
  setEditCustomChecklistMessage('');
  document.getElementById('customChecklistActive')?.classList.add('hidden');
  document.getElementById('customChecklistEdit')?.classList.remove('hidden');
}

function closeCustomChecklistEdit() {
  document.getElementById('customChecklistEdit')?.classList.add('hidden');
  if (state.customChecklist) {
    document.getElementById('customChecklistActive')?.classList.remove('hidden');
  }
  setEditCustomChecklistMessage('');
}

function confirmCustomChecklistEdit() {
  const checklist = state.customChecklist;
  if (!checklist) return;
  const name = document.getElementById('editCustomChecklistNameInput')?.value.trim() || 'Custom checklist';
  const type = document.querySelector('input[name="editCustomChecklistType"]:checked')?.value || checklist.type;
  const target = Math.round(Number(document.getElementById('editCustomChecklistTargetInput')?.value || 0));
  const max = type === 'minutes' ? 240 : 120;
  if (!target || target < 1) {
    setEditCustomChecklistMessage(type === 'minutes' ? 'Enter how many minutes to track.' : 'Enter how many rounds to track.', 'error');
    return;
  }
  if (target > max) {
    setEditCustomChecklistMessage(type === 'minutes' ? 'Keep it to 240 minutes or less.' : 'Keep it to 120 rounds or less.', 'error');
    return;
  }
  const itemCount = type === 'minutes' ? Math.ceil(target / 5) : target;
  state.customChecklist = {
    name: name.slice(0, 40),
    type,
    target,
    items: Array.from({ length: itemCount }, (_, index) => Boolean(checklist.items[index]))
  };
  saveState();
  document.getElementById('customChecklistEdit')?.classList.add('hidden');
  renderCustomChecklist();
}

function cancelCustomChecklist() {
  state.customChecklist = null;
  saveState();
  renderToday();
}

function completeCustomChecklist(skipIncompleteConfirm = false) {
  const checklist = state.customChecklist;
  if (!checklist) return;
  if (!skipIncompleteConfirm && !checklist.items.every(Boolean)) {
    showCompletionScreen({
      title: 'Almost there!',
      message: 'Some items are unfinished and won’t be counted. Save this progress or go back to finish more.',
      actionLabel: 'Save progress',
      cancelLabel: 'Go back',
      onConfirm: () => completeCustomChecklist(true)
    });
    return;
  }
  const completedCount = checklist.items.filter(Boolean).length;
  const countedTarget = checklist.items.every(Boolean)
    ? checklist.target
    : checklist.type === 'minutes'
      ? Math.min(checklist.target, completedCount * 5)
      : completedCount;
  const prescription = customChecklistUnitLabel(checklist.type, countedTarget);
  state.history.push({
    type: 'custom',
    date: new Date().toISOString(),
    workout: checklist.name,
    mode: 'custom',
    customType: checklist.type,
    target: countedTarget,
    exercises: [{ name: checklist.name, prescription, trackKey: 'custom', isAddOn: false }]
  });
  state.customChecklist = null;
  saveState();
  renderToday();
  renderProgress();
  renderActivity();
  renderAccount();
  showWorkoutStatus('Checklist saved.', 'Your custom checklist is saved in your history.');
  updateUpdateBanner();
}

function dismissTodayEmptyState() {
  state.todayEmptyStateDismissed = true;
  saveState();
  renderToday();
}

function selectEnergy(feel) {
  state.selectedEnergy = feel;
  state.generated = null;
  state.includeWarmup = false;
  state.includeStretch = false;
  state.includeExerciseTimer = false;
  state.includeRestTimer = false;
  state.restTimerSeconds = 60;
  saveState();
  renderSelectedEnergy();
}

function renderSelectedEnergy() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  const previewWorkout = getTodayWorkout(option.mode);

  hideCustomChecklistViews();
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.getElementById('selectedEnergyCard').dataset.energy = state.selectedEnergy || 'normal';

  const mascot = document.getElementById('selectedEnergyMascot');
  if (mascot) mascot.src = option.icon || 'Assets/Energy/normal-icon.png';

  const pill = document.getElementById('selectedEnergyPill');
  if (pill) pill.textContent = option.title;

  const stars = document.getElementById('selectedEnergyStars');
  if (stars) {
    stars.innerHTML = '';
  }

  const workoutName = document.getElementById('selectedWorkoutName');
  if (workoutName) workoutName.textContent = previewWorkout.workoutName;

  const workoutMeta = document.getElementById('selectedWorkoutMeta');
  if (workoutMeta) {
    const volumeMap = {
      great: 'full volume',
      normal: 'reduced volume',
      tired: 'reduced volume',
      reduced: 'reduced volume',
      exhausted: 'minimum volume',
      minimum: 'minimum volume'
    };
    const volume = volumeMap[previewWorkout.mode] || 'standard volume';
    const count = (previewWorkout.exercises || []).filter(Boolean).length;
    workoutMeta.innerHTML = `${escapeHTML(previewWorkout.workoutName)}: ${escapeHTML(volume)}<br>${count} exercises`;
  }

  const warmupInput = document.getElementById('includeWarmup');
  const stretchInput = document.getElementById('includeStretch');
  const exerciseTimerInput = document.getElementById('includeExerciseTimer');
  const restTimerInput = document.getElementById('includeRestTimer');
  const restTimerOptions = document.getElementById('restTimerOptions');
  if (warmupInput) warmupInput.checked = Boolean(state.includeWarmup);
  if (stretchInput) stretchInput.checked = Boolean(state.includeStretch);
  if (exerciseTimerInput) exerciseTimerInput.checked = Boolean(state.includeExerciseTimer);
  if (restTimerInput) restTimerInput.checked = Boolean(state.includeRestTimer);
  if (restTimerOptions) restTimerOptions.classList.add('hidden');
  updateAddOnSummary();
}

function updateAddOnSummary() {
  const total = document.getElementById('sessionTotalPreview');
  const extra = getExtraSessionMinutes();
  if (!total) return;
  const extras = [];
  if (extra) extras.push(`${extra} min`);
  if (state.includeExerciseTimer) extras.push('exercise timers');
  if (state.includeRestTimer) extras.push(`${state.restTimerSeconds || 60}s rest`);
  total.textContent = extras.length ? `Workout + ${extras.join(' · ')}` : 'Workout only';
}

function workoutToolSummary(workout) {
  const base = sessionTotalLabel(workout);
  const timerParts = [];
  if (workout?.includeExerciseTimer) timerParts.push('exercise timers');
  if (workout?.includeRestTimer) timerParts.push(`${workout.restTimerSeconds || 60}s rest`);
  if (!timerParts.length) return base;
  if (base === 'Workout only') return timerParts.join(' · ');
  return `${base} · ${timerParts.join(' · ')}`;
}

function generateWorkout() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  const baseWorkout = getTodayWorkout(option.mode);
  state.generated = applyWorkoutAddOns(baseWorkout);
  state.generated.includeExerciseTimer = Boolean(state.includeExerciseTimer);
  state.generated.includeRestTimer = Boolean(state.includeRestTimer);
  state.generated.restTimerSeconds = 60;
  saveState();
  renderGeneratedWorkout();
}

function renderGeneratedWorkout() {
  const generated = state.generated || getTodayWorkout('normal');
  hideCustomChecklistViews();
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.remove('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.getElementById('workoutName').textContent = generated.workoutName;
  document.getElementById('workoutMeta').textContent = generated.includeExerciseTimer ? 'Includes exercise timers' : 'Workout is ready';

  const preview = document.getElementById('previewList');
  preview.innerHTML = '';
  (generated.exercises || []).filter(Boolean).forEach(exercise => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `<strong>${escapeHTML(exerciseDisplayName(exercise))}</strong><span>${escapeHTML(exercise.prescription)}</span>`;
    preview.appendChild(row);
  });
}

function startWorkout() {
  if (!state.generated) generateWorkout();
  state.generated = sanitizeWorkout(state.generated);
  if (!state.generated) {
    state.selectedEnergy = null;
    saveState();
    renderToday();
    return;
  }
  state.current = {
    ...state.generated,
    includeExerciseTimer: Boolean(state.generated.includeExerciseTimer),
    includeRestTimer: Boolean(state.generated.includeRestTimer),
    restTimerSeconds: 60,
    ratings: {},
    sets: {}
  };
  state.current.exercises = (state.current.exercises || []).map((exercise, index) => ({
    ...exercise,
    sessionKey: exerciseSessionKey(exercise, index)
  }));
  state.current.exercises.forEach((exercise, index) => {
    const exerciseKey = exerciseSessionKey(exercise, index);
    state.current.sets[exerciseKey] = Array.from({ length: exercise.setCount || 1 }, () => false);
  });
  openExerciseTrackKey = exerciseSessionKey(state.current.exercises[0], 0) || null;
  state.generated = null;
  saveState();
  renderExercises();
  requestWorkoutWakeLock();
}

function areExerciseSetsComplete(exercise) {
  if (!exercise || !state.current?.sets) return false;
  const sets = state.current.sets[exerciseSessionKey(exercise)] || [];
  return sets.length > 0 && sets.every(Boolean);
}

function isExerciseComplete(exercise) {
  if (!areExerciseSetsComplete(exercise)) return false;
  return Boolean(exercise.isAddOn || state.current?.ratings?.[exerciseSessionKey(exercise)]);
}

function firstIncompleteExerciseKey() {
  const exercises = state.current?.exercises || [];
  const exercise = exercises.find(item => !isExerciseComplete(item));
  return exercise ? exerciseSessionKey(exercise) : null;
}

function openNextIncompleteExercise(afterTrackKey = null) {
  const exercises = state.current?.exercises || [];
  if (!exercises.length) {
    openExerciseTrackKey = null;
    return;
  }
  const startIndex = Math.max(0, exercises.findIndex(exercise => exerciseSessionKey(exercise) === afterTrackKey));
  const next = exercises.slice(startIndex + 1).find(exercise => !isExerciseComplete(exercise)) ||
    exercises.find(exercise => !isExerciseComplete(exercise));
  openExerciseTrackKey = next ? exerciseSessionKey(next) : null;
}

function exerciseChipPrescription(exercise) {
  const prescription = exercise?.prescription || '';
  if (exercise?.isAddOn) return prescription.split('·')[0].trim();
  return prescription.replace(/×/g, 'x');
}

function exerciseDisplayName(exerciseOrName) {
  const name = typeof exerciseOrName === 'string' ? exerciseOrName : exerciseOrName?.name;
  if (name === '2-min full-body warm-up') return 'Warm-up';
  return name || '';
}

function slugForKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'exercise';
}

function exerciseSessionKey(exercise, index = 0) {
  if (!exercise) return '';
  if (exercise.sessionKey) return exercise.sessionKey;
  return `${exercise.trackKey || 'exercise'}-${index}-${slugForKey(exercise.name || exerciseDisplayName(exercise))}`;
}

function activityDayKey(date, day) {
  return `${date.getFullYear()}-${date.getMonth()}-${day}`;
}

async function requestWorkoutWakeLock() {
  if (!('wakeLock' in navigator) || workoutWakeLock) return;
  try {
    workoutWakeLock = await navigator.wakeLock.request('screen');
    workoutWakeLock.addEventListener('release', () => {
      workoutWakeLock = null;
    });
  } catch (error) {}
}

async function releaseWorkoutWakeLock() {
  if (!workoutWakeLock) return;
  const lock = workoutWakeLock;
  workoutWakeLock = null;
  try { await lock.release(); } catch (error) {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.current || activeTimer)) {
    requestWorkoutWakeLock();
  }
});

function setControlMarkup(exercise, exerciseKey, index, completed, timedSeconds) {
  const label = exercise.setLabels?.[index] || `Round ${index + 1}`;
  const iconClass = completed ? 'is-check' : timedSeconds ? 'is-timer' : 'is-square';
  const exerciseName = exerciseDisplayName(exercise);
  const timerData = timedSeconds
    ? `data-timer-seconds="${timedSeconds}" data-exercise-name="${escapeHTML(exerciseName)}" data-track="${escapeHTML(exerciseKey)}" data-set-index="${index}" data-set-label="${escapeHTML(label)}"`
    : '';
  return `
    <div class="set-row ${timedSeconds ? 'timed-set-row' : ''} ${completed ? 'completed' : ''}">
      <span>${escapeHTML(label)}</span>
      <button class="set-control ${iconClass}" type="button" data-track="${escapeHTML(exerciseKey)}" data-set-index="${index}" ${timerData} aria-label="${completed ? 'Completed' : timedSeconds ? `Start ${label} timer` : `Complete ${label}`}"></button>
    </div>
  `;
}

function shouldStartRestTimerAfterSet(trackKey) {
  const exercise = findCurrentExercise(trackKey);
  return Boolean(state.current?.includeRestTimer && !exercise?.isAddOn && hasRemainingWorkoutSets());
}

function renderExercises() {
  hideCustomChecklistViews();
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.add('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.documentElement.classList.add('workout-active');
  document.body.classList.add('workout-active');
  document.querySelector('.topbar')?.classList.add('hidden');
  document.querySelector('.bottom-nav')?.classList.add('hidden');

  const list = document.getElementById('exerciseList');
  list.innerHTML = '';

  const titleCard = document.createElement('div');
  titleCard.className = 'workout-started-title';
  titleCard.innerHTML = `<p>Today's workout</p>`;
  list.appendChild(titleCard);

  state.current = sanitizeWorkout(state.current);
  if (!state.current) { renderToday(); return; }
  state.current.exercises = (state.current.exercises || []).map((exercise, index) => ({
    ...exercise,
    sessionKey: exerciseSessionKey(exercise, index)
  }));
  requestWorkoutWakeLock();
  if (!openExerciseTrackKey || !state.current.exercises.some(exercise => exerciseSessionKey(exercise) === openExerciseTrackKey)) {
    openExerciseTrackKey = firstIncompleteExerciseKey();
  }
  state.current.exercises.forEach((exercise, index) => {
    const exerciseKey = exerciseSessionKey(exercise, index);
    const isOpen = exerciseKey === openExerciseTrackKey;
    const isComplete = isExerciseComplete(exercise);
    const chipPrescription = isComplete ? '' : `<em>${escapeHTML(exerciseChipPrescription(exercise))}</em>`;
    const card = document.createElement('div');
    card.className = `exercise-card workout-accordion-card ${isOpen ? 'open' : ''} ${isComplete ? 'completed' : ''}`;
    card.dataset.track = exerciseKey;
    const selectedRating = state.current.ratings[exerciseKey];
    if (!state.current.sets) state.current.sets = {};
    if (!state.current.sets[exerciseKey]) state.current.sets[exerciseKey] = Array.from({ length: exercise.setCount || 1 }, () => false);
    const completedSets = state.current.sets[exerciseKey];
    const timedSeconds = state.current.includeExerciseTimer ? getTimedExerciseSeconds(exercise) : null;
    const exerciseName = exerciseDisplayName(exercise);
    const setRows = Array.from({ length: exercise.setCount || completedSets.length || 1 }, (_, index) => {
      return setControlMarkup(exercise, exerciseKey, index, Boolean(completedSets[index]), timedSeconds);
    }).join('');
    const help = getExerciseHelp(exerciseName);
    const helpButton = help ? `<button class="exercise-help-btn" type="button" data-exercise-name="${escapeHTML(exerciseName)}" aria-label="Help with ${escapeHTML(exerciseName)}">?</button>` : '';
    const ratingBlock = exercise.isAddOn ? '' : `
      <p class="rating-label">How was it?</p>
      <div class="rating-row" data-track="${exerciseKey}">
        <button data-rating="easy" class="${selectedRating === 'easy' ? 'selected' : ''}">Easy</button>
        <button data-rating="good" class="${selectedRating === 'good' ? 'selected' : ''}">Good</button>
        <button data-rating="hard" class="${selectedRating === 'hard' ? 'selected' : ''}">Hard</button>
        <button data-rating="failed" class="${selectedRating === 'failed' ? 'selected' : ''}">Failed</button>
      </div>`;
    card.innerHTML = `
      <button class="exercise-chip-toggle" type="button" data-track="${escapeHTML(exerciseKey)}">
        <span>${escapeHTML(exerciseName)}</span>
        ${chipPrescription}
        <i aria-hidden="true"></i>
      </button>
      <div class="exercise-card-body">
        <div class="exercise-card-header">
          <h3>${escapeHTML(exerciseName)} - ${escapeHTML(exercise.prescription)}</h3>
          ${helpButton}
        </div>
        <div class="set-list">${setRows}</div>
        ${ratingBlock}
      </div>
    `;
    list.appendChild(card);
  });
  document.getElementById('completeBtn').classList.remove('hidden');
}
function showConfirmPanel({ title, message, actionLabel, onConfirm }) {
  const panel = document.getElementById('confirmPanel');
  const titleEl = document.getElementById('confirmTitle');
  const messageEl = document.getElementById('confirmMessage');
  const actionBtn = document.getElementById('confirmActionBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (!panel || !titleEl || !messageEl || !actionBtn || !cancelBtn) return;

  lastFocusedElement = document.activeElement;
  pendingConfirmAction = onConfirm;
  titleEl.textContent = title;
  messageEl.textContent = message;
  actionBtn.textContent = actionLabel;
  cancelBtn.textContent = 'Go back';
  panel.classList.remove('workout-completion-panel', 'auto-complete');
  document.getElementById('confirmActionBtn')?.classList.remove('hidden');
  document.getElementById('confirmCancelBtn')?.classList.remove('hidden');
  panel.classList.remove('hidden');
  syncScreenThemeColor();
  renderModule.focusFirstInteractive(panel);
}

function closeConfirmPanel() {
  const panel = document.getElementById('confirmPanel');
  if (panel) {
    panel.classList.add('hidden');
    panel.classList.remove('workout-completion-panel', 'auto-complete');
  }
  document.documentElement.classList.remove('confirmation-active');
  document.body.classList.remove('confirmation-active');
  document.getElementById('confirmActionBtn')?.classList.remove('hidden');
  document.getElementById('confirmCancelBtn')?.classList.remove('hidden');
  pendingConfirmAction = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
  syncScreenThemeColor();
}

function showExerciseHelp(exerciseName) {
  const displayName = exerciseDisplayName(exerciseName);
  const help = getExerciseHelp(displayName);
  const panel = document.getElementById('exerciseHelpPanel');
  if (!help || !panel) return;

  lastFocusedElement = document.activeElement;
  document.getElementById('exerciseHelpTitle').textContent = displayName;
  document.getElementById('exerciseHelpPurpose').textContent = help.purpose || '';
  const cues = document.getElementById('exerciseHelpCues');
  if (cues) {
    cues.innerHTML = '';
    (help.cues || []).forEach(cue => {
      const item = document.createElement('li');
      item.textContent = cue;
      cues.appendChild(item);
    });
  }
  document.getElementById('exerciseHelpSafety').textContent = help.safety ? `Safety: ${help.safety}` : '';
  panel.classList.remove('hidden');
  renderModule.focusFirstInteractive(panel);
}

function closeExerciseHelp() {
  document.getElementById('exerciseHelpPanel')?.classList.add('hidden');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function formatTimerDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function getTimedExerciseSeconds(exercise) {
  if (!exercise?.prescription) return null;
  const text = `${exercise.prescription} ${exercise.basePrescription || ''}`.toLowerCase();
  const eachMatch = text.match(/(\d+)\s*s\s+each/);
  if (eachMatch) return Number(eachMatch[1]);

  const secondsMatch = text.match(/×\s*(\d+)\s*s\b/);
  if (secondsMatch) return Number(secondsMatch[1]);

  const minutesMatch = text.match(/×\s*(\d+)\s*min\b/) || text.match(/^(\d+)\s*min\b/) || text.match(/\b(\d+)\s*min\b/);
  if (minutesMatch) return Number(minutesMatch[1]) * 60;

  return null;
}

function markWorkoutSetDone(trackKey, setIndex, done = true) {
  if (!state.current || !trackKey || !Number.isFinite(Number(setIndex))) return;
  if (!state.current.sets) state.current.sets = {};
  if (!state.current.sets[trackKey]) {
    const exercise = findCurrentExercise(trackKey);
    state.current.sets[trackKey] = Array.from({ length: exercise?.setCount || 1 }, () => false);
  }
  const index = Number(setIndex);
  state.current.sets[trackKey][index] = Boolean(done);
  const exercise = findCurrentExercise(trackKey);
  if (exercise && isExerciseComplete(exercise)) {
    openNextIncompleteExercise(trackKey);
  } else {
    openExerciseTrackKey = trackKey;
  }
  saveState();
  renderExercises();
}

function renderWorkoutTimer() {
  if (!activeTimer) return;
  const title = document.getElementById('timerTitle');
  const count = document.getElementById('timerCount');

  if (title) title.textContent = activeTimer.title || 'Timer';
  if (count) {
    if (activeTimer.phase === 'prep') {
      count.textContent = activeTimer.prepSeconds;
    } else if (activeTimer.remainingSeconds <= 0) {
      count.textContent = '0';
    } else {
      count.textContent = String(activeTimer.remainingSeconds);
    }
  }
}

function tickWorkoutTimer() {
  if (!activeTimer) return;
  if (activeTimer.phase === 'prep') {
    activeTimer.prepSeconds -= 1;
    if (activeTimer.prepSeconds <= 0) {
      activeTimer.phase = 'active';
    }
    renderWorkoutTimer();
    return;
  }

  activeTimer.remainingSeconds -= 1;
  if (activeTimer.remainingSeconds <= 0) {
    activeTimer.remainingSeconds = 0;
    window.navigator?.vibrate?.(120);
    clearInterval(timerInterval);
    timerInterval = null;
    if (activeTimer.completeOnFinish && activeTimer.trackKey) {
      const completedTrackKey = activeTimer.trackKey;
      markWorkoutSetDone(completedTrackKey, activeTimer.setIndex, true);
      activeTimer.pendingRestTimer = shouldStartRestTimerAfterSet(completedTrackKey);
    }
    if (timerAutoClose) clearTimeout(timerAutoClose);
    timerAutoClose = window.setTimeout(() => closeWorkoutTimer(false), 2500);
  }
  renderWorkoutTimer();
}

function showWorkoutTimer({ title, subtitle, seconds, prepSeconds = 0, trackKey = null, setIndex = null, completeOnFinish = false }) {
  const panel = document.getElementById('timerPanel');
  if (!panel || !seconds) return;

  requestWorkoutWakeLock();
  closeWorkoutTimer(false);
  lastFocusedElement = document.activeElement;
  activeTimer = {
    title,
    subtitle,
    remainingSeconds: seconds,
    prepSeconds,
    phase: prepSeconds ? 'prep' : 'active',
    trackKey,
    setIndex,
    completeOnFinish
  };
  renderWorkoutTimer();
  panel.classList.remove('hidden');
  renderModule.focusFirstInteractive(panel);
  timerInterval = setInterval(tickWorkoutTimer, 1000);
}

function closeWorkoutTimer(restoreFocus = true) {
  const shouldStartRestTimer = Boolean(activeTimer?.pendingRestTimer);
  if (timerInterval) clearInterval(timerInterval);
  if (timerAutoClose) clearTimeout(timerAutoClose);
  timerInterval = null;
  timerAutoClose = null;
  activeTimer = null;
  document.getElementById('timerPanel')?.classList.add('hidden');
  if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  if (restoreFocus) lastFocusedElement = null;
  if (shouldStartRestTimer) {
    window.setTimeout(() => {
      showWorkoutTimer({
        title: 'Rest',
        subtitle: 'Rest',
        seconds: 60
      });
    }, 0);
  }
}

function hasRemainingWorkoutSets() {
  if (!state.current?.exercises || !state.current?.sets) return false;
  return state.current.exercises.some(exercise => {
    if (exercise.isAddOn) return false;
    const sets = state.current.sets[exerciseSessionKey(exercise)] || [];
    return sets.some(done => !done);
  });
}

function findCurrentExercise(trackKey) {
  return (state.current?.exercises || []).find(exercise => exerciseSessionKey(exercise) === trackKey) || null;
}

function isWorkoutFullyComplete() {
  if (!state.current) return false;
  const rateableExercises = (state.current.exercises || []).filter(exercise => !exercise.isAddOn);
  if (!rateableExercises.length) return false;
  const allSetsDone = rateableExercises.every(exercise => areExerciseSetsComplete(exercise));
  const allRated = rateableExercises.every(exercise => state.current.ratings?.[exerciseSessionKey(exercise)]);
  return allSetsDone && allRated;
}

function completeWorkout(skipMissingRatingConfirm = false) {
  if (!state.current) return;
  const completedMainExercises = (state.current.exercises || []).filter(exercise => {
    return !exercise.isAddOn && areExerciseSetsComplete(exercise);
  });
  if (!completedMainExercises.length) {
    showCompletionScreen({
      title: 'Workout not completed',
      message: 'If you complete this workout, as no exercise was marked as done, it will not count in your progress.',
      actionLabel: 'Complete',
      cancelLabel: 'Go back',
      onConfirm: completeWorkoutWithoutProgress
    });
    return;
  }
  if (!skipMissingRatingConfirm && !isWorkoutFullyComplete()) {
    showCompletionScreen({
      title: 'Almost there!',
      message: 'Some items are unfinished and won’t be counted. Save this progress or go back to finish more.',
      actionLabel: 'Save progress',
      cancelLabel: 'Go back',
      onConfirm: () => completeWorkoutNow(false)
    });
    return;
  }

  completeWorkoutNow();
}

function completeWorkoutWithoutProgress() {
  if (!state.current) return;
  state.current = null;
  state.selectedEnergy = null;
  state.generated = null;
  openExerciseTrackKey = null;
  releaseWorkoutWakeLock();
  saveState();
  renderToday();
  renderProgress();
  renderActivity();
  renderAccount();
  updateUpdateBanner();
}

function showCompletionScreen({ title, message, actionLabel = '', cancelLabel = '', onConfirm = null, autoClose = false }) {
  const panel = document.getElementById('confirmPanel');
  const titleEl = document.getElementById('confirmTitle');
  const messageEl = document.getElementById('confirmMessage');
  const actionBtn = document.getElementById('confirmActionBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (!panel || !titleEl || !messageEl || !actionBtn || !cancelBtn) return;

  lastFocusedElement = document.activeElement;
  pendingConfirmAction = onConfirm;
  titleEl.textContent = title;
  messageEl.textContent = message;
  actionBtn.textContent = actionLabel;
  cancelBtn.textContent = cancelLabel;
  panel.classList.add('workout-completion-panel');
  document.documentElement.classList.add('confirmation-active');
  document.body.classList.add('confirmation-active');
  panel.classList.toggle('auto-complete', Boolean(autoClose));
  actionBtn.classList.toggle('hidden', autoClose || !actionLabel);
  cancelBtn.classList.toggle('hidden', autoClose || !cancelLabel);
  panel.classList.remove('hidden');
  syncScreenThemeColor();

  if (autoClose) {
    window.setTimeout(() => {
      closeConfirmPanel();
      renderToday();
    }, 2500);
  } else {
    renderModule.focusFirstInteractive(panel);
  }
}

function completeWorkoutNow(showFullConfirmation = true) {
  if (!state.current) return;
  const completedExercises = (state.current.exercises || []).filter((exercise, index) => {
    return areExerciseSetsComplete(exercise) && (!exercise.isAddOn || state.current.sets?.[exerciseSessionKey(exercise, index)]?.some(Boolean));
  });
  const completedMainExercises = completedExercises.filter(exercise => !exercise.isAddOn);
  if (!completedMainExercises.length) return;

  completedExercises.forEach((exercise, index) => {
    const rating = state.current.ratings?.[exerciseSessionKey(exercise, index)];
    const progressionTrackKey = exercise.progressionTrackKey || exercise.trackKey;
    if (rating && state.levels[progressionTrackKey]) applyRating(progressionTrackKey, rating);
  });
  state.history.push({
    date: new Date().toISOString(),
    workout: state.current.workoutName,
    mode: state.current.mode,
    completedCount: completedMainExercises.length,
    exercises: completedExercises.map(ex => ({
      name: ex.name,
      prescription: ex.prescription,
      trackKey: ex.trackKey,
      progressionTrackKey: ex.progressionTrackKey || null,
      isAddOn: Boolean(ex.isAddOn)
    }))
  });
  state.rotationIndex = (state.rotationIndex + 1) % getRotation().length;
  state.current = null;
  state.selectedEnergy = null;
  state.generated = null;
  openExerciseTrackKey = null;
  releaseWorkoutWakeLock();
  saveState();
  renderToday();
  renderProgress();
  renderActivity();
  renderAccount();
  if (showFullConfirmation) {
    showCompletionScreen({
      title: 'Well done!',
      message: 'You showed up and that counts. Your progress is saved.',
      autoClose: true
    });
  }
  updateUpdateBanner();
}

function showWorkoutStatus(titleText = 'Well done for today.', messageText = 'You showed up, and that counts. Your progress is saved.') {
  const card = document.getElementById('workoutStatusCard');
  if (!card) return;
  const title = card.querySelector('h2');
  const message = card.querySelector('p');
  if (title) title.textContent = titleText;
  if (message) message.textContent = messageText;
  card.classList.remove('hidden');
  renderModule.focusFirstInteractive(card);
}

function dismissWorkoutStatus() {
  document.getElementById('workoutStatusCard')?.classList.add('hidden');
}
function getTrackLevel(trackKey) {
  return state.levels[trackKey]?.level || 0;
}

function getGoalTrackKey(goal) {
  if (typeof workoutModule.getGoalTrackKey === 'function') {
    return workoutModule.getGoalTrackKey(goal, getProfile(), state);
  }
  return goal === 'handstand' ? 'handstand' : goal === 'lsit' ? 'lsit' : goal === 'muscleup' ? 'muscleup' : 'pullup';
}

function getGoalJourneyTitle(goal) {
  return {
    pullup: 'Pull-up journey',
    muscleup: 'Muscle-up journey',
    handstand: 'Handstand journey',
    lsit: 'L-sit journey',
    general: 'General fitness path'
  }[goal] || 'Goal journey';
}

function hasCountableWorkoutProgress(item) {
  if (!item) return false;
  if (item.customType) return true;
  if (Number.isFinite(item.completedCount)) return item.completedCount > 0;
  const exercises = Array.isArray(item.exercises) ? item.exercises : [];
  if (exercises.some(exercise => !exercise.isAddOn)) return true;
  const date = new Date(item.date);
  return !Number.isNaN(date.getTime());
}

function countableHistory() {
  return state.history.filter(hasCountableWorkoutProgress);
}

function historyEntryId(item = {}) {
  const source = [
    item.date || '',
    item.workout || '',
    item.mode || '',
    item.type || '',
    item.customType || ''
  ].join('|');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return `${Date.parse(item.date) || 0}-${Math.abs(hash)}`;
}

function renderGeneralGoalProgress() {
  const total = countableHistory().length;
  const percent = Math.min(100, Math.round((Math.min(total, 12) / 12) * 100));
  const progress = document.getElementById('pullupProgressBar');
  if (progress) progress.style.width = `${percent}%`;
}

function renderProgress() {
  const profile = getProfile();
  const goal = profile?.goal || 'pullup';
  const goalTrackKey = getGoalTrackKey(goal);
  const tracks = getTracks();
  const track = tracks[goalTrackKey]?.length ? tracks[goalTrackKey] : tracks.pullup?.length ? tracks.pullup : baseTracks.pullup;
  if (!Array.isArray(track) || !track.length) return;
  const level = Math.max(0, Math.min(getTrackLevel(goalTrackKey), track.length - 1));
  const percent = Math.round(((level + 1) / track.length) * 100);

  const heroTitle = document.getElementById('goalHeroTitle');
  if (heroTitle) heroTitle.textContent = goalLabels[goal] || 'Pull-up';
  const progress = document.getElementById('pullupProgressBar');
  if (progress) progress.style.width = `${percent}%`;
  if (goal === 'general') renderGeneralGoalProgress();

  const levels = document.getElementById('levelsList');
  if (!levels) return;
  levels.innerHTML = '';
  const labels = {
    pullup: 'Pull-up',
    pushup: 'Push-up',
    dip: 'Dip',
    legs: 'Legs',
    core: 'Core',
    crow: 'Crow pose',
    rope: 'Jump rope',
    handstand: 'Handstand',
    lsit: 'L-sit',
    muscleup: 'Muscle-up'
  };

  Object.keys(labels).forEach(key => {
    const item = state.levels[key];
    if (!item) return;
    const exerciseTrack = getTracks()[key] || baseTracks[key];
    if (!Array.isArray(exerciseTrack) || !exerciseTrack.length) return;
    const exercise = exerciseTrack[Math.min(item.level, exerciseTrack.length - 1)];
    if (!exercise) return;
    const row = document.createElement('div');
    row.className = 'level-row';
    row.innerHTML = `<strong>${labels[key]}</strong><span>${item.level + 1}/${exerciseTrack.length}</span>`;
    levels.appendChild(row);
  });
}

function monthWeekKey(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  return Math.floor((date.getDate() + offset - 1) / 7);
}

function workoutItemsForMonth(date = new Date()) {
  return accountModule.workoutItemsForMonth(countableHistory(), date);
}

function workoutCountForMonth(date = new Date()) {
  return accountModule.workoutCountForMonth(countableHistory(), date);
}

function workoutItemsForYear(date = new Date()) {
  const year = date.getFullYear();
  return countableHistory()
    .map(item => ({ ...item, parsedDate: new Date(item.date) }))
    .filter(item => item.parsedDate.getFullYear() === year);
}

function elapsedWeeksInMonth(date = new Date()) {
  const weeks = new Set();
  for (let day = 1; day <= date.getDate(); day += 1) {
    weeks.add(monthWeekKey(new Date(date.getFullYear(), date.getMonth(), day)));
  }
  return weeks.size || 1;
}

function renderConsistency(monthlyCount, now = new Date()) {
  const title = document.getElementById('consistencyTitle');
  const message = document.getElementById('consistencyMessage');
  if (!title || !message) return;

  const activeWeeks = new Set(
    countableHistory()
      .map(item => new Date(item.date))
      .filter(date => date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear())
      .map(date => monthWeekKey(date))
  ).size;
  const elapsedWeeks = elapsedWeeksInMonth(now);

  if (!monthlyCount) {
    title.textContent = 'Your rhythm starts here.';
    message.textContent = countableHistory().length ? 'A quiet month is not a reset. Come back with one easy session.' : 'Start light. The first win is simply showing up.';
    return;
  }

  if (activeWeeks >= elapsedWeeks) {
    title.textContent = 'You showed up every week this month.';
    message.textContent = 'That is the identity we are building: someone who comes back.';
    return;
  }

  if (monthlyCount === 1) {
    if (countableHistory().length <= 1) {
      title.textContent = 'First workout logged.';
      message.textContent = 'This is the start: one honest session, saved and ready to build on.';
    } else {
      title.textContent = 'You came back this month.';
      message.textContent = 'One workout is still proof: the door is open again.';
    }
    return;
  }

  title.textContent = `You showed up in ${activeWeeks} week${activeWeeks === 1 ? '' : 's'} this month.`;
  message.textContent = 'Keep it repeatable. Consistency is built by returning, not by being perfect.';
}

function renderOnboarding() {
  const onboarding = document.getElementById('onboarding');
  if (!onboarding) return;

  // During password recovery, Supabase creates a temporary logged-in session.
  // Do not show onboarding while the user is only here to set a new password.
  if (passwordRecoveryMode || !currentUser || hasCompletedProfile()) {
    onboarding.classList.add('hidden');
    document.documentElement.classList.remove('onboarding-active');
    document.body.classList.remove('onboarding-active');
    syncScreenThemeColor();
    return;
  }

  onboarding.classList.remove('hidden');
  hideAccountSubmenuPanel();
  document.documentElement.classList.remove('welcome-active', 'account-submenu-active');
  document.body.classList.remove('welcome-active', 'account-submenu-active');
  document.documentElement.classList.add('onboarding-active');
  document.body.classList.add('onboarding-active');
  syncScreenThemeColor();
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const stepOne = document.getElementById('onboardingStepOne');
  const stepTwo = document.getElementById('onboardingStepTwo');
  const confirmation = document.getElementById('onboardingConfirmation');
  if (!stepOne || !stepTwo || !confirmation) return;

  stepOne.classList.toggle('hidden', onboardingStep !== 1 || onboardingConfirmationReady);
  stepTwo.classList.toggle('hidden', onboardingStep !== 2 || onboardingConfirmationReady);
  confirmation.classList.toggle('hidden', !onboardingConfirmationReady);
}

function showOnboardingStepTwo() {
  const goal = document.querySelector('input[name="goal"]:checked')?.value;
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(input => input.value);

  if (!goal || equipment.length === 0) {
    setPanelMessage('onboardingMessage', 'Choose a focus and equipment to continue.', 'error');
    return;
  }

  setPanelMessage('onboardingMessage', '');
  onboardingStep = 2;
  renderOnboardingStep();
  document.getElementById('onboarding')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function finishOnboarding() {
  onboardingConfirmationReady = false;
  onboardingStep = 1;
  document.documentElement.classList.remove('onboarding-active');
  document.body.classList.remove('onboarding-active');
  renderAll();
}

function saveProfileFromOnboarding() {
  const goal = document.querySelector('input[name="goal"]:checked')?.value;
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(input => input.value);
  const pushups = document.querySelector('input[name="pushups"]:checked')?.value;
  const squats = document.querySelector('input[name="squats"]:checked')?.value;
  const deadHang = equipment.includes('pullupBar') ? document.querySelector('input[name="deadHang"]:checked')?.value : null;
  const negativePullup = equipment.includes('pullupBar') ? document.querySelector('input[name="negativePullup"]:checked')?.value : null;
  const dip = equipment.includes('dipBars') ? document.querySelector('input[name="dip"]:checked')?.value : null;

  if (!goal || !pushups || !squats || equipment.length === 0) {
    setPanelMessage('onboardingMessage', 'Choose a goal, equipment, push-up level, and squat level to continue.', 'error');
    return;
  }
  if (equipment.includes('pullupBar') && (!deadHang || !negativePullup)) {
    setPanelMessage('onboardingMessage', 'Answer the pull-up bar questions to continue.', 'error');
    return;
  }
  if (equipment.includes('dipBars') && !dip) {
    setPanelMessage('onboardingMessage', 'Answer the dip bars question to continue.', 'error');
    return;
  }

  setPanelMessage('onboardingMessage', 'Building your plan...', 'info');
  state.profile = { goal, equipment, pushups, squats, deadHang, negativePullup, dip, createdAt: new Date().toISOString() };
  state.levels = initialLevelsFromProfile(state.profile, state.levels);
  state.rotationIndex = 0;
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  setPanelMessage('onboardingMessage', '');
  onboardingConfirmationReady = true;
  renderOnboardingStep();
  document.getElementById('onboarding')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function initialLevelsFromProfile(profile, existingLevels) {
  const levels = { ...defaultState().levels, ...(existingLevels || {}) };
  const pushMap = { zero: 0, oneFive: 1, sixTen: 5, tenPlus: 7 };
  const squatMap = { zeroFive: 0, sixTen: 2, tenPlus: 3 };
  const pushLevel = pushMap[profile.pushups] ?? 0;
  const squatLevel = squatMap[profile.squats] ?? 0;
  levels.pushup = { ...levels.pushup, level: pushLevel, points: 0 };
  levels.horizontalPush = { ...levels.horizontalPush, level: pushLevel, points: 0 };
  levels.legs = { ...levels.legs, level: squatLevel, points: 0 };
  levels.squat = { ...levels.squat, level: squatLevel, points: 0 };
  if (profile.equipment.includes('pullupBar')) {
    const pullLevel = profile.negativePullup === 'yes' ? 4 : profile.deadHang === 'yes' ? 0 : 0;
    levels.pullup = { ...levels.pullup, level: pullLevel, points: 0 };
    levels.verticalPull = { ...levels.verticalPull, level: pullLevel, points: 0 };
  } else {
    levels.pullup = { ...levels.pullup, level: 0, points: 0 };
    levels.horizontalPull = { ...levels.horizontalPull, level: 0, points: 0 };
  }
  if (profile.equipment.includes('dipBars')) {
    const dipLevel = profile.dip === 'yes' ? 8 : 0;
    levels.dip = { ...levels.dip, level: dipLevel, points: 0 };
    levels.dipStrength = { ...levels.dipStrength, level: dipLevel, points: 0 };
  } else {
    levels.dip = { ...levels.dip, level: 0, points: 0 };
    levels.dipStrength = { ...levels.dipStrength, level: 0, points: 0 };
  }
  return levels;
}

function updateConditionalQuestions() {
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(input => input.value);
  document.getElementById('pullupAssessment')?.classList.toggle('hidden', !equipment.includes('pullupBar'));
  document.getElementById('dipAssessment')?.classList.toggle('hidden', !equipment.includes('dipBars'));
}

function isSafeToShowUpdateBanner() {
  const accountPanel = document.getElementById('accountPanel');
  const accountSubmenuPanel = document.getElementById('accountSubmenuPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const onboarding = document.getElementById('onboarding');
  return Boolean(
    updateBannerReady &&
    currentUser &&
    !passwordRecoveryMode &&
    !isAccountDocumentRoute() &&
    !state.current &&
    !accountPanel?.classList.contains('account-open') &&
    accountSubmenuPanel?.classList.contains('hidden') &&
    loggedOut?.classList.contains('hidden') &&
    onboarding?.classList.contains('hidden')
  );
}

function updateUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.toggle('hidden', !isSafeToShowUpdateBanner());
}

function markUpdateReady(worker) {
  waitingServiceWorker = worker || waitingServiceWorker;
  updateBannerReady = versionUpdateReady;
  updateUpdateBanner();
}

function setVersionUpdateReady(isReady, latestVersion = latestKnownVersion) {
  latestKnownVersion = latestVersion || latestKnownVersion;
  versionUpdateReady = Boolean(isReady);
  updateBannerReady = versionUpdateReady;
  updateUpdateBanner();
}

function applyWaitingUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;
  versionUpdateReady = false;
  updateBannerReady = false;
  const banner = document.getElementById('updateBanner');
  if (banner) banner.classList.add('hidden');

  const reloadSoon = () => {
    window.setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const activateWorker = worker => {
    if (!worker) {
      reloadSoon();
    return;
  }
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.warn('Service worker activation failed:', error);
    }
    reloadSoon();
  };

  if (waitingServiceWorker) {
    activateWorker(waitingServiceWorker);
    return;
  }

  navigator.serviceWorker?.getRegistration?.()
    .then(registration => activateWorker(registration?.waiting))
    .catch(() => reloadSoon());
}

async function checkLiveVersion() {
  if (versionCheckInProgress) return;
  versionCheckInProgress = true;
  try {
    const response = await fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const latestVersion = typeof data.version === 'string' ? data.version.trim() : '';
    if (!latestVersion) return;
    setVersionUpdateReady(latestVersion !== APP_VERSION, latestVersion);
  } catch (error) {
    console.warn('Version check failed:', error);
  } finally {
    versionCheckInProgress = false;
  }
}


function enforceScreenSeparation() {
  const panel = document.getElementById('accountPanel');
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const loggedIn = document.getElementById('loggedInAccount');
  const onboarding = document.getElementById('onboarding');
  const screens = document.querySelectorAll('.screen');
  const bottomNav = document.querySelector('.bottom-nav');
  const accountBtn = document.getElementById('accountBtn');

  if (passwordRecoveryMode) {
    document.body.classList.add('logged-out');
    document.documentElement.classList.add('logged-out');
    document.documentElement.classList.add('recovery-boot');
    setWelcomeVisible(false);
    panel?.classList.remove('hidden', 'account-modal', 'account-open');
    submenuPanel?.classList.add('hidden');
    submenuPanel?.setAttribute('aria-hidden', 'true');
    loggedOut?.classList.remove('hidden');
    loggedIn?.classList.add('hidden');
    setAuthMode('reset');
    onboarding?.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    bottomNav?.classList.add('hidden');
    accountBtn?.classList.add('hidden');
    return;
  }

  document.documentElement.classList.remove('recovery-boot');

  if (!currentUser) {
    panel?.classList.remove('hidden', 'account-modal', 'account-open');
    submenuPanel?.classList.add('hidden');
    submenuPanel?.setAttribute('aria-hidden', 'true');
    loggedOut?.classList.remove('hidden');
    loggedIn?.classList.add('hidden');
    onboarding?.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    bottomNav?.classList.add('hidden');
    accountBtn?.classList.add('hidden');
    return;
  }

  const profileDone = hasCompletedProfile();
  screens.forEach(screen => screen.classList.toggle('auth-locked', !profileDone));
  syncBottomNavVisibility(profileDone);
  accountBtn?.classList.toggle('hidden', !profileDone && !currentUser);
}
function renderAll() {
  renderAccount();
  renderOnboarding();
  if (!passwordRecoveryMode && currentUser && hasCompletedProfile()) {
    renderToday();
    renderProgress();
    renderActivity();
  }
  enforceScreenSeparation();
  updateWelcomeGate();
  updateUpdateBanner();
}

function renderAccount() {
  const panel = document.getElementById('accountPanel');
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const loggedIn = document.getElementById('loggedInAccount');
  const email = document.getElementById('accountEmail');
  const accountBtn = document.getElementById('accountBtn');
  const bottomNav = document.querySelector('.bottom-nav');
  const screens = document.querySelectorAll('.screen');

  document.documentElement.classList.toggle('logged-out', !currentUser);
  document.body.classList.toggle('logged-out', !currentUser);

  if (!panel || !loggedOut || !loggedIn) return;

  panel.classList.toggle('account-modal', Boolean(currentUser));

	  if (!currentUser) {
	    replaceAccountRouteWithNormalUrl();
	    clearAccountRouteStartup();
	    panel.classList.remove('account-main-mode');
    hideAccountSubmenuPanel();
    document.documentElement.classList.remove('account-main-active', 'account-submenu-active');
    document.body.classList.remove('account-main-active', 'account-submenu-active');
    syncScreenThemeColor();
  }

  if (!SUPABASE_READY) {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal');
    submenuPanel?.classList.add('hidden');
    submenuPanel?.setAttribute('aria-hidden', 'true');
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    if (bottomNav) bottomNav.classList.add('hidden');
    if (accountBtn) accountBtn.classList.add('hidden');
    const muted = loggedOut.querySelector('.muted');
    if (muted) muted.textContent = 'Account connection is not configured yet.';
    return;
  }

  if (passwordRecoveryMode) {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal', 'account-open');
    submenuPanel?.classList.add('hidden');
    submenuPanel?.setAttribute('aria-hidden', 'true');
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    setAuthMode('reset');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    if (bottomNav) bottomNav.classList.add('hidden');
    if (accountBtn) accountBtn.classList.add('hidden');
    return;
  }

  if (currentUser) {
    setAuthMessage('');
    loggedOut.classList.add('hidden');
    loggedIn.classList.remove('hidden');
    const profileDone = hasCompletedProfile();
    screens.forEach(screen => screen.classList.toggle('auth-locked', !profileDone));
    syncBottomNavVisibility(profileDone);
    if (accountBtn) {
      accountBtn.classList.remove('hidden');
      accountBtn.textContent = 'Account';
    }
    if (email) email.textContent = getAccountDisplayName();
    renderAccountMainSummary();
    if (!panel.classList.contains('account-open') && submenuPanel?.classList.contains('hidden')) panel.classList.add('hidden');
  } else {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal', 'account-open');
    submenuPanel?.classList.add('hidden');
    submenuPanel?.setAttribute('aria-hidden', 'true');
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    if (bottomNav) bottomNav.classList.add('hidden');
    if (accountBtn) accountBtn.classList.add('hidden');
  }
}

function openAccountMain() {
  const panel = document.getElementById('accountPanel');
  const loggedIn = document.getElementById('loggedInAccount');
  if (!panel || !currentUser) return;

  hideNormalAppChrome();
  document.documentElement.classList.add('account-document-route');
  document.documentElement.classList.remove('account-route-content-ready');
  hideAccountSubmenuPanel();
  hideAllAccountViews();

  panel.classList.add('account-modal', 'account-open', 'account-main-mode');
  panel.classList.remove('account-password-mode');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  if (loggedIn) loggedIn.classList.remove('hidden');

  document.documentElement.classList.remove('account-submenu-active');
  document.body.classList.remove('account-submenu-active');
  document.documentElement.classList.add('account-main-active');
  document.body.classList.add('account-main-active');

  syncScreenThemeColor();
  renderAccountView('main', { panel, content: loggedIn });
  revealAccountRouteContent('main');
  updateUpdateBanner();
}

function hideAllAccountViews() {
  document.querySelectorAll('#loggedInAccount .account-view, #accountSubmenuContent .account-view').forEach(item => item.classList.add('hidden'));
}

function hideAccountMainPanel() {
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  panel.classList.remove('account-open', 'account-main-mode', 'account-password-mode');
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
}

function hideAccountSubmenuPanel() {
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  if (!submenuPanel) return;
  submenuPanel.classList.add('hidden');
  submenuPanel.setAttribute('aria-hidden', 'true');
}

function openAccountSubmenu(view) {
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  const submenuContent = document.getElementById('accountSubmenuContent');
  if (!submenuPanel || !submenuContent || !currentUser) return;

  hideNormalAppChrome();
  document.documentElement.classList.add('account-document-route');
  document.documentElement.classList.remove('account-route-content-ready');
  hideAllAccountViews();
  hideAccountMainPanel();

  document.body.classList.remove('account-main-active', 'account-submenu-active');
  document.documentElement.classList.remove('account-main-active', 'account-submenu-active');
  document.documentElement.classList.add('account-submenu-active');
  document.body.classList.add('account-submenu-active');

  syncScreenThemeColor();
  renderAccountView(view, { panel: submenuPanel, content: submenuContent });
  submenuPanel.classList.remove('hidden');
  submenuPanel.setAttribute('aria-hidden', 'false');
  revealAccountRouteContent(view);
  updateUpdateBanner();
}

function restoreRequestedAccountRoute() {
  const requestedView = getRequestedAccountView();

  if (!requestedView || passwordRecoveryMode) {
    clearAccountRouteStartup();
    return false;
  }

  if (!currentUser || !hasCompletedProfile()) {
    replaceAccountRouteWithNormalUrl();
    clearAccountRouteStartup();
    syncScreenThemeColor();
    return false;
  }

  if (requestedView === 'main') {
    openAccountMain();
    return true;
  }

  if (ACCOUNT_SUBMENU_VIEWS.has(requestedView)) {
    openAccountSubmenu(requestedView);
    return true;
  }

  clearAccountRouteStartup();
  return false;
}

function renderAccountView(view, { panel = null, content = null } = {}) {
  hideAllAccountViews();
  const target = document.getElementById(`account${view[0].toUpperCase()}${view.slice(1)}View`);
  if (target) target.classList.remove('hidden');
  const title = document.getElementById('accountModalTitle');
  if (title) title.textContent = 'somthingreat';
  const submenuTitle = document.getElementById('accountSubmenuTitle');
  if (submenuTitle) submenuTitle.textContent = 'somthingreat';

  if (panel) panel.scrollTop = 0;
  if (content) content.scrollTop = 0;
  if (view === 'goal') populateAccountGoal();
  if (view === 'equipment') populateAccountEquipment();
  if (view !== 'recovery') recoveryFormEditing = false;
  if (view === 'recovery') {
    recoveryFormEditing = false;
    populateAccountRecovery();
  }
  if (view === 'support') resetSupportForm();
  if (view === 'admin') renderAdminDashboard();
  setPanelMessage('accountGoalMessage', '');
  setPanelMessage('accountEquipmentMessage', '');
  setPanelMessage('accountRecoveryMessage', '');
  setPanelMessage('supportMessage', '');
}

function renderAccountMainSummary() {
  const profile = getProfile() || {};
  const goalSummary = document.getElementById('accountGoalSummary');
  const equipmentSummary = document.getElementById('accountEquipmentSummary');
  const recoverySummary = document.getElementById('accountRecoverySummary');
  const adminSection = document.getElementById('adminAccountSection');
  const passwordSection = document.getElementById('passwordAccountSection');
  if (adminSection) adminSection.classList.toggle('hidden', !isAdminUser());
  if (passwordSection) passwordSection.classList.toggle('hidden', !canChangePassword());
  if (goalSummary) goalSummary.textContent = goalLabels[profile.goal] || 'Not set';
  if (equipmentSummary) {
    const equipment = profile.equipment || [];
    equipmentSummary.textContent = equipment.length ? equipment.map(item => equipmentLabels[item] || item).join(', ') : 'Not set';
  }
  if (recoverySummary) {
    const recovery = getActiveRecovery();
    recoverySummary.textContent = recovery ? recoveryAreaLabels[recovery.area] || 'Active' : '';
  }
}

function populateAccountGoal() {
  const goal = getProfile()?.goal || 'pullup';
  const input = document.querySelector(`input[name="accountGoal"][value="${goal}"]`);
  if (input) input.checked = true;
}

function populateAccountEquipment() {
  const equipment = getProfile()?.equipment || ['none'];
  document.querySelectorAll('input[name="accountEquipment"]').forEach(input => {
    input.checked = equipment.includes(input.value);
  });
}

function getActiveRecovery() {
  const recovery = state.recovery;
  if (!recovery || typeof recovery !== 'object') return null;
  if (recovery.until && !Number.isNaN(new Date(recovery.until).getTime()) && new Date(recovery.until).getTime() < Date.now()) return null;
  return recovery.area ? recovery : null;
}

function recoveryEndDate(duration) {
  const config = recoveryDurations[duration];
  if (!config || config.openEnded) return null;
  const date = new Date();
  if (config.days) date.setDate(date.getDate() + config.days);
  if (config.months) date.setMonth(date.getMonth() + config.months);
  return date;
}

function formatRecoveryDate(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return '';
  const d = new Date(date);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${month}. ${d.getDate()} ${d.getFullYear()}`;
}

function recoveryStatusText(recovery) {
  if (!recovery) return '';
  const mode = recoveryModeLabels[recovery.mode] || 'Reduce load';
  if (!recovery.until) return `${mode} until you remove it`;
  return `${mode} until ${formatRecoveryDate(recovery.until)}`;
}

function populateAccountRecovery() {
  const recovery = getActiveRecovery();
  const formRecovery = recoveryFormEditing ? recovery : null;
  const areaInput = document.getElementById('recoveryAreaInput');
  const durationInput = document.getElementById('recoveryDurationInput');
  const saveBtn = document.getElementById('saveAccountRecoveryBtn');
  const card = document.getElementById('activeRecoveryCard');
  const cardArea = document.getElementById('activeRecoveryArea');
  const cardUntil = document.getElementById('activeRecoveryUntil');

  if (areaInput) areaInput.value = formRecovery?.area || '';
  if (durationInput) durationInput.value = formRecovery?.duration || '';
  document.querySelectorAll('input[name="accountRecoveryMode"]').forEach(input => {
    input.checked = (formRecovery?.mode || 'reduce') === input.value;
  });
  if (saveBtn) saveBtn.textContent = recoveryFormEditing && recovery ? 'Update recovery' : 'Add recovery';

  if (card) card.classList.toggle('hidden', !recovery);
  if (cardArea) cardArea.textContent = recovery ? recoveryAreaLabels[recovery.area] || '' : '';
  if (cardUntil) cardUntil.textContent = recoveryStatusText(recovery);
}

async function saveAccountRecovery() {
  const area = document.getElementById('recoveryAreaInput')?.value || '';
  const duration = document.getElementById('recoveryDurationInput')?.value || '';
  const mode = document.querySelector('input[name="accountRecoveryMode"]:checked')?.value || 'reduce';
  if (!area) return setPanelMessage('accountRecoveryMessage', 'Select an area first.', 'error');
  if (!duration) return setPanelMessage('accountRecoveryMessage', 'Select a duration first.', 'error');
  const until = recoveryEndDate(duration);
  state.recovery = {
    area,
    mode,
    duration,
    until: until ? until.toISOString() : null,
    createdAt: new Date().toISOString()
  };
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  recoveryFormEditing = false;
  populateAccountRecovery();
  renderAccountMainSummary();
  setPanelMessage('accountRecoveryMessage', 'Recovery saved.', 'success');
}

function editAccountRecovery() {
  recoveryFormEditing = true;
  populateAccountRecovery();
  document.getElementById('recoveryAreaInput')?.focus();
}

function removeAccountRecovery() {
  recoveryFormEditing = false;
  state.recovery = null;
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  populateAccountRecovery();
  renderAccountMainSummary();
  setPanelMessage('accountRecoveryMessage', 'Recovery removed.', 'success');
}

async function saveAccountGoal() {
  const goal = document.querySelector('input[name="accountGoal"]:checked')?.value;
  if (!goal) return setPanelMessage('accountGoalMessage', 'Choose a goal first.', 'error');
  setPanelMessage('accountGoalMessage', 'Saving goal...', 'info');
  state.profile = { ...(state.profile || {}), goal, updatedAt: new Date().toISOString() };
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  renderAll();
  populateAccountGoal();
  renderAccountMainSummary();
  setPanelMessage('accountGoalMessage', 'Goal saved.', 'success');
}

async function saveAccountEquipment() {
  const equipment = Array.from(document.querySelectorAll('input[name="accountEquipment"]:checked')).map(input => input.value);
  if (equipment.length === 0) return setPanelMessage('accountEquipmentMessage', 'Choose at least one equipment option.', 'error');
  setPanelMessage('accountEquipmentMessage', 'Saving equipment...', 'info');
  state.profile = { ...(state.profile || {}), equipment, updatedAt: new Date().toISOString() };
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  renderAll();
  populateAccountEquipment();
  renderAccountMainSummary();
  setPanelMessage('accountEquipmentMessage', 'Equipment saved.', 'success');
}

async function changePasswordFromAccount() {
  return withButtonLoading('saveAccountPasswordBtn', 'Sending...', async () => {
    if (!supabaseClient || !currentUser) return;
    const message = document.getElementById('accountPasswordMessage');
    const email = currentUser.email || document.getElementById('accountEmail')?.textContent.trim();
    renderModule.setMessage(message, '', 'info');
    if (!email) {
      renderModule.setMessage(message, 'Log in again before changing your password.', 'error');
      return;
    }
    const { error } = await sendPasswordResetToEmail(email);
    if (error) {
      renderModule.setMessage(message, friendlyAuthError(error.message), 'error');
    }
  });
}

function resetSupportForm() {
  setPanelMessage('supportMessage', '');
}

async function sendSupportMessage() {
  const button = document.getElementById('sendSupportBtn');
  const subjectInput = document.getElementById('supportSubjectInput');
  const messageInput = document.getElementById('supportMessageInput');
  const message = document.getElementById('supportMessage');
  const subject = subjectInput?.value.trim() || '';
  const body = messageInput?.value.trim() || '';

  renderModule.setMessage(message, '', 'info');
  if (!subject || !body) {
    renderModule.setMessage(message, 'Add a subject and message first.', 'error');
    return;
  }
  if (!supabaseClient || !currentUser) {
    renderModule.setMessage(message, 'Log in again before sending support.', 'error');
    return;
  }

  renderModule.setButtonLoading(button, true, 'Sending');
  const { error } = await supabaseClient.functions.invoke('support-email', {
    body: {
      subject,
      message: body,
      email: currentUser?.email || '',
      userId: currentUser?.id || '',
      appVersion: '1.0.0',
      device: navigator.userAgent,
      language: navigator.language,
      sentAt: new Date().toISOString()
    }
  });

  if (error) {
    renderModule.setButtonLoading(button, false);
    renderModule.setMessage(message, 'Could not send it yet. Try again in a moment.', 'error');
    return;
  }

  if (subjectInput) subjectInput.value = '';
  if (messageInput) messageInput.value = '';
  renderModule.setButtonLoading(button, true, 'Sent');
  setTimeout(() => renderModule.setButtonLoading(button, false), 1600);
}
function renderActivity() {
  const yearSummary = document.getElementById('historyYearSummary');
  const monthSummary = document.getElementById('historyMonthSummary');
  const yearTitle = document.getElementById('historyYearTitle');
  const title = document.getElementById('historyMonthTitle');
  const calendar = document.getElementById('historyCalendar');
  const list = document.getElementById('historyList');
  if (!yearSummary || !monthSummary || !yearTitle || !title || !calendar || !list) return;

  const month = accountHistoryMonth.getMonth();
  const year = accountHistoryMonth.getFullYear();
  const now = new Date();
  const yearItems = workoutItemsForYear(accountHistoryMonth);
  const yearCount = yearItems.length;
  const monthItems = workoutItemsForMonth(accountHistoryMonth).sort((a, b) => a.parsedDate - b.parsedDate);
  const monthCount = monthItems.length;
  yearSummary.textContent = `This year: ${yearCount} workout${yearCount === 1 ? '' : 's'}`;
  monthSummary.textContent = `This month: ${monthCount} workout${monthCount === 1 ? '' : 's'}`;
  yearTitle.textContent = String(year);
  title.textContent = accountHistoryMonth.toLocaleDateString('en-US', { month: 'long' });

  const byDay = new Map();
  monthItems.forEach(item => {
    const day = item.parsedDate.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const todayDay = now.getDate();
  const todayHistoryKey = activityDayKey(accountHistoryMonth, todayDay);
  if (!accountHistorySelectedDay && isCurrentMonth && byDay.has(todayDay) && accountHistoryDismissedDayKey !== todayHistoryKey) {
    accountHistorySelectedDay = todayDay;
  }
  const selectedWorkoutDay = accountHistorySelectedDay && byDay.has(accountHistorySelectedDay)
    ? accountHistorySelectedDay
    : null;
  accountHistorySelectedDay = selectedWorkoutDay;
  document.querySelectorAll('#activity .history-weekdays span').forEach((item, index) => {
    item.classList.toggle('is-today-weekday', isCurrentMonth && index === ((now.getDay() + 6) % 7));
  });
  calendar.innerHTML = '';
  for (let i = 0; i < mondayOffset; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'history-day history-empty';
    calendar.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const hasWorkout = byDay.has(day);
    const isToday = date.toDateString() === now.toDateString();
    const isSelected = selectedWorkoutDay === day;
    const isPast = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.historyDay = String(day);
    button.className = [
      'history-day',
      hasWorkout ? 'has-workout' : '',
      isPast && !hasWorkout ? 'past-empty' : '',
      !isPast && !isToday && !hasWorkout ? 'future-empty' : '',
      isToday ? 'is-today' : '',
      isSelected ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    button.disabled = !hasWorkout;
    button.innerHTML = `<span>${day}</span>`;
    calendar.appendChild(button);
  }

  const selectedItems = selectedWorkoutDay ? byDay.get(selectedWorkoutDay) || [] : [];
  list.innerHTML = selectedItems.length
    ? selectedItems.map(item => {
      const dateLabel = item.parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const label = item.type === 'custom'
        ? `${item.workout || 'Custom checklist'} - Custom`
        : `${item.workout || 'Workout'} - ${energyOptions[item.mode]?.title || item.mode || 'Done'}`;
      return `
        <div class="history-item">
          <div class="history-item-copy">
            <strong>${escapeHTML(dateLabel)}</strong>
            <span>${escapeHTML(label)}</span>
          </div>
        </div>
      `;
    }).join('')
    : '';
}

async function renderAdminDashboard() {
  const summary = document.getElementById('adminDashboardSummary');
  const message = document.getElementById('adminDashboardMessage');
  const list = document.getElementById('adminDashboardList');
  const toggle = document.getElementById('toggleAdminUsersBtn');
  const adminView = document.getElementById('accountAdminView');
  if (!summary || !message || !list) return;

  if (!isAdminUser()) {
    summary.textContent = 'Admin access only.';
    message.textContent = 'Admin access only.';
    list.innerHTML = '';
    return;
  }

  if (!supabaseClient) {
    summary.textContent = 'Supabase is not configured.';
    message.textContent = 'Supabase is not configured.';
    list.innerHTML = '';
    return;
  }

  summary.textContent = 'Loading dashboard...';
  message.textContent = 'Loading users...';
  list.innerHTML = '';
  if (adminView) adminView.classList.remove('admin-users-open');
  if (toggle) toggle.classList.remove('is-open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  list.classList.add('hidden');

  const [{ data: profiles, error: profileError }, { data: savedStates, error: stateError }] = await Promise.all([
    supabaseClient
      .from('workout_profiles')
      .select('id,email,current_auth_user_id,deleted_at,updated_at')
      .order('updated_at', { ascending: false }),
    supabaseClient
      .from('workout_states_v2')
      .select('profile_id,state,updated_at')
  ]);

  if (profileError || stateError) {
    summary.textContent = 'Could not load dashboard.';
    message.textContent = 'Could not load admin dashboard. Check Supabase admin policies.';
    return;
  }

  const statesByProfile = new Map((savedStates || []).map(item => [item.profile_id, item]));
  const now = new Date();
  const rows = (profiles || []).filter(profile => !profile.deleted_at).map(profile => {
    const stateRow = statesByProfile.get(profile.id);
    const savedState = stateRow?.state || null;
    return {
      email: profile.email || 'Unknown',
      active: formatAdminActive(profile, savedState, now),
      goal: formatAdminGoal(savedState),
      completed: getCompletedWorkoutCount(savedState),
      updatedAt: stateRow?.updated_at || profile.updated_at
    };
  });

  const activeCount = rows.filter(row => row.active === 'Y').length;
  const goalCounts = rows.reduce((counts, row) => {
    counts[row.goal] = (counts[row.goal] || 0) + 1;
    return counts;
  }, {});
  const topGoal = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Not set';
  summary.innerHTML = [
    `Total users: ${rows.length}`,
    `Active users: ${activeCount}`,
    `Most selected focus: ${escapeHTML(topGoal)}`
  ].join('<br>');
  message.textContent = '';
  list.innerHTML = rows.length
    ? rows.map(row => `
      <div class="admin-user-row">
        <span>${escapeHTML(row.email)}</span>
        <strong>${row.completed}</strong>
      </div>
    `).join('')
    : '<p class="muted">No active profiles found yet.</p>';
}

async function initCloudSync() {
  if (!supabaseClient) {
    replaceAccountRouteWithNormalUrl();
    clearAccountRouteStartup();
    renderAll();
    return;
  }

  passwordRecoveryMode = passwordRecoveryMode || isPasswordRecoveryUrl();

  if (passwordRecoveryMode) {
    welcomeDismissed = true;
    setWelcomeVisible(false);
    setAuthMode('reset');
    await ensureRecoverySession();
    setAuthMode('reset');
  } else {
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data.session?.user || null;
    currentProfileId = null;
    if (currentUser) await loadCloudState();
  }

  renderAll();
  restoreRequestedAccountRoute();

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    currentProfileId = null;
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryMode = true;
    if (hasRecoveryBootFlag()) passwordRecoveryMode = true;
    if (event === 'SIGNED_IN' && !passwordRecoveryMode) passwordRecoveryMode = false;
    if (event === 'SIGNED_OUT') passwordRecoveryMode = false;
    if (passwordRecoveryMode) {
      welcomeDismissed = true;
      setWelcomeVisible(false);
      setAuthMode('reset');
      if (!currentUser) await ensureRecoverySession();
    }

    // Do not block the UI on cloud sync. If Supabase profile/state loading is slow,
    // users must still leave the auth screen instead of staying on “Logging in...”.
    renderAll();
    restoreRequestedAccountRoute();
    if (currentUser && !passwordRecoveryMode) loadCloudStateInBackground();
  });
}

async function signUp() {
  return withButtonLoading('signupBtn', 'Creating...', async () => {
    passwordRecoveryMode = false;
    clearRecoveryBootFlag();
    if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');
    const email = document.getElementById('signupEmailInput')?.value.trim();
    const password = document.getElementById('signupPasswordInput')?.value;
    const confirmPassword = document.getElementById('signupConfirmPasswordInput')?.value;
    if (!email || !password || !confirmPassword) return setAuthMessage('Enter your email, password, and confirmation.', 'error');
    if (password.length < 6) return setAuthMessage('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return setAuthMessage('Passwords do not match.', 'error');
    setAuthMessage('Creating your account...', 'info');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
    currentUser = data?.session?.user || data?.user || currentUser;
    currentProfileId = null;
    if (currentUser) await loadCloudState();
    setAuthMessage('Account created. Let’s build your plan.', 'success');
    renderAll();
  });
}

async function login() {
  return withButtonLoading('loginBtn', 'Logging in...', async () => {
    passwordRecoveryMode = false;
    clearRecoveryBootFlag();
    if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');
    const email = document.getElementById('loginEmailInput')?.value.trim();
    const password = document.getElementById('loginPasswordInput')?.value;
    if (!email || !password) return setAuthMessage('Enter your email and password.', 'error');

    setAuthMessage('Logging in...', 'info');

    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.signInWithPassword({ email, password }),
        12000,
        'Login is taking too long. Check your connection and try again.'
      );

      if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');

      passwordRecoveryMode = false;
      currentUser = data?.session?.user || currentUser;
      currentProfileId = null;

      setAuthMessage('Logged in. Loading your progress...', 'success');
      renderAll();
      loadCloudStateInBackground();
    } catch (error) {
      setAuthMessage(error.message || 'Login failed. Please try again.', 'error');
    }
  });
}

async function loginWithGoogle() {
  passwordRecoveryMode = false;
  clearRecoveryBootFlag();
  if (!supabaseClient) return setAuthMessage('Google connection is not configured yet.', 'error');

  setAuthMessage('');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) setAuthMessage(friendlyAuthError(error.message), 'error');
}

async function sendPasswordReset() {
  return withButtonLoading('forgotPasswordBtn', 'Sending...', async () => {
    if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');
    const email = document.getElementById('loginEmailInput')?.value.trim();
    if (!email) return setAuthMessage('Enter your email first, then tap Forgot password.', 'error');

    setAuthMessage('');
    const { error } = await sendPasswordResetToEmail(email);
    if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
  });
}

async function updatePasswordFromRecovery() {
  return withButtonLoading('resetPasswordBtn', 'Updating...', async () => {
    if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');

    passwordRecoveryMode = true;
    const session = await ensureRecoverySession();
    if (!session?.user) return setAuthMessage('This reset link was not recognised. Please request a new reset link and open it directly from your email.', 'error');
    currentUser = session.user;

    const password = document.getElementById('resetPasswordInput')?.value;
    const confirmPassword = document.getElementById('resetConfirmPasswordInput')?.value;
    if (!password || !confirmPassword) return setAuthMessage('Enter and confirm your new password.', 'error');
    if (password.length < 6) return setAuthMessage('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return setAuthMessage('Passwords do not match.', 'error');

    setAuthMessage('Updating password...', 'info');
    const client = activeRecoveryClient || supabaseClient;
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      const lower = (error.message || '').toLowerCase();
      if (lower.includes('current password') || lower.includes('auth session missing') || lower.includes('session missing')) {
        return setAuthMessage('This reset session was not recognised. Please request a new reset link and open it directly from your email.', 'error');
      }
      return setAuthMessage(friendlyAuthError(error.message), 'error');
    }
    await finishResetToLogin(client);
  });
}

async function logout() {
  if (!supabaseClient) return;
  await signOutClient(supabaseClient);
  currentUser = null;
  currentProfileId = null;
  passwordRecoveryMode = false;
  clearAuthFields();
  welcomeDismissed = false;
  setAuthMode('welcome');
  renderAll();
}

document.addEventListener('mousedown', event => {
  if (event.target.closest('[data-toggle-password]')) event.preventDefault();
});

document.addEventListener('touchend', event => {
  const toggle = event.target.closest('[data-toggle-password]');
  if (!toggle) return;
  event.preventDefault();
  togglePasswordVisibility(toggle);
}, { passive: false });

document.addEventListener('keydown', event => {
  const timerPanel = document.getElementById('timerPanel');
  if (timerPanel && !timerPanel.classList.contains('hidden')) {
    if (event.key === 'Escape') closeWorkoutTimer();
    renderModule.trapTabKey(event, timerPanel);
    return;
  }

  const confirmPanel = document.getElementById('confirmPanel');
  if (confirmPanel && !confirmPanel.classList.contains('hidden')) {
    if (event.key === 'Escape') closeConfirmPanel();
    renderModule.trapTabKey(event, confirmPanel);
    return;
  }

  const exerciseHelpPanel = document.getElementById('exerciseHelpPanel');
  if (exerciseHelpPanel && !exerciseHelpPanel.classList.contains('hidden')) {
    if (event.key === 'Escape') closeExerciseHelp();
    renderModule.trapTabKey(event, exerciseHelpPanel);
    return;
  }

  const accountPanel = document.getElementById('accountPanel');
  const accountSubmenuPanel = document.getElementById('accountSubmenuPanel');
  if (accountSubmenuPanel && !accountSubmenuPanel.classList.contains('hidden')) {
    if (event.key === 'Escape') closeAccountRoute();
    renderModule.trapTabKey(event, accountSubmenuPanel);
    return;
  }

  if (accountPanel?.classList.contains('account-open')) {
    if (event.key === 'Escape') closeAccountRoute();
    renderModule.trapTabKey(event, accountPanel);
  }
});

document.addEventListener('click', event => {
  if (event.target.id === 'welcomeNextBtn') {
    welcomeDismissed = true;
    updateWelcomeGate();
    // Re-apply auth/onboarding visibility after the welcome screen is dismissed.
    // Without this, the hidden app shell can reappear with the active Today screen
    // still mounted behind the logged-out auth form.
    renderAccount();
    renderOnboarding();
    return;
  }

  if (event.target.id === 'welcomeLoginBtn') {
    welcomeDismissed = true;
    setAuthMode('login');
    updateWelcomeGate();
    renderAccount();
    renderOnboarding();
    return;
  }

  if (event.target.id === 'applyUpdateBtn') applyWaitingUpdate();
  if (event.target.id === 'confirmCancelBtn') closeConfirmPanel();
  if (event.target.id === 'confirmActionBtn') {
    const action = pendingConfirmAction;
    closeConfirmPanel();
    if (typeof action === 'function') action();
  }
  if (event.target.id === 'skipTimerBtn' || event.target.id === 'timerPanel') closeWorkoutTimer();
  if (event.target.id === 'closeExerciseHelpBtn' || event.target.id === 'exerciseHelpPanel') closeExerciseHelp();
  const exerciseHelpButton = event.target.closest('.exercise-help-btn');
  if (exerciseHelpButton) showExerciseHelp(exerciseHelpButton.dataset.exerciseName);

  const exerciseToggle = event.target.closest('.exercise-chip-toggle');
  if (exerciseToggle) {
    const trackKey = exerciseToggle.dataset.track;
    openExerciseTrackKey = openExerciseTrackKey === trackKey ? null : trackKey;
    renderExercises();
    return;
  }

  const setControl = event.target.closest('.set-control');
  if (setControl) {
    const trackKey = setControl.dataset.track;
    const setIndex = Number(setControl.dataset.setIndex);
    const currentDone = Boolean(state.current?.sets?.[trackKey]?.[setIndex]);
    if (setControl.dataset.timerSeconds && !currentDone) {
      const seconds = Number(setControl.dataset.timerSeconds);
      const exerciseName = setControl.dataset.exerciseName || 'Exercise';
      const setLabel = setControl.dataset.setLabel || 'Round';
      openExerciseTrackKey = trackKey;
      saveState();
      renderExercises();
      showWorkoutTimer({
        title: exerciseName,
        subtitle: setLabel,
        seconds,
        prepSeconds: 3,
        trackKey,
        setIndex,
        completeOnFinish: true
      });
      return;
    }
    markWorkoutSetDone(trackKey, setIndex, !currentDone);
    if (!currentDone && shouldStartRestTimerAfterSet(trackKey)) {
      showWorkoutTimer({
        title: 'Rest',
        subtitle: 'Rest',
        seconds: 60
      });
    }
    return;
  }

  const exerciseTimerButton = event.target.closest('.set-timer-btn');
  if (exerciseTimerButton) {
    const seconds = Number(exerciseTimerButton.dataset.timerSeconds);
    const exerciseName = exerciseTimerButton.dataset.exerciseName || 'Exercise';
    const setLabel = exerciseTimerButton.dataset.setLabel || 'Set';
    showWorkoutTimer({
      title: exerciseName,
      subtitle: `${setLabel} starts after a short countdown.`,
      seconds,
      prepSeconds: 3
    });
  }

  const feelButton = event.target.closest('.feel-btn');
  if (feelButton) selectEnergy(feelButton.dataset.feel);
  if (event.target.id === 'dismissTodayEmptyState') dismissTodayEmptyState();
  if (event.target.id === 'dismissWorkoutStatusBtn') dismissWorkoutStatus();
  if (event.target.id === 'openCustomChecklistBtn') openCustomChecklistForm();
  if (event.target.id === 'cancelCustomChecklistFormBtn') {
    resetCustomChecklistForm();
    renderToday();
  }
  if (event.target.id === 'createCustomChecklistBtn') createCustomChecklist();
  if (event.target.id === 'cancelCustomChecklistBtn') cancelCustomChecklist();
  if (event.target.id === 'completeCustomChecklistBtn') completeCustomChecklist();
  if (event.target.id === 'editCustomChecklistBtn') openCustomChecklistEdit();
  if (event.target.id === 'closeCustomChecklistEditBtn' || event.target.id === 'cancelEditCustomChecklistBtn') closeCustomChecklistEdit();
  if (event.target.id === 'confirmEditCustomChecklistBtn') confirmCustomChecklistEdit();

  if (event.target.matches('input[type="checkbox"][data-custom-check-index]')) {
    if (!state.customChecklist) return;
    const index = Number(event.target.dataset.customCheckIndex);
    state.customChecklist.items[index] = event.target.checked;
    saveState();
    renderCustomChecklist();
  }

  if (event.target.id === 'changeEnergyBtn') {
    state.selectedEnergy = null;
    state.generated = null;
    saveState();
    renderToday();
  }

  if (['includeWarmup', 'includeStretch', 'includeExerciseTimer', 'includeRestTimer'].includes(event.target.id)) {
    state.includeWarmup = Boolean(document.getElementById('includeWarmup')?.checked);
    state.includeStretch = Boolean(document.getElementById('includeStretch')?.checked);
    state.includeExerciseTimer = Boolean(document.getElementById('includeExerciseTimer')?.checked);
    state.includeRestTimer = Boolean(document.getElementById('includeRestTimer')?.checked);
    state.restTimerSeconds = 60;
    saveState();
    renderSelectedEnergy();
    updateAddOnSummary();
  }

  if (event.target.matches('input[name="restTimerSeconds"]')) {
    state.restTimerSeconds = 60;
    saveState();
    updateAddOnSummary();
  }

  if (event.target.id === 'generateWorkoutBtn') generateWorkout();
  if (event.target.id === 'regenerateWorkoutBtn') {
    state.generated = null;
    saveState();
    renderSelectedEnergy();
  }
  if (event.target.id === 'startWorkoutBtn') startWorkout();

  if (event.target.matches('input[type="checkbox"][data-set-index]')) {
    if (!state.current) return;
    const trackKey = event.target.dataset.track;
    const setIndex = Number(event.target.dataset.setIndex);
    if (!state.current.sets) state.current.sets = {};
    if (!state.current.sets[trackKey]) state.current.sets[trackKey] = [false, false, false];
    state.current.sets[trackKey][setIndex] = event.target.checked;
    saveState();
    if (event.target.checked && shouldStartRestTimerAfterSet(trackKey)) {
      const restSeconds = 60;
      showWorkoutTimer({
        title: 'Rest',
        subtitle: `Take ${restSeconds}s before the next set.`,
        seconds: restSeconds
      });
    }
  }

  if (event.target.matches('.rating-row button')) {
    const row = event.target.closest('.rating-row');
    row.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    state.current.ratings[row.dataset.track] = event.target.dataset.rating;
    const exercise = findCurrentExercise(row.dataset.track);
    if (exercise && isExerciseComplete(exercise)) {
      openNextIncompleteExercise(row.dataset.track);
    }
    saveState();
    renderExercises();
  }

  if (event.target.id === 'completeBtn') completeWorkout();

  if (event.target.id === 'accountBtn' && currentUser) navigateToAccountMain();
  if (event.target.id === 'closeAccountModalBtn') closeAccountRoute();
  if (event.target.id === 'closeAccountSubmenuBtn') closeAccountRoute();
  if (event.target.id === 'accountPanel' && event.target.classList.contains('account-modal')) closeAccountRoute();
  const accountViewButton = event.target.closest('[data-account-view]');
  if (accountViewButton) {
    const view = accountViewButton.dataset.accountView;
    if (view === 'main') {
      navigateBackToAccountMain();
    } else {
      navigateToAccountSubmenu(view);
    }
  }
  if (event.target.id === 'saveAccountGoalBtn') saveAccountGoal();
  if (event.target.id === 'saveAccountEquipmentBtn') saveAccountEquipment();
  if (event.target.id === 'saveAccountRecoveryBtn') saveAccountRecovery();
  if (event.target.id === 'editAccountRecoveryBtn') editAccountRecovery();
  if (event.target.id === 'removeAccountRecoveryBtn') removeAccountRecovery();
  if (event.target.id === 'saveAccountPasswordBtn') changePasswordFromAccount();
  if (event.target.id === 'sendSupportBtn') sendSupportMessage();
  if (event.target.id === 'historyPrevMonthBtn') {
    accountHistoryMonth = new Date(accountHistoryMonth.getFullYear(), accountHistoryMonth.getMonth() - 1, 1);
    accountHistorySelectedDay = null;
    accountHistoryDismissedDayKey = null;
    renderActivity();
  }
  if (event.target.id === 'historyNextMonthBtn') {
    accountHistoryMonth = new Date(accountHistoryMonth.getFullYear(), accountHistoryMonth.getMonth() + 1, 1);
    accountHistorySelectedDay = null;
    accountHistoryDismissedDayKey = null;
    renderActivity();
  }
  if (event.target.id === 'toggleAdminUsersBtn') {
    const list = document.getElementById('adminDashboardList');
    const isOpen = !list?.classList.contains('hidden');
    const adminView = document.getElementById('accountAdminView');
    list?.classList.toggle('hidden', isOpen);
    event.target.classList.toggle('is-open', !isOpen);
    event.target.setAttribute('aria-expanded', String(!isOpen));
    adminView?.classList.toggle('admin-users-open', !isOpen);
  }
  const historyDayButton = event.target.closest('[data-history-day]');
  if (historyDayButton && !historyDayButton.disabled) {
    const selectedDay = Number(historyDayButton.dataset.historyDay);
    const selectedKey = activityDayKey(accountHistoryMonth, selectedDay);
    if (accountHistorySelectedDay === selectedDay) {
      accountHistorySelectedDay = null;
      accountHistoryDismissedDayKey = selectedKey;
    } else {
      accountHistorySelectedDay = selectedDay;
      accountHistoryDismissedDayKey = null;
    }
    renderActivity();
  }
  if (event.target.id === 'refreshAdminDashboardBtn') renderAdminDashboard();
  const googleAuthButton = event.target.closest('[data-google-auth]');
  if (event.target.id === 'showLoginBtn') setAuthMode('login');
  if (event.target.id === 'backToAuthWelcomeFromLogin') setAuthMode('welcome');
  if (['signupBtn', 'loginBtn', 'forgotPasswordBtn', 'resetPasswordBtn'].includes(event.target.id) || googleAuthButton) {
    blurActiveAuthField();
  }
  if (event.target.id === 'signupBtn') signUp();
  if (event.target.id === 'loginBtn') login();
  if (googleAuthButton) loginWithGoogle();
  if (event.target.id === 'forgotPasswordBtn') sendPasswordReset();
  if (event.target.id === 'resetPasswordBtn') updatePasswordFromRecovery();
  if (event.target.id === 'logoutBtn') logout();
  const passwordToggle = event.target.closest('[data-toggle-password]');
  if (passwordToggle) togglePasswordVisibility(passwordToggle);
  if (event.target.id === 'onboardingNextBtn') showOnboardingStepTwo();
  if (event.target.id === 'saveProfileBtn') saveProfileFromOnboarding();
  if (event.target.id === 'startOnboardingPlanBtn') finishOnboarding();

  if (event.target.matches('.nav-btn')) {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    event.target.classList.add('active');
    event.target.setAttribute('aria-current', 'page');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(event.target.dataset.screen).classList.add('active');
    if (event.target.dataset.screen === 'today') {
      renderToday();
    } else {
      document.body.classList.remove('workout-active');
      document.documentElement.classList.remove('workout-active');
      document.querySelector('.topbar')?.classList.remove('hidden');
      syncBottomNavVisibility();
    }
    const title = document.getElementById('screenTitle');
    if (title) title.textContent = event.target.textContent;
    renderProgress();
    renderActivity();
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('input[name="equipment"]')) {
    const none = document.querySelector('input[name="equipment"][value="none"]');
    const others = Array.from(document.querySelectorAll('input[name="equipment"]:not([value="none"])'));
    if (event.target.value === 'none' && event.target.checked) others.forEach(input => input.checked = false);
    if (event.target.value !== 'none' && event.target.checked && none) none.checked = false;
    updateConditionalQuestions();
  }

  if (event.target.matches('input[name="accountEquipment"]')) {
    const none = document.querySelector('input[name="accountEquipment"][value="none"]');
    const others = Array.from(document.querySelectorAll('input[name="accountEquipment"]:not([value="none"])'));
    if (event.target.value === 'none' && event.target.checked) others.forEach(input => input.checked = false);
    if (event.target.value !== 'none' && event.target.checked && none) none.checked = false;
  }
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applyingUpdate) return;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(registration => {
    const checkForUpdate = () => {
      registration.update().catch(error => {
        console.warn('Service worker update check failed:', error);
      });
    };

    if (registration.waiting) {
      markUpdateReady(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateReady(newWorker);
        }
      });
    });

    // Check quietly on app open, resume, focus, and periodically while open.
    // The new worker activates only after the user taps Refresh.
    checkForUpdate();
    checkLiveVersion();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkForUpdate();
        checkLiveVersion();
        checkCurrentAuthSession();
      }
    });
    window.addEventListener('focus', () => {
      checkForUpdate();
      checkLiveVersion();
      checkCurrentAuthSession();
    });
    window.setInterval(() => {
      if (!document.hidden) {
        checkForUpdate();
        checkLiveVersion();
      }
    }, 60 * 1000);
  }).catch(error => {
    console.warn('Service worker registration failed:', error);
  });
}

registerServiceWorker();

setupStarAnimation();
if (!(SUPABASE_READY && getRequestedAccountView())) {
  renderAll();
}
initCloudSync();
