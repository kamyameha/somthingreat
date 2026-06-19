const INITIAL_AUTH_SEARCH = window.location.search || '';
const INITIAL_AUTH_HASH = window.location.hash || '';
const APP_VERSION = 'v8-30-css-help-cleanup';
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
let activeRecoveryClient = null;
let authSessionCheckInProgress = false;
let pendingConfirmAction = null;
let lastFocusedElement = null;

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
  try {
    return Boolean(
      window.__SOMTHINGREAT_RECOVERY_BOOT ||
      document.documentElement.classList.contains('recovery-boot') ||
      sessionStorage.getItem('somthingreat-recovery-boot') === '1'
    );
  } catch (error) {
    return Boolean(window.__SOMTHINGREAT_RECOVERY_BOOT || document.documentElement.classList.contains('recovery-boot'));
  }
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
  //   ?code=... (PKCE recovery links can temporarily look like this)
  const current = `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`;
  const initial = `${INITIAL_AUTH_SEARCH.replace(/^\?/, '')}&${INITIAL_AUTH_HASH.replace(/^#/, '')}`;
  const params = new URLSearchParams(`${initial}&${current}`);
  return (
    hasRecoveryBootFlag() ||
    params.get('reset-password') === '1' ||
    params.get('type') === 'recovery' ||
    params.get('event') === 'PASSWORD_RECOVERY' ||
    params.has('code') ||
    params.has('access_token') ||
    params.has('refresh_token') ||
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
const ADMIN_EMAILS = ['grascam@gmail.com'];
const accountModule = window.SomthingreatAccount;
const adminModule = window.SomthingreatAdmin;
const renderModule = window.SomthingreatRender;
if (!accountModule || !adminModule || !renderModule) throw new Error('Somthingreat UI modules missing.');

function setWelcomeVisible(visible) {
  const welcome = document.getElementById('welcomeScreen');
  const app = document.querySelector('.app');
  const bottomNav = document.querySelector('.bottom-nav');

  if (welcome) welcome.classList.toggle('hidden', !visible);
  if (app) app.classList.toggle('hidden', visible);
  // Only force-hide the bottom nav while the welcome screen is open.
  // When the welcome screen closes, renderAccount() decides if the nav should show.
  if (bottomNav && visible) bottomNav.classList.add('hidden');
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
  pullup: 'First Pull-Up',
  handstand: 'First Handstand',
  lsit: 'First L-Sit',
  muscleup: 'First Muscle-Up',
  general: 'General Fitness'
};

const equipmentLabels = {
  none: 'No equipment',
  pullupBar: 'Pull-up bar',
  dipBars: 'Dip bars',
  bands: 'Resistance bands',
  jumpRope: 'Jump rope'
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
function isAdminUser() {
  return adminModule.isAdminUser(currentUser, ADMIN_EMAILS);
}

function getCompletedWorkoutCount(savedState) {
  return adminModule.getCompletedWorkoutCount(savedState);
}

function formatAdminGoal(savedState) {
  return adminModule.formatAdminGoal(savedState, goalLabels);
}

function formatAdminActive(profile, savedState) {
  return adminModule.formatAdminActive(profile, savedState);
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
    button.textContent = 'Show';
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
  button.textContent = isHidden ? 'Hide' : 'Show';
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
  document.getElementById('exerciseList').innerHTML = '';
  document.getElementById('completeBtn').classList.add('hidden');

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
    document.getElementById('selectedEnergyCard').classList.add('hidden');
    document.getElementById('generatedWorkoutCard').classList.remove('hidden');
    document.getElementById('exercisePreview').classList.remove('hidden');
    renderGeneratedWorkout();
    return;
  }

  if (state.selectedEnergy) {
    renderSelectedEnergy();
    return;
  }

  document.getElementById('energyCard').classList.remove('hidden');
  document.getElementById('selectedEnergyCard').classList.add('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');

  const emptyState = document.getElementById('todayEmptyState');
  if (emptyState) {
    const shouldShowEmptyState = state.history.length === 0 && !state.todayEmptyStateDismissed;
    emptyState.classList.toggle('hidden', !shouldShowEmptyState);
  }
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
  saveState();
  renderSelectedEnergy();
}

function renderSelectedEnergy() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  const previewWorkout = getTodayWorkout(option.mode);

  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');

  const mascot = document.getElementById('selectedEnergyMascot');
  if (mascot) mascot.src = option.icon || 'Assets/Energy/normal-icon.png';

  const pill = document.getElementById('selectedEnergyPill');
  if (pill) pill.textContent = option.title;

  const workoutName = document.getElementById('selectedWorkoutName');
  if (workoutName) workoutName.textContent = previewWorkout.workoutName;

  const workoutMeta = document.getElementById('selectedWorkoutMeta');
  if (workoutMeta) workoutMeta.textContent = modeLabel(previewWorkout.mode).replace(/^\w+ · /, '');

  const warmupInput = document.getElementById('includeWarmup');
  const stretchInput = document.getElementById('includeStretch');
  if (warmupInput) warmupInput.checked = Boolean(state.includeWarmup);
  if (stretchInput) stretchInput.checked = Boolean(state.includeStretch);
  updateAddOnSummary();
}

function updateAddOnSummary() {
  const total = document.getElementById('sessionTotalPreview');
  const extra = getExtraSessionMinutes();
  if (total) total.textContent = extra ? `Workout + ${extra} min add-ons` : 'Workout only';
}

function generateWorkout() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  const baseWorkout = getTodayWorkout(option.mode);
  state.generated = applyWorkoutAddOns(baseWorkout);
  saveState();
  renderGeneratedWorkout();
}

function renderGeneratedWorkout() {
  const generated = state.generated || getTodayWorkout('normal');
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.add('hidden');
  document.getElementById('generatedWorkoutCard').classList.remove('hidden');
  document.getElementById('exercisePreview').classList.remove('hidden');
  document.getElementById('workoutName').textContent = generated.workoutName;
  document.getElementById('workoutMeta').textContent = `${modeLabel(generated.mode)} · ${sessionTotalLabel(generated)}`;

  const preview = document.getElementById('previewList');
  preview.innerHTML = '';
  (generated.exercises || []).filter(Boolean).forEach(exercise => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `<strong>${exercise.name}</strong><span>${exercise.prescription}</span>`;
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
  state.current = { ...state.generated, ratings: {}, sets: {} };
  state.current.exercises.forEach(exercise => {
    state.current.sets[exercise.trackKey] = Array.from({ length: exercise.setCount || 1 }, () => false);
  });
  state.generated = null;
  saveState();
  renderExercises();
}

function renderExercises() {
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.add('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');

  const list = document.getElementById('exerciseList');
  list.innerHTML = '';

  const titleCard = document.createElement('div');
  titleCard.className = 'hero-card';
  titleCard.innerHTML = `<p class="muted-light">Today's workout</p><h2>${state.current.workoutName}</h2><p>${modeLabel(state.current.mode)} · ${sessionTotalLabel(state.current)}</p>`;
  list.appendChild(titleCard);

  state.current = sanitizeWorkout(state.current);
  if (!state.current) { renderToday(); return; }
  state.current.exercises.forEach((exercise) => {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    const selectedRating = state.current.ratings[exercise.trackKey];
    if (!state.current.sets) state.current.sets = {};
    if (!state.current.sets[exercise.trackKey]) state.current.sets[exercise.trackKey] = Array.from({ length: exercise.setCount || 1 }, () => false);
    const completedSets = state.current.sets[exercise.trackKey];
    const setRows = Array.from({ length: exercise.setCount || completedSets.length || 1 }, (_, index) => {
      const label = exercise.setLabels?.[index] || `Set ${index + 1}`;
      return `<div class="set-row"><span>${label}</span><input type="checkbox" data-track="${exercise.trackKey}" data-set-index="${index}" ${completedSets[index] ? 'checked' : ''}></div>`;
    }).join('');
    const help = getExerciseHelp(exercise.name);
    const helpButton = help ? `<button class="exercise-help-btn" type="button" data-exercise-name="${escapeHTML(exercise.name)}" aria-label="Help with ${escapeHTML(exercise.name)}">Help</button>` : '';
    const ratingBlock = exercise.isAddOn ? '' : `
      <p class="rating-label">How was it?</p>
      <div class="rating-row" data-track="${exercise.trackKey}">
        <button data-rating="easy" class="${selectedRating === 'easy' ? 'selected' : ''}">Easy</button>
        <button data-rating="good" class="${selectedRating === 'good' ? 'selected' : ''}">Good</button>
        <button data-rating="hard" class="${selectedRating === 'hard' ? 'selected' : ''}">Hard</button>
        <button data-rating="failed" class="${selectedRating === 'failed' ? 'selected' : ''}">Failed</button>
      </div>`;
    card.innerHTML = `
      <h3>${exercise.name}${helpButton}</h3>
      <p class="prescription">${exercise.prescription}</p>
      ${setRows}
      ${ratingBlock}
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
  if (!panel || !titleEl || !messageEl || !actionBtn) return;

  lastFocusedElement = document.activeElement;
  pendingConfirmAction = onConfirm;
  titleEl.textContent = title;
  messageEl.textContent = message;
  actionBtn.textContent = actionLabel;
  panel.classList.remove('hidden');
  renderModule.focusFirstInteractive(panel);
}

function closeConfirmPanel() {
  const panel = document.getElementById('confirmPanel');
  if (panel) panel.classList.add('hidden');
  pendingConfirmAction = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function showExerciseHelp(exerciseName) {
  const help = getExerciseHelp(exerciseName);
  const panel = document.getElementById('exerciseHelpPanel');
  if (!help || !panel) return;

  lastFocusedElement = document.activeElement;
  document.getElementById('exerciseHelpTitle').textContent = exerciseName;
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

function completeWorkout(skipMissingRatingConfirm = false) {
  if (!state.current) return;
  const rateableExercises = state.current.exercises.filter(exercise => !exercise.isAddOn);
  const ratedCount = Object.keys(state.current.ratings).length;
  if (!skipMissingRatingConfirm && ratedCount < rateableExercises.length) {
    showConfirmPanel({
      title: 'Complete workout?',
      message: 'Some exercises are not rated yet. You can go back and rate them, or complete anyway.',
      actionLabel: 'Complete',
      onConfirm: () => completeWorkout(true)
    });
    return;
  }

  completeWorkoutNow();
}

function completeWorkoutNow() {
  if (!state.current) return;
  Object.entries(state.current.ratings).forEach(([trackKey, rating]) => {
    if (state.levels[trackKey]) applyRating(trackKey, rating);
  });
  state.history.push({ date: new Date().toISOString(), workout: state.current.workoutName, mode: state.current.mode, exercises: state.current.exercises.map(ex => ({ name: ex.name, prescription: ex.prescription, trackKey: ex.trackKey, isAddOn: Boolean(ex.isAddOn) })) });
  state.rotationIndex = (state.rotationIndex + 1) % getRotation().length;
  state.current = null;
  state.selectedEnergy = null;
  state.generated = null;
  saveState();
  renderToday();
  renderGoals();
  renderProgress();
  renderAccount();
  showWorkoutStatus();
  updateUpdateBanner();
}

function showWorkoutStatus() {
  const card = document.getElementById('workoutStatusCard');
  if (!card) return;
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
  return goal === 'handstand' ? 'handstand' : goal === 'lsit' ? 'lsit' : goal === 'muscleup' ? 'muscleup' : 'pullup';
}

function getGoalJourneyTitle(goal) {
  return {
    pullup: 'Pull-Up Journey',
    muscleup: 'Muscle-Up Journey',
    handstand: 'Handstand Journey',
    lsit: 'L-Sit Journey',
    general: 'General Fitness Path'
  }[goal] || 'Goal Journey';
}

function renderGeneralGoalJourney(journey) {
  const monthly = workoutCountForMonth(new Date());
  const total = state.history.length;
  const percent = Math.min(100, Math.round((Math.min(total, 12) / 12) * 100));
  const progress = document.getElementById('pullupProgressBar');
  if (progress) progress.style.width = `${percent}%`;
  journey.innerHTML = `
    <div class="journey-summary current-stage"><div><p class="eyebrow">Current focus</p><strong>Balanced training</strong><span>Workouts rotate push, pull, legs, core, and skill work so one area does not carry everything.</span></div><em>Now</em></div>
    <div class="journey-summary"><div><p class="eyebrow">Builds next</p><strong>Stronger basics</strong><span>Rate each exercise honestly. The app uses that feedback to make future sessions easier or harder.</span></div><em>Next</em></div>
    <div class="journey-summary"><div><p class="eyebrow">Progress so far</p><strong>${total} workout${total === 1 ? '' : 's'} completed</strong><span>${monthly} this month. Keep showing up to build a reliable base.</span></div><em>${Math.min(total, 12)}/12</em></div>
  `;
}

function renderGoals() {
  const profile = getProfile();
  const goal = profile?.goal || 'pullup';
  const goalTrackKey = getGoalTrackKey(goal);
  const tracks = getTracks();
  const track = tracks[goalTrackKey]?.length ? tracks[goalTrackKey] : tracks.pullup?.length ? tracks.pullup : baseTracks.pullup;
  if (!Array.isArray(track) || !track.length) return;
  const level = Math.max(0, Math.min(getTrackLevel(goalTrackKey), track.length - 1));
  const current = track[Math.min(level, track.length - 1)];
  const next = track[Math.min(level + 1, track.length - 1)];
  if (!current || !next) return;
  const percent = Math.round(((level + 1) / track.length) * 100);

  const heroTitle = document.getElementById('goalHeroTitle');
  if (heroTitle) heroTitle.textContent = goalLabels[goal] || 'First Pull-Up';
  const progress = document.getElementById('pullupProgressBar');
  if (progress) progress.style.width = `${percent}%`;

  const journey = document.getElementById('pullupJourney');
  if (!journey) return;
  const journeyTitle = document.getElementById('goalJourneyTitle');
  if (journeyTitle) journeyTitle.textContent = getGoalJourneyTitle(goal);
  if (goal === 'general') {
    renderGeneralGoalJourney(journey);
  } else {
  const completedNames = track.slice(0, level).map(step => step.name).join(' · ');
  const hasCompletedWorkout = state.history.length > 0;
  const progressLabel = hasCompletedWorkout ? 'Progress so far' : 'Starting point';
  const progressTitle = hasCompletedWorkout
    ? `Stage ${level + 1} of ${track.length}`
    : `Starting at stage ${level + 1}`;
  const progressDescription = hasCompletedWorkout
    ? (level === 0 ? 'Your first milestone is in progress.' : completedNames)
    : 'Based on your setup. Complete workouts to move through the path.';
  const progressPill = hasCompletedWorkout ? `${level + 1}/${track.length}` : 'Start';
  journey.innerHTML = `
    <div class="journey-summary current-stage"><div><p class="eyebrow">Current focus</p><strong>${current.name}</strong><span>Build consistency here: ${current.prescription}</span></div><em>Now</em></div>
    <div class="journey-summary"><div><p class="eyebrow">Unlocks next</p><strong>${level >= track.length - 1 ? 'Goal unlocked' : next.name}</strong><span>${level >= track.length - 1 ? 'Keep training and consolidate the skill.' : `Next target: ${next.prescription}`}</span></div><em>Next</em></div>
    <div class="journey-summary"><div><p class="eyebrow">${progressLabel}</p><strong>${progressTitle}</strong><span>${progressDescription}</span></div><em>${progressPill}</em></div>
  `;
  }

  const skills = [
    { key: 'pullup', label: 'Pull-Up' },
    { key: 'handstand', label: 'Handstand' },
    { key: 'lsit', label: 'L-Sit' },
    { key: 'muscleup', label: 'Muscle-Up' }
  ].filter(skill => goal === 'general' || skill.key !== goalTrackKey).slice(0, 3);
  const skillList = document.getElementById('skillList');
  if (!skillList) return;
  skillList.innerHTML = '';
  skills.forEach(skill => {
    const skillTrack = tracks[skill.key]?.length ? tracks[skill.key] : baseTracks[skill.key];
    if (!Array.isArray(skillTrack) || !skillTrack.length) return;
    const skillLevel = getTrackLevel(skill.key);
    const currentSkill = skillTrack[Math.min(skillLevel, skillTrack.length - 1)];
    if (!currentSkill) return;
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML = `<div><strong>${skill.label}</strong><p>${currentSkill.name} · ${currentSkill.prescription}</p></div><span>Level ${skillLevel + 1}/${skillTrack.length}</span>`;
    skillList.appendChild(row);
  });
}

function renderProgress() {
  const now = new Date();
  const monthly = workoutCountForMonth(now);
  document.getElementById('monthlyCount').textContent = monthly;
  renderConsistency(monthly, now);

  const levels = document.getElementById('levelsList');
  levels.innerHTML = '';
  const labels = {
    pushup: 'Push-Up',
    pullup: 'Pull-Up',
    dip: 'Dip',
    legs: 'Legs',
    core: 'Core',
    crow: 'Crow Pose',
    lsit: 'L-Sit',
    handstand: 'Handstand',
    muscleup: 'Muscle-Up',
    rope: 'Jump Rope'
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
    row.innerHTML = `<div><strong>${labels[key]}</strong><p>${exercise.name} · ${exercise.prescription}</p></div><span>L${item.level + 1}</span>`;
    levels.appendChild(row);
  });
}

function monthWeekKey(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  return Math.floor((date.getDate() + offset - 1) / 7);
}

function workoutItemsForMonth(date = new Date()) {
  return accountModule.workoutItemsForMonth(state.history, date);
}

function workoutCountForMonth(date = new Date()) {
  return accountModule.workoutCountForMonth(state.history, date);
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
    state.history
      .map(item => new Date(item.date))
      .filter(date => date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear())
      .map(date => monthWeekKey(date))
  ).size;
  const elapsedWeeks = elapsedWeeksInMonth(now);

  if (!monthlyCount) {
    title.textContent = 'Your rhythm starts here.';
    message.textContent = state.history.length ? 'A quiet month is not a reset. Come back with one easy session.' : 'Start light. The first win is simply showing up.';
    return;
  }

  if (activeWeeks >= elapsedWeeks) {
    title.textContent = 'You showed up every week this month.';
    message.textContent = 'That is the identity we are building: someone who comes back.';
    return;
  }

  if (monthlyCount === 1) {
    title.textContent = 'You came back this month.';
    message.textContent = 'One workout is still proof: the door is open again.';
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
    return;
  }

  onboarding.classList.remove('hidden');
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
  renderAll();
}

function initialLevelsFromProfile(profile, existingLevels) {
  const levels = { ...defaultState().levels, ...(existingLevels || {}) };
  const pushMap = { zero: 0, oneFive: 0, sixTen: 5, tenPlus: 7 };
  const squatMap = { zeroFive: 0, sixTen: 0, tenPlus: 1 };
  levels.pushup = { level: pushMap[profile.pushups] ?? 0, points: 0 };
  levels.legs = { level: squatMap[profile.squats] ?? 0, points: 0 };
  if (profile.equipment.includes('pullupBar')) {
    levels.pullup = { level: profile.negativePullup === 'yes' ? 1 : profile.deadHang === 'yes' ? 0 : 0, points: 0 };
  } else {
    levels.pullup = { level: 0, points: 0 };
  }
  if (profile.equipment.includes('dipBars')) {
    levels.dip = { level: profile.dip === 'yes' ? 2 : 0, points: 0 };
  } else {
    levels.dip = { level: 0, points: 0 };
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
  const onboarding = document.getElementById('onboarding');
  return Boolean(
    updateBannerReady &&
    !passwordRecoveryMode &&
    !state.current &&
    !state.selectedEnergy &&
    !state.generated &&
    !document.body.classList.contains('logged-out') &&
    !accountPanel?.classList.contains('account-open') &&
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
  updateBannerReady = Boolean(waitingServiceWorker) || versionUpdateReady;
  updateUpdateBanner();
}

function markVersionUpdateReady() {
  versionUpdateReady = true;
  updateBannerReady = true;
  updateUpdateBanner();
}

function applyWaitingUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;
  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

async function checkLiveVersion() {
  if (versionCheckInProgress || document.hidden) return;
  versionCheckInProgress = true;
  try {
    const response = await fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.version && data.version !== APP_VERSION) {
      markVersionUpdateReady();
    }
  } catch (error) {
    // Version polling is only a helper; service-worker update checks still run.
  } finally {
    versionCheckInProgress = false;
  }
}


function enforceScreenSeparation() {
  const panel = document.getElementById('accountPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const loggedIn = document.getElementById('loggedInAccount');
  const onboarding = document.getElementById('onboarding');
  const screens = document.querySelectorAll('.screen');
  const bottomNav = document.querySelector('.bottom-nav');
  const accountBtn = document.getElementById('accountBtn');

  if (passwordRecoveryMode) {
    document.body.classList.add('logged-out');
    document.documentElement.classList.add('recovery-boot');
    setWelcomeVisible(false);
    panel?.classList.remove('hidden', 'account-modal', 'account-open');
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
  bottomNav?.classList.toggle('hidden', !profileDone);
  accountBtn?.classList.toggle('hidden', !profileDone && !currentUser);
}

function renderAll() {
  renderAccount();
  renderOnboarding();
  if (!passwordRecoveryMode && currentUser && hasCompletedProfile()) {
    renderToday();
    renderGoals();
    renderProgress();
  }
  enforceScreenSeparation();
  updateWelcomeGate();
  updateUpdateBanner();
}

function renderAccount() {
  const panel = document.getElementById('accountPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const loggedIn = document.getElementById('loggedInAccount');
  const email = document.getElementById('accountEmail');
  const accountBtn = document.getElementById('accountBtn');
  const bottomNav = document.querySelector('.bottom-nav');
  const screens = document.querySelectorAll('.screen');

  document.body.classList.toggle('logged-out', !currentUser);

  if (!panel || !loggedOut || !loggedIn) return;

  panel.classList.toggle('account-modal', Boolean(currentUser));

  if (!SUPABASE_READY) {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal');
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
    if (bottomNav) bottomNav.classList.toggle('hidden', !profileDone);
    if (accountBtn) {
      accountBtn.classList.remove('hidden');
      accountBtn.textContent = 'Account';
    }
    if (email) email.textContent = currentUser.email;
    renderAccountMainSummary();
    if (!panel.classList.contains('account-open')) panel.classList.add('hidden');
  } else {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal', 'account-open');
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    if (bottomNav) bottomNav.classList.add('hidden');
    if (accountBtn) accountBtn.classList.add('hidden');
  }
}

function openAccountModal() {
  const panel = document.getElementById('accountPanel');
  if (!panel || !currentUser) return;
  panel.classList.add('account-modal', 'account-open');
  panel.classList.remove('hidden');
  showAccountView('main');
  renderModule.focusFirstInteractive(panel);
}

function closeAccountModal() {
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  panel.classList.remove('account-open');
  panel.classList.add('hidden');
  showAccountView('main');
  updateUpdateBanner();
}

function showAccountView(view) {
  const titles = {
    main: 'Account',
    goal: 'Change goal',
    equipment: 'Change equipment',
    password: 'Change password',
    history: 'Workout history',
    admin: 'Admin dashboard'
  };
  document.querySelectorAll('#loggedInAccount .account-view').forEach(item => item.classList.add('hidden'));
  const target = document.getElementById(`account${view[0].toUpperCase()}${view.slice(1)}View`);
  if (target) target.classList.remove('hidden');
  const title = document.getElementById('accountModalTitle');
  if (title) title.textContent = titles[view] || 'Account';
  const closeBtn = document.getElementById('closeAccountModalBtn');
  if (closeBtn) closeBtn.classList.toggle('hidden', view !== 'main');
  const panel = document.getElementById('accountPanel');
  const content = document.getElementById('loggedInAccount');
  if (panel) panel.classList.toggle('account-password-mode', view === 'password');
  if (panel) panel.scrollTop = 0;
  if (content) content.scrollTop = 0;
  if (view === 'goal') populateAccountGoal();
  if (view === 'equipment') populateAccountEquipment();
  if (view === 'history') renderAccountHistory();
  if (view === 'admin') renderAdminDashboard();
  setPanelMessage('accountGoalMessage', '');
  setPanelMessage('accountEquipmentMessage', '');
}

function renderAccountMainSummary() {
  const profile = getProfile() || {};
  const goalSummary = document.getElementById('accountGoalSummary');
  const equipmentSummary = document.getElementById('accountEquipmentSummary');
  const historySummary = document.getElementById('accountHistorySummary');
  const adminSection = document.getElementById('adminAccountSection');
  if (adminSection) adminSection.classList.toggle('hidden', !isAdminUser());
  if (goalSummary) goalSummary.textContent = goalLabels[profile.goal] || 'Not set';
  if (equipmentSummary) {
    const equipment = profile.equipment || [];
    equipmentSummary.textContent = equipment.length ? equipment.map(item => equipmentLabels[item] || item).join(', ') : 'Not set';
  }
  if (historySummary) {
    const count = workoutCountForMonth(new Date());
    historySummary.textContent = `${count} workout${count === 1 ? '' : 's'}`;
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
  openAccountModal();
  showAccountView('main');
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
  openAccountModal();
  showAccountView('main');
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
    renderModule.setMessage(message, 'Sending reset link...', 'info');
    const { error } = await sendPasswordResetToEmail(email);
    if (error) {
      renderModule.setMessage(message, friendlyAuthError(error.message), 'error');
      return;
    }
    renderModule.setMessage(message, 'Password reset link sent. Check your email.', 'success');
  });
}

function renderAccountHistory() {
  const title = document.getElementById('historyMonthTitle');
  const calendar = document.getElementById('historyCalendar');
  const list = document.getElementById('historyList');
  if (!title || !calendar || !list) return;

  const month = accountHistoryMonth.getMonth();
  const year = accountHistoryMonth.getFullYear();
  const label = accountHistoryMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  title.textContent = label;

  const monthItems = workoutItemsForMonth(accountHistoryMonth).sort((a, b) => a.parsedDate - b.parsedDate);

  accountModule.renderHistoryCalendar(calendar, accountHistoryMonth, monthItems);
  accountModule.renderHistoryList(list, monthItems, energyOptions);
}

async function renderAdminDashboard() {
  const message = document.getElementById('adminDashboardMessage');
  const list = document.getElementById('adminDashboardList');
  if (!message || !list) return;

  if (!isAdminUser()) {
    message.textContent = 'Admin access only.';
    list.innerHTML = '';
    return;
  }

  if (!supabaseClient) {
    message.textContent = 'Supabase is not configured.';
    list.innerHTML = '';
    return;
  }

  message.textContent = 'Loading users...';
  list.innerHTML = '';

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
    message.textContent = 'Could not load admin dashboard. Check Supabase admin policies.';
    return;
  }

  const statesByProfile = new Map((savedStates || []).map(item => [item.profile_id, item]));
  const rows = (profiles || []).filter(profile => !profile.deleted_at).map(profile => {
    const stateRow = statesByProfile.get(profile.id);
    const savedState = stateRow?.state || null;
    return {
      email: profile.email || 'Unknown',
      active: formatAdminActive(profile, savedState),
      goal: formatAdminGoal(savedState),
      completed: getCompletedWorkoutCount(savedState),
      updatedAt: stateRow?.updated_at || profile.updated_at
    };
  });

  message.textContent = `${rows.length} active profile${rows.length === 1 ? '' : 's'}`;
  list.innerHTML = rows.length
    ? rows.map(row => `
      <div class="admin-user-row compact-admin-row">
        <strong>${escapeHTML(row.active)}</strong>
        <div class="admin-user-stats">
          <span>${row.completed} workout${row.completed === 1 ? '' : 's'}</span>
          <span>${escapeHTML(row.goal)}</span>
        </div>
      </div>
    `).join('')
    : '<p class="muted">No active profiles found yet.</p>';
}

async function initCloudSync() {
  if (!supabaseClient) {
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

async function sendPasswordReset() {
  return withButtonLoading('forgotPasswordBtn', 'Sending...', async () => {
    if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');
    const email = document.getElementById('loginEmailInput')?.value.trim();
    if (!email) return setAuthMessage('Enter your email first, then tap Forgot password.', 'error');

    setAuthMessage('Sending reset link...', 'info');
    const { error } = await sendPasswordResetToEmail(email);
    if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
    setAuthMessage('Password reset link sent. Check your email.', 'success');
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
  if (event.target.matches('[data-toggle-password]')) event.preventDefault();
});

document.addEventListener('touchend', event => {
  if (!event.target.matches('[data-toggle-password]')) return;
  event.preventDefault();
  togglePasswordVisibility(event.target);
}, { passive: false });

document.addEventListener('keydown', event => {
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
  if (accountPanel?.classList.contains('account-open')) {
    if (event.key === 'Escape') closeAccountModal();
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

  if (event.target.id === 'applyUpdateBtn') applyWaitingUpdate();
  if (event.target.id === 'confirmCancelBtn') closeConfirmPanel();
  if (event.target.id === 'confirmActionBtn') {
    const action = pendingConfirmAction;
    closeConfirmPanel();
    if (typeof action === 'function') action();
  }
  if (event.target.id === 'closeExerciseHelpBtn' || event.target.id === 'exerciseHelpPanel') closeExerciseHelp();
  const exerciseHelpButton = event.target.closest('.exercise-help-btn');
  if (exerciseHelpButton) showExerciseHelp(exerciseHelpButton.dataset.exerciseName);

  const feelButton = event.target.closest('.feel-btn');
  if (feelButton) selectEnergy(feelButton.dataset.feel);
  if (event.target.id === 'dismissTodayEmptyState') dismissTodayEmptyState();
  if (event.target.id === 'dismissWorkoutStatusBtn') dismissWorkoutStatus();

  if (event.target.id === 'changeEnergyBtn') {
    state.selectedEnergy = null;
    state.generated = null;
    saveState();
    renderToday();
  }

  if (event.target.id === 'includeWarmup' || event.target.id === 'includeStretch') {
    state.includeWarmup = Boolean(document.getElementById('includeWarmup')?.checked);
    state.includeStretch = Boolean(document.getElementById('includeStretch')?.checked);
    saveState();
    updateAddOnSummary();
  }

  if (event.target.id === 'generateWorkoutBtn') generateWorkout();
  if (event.target.id === 'regenerateWorkoutBtn') {
    state.generated = null;
    state.selectedEnergy = null;
    state.includeWarmup = false;
    state.includeStretch = false;
    saveState();
    renderToday();
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
  }

  if (event.target.matches('.rating-row button')) {
    const row = event.target.closest('.rating-row');
    row.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    state.current.ratings[row.dataset.track] = event.target.dataset.rating;
    saveState();
  }

  if (event.target.id === 'completeBtn') completeWorkout();

  if (event.target.id === 'accountBtn' && currentUser) openAccountModal();
  if (event.target.id === 'closeAccountModalBtn') closeAccountModal();
  if (event.target.id === 'accountPanel' && event.target.classList.contains('account-modal')) closeAccountModal();
  const accountViewButton = event.target.closest('[data-account-view]');
  if (accountViewButton) showAccountView(accountViewButton.dataset.accountView);
  if (event.target.id === 'saveAccountGoalBtn') saveAccountGoal();
  if (event.target.id === 'saveAccountEquipmentBtn') saveAccountEquipment();
  if (event.target.id === 'saveAccountPasswordBtn') changePasswordFromAccount();
  if (event.target.id === 'historyPrevMonthBtn') { accountHistoryMonth = new Date(accountHistoryMonth.getFullYear(), accountHistoryMonth.getMonth() - 1, 1); renderAccountHistory(); }
  if (event.target.id === 'historyNextMonthBtn') { accountHistoryMonth = new Date(accountHistoryMonth.getFullYear(), accountHistoryMonth.getMonth() + 1, 1); renderAccountHistory(); }
  if (event.target.id === 'refreshAdminDashboardBtn') renderAdminDashboard();
  if (event.target.id === 'showLoginBtn') setAuthMode('login');
  if (event.target.id === 'backToAuthWelcomeFromLogin') setAuthMode('welcome');
  if (['signupBtn', 'loginBtn', 'forgotPasswordBtn', 'resetPasswordBtn'].includes(event.target.id)) {
    blurActiveAuthField();
  }
  if (event.target.id === 'signupBtn') signUp();
  if (event.target.id === 'loginBtn') login();
  if (event.target.id === 'forgotPasswordBtn') sendPasswordReset();
  if (event.target.id === 'resetPasswordBtn') updatePasswordFromRecovery();
  if (event.target.id === 'logoutBtn') logout();
  if (event.target.matches('[data-toggle-password]')) togglePasswordVisibility(event.target);
  if (event.target.id === 'saveProfileBtn') saveProfileFromOnboarding();

  if (event.target.matches('.nav-btn')) {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    event.target.classList.add('active');
    event.target.setAttribute('aria-current', 'page');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(event.target.dataset.screen).classList.add('active');
    const title = document.getElementById('screenTitle');
    if (title) title.textContent = event.target.textContent;
    renderGoals();
    renderProgress();
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
renderAll();
initCloudSync();
