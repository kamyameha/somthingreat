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
let authResolved = false;
let authLoadingStartedAt = Date.now();
let authenticatedAppReadyPromise = null;
let preparedAuthUserId = null;
let todayMascotPreloadPromise = null;
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
let workoutCompletionState = null;
let workoutWakeLock = null;
let onboardingStep = 1;
let onboardingConfirmationReady = false;
let accountHistoryDismissedDayKey = null;
let recoveryFormEditing = false;
let detailedSessionFlushInProgress = false;
let todayPreviewTimer = null;
let todayMascotTimer = null;
let todayReactionTimers = [];
let energyPointerStart = null;
let energyScrollGesture = false;
let cloudSavePromise = null;
let cloudSaveRequested = false;
let workoutCompletionSaveInProgress = false;
let renderedWorkoutSessionId = null;
let swapAvailabilityMessageTimer = null;
let accountReturnState = null;
let accountHistoryEntryActive = false;
let accountHistoryBackInFlight = false;

const ACCOUNT_SUBMENU_VIEWS = new Set(['goal', 'equipment', 'recovery', 'password', 'support', 'tracker']);
const AUTH_LOADING_MIN_MS = 450;
const TODAY_PREVIEW_DELAY_MS = 900;
const TODAY_REDUCED_PREVIEW_DELAY_MS = 600;
const TODAY_MASCOT_FRAME_MS = 600;
const TODAY_MASCOT_REACTION_B_MS = 200;
const TODAY_MASCOT_REACTION_A_MS = 600;
const TODAY_MASCOT_FRAMES = {
  empty: ['Assets/EnergyCheck/empty-state-a.svg', 'Assets/EnergyCheck/empty-state-b.svg'],
  great: ['Assets/EnergyCheck/great-a.svg', 'Assets/EnergyCheck/great-b.svg'],
  normal: ['Assets/EnergyCheck/normal-a.svg', 'Assets/EnergyCheck/normal-b.svg'],
  tired: ['Assets/EnergyCheck/tired-a.svg', 'Assets/EnergyCheck/tired-b.svg'],
  exhausted: ['Assets/EnergyCheck/exhausted-a.svg', 'Assets/EnergyCheck/exhausted-b.svg']
};

function persistenceDiagnostic(event, details = {}) {
  const enabled = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    localStorage.getItem('somthingreat-persistence-debug') === '1';
  if (!enabled) return;
  console.debug(`[workout-persistence] ${event}`, {
    userId: currentUser?.id || null,
    ...details
  });
}

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
      resetAuthUI('welcome');
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
const accountModule = window.SomthingreatAccount;
const renderModule = window.SomthingreatRender;
if (!accountModule || !renderModule) throw new Error('Somthingreat UI modules missing.');

function setWelcomeVisible(visible) {
  const welcome = document.getElementById('welcomeScreen');
  const app = document.querySelector('.app');
  const bottomNav = document.querySelector('.bottom-nav');

	  document.documentElement.classList.toggle('welcome-active', visible);
	  document.body.classList.toggle('welcome-active', visible);
	  if (visible) {
	    document.documentElement.classList.remove('onboarding-active', 'confirmation-active', 'account-active', 'workout-active', 'today-active');
	    document.body.classList.remove('onboarding-active', 'confirmation-active', 'account-active', 'workout-active', 'today-active');
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

function setAuthResolved(resolved = true) {
  authResolved = Boolean(resolved);
  document.documentElement.classList.toggle('auth-loading', !authResolved);
  document.body.classList.toggle('auth-loading', !authResolved);
  document.getElementById('authLoadingScreen')?.setAttribute('aria-hidden', authResolved ? 'true' : 'false');
}

function beginAuthLoading() {
  authLoadingStartedAt = Date.now();
  setAuthResolved(false);
}

function waitForReadyPaint() {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

async function revealPreparedApp() {
  await preloadTodayMascots();
  renderAll();
  await waitForReadyPaint();
  const remaining = AUTH_LOADING_MIN_MS - (Date.now() - authLoadingStartedAt);
  if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
  setAuthResolved(true);
}

async function prepareAuthenticatedApp() {
  if (!currentUser || passwordRecoveryMode) return;
  if (preparedAuthUserId === currentUser.id && authResolved) return;
  if (authenticatedAppReadyPromise) return authenticatedAppReadyPromise;

  const userId = currentUser.id;
  beginAuthLoading();
  authenticatedAppReadyPromise = (async () => {
    try {
      await withTimeout(loadCloudState(), 12000, 'Cloud sync is taking too long. Local progress is still available.');
    } catch (error) {
      setSyncStatus(error.message || 'Could not load progress. Local progress is still available.');
    }
    await revealPreparedApp();
    if (currentUser?.id === userId) preparedAuthUserId = userId;
  })().finally(() => {
    authenticatedAppReadyPromise = null;
  });

  return authenticatedAppReadyPromise;
}

function setupStarAnimation() {
  const stars = Array.from(document.querySelectorAll('.welcome-star'));
  if (!stars.length) return;

  const frames = [
    'Assets/Animations/start1.png',
    'Assets/Animations/start2.png',
    'Assets/Animations/start3.png'
  ];

  let frame = 0;
  stars.forEach(star => { star.src = frames[frame]; });

  window.setInterval(() => {
    frame = (frame + 1) % frames.length;
    stars.forEach(star => { star.src = frames[frame]; });
  }, 600);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function preloadTodayMascots() {
  if (todayMascotPreloadPromise) return todayMascotPreloadPromise;
  todayMascotPreloadPromise = Promise.all(Object.values(TODAY_MASCOT_FRAMES).flat().map(src => new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  })));
  return todayMascotPreloadPromise;
}

function clearTodayMascotTimers() {
  clearTimeout(todayMascotTimer);
  todayMascotTimer = null;
  todayReactionTimers.forEach(timer => clearTimeout(timer));
  todayReactionTimers = [];
}

function clearTodaySelectionTimers() {
  clearTimeout(todayPreviewTimer);
  todayPreviewTimer = null;
  clearTodayMascotTimers();
}

function currentTodayMascotFrames() {
  return TODAY_MASCOT_FRAMES[state?.selectedEnergy || 'empty'] || TODAY_MASCOT_FRAMES.empty;
}

function setTodayMascotFrame(frameIndex = 0) {
  const mascot = document.getElementById('todayMascot');
  const frames = currentTodayMascotFrames();
  const nextFrame = frames[frameIndex] || frames[0];
  if (mascot && mascot.getAttribute('src') !== nextFrame) mascot.src = nextFrame;
}

function syncTodayMascotSources() {
  setTodayMascotFrame(0);
}

function startTodayMascotIdle() {
  clearTodayMascotTimers();
  setTodayMascotFrame(0);
  if (prefersReducedMotion()) return;

  let frame = 0;
  const showNextFrame = () => {
    frame = (frame + 1) % currentTodayMascotFrames().length;
    setTodayMascotFrame(frame);
    todayMascotTimer = window.setTimeout(showNextFrame, TODAY_MASCOT_FRAME_MS);
  };

  todayMascotTimer = window.setTimeout(showNextFrame, TODAY_MASCOT_FRAME_MS);
}

function playTodayMascotReaction() {
  clearTodayMascotTimers();
  setTodayMascotFrame(0);
  if (prefersReducedMotion()) return;

  todayReactionTimers = [
    window.setTimeout(() => setTodayMascotFrame(1), TODAY_MASCOT_REACTION_B_MS),
    window.setTimeout(() => startTodayMascotIdle(), TODAY_MASCOT_REACTION_A_MS)
  ];
}

function updateWelcomeGate() {
  // Recovery links must bypass the animated welcome screen and go straight
  // to the password reset form. Otherwise the user lands on Welcome instead
  // of seeing the reset fields.
  if (!authResolved) {
    setWelcomeVisible(false);
    return;
  }
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
  pistolSquat: 'Pistol squat'
};

const equipmentLabels = {
  none: 'No equipment',
  pullupBar: 'Pull-up bar',
  dipBars: 'Dip bars',
  bands: 'Resistance bands',
  jumpRope: 'Jump rope'
};
const deprecatedProfileEquipment = new Set(['jumpRope']);

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
  return workoutModule.getRotation(getProfile(), state);
}

function hasCompletedProfile() {
  return Boolean(state.profile?.goal && Array.isArray(state.profile?.equipment) && state.profile.equipment.length && state.profile?.pushups && state.profile?.squats);
}

function needsPrioritySkillSelection() {
  return Boolean(state.profile?.prioritySkillRequired || (state.profile && !state.profile.goal));
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
  return workoutModule.applyWorkoutAddOns(workout, addOns, { state, profile: getProfile() });
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
  const updatedAt = new Date().toISOString();
  state.lastUpdatedAt = updatedAt;
  if (state.current) {
    state.current.lifecycleStatus = 'active';
    state.current.updatedAt = updatedAt;
  }
  state = stateStore.saveState(state);
  persistenceDiagnostic('local-save', {
    sessionId: state.current?.sessionId || null,
    lifecycleStatus: state.current?.lifecycleStatus || 'closed',
    historySessionIds: state.history.map(item => item.sessionId).filter(Boolean),
    completedSetCounts: state.current
      ? Object.fromEntries(Object.entries(state.current.sets || {}).map(([key, sets]) => [key, sets.filter(Boolean).length]))
      : {}
  });
  queueCloudSave();
}

function saveLocalStateOnly() {
  const updatedAt = new Date().toISOString();
  state.lastUpdatedAt = updatedAt;
  if (state.current) {
    state.current.lifecycleStatus = 'active';
    state.current.updatedAt = updatedAt;
  }
  state = stateStore.writeLocalState(state);
}

function publicState() {
  return stateStore.publicState(state);
}

function createSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function queueDetailedSession(record) {
  if (!record?.sessionId) return;
  if (!Array.isArray(state.pendingSessionRecords)) state.pendingSessionRecords = [];
  const existingIndex = state.pendingSessionRecords.findIndex(item => item.sessionId === record.sessionId);
  if (existingIndex >= 0) state.pendingSessionRecords[existingIndex] = record;
  else state.pendingSessionRecords.push(record);
}

async function flushPendingSessionRecords() {
  if (detailedSessionFlushInProgress || !supabaseClient || !currentUser) return;
  if (!Array.isArray(state.pendingSessionRecords) || !state.pendingSessionRecords.length) return;
  const profileId = currentProfileId || await ensureWorkoutProfile();
  if (!profileId) return;
  detailedSessionFlushInProgress = true;
  try {
    for (const pending of [...state.pendingSessionRecords]) {
      const { error } = await supabaseClient.rpc('record_workout_session', {
        p_payload: { ...pending, profileId }
      });
      if (error) {
        console.warn('Detailed workout history will retry later:', error.message);
        break;
      }
      state.pendingSessionRecords = state.pendingSessionRecords.filter(item => item.sessionId !== pending.sessionId);
      saveLocalStateOnly();
    }
  } finally {
    detailedSessionFlushInProgress = false;
  }
}

function queueCloudSave() {
  if (!supabaseClient || !currentUser) return;
  clearTimeout(syncTimer);
  cloudSaveRequested = true;
  syncTimer = setTimeout(() => saveCloudState(), 500);
}

function normaliseEmail(email = '') {
  return String(email).trim().toLowerCase();
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
  const isConfirmationScreen = root.classList.contains('confirmation-active');
  const isBlueScreen = root.classList.contains('onboarding-active') ||
    root.classList.contains('workout-active');
  const isMenuScreen = root.classList.contains('account-active');
  setThemeColor(isConfirmationScreen ? '#D2F672' : isMenuScreen ? '#1c1c1c' : isBlueScreen ? '#012ded' : '#ffffff');
}

function setAccountActive(active) {
  document.documentElement.classList.toggle('account-active', active);
  document.body.classList.toggle('account-active', active);
  if (active) setThemeColor('#1c1c1c');
}

function ensureAccountHistoryEntry() {
  if (accountHistoryEntryActive) return;
  window.history.pushState(
    { ...(window.history.state || {}), somthingreatMenu: true },
    document.title,
    window.location.href
  );
  accountHistoryEntryActive = true;
}

function captureAccountReturnState() {
  if (accountReturnState) return;
  const root = document.documentElement;
  const body = document.body;
  const app = document.querySelector('.app');
  const activeScreen = document.querySelector('.screen.active');
  accountReturnState = {
    activeScreenId: activeScreen?.id || '',
    appScrollTop: app?.scrollTop || 0,
    documentScrollTop: document.scrollingElement?.scrollTop || 0,
    rootTodayActive: root.classList.contains('today-active'),
    bodyTodayActive: body.classList.contains('today-active'),
    rootWorkoutActive: root.classList.contains('workout-active'),
    bodyWorkoutActive: body.classList.contains('workout-active'),
    rootBackgroundColor: root.style.backgroundColor,
    bodyBackgroundColor: body.style.backgroundColor,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || '#ffffff',
    focusedElement: document.activeElement
  };
}

function restoreAccountReturnState() {
  const saved = accountReturnState;
  accountReturnState = null;
  const root = document.documentElement;
  const body = document.body;
  const app = document.querySelector('.app');
  const panel = document.getElementById('accountPanel');
  const submenuPanel = document.getElementById('accountSubmenuPanel');

  panel?.classList.remove('account-open', 'account-main-mode', 'account-password-mode');
  submenuPanel?.classList.remove('account-submenu-mode');
  if (panel) {
    panel.scrollTop = 0;
    panel.inert = true;
  }
  if (submenuPanel) {
    submenuPanel.scrollTop = 0;
    submenuPanel.inert = true;
  }
  if (typeof document.activeElement?.blur === 'function') document.activeElement.blur();

  if (!saved) {
    syncScreenThemeColor();
    syncBottomNavVisibility();
    return;
  }

  root.classList.toggle('today-active', saved.rootTodayActive);
  body.classList.toggle('today-active', saved.bodyTodayActive);
  root.classList.toggle('workout-active', saved.rootWorkoutActive);
  body.classList.toggle('workout-active', saved.bodyWorkoutActive);
  root.style.backgroundColor = saved.rootBackgroundColor;
  body.style.backgroundColor = saved.bodyBackgroundColor;
  setMetaContent('theme-color', saved.themeColor);
  syncBottomNavVisibility();
  if (saved.activeScreenId === 'today' && saved.bodyTodayActive) syncTodayMascotSources();

  const restoreScroll = () => {
    if (app) app.scrollTop = saved.appScrollTop;
    if (document.scrollingElement) document.scrollingElement.scrollTop = saved.documentScrollTop;
  };
  restoreScroll();
  window.requestAnimationFrame(() => {
    restoreScroll();
    if (saved.focusedElement?.isConnected && typeof saved.focusedElement.focus === 'function') {
      saved.focusedElement.focus({ preventScroll: true });
    }
  });
}

function focusAccountViewHeading(view) {
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

  const shouldHide = !profileDone ||
    passwordRecoveryMode ||
    !currentUser ||
    document.documentElement.classList.contains('welcome-active') ||
    document.documentElement.classList.contains('account-active') ||
    document.body.classList.contains('workout-active');

  bottomNav.classList.toggle('hidden', shouldHide);
}

function resetMainRouteScroll() {
  const app = document.querySelector('.app');
  const root = document.scrollingElement;
  if (app) app.scrollTop = 0;
  if (root) root.scrollTop = 0;
}

function resetRouteScrollOnEntry() {
  resetMainRouteScroll();
  window.requestAnimationFrame(resetMainRouteScroll);
}

function openAccountModal() {
  openAccountMain();
}

function showAccountView(view = 'main') {
  if (view === 'main') {
    openAccountMain();
    return;
  }
  if (ACCOUNT_SUBMENU_VIEWS.has(view)) openAccountSubmenu(view);
}

function closeAccountModal(fromHistory = false) {
  const panel = document.getElementById('accountPanel');
  const submenuPanel = document.getElementById('accountSubmenuPanel');

  panel?.classList.remove('account-open', 'account-main-mode', 'account-password-mode');
  panel?.classList.add('hidden');
  panel?.setAttribute('aria-hidden', 'true');
  submenuPanel?.classList.remove('account-submenu-mode');
  submenuPanel?.classList.add('hidden');
  submenuPanel?.setAttribute('aria-hidden', 'true');
  hideAllAccountViews();
  setAccountActive(false);
  restoreAccountReturnState();
  if (accountHistoryEntryActive) {
    accountHistoryEntryActive = false;
    if (!fromHistory) {
      accountHistoryBackInFlight = true;
      window.history.back();
    }
  }
  updateUpdateBanner();
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

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
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

async function writeCloudStateSnapshot(snapshot) {
  if (!supabaseClient || !currentUser) return true;
  const profileId = currentProfileId || await ensureWorkoutProfile();
  if (!profileId) return false;

  setSyncStatus('Saving...');
  const { error } = await supabaseClient
    .from('workout_states_v2')
    .upsert({ profile_id: profileId, state: snapshot, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  setSyncStatus(error ? 'Save failed. Local progress is still saved.' : 'Progress saved.');
  persistenceDiagnostic(error ? 'cloud-save-failed' : 'cloud-save-complete', {
    sessionId: snapshot.current?.sessionId || null,
    lifecycleStatus: snapshot.current?.lifecycleStatus || 'closed',
    historySessionIds: (snapshot.history || []).map(item => item.sessionId).filter(Boolean),
    stateUpdatedAt: snapshot.lastUpdatedAt || null
  });
  return !error;
}

function saveCloudState() {
  clearTimeout(syncTimer);
  cloudSaveRequested = true;
  if (cloudSavePromise) return cloudSavePromise;

  cloudSavePromise = (async () => {
    while (cloudSaveRequested) {
      cloudSaveRequested = false;
      const saved = await writeCloudStateSnapshot(publicState());
      if (!saved) break;
    }
  })().finally(() => {
    cloudSavePromise = null;
  });

  return cloudSavePromise;
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
    .select('state, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    setSyncStatus('Could not load progress. Local progress is still available.');
    return;
  }

  const legacyState = !data?.state ? await loadLegacyCloudState() : null;
  const cloudState = data?.state
    ? { ...data.state, lastUpdatedAt: data.state.lastUpdatedAt || data.updated_at || null }
    : legacyState;

  if (cloudState) {
    const localPending = Array.isArray(state.pendingSessionRecords) ? state.pendingSessionRecords : [];
    state = stateStore.reconcileStates(state, cloudState);
    persistenceDiagnostic('cloud-restore-reconciled', {
      cloudSessionId: cloudState.current?.sessionId || null,
      restoredSessionId: state.current?.sessionId || null,
      closedSessionIds: state.closedWorkoutSessionIds,
      historySessionIds: state.history.map(item => item.sessionId).filter(Boolean),
      cloudUpdatedAt: cloudState.lastUpdatedAt || null,
      localUpdatedAt: state.lastUpdatedAt || null
    });
    const pendingById = new Map([...(state.pendingSessionRecords || []), ...localPending]
      .filter(item => item?.sessionId)
      .map(item => [item.sessionId, item]));
    state.pendingSessionRecords = [...pendingById.values()];
    saveLocalStateOnly();
    await saveCloudState();
    renderAll();
    setSyncStatus(legacyState ? 'Progress recovered and upgraded.' : 'Progress reconciled.');
  } else {
    state = sanitizeState(state);
    saveLocalStateOnly();
    await saveCloudState();
    renderAll();
    setSyncStatus('Progress saved.');
  }
  flushPendingSessionRecords();
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

function applyLoggedOutAuthSurfaceState() {
  const root = document.documentElement;
  const body = document.body;
  const panel = document.getElementById('accountPanel');
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  const loggedOut = document.getElementById('loggedOutAccount');
  const loggedIn = document.getElementById('loggedInAccount');
  const app = document.querySelector('.app');
  const bottomNav = document.querySelector('.bottom-nav');

  root.classList.add('logged-out');
  body.classList.add('logged-out');
  root.classList.remove('onboarding-active', 'confirmation-active', 'account-active', 'workout-active', 'today-active', 'recovery-boot');
  body.classList.remove('onboarding-active', 'confirmation-active', 'account-active', 'workout-active', 'today-active', 'password-recovery-mode');

  panel?.classList.remove('hidden', 'account-modal', 'account-open', 'account-main-mode', 'account-password-mode');
  panel?.setAttribute('aria-hidden', 'false');
  if (panel) panel.inert = false;
  hideAccountSubmenuPanel();
  submenuPanel?.setAttribute('aria-hidden', 'true');
  loggedOut?.classList.remove('hidden');
  loggedIn?.classList.add('hidden');

  document.querySelectorAll('.screen').forEach(screen => screen.classList.add('auth-locked'));
  document.querySelector('.topbar')?.classList.remove('hidden');
  bottomNav?.classList.add('hidden');
  document.getElementById('accountBtn')?.classList.add('hidden');

  if (app) app.inert = false;
  if (bottomNav) bottomNav.inert = false;
  ['todayEmptyState', 'generatedWorkoutCard', 'confirmPanel', 'exerciseHelpPanel', 'timerPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('todayEmptyState')?.setAttribute('aria-hidden', 'true');
}

function resetAuthUI(mode = 'welcome') {
  passwordRecoveryMode = false;
  if (accountReturnState || accountHistoryEntryActive) closeAccountModal();
  accountReturnState = null;
  clearRecoveryBootFlag();
  welcomeDismissed = mode !== 'welcome';
  clearTodaySelectionTimers();
  clearAuthFields();
  applyLoggedOutAuthSurfaceState();
  setAuthMode(mode);
  setAuthMessage('');
  resetMainRouteScroll();
  setThemeColor('#ffffff');
}

function setAuthMode(mode = 'welcome') {
	  blurActiveAuthField();
	  document.documentElement.classList.remove('account-active', 'workout-active');
	  document.body.classList.remove('account-active', 'workout-active');
	  document.getElementById('accountPanel')?.classList.remove('account-main-mode');
	  hideAccountSubmenuPanel();
	  syncScreenThemeColor();
  const welcome = document.getElementById('authWelcome');
  const login = document.getElementById('authLoginForm');
  const reset = document.getElementById('authResetForm');
  if (!welcome || !login || !reset) return;

  const isReset = mode === 'reset';
  if (!currentUser && !isReset) applyLoggedOutAuthSurfaceState();
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
  if (state.current) {
    renderExercises();
    return;
  }

  const todayIsActive = document.getElementById('today')?.classList.contains('active');
  document.documentElement.classList.remove('workout-active');
  document.body.classList.remove('workout-active');
  document.documentElement.classList.toggle('today-active', Boolean(todayIsActive));
  document.body.classList.toggle('today-active', Boolean(todayIsActive));
  if (todayIsActive) setThemeColor('#ffffff');
  if (todayIsActive) resetRouteScrollOnEntry();
  document.querySelector('.topbar')?.classList.remove('hidden');
  document.getElementById('exerciseList').innerHTML = '';
  document.getElementById('completeBtn')?.classList.add('hidden');
  hideCustomChecklistViews();

  if (state.generated) {
    document.getElementById('energyCard').classList.remove('hidden');
    document.getElementById('generatedWorkoutCard').classList.remove('hidden');
    document.getElementById('exercisePreview').classList.add('hidden');
    syncTodayEnergyUI();
    renderGeneratedWorkout();
    return;
  }

  document.getElementById('energyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  syncTodayEnergyUI();

  const emptyState = document.getElementById('todayEmptyState');
  if (emptyState) {
    const advice = currentRestAdvice();
    const adviceSeen = advice && (state.restAdvice?.acknowledgedSequenceKey === advice.key || state.restAdvice?.lastShownDate === advice.today);
    const shouldShowAdvice = Boolean(advice && !adviceSeen);
    emptyState.dataset.mode = shouldShowAdvice ? 'rest-advice' : 'welcome';
    emptyState.querySelector('h2').textContent = shouldShowAdvice ? 'Rest might help' : 'You’re set.';
    emptyState.querySelector('p').textContent = shouldShowAdvice
      ? "You've trained 3 days in a row. Taking a rest day can help your body recover."
      : 'Start with how you feel today, and Somthingreat will shape the workout from there.';
    document.getElementById('todayInfoAction')?.classList.toggle('hidden', !shouldShowAdvice);
    emptyState.classList.toggle('hidden', !shouldShowAdvice);
    emptyState.setAttribute('aria-hidden', shouldShowAdvice ? 'false' : 'true');
    const appShell = document.querySelector('.app');
    const bottomNav = document.querySelector('.bottom-nav');
    if (appShell) appShell.inert = shouldShowAdvice;
    if (bottomNav) bottomNav.inert = shouldShowAdvice;
  }

  if (todayIsActive && !todayMascotTimer && !todayReactionTimers.length) startTodayMascotIdle();
}

function syncTodayEnergyUI() {
  document.querySelectorAll('.energy-option').forEach(option => {
    const selected = option.dataset.feel === state.selectedEnergy;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  syncTodayMascotSources();
  positionInitialEnergySelector();
}

function positionInitialEnergySelector() {
  const grid = document.querySelector('.energy-grid');
  const targetFeel = state.selectedEnergy || 'normal';
  const target = grid?.querySelector(`[data-feel="${targetFeel}"]`);
  if (!grid || !target || grid.dataset.initialPositioned === 'true') return;
  grid.scrollLeft = target.offsetLeft - ((grid.clientWidth - target.offsetWidth) / 2);
  grid.dataset.initialPositioned = 'true';
}

function resetTodayAfterWorkout() {
  clearTodaySelectionTimers();
  state.selectedEnergy = null;
  state.generated = null;
  state.includeWarmup = false;
  state.includeStretch = false;
  state.includeExerciseTimer = false;
  state.includeRestTimer = false;
  state.restTimerSeconds = 60;
  const energyGrid = document.querySelector('.energy-grid');
  if (energyGrid) {
    energyGrid.scrollLeft = 0;
    energyGrid.dataset.initialPositioned = 'false';
  }
}

function resetTodaySession() {
  clearTodaySelectionTimers();
  const hadTemporaryState = Boolean(
    state.selectedEnergy ||
    state.generated ||
    state.includeWarmup ||
    state.includeStretch ||
    state.includeExerciseTimer ||
    state.includeRestTimer
  );
  state.selectedEnergy = null;
  state.generated = null;
  state.includeWarmup = false;
  state.includeStretch = false;
  state.includeExerciseTimer = false;
  state.includeRestTimer = false;
  state.restTimerSeconds = 60;
  document.getElementById('generatedWorkoutCard')?.classList.add('hidden');
  const energyGrid = document.querySelector('.energy-grid');
  if (energyGrid) energyGrid.dataset.initialPositioned = 'false';
  syncTodayEnergyUI();
  if (hadTemporaryState) saveState();
}

function hideCustomChecklistViews() {
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
  openAccountSubmenu('tracker');
  setCustomChecklistMessage('');
}

function resetCustomChecklistForm() {
  const activity = document.getElementById('activityQuickSelect');
  const target = document.getElementById('customChecklistTargetInput');
  const rounds = document.querySelector('input[name="customChecklistType"][value="rounds"]');
  if (activity) activity.value = '';
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
  const name = document.getElementById('activityQuickSelect')?.value || '';
  const type = document.querySelector('input[name="customChecklistType"]:checked')?.value || 'rounds';
  const target = Math.round(Number(document.getElementById('customChecklistTargetInput')?.value || 0));
  const max = type === 'minutes' ? 240 : 120;
  if (!name) {
    setCustomChecklistMessage('Select an activity first.', 'error');
    return;
  }
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
  state.progressInsights = { ...(state.progressInsights || {}), returningSeenWorkoutId: '' };
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
  const advice = currentRestAdvice();
  if (document.getElementById('todayEmptyState')?.dataset.mode === 'rest-advice' && advice) {
    state.restAdvice = { acknowledgedSequenceKey: advice.key, lastShownDate: advice.today };
  } else {
    state.todayEmptyStateDismissed = true;
  }
  saveState();
  renderToday();
}

function selectEnergy(feel) {
  if (!energyOptions[feel]) return;
  clearTodaySelectionTimers();
  state.selectedEnergy = feel;
  state.generated = null;
  state.includeWarmup = false;
  state.includeStretch = false;
  state.includeExerciseTimer = false;
  state.includeRestTimer = false;
  state.restTimerSeconds = 60;
  renderToday();
  document.querySelector(`.energy-option[data-feel="${feel}"]`)?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'center'
  });
  playTodayMascotReaction();

  const previewDelay = prefersReducedMotion() ? TODAY_REDUCED_PREVIEW_DELAY_MS : TODAY_PREVIEW_DELAY_MS;
  todayPreviewTimer = window.setTimeout(() => {
    todayPreviewTimer = null;
    if (state.selectedEnergy !== feel) return;
    clearTodayMascotTimers();
    generateWorkout();
  }, previewDelay);
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

function generateWorkout({ render = true } = {}) {
  const option = energyOptions[state.selectedEnergy];
  if (!option) return;
  const baseWorkout = getTodayWorkout(option.mode);
  if (baseWorkout.generationFailure) {
    console.warn('Workout composition diagnostic:', baseWorkout.generationFailure);
  }
  if (baseWorkout.developmentDiagnostics?.reducedVariety) {
    console.warn('Workout reduced-catalogue diagnostic:', baseWorkout.developmentDiagnostics);
  }
  state.generated = applyWorkoutAddOns(baseWorkout);
  state.generated.includeExerciseTimer = Boolean(state.includeExerciseTimer);
  state.generated.includeRestTimer = Boolean(state.includeRestTimer);
  state.generated.restTimerSeconds = 60;
  state.generationHistory = [
    ...(Array.isArray(state.generationHistory) ? state.generationHistory : []),
    {
      date: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      workout: baseWorkout.workoutName,
      mode: baseWorkout.mode,
      selectedMasterySkill: baseWorkout.selectedMasterySkill,
      exercises: baseWorkout.exercises.map(exercise => ({ exerciseId: exercise.id }))
    }
  ].slice(-50);
  saveState();
  if (render) renderGeneratedWorkout();
}

function updateGeneratedWorkoutAddOns() {
  if (!state.generated) return;
  const baseWorkout = {
    ...state.generated,
    exercises: (state.generated.exercises || []).filter(exercise => !exercise?.isAddOn)
  };
  state.generated = applyWorkoutAddOns(baseWorkout);
  state.generated.includeExerciseTimer = Boolean(state.includeExerciseTimer);
  state.generated.includeRestTimer = Boolean(state.includeRestTimer);
  state.generated.restTimerSeconds = 60;
}

function swapCandidateAudit(exercise, workout, { respectCommittedSets = false } = {}) {
  if (!exercise || exercise.isAddOn) {
    return { finalCandidates: [], reason: 'Workout add-ons are intentionally not swappable.' };
  }
  const key = exerciseSessionKey(exercise);
  if (respectCommittedSets && ((workout?.sets?.[key] || []).some(Boolean) || workout?.ratings?.[key])) {
    return { finalCandidates: [], reason: 'This exercise cannot be changed after progress has been recorded.' };
  }
  const trackKey = exercise.progressionTrackKey || exercise.trackKey;
  const recovery = typeof getActiveRecovery === 'function' ? getActiveRecovery() : null;
  const usedIds = new Set((workout?.exercises || []).map(item => item?.id).filter(Boolean));
  return workoutModule.getSwapCandidateAudit(exercise, {
    usedIds,
    recovery,
    unlockedLevel: state.levels?.[trackKey]?.level || 0,
    profile: getProfile(),
    state
  });
}

function previewSwapAudit(exercise) {
  return swapCandidateAudit(exercise, state.generated);
}

function previewSwapCandidates(exercise) {
  return previewSwapAudit(exercise).finalCandidates;
}

function activeSwapAudit(exercise) {
  return swapCandidateAudit(exercise, state.current, { respectCommittedSets: true });
}

function activeSwapCandidates(exercise) {
  return activeSwapAudit(exercise).finalCandidates;
}

function swapAvailabilityCopy(reason = '') {
  if (/locked progression stages/i.test(reason)) return 'Keep progressing to unlock another option.';
  if (/unavailable equipment/i.test(reason)) return 'No other suitable option works with your current equipment.';
  if (/already used/i.test(reason)) return 'Every suitable alternative is already in this workout.';
  return 'No other suitable option is available yet.';
}

function showSwapAvailabilityMessage(message = 'No other suitable option is unlocked yet.') {
  const element = document.getElementById('swapAvailabilityMessage');
  if (!element) return;
  window.clearTimeout(swapAvailabilityMessageTimer);
  element.textContent = message || 'No other suitable option is unlocked yet.';
  element.classList.remove('hidden');
  swapAvailabilityMessageTimer = window.setTimeout(() => {
    element.classList.add('hidden');
  }, 2600);
}

function swapActiveExercise(index) {
  const current = state.current?.exercises?.[index];
  const candidates = activeSwapCandidates(current);
  if (!current || !candidates.length) return;
  const next = workoutModule.selectSwapCandidate(current, candidates);
  if (!next) return;
  const replacement = workoutModule.createSwapReplacement(current, next, state.current.mode,
    typeof getActiveRecovery === 'function' ? getActiveRecovery() : null, { profile: getProfile(), state });
  const key = exerciseSessionKey(current, index);
  replacement.sessionKey = key;
  state.current.exercises[index] = replacement;
  state.current.sets[key] = Array.from({ length: replacement.setCount || 1 }, () => false);
  delete state.current.ratings[key];
  saveState();
  renderExercises();
}

function swapPreviewExercise(index) {
  const current = state.generated?.exercises?.[index];
  if (!current) return;
  const candidates = previewSwapCandidates(current);
  if (!candidates.length) return;
  const next = workoutModule.selectSwapCandidate(current, candidates);
  if (!next) return;
  state.generated.exercises[index] = workoutModule.createSwapReplacement(
    current,
    next,
    state.generated.mode,
    typeof getActiveRecovery === 'function' ? getActiveRecovery() : null,
    { profile: getProfile(), state }
  );
  saveState();
  renderGeneratedWorkout();
}

function renderGeneratedWorkout() {
  const generated = state.generated;
  if (!generated) return;
  hideCustomChecklistViews();
  document.getElementById('energyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.remove('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.getElementById('workoutName').textContent = workoutModule.workoutDisplayName(generated.workoutName);
  const workoutMeta = document.getElementById('workoutMeta');
  if (workoutMeta) workoutMeta.textContent = workoutToolSummary(generated);

  const warmupInput = document.getElementById('includeWarmup');
  const stretchInput = document.getElementById('includeStretch');
  const exerciseTimerInput = document.getElementById('includeExerciseTimer');
  const restTimerInput = document.getElementById('includeRestTimer');
  if (warmupInput) warmupInput.checked = Boolean(state.includeWarmup);
  if (stretchInput) stretchInput.checked = Boolean(state.includeStretch);
  if (exerciseTimerInput) exerciseTimerInput.checked = Boolean(state.includeExerciseTimer);
  if (restTimerInput) restTimerInput.checked = Boolean(state.includeRestTimer);
  updateAddOnSummary();

  const preview = document.getElementById('previewList');
  preview.innerHTML = '';
  (generated.exercises || []).filter(Boolean).forEach((exercise, index) => {
    const name = exerciseDisplayName(exercise);
    const roleLabel = exerciseWorkoutRoleLabel(exercise, generated);
    const hasHelp = !exercise.isAddOn && Boolean(getExerciseHelp(name));
    const swapAudit = previewSwapAudit(exercise);
    const canSwap = swapAudit.finalCandidates.length > 0;
    const swapButton = exercise.isAddOn
      ? ''
      : canSwap
        ? `<button class="preview-icon-btn preview-swap-btn" type="button" data-preview-index="${index}" aria-label="Change ${escapeHTML(name)}"></button>`
        : `<button class="preview-icon-btn preview-swap-btn swap-unavailable-btn" type="button" aria-disabled="true" data-swap-reason="${escapeHTML(swapAvailabilityCopy(swapAudit.reason))}" aria-label="Swap unavailable for ${escapeHTML(name)}. ${escapeHTML(swapAudit.reason)}"></button>`;
    const row = document.createElement('div');
    row.className = 'preview-row preview-action-row';
    row.innerHTML = `
      <div class="preview-exercise-copy">
        ${roleLabel ? `<small class="exercise-role-label">${escapeHTML(roleLabel)}</small>` : ''}
        <strong>${escapeHTML(name)}</strong>
        <span>${escapeHTML(exercise.prescription)}</span>
      </div>
      <div class="preview-exercise-actions">
        ${swapButton}
        ${hasHelp ? `<button class="preview-icon-btn preview-help-btn exercise-help-btn" type="button" data-exercise-name="${escapeHTML(name)}" aria-label="How to do ${escapeHTML(name)}">?</button>` : ''}
      </div>`;
    preview.appendChild(row);
  });
}

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.energy-grid')) return;
  energyPointerStart = { x: event.clientX, y: event.clientY };
  energyScrollGesture = false;
}, { passive: true });

document.addEventListener('pointermove', event => {
  if (!energyPointerStart) return;
  if (Math.hypot(event.clientX - energyPointerStart.x, event.clientY - energyPointerStart.y) > 8) {
    energyScrollGesture = true;
  }
}, { passive: true });

document.addEventListener('pointerup', () => {
  energyPointerStart = null;
  window.setTimeout(() => { energyScrollGesture = false; }, 0);
}, { passive: true });

document.addEventListener('pointercancel', () => {
  energyPointerStart = null;
  energyScrollGesture = false;
}, { passive: true });

document.addEventListener('click', event => {
  const swapButton = event.target.closest('.preview-swap-btn');
  if (!swapButton) return;
  event.preventDefault();
  event.stopPropagation();
  if (swapButton.classList.contains('swap-unavailable-btn')) {
    event.stopImmediatePropagation();
    showSwapAvailabilityMessage(swapButton.dataset.swapReason);
    return;
  }
  if (!swapButton.dataset.previewIndex) return;
  swapPreviewExercise(Number(swapButton.dataset.previewIndex));
});

function startWorkout() {
  if (!state.generated && state.selectedEnergy) generateWorkout({ render: false });
  state.generated = sanitizeWorkout(state.generated);
  if (!state.generated) {
    state.selectedEnergy = null;
    saveState();
    renderToday();
    return;
  }
  const startedAt = state.generated.startedAt || new Date().toISOString();
  state.current = {
    ...state.generated,
    sessionId: state.generated.sessionId || createSessionId(),
    startedAt,
    updatedAt: startedAt,
    lifecycleStatus: 'active',
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
  workoutCompletionState = null;
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

function exerciseWorkoutRoleLabel(exercise, workout = null) {
  if (!exercise || exercise.isAddOn || workout?.workoutName !== 'Skill lab') return '';
  if (exercise.workoutRoleLabel) return exercise.workoutRoleLabel;
  if (exercise.workoutRole === 'primaryFocus') return 'Priority skill';
  if (exercise.workoutRole === 'focusAccessory') {
    const secondarySkill = exercise.roleMasterySkill || workout?.secondarySkill;
    return secondarySkill && goalLabels[secondarySkill]
      ? `Secondary skill · ${goalLabels[secondarySkill]}`
      : 'Foundational practice';
  }
  return exercise.workoutRole === 'generalSupport' ? 'Support' : '';
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
  if (exercise.workoutExerciseId) return exercise.workoutExerciseId;
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
    restoreActiveWorkoutTimer();
  }
});

function setControlMarkup(exercise, exerciseKey, index, completed, timedSeconds) {
  const label = exercise.setLabels?.[index] || `Round ${index + 1}`;
  const iconClass = completed ? 'is-check' : timedSeconds ? 'is-timer' : 'is-square';
  const exerciseName = exerciseDisplayName(exercise);
  const rowHelp = !completed && exercise.isAddOn ? getExerciseHelp(label) : null;
  const rowHelpButton = rowHelp
    ? `<button class="exercise-help-btn set-help-btn" type="button" data-exercise-name="${escapeHTML(label)}" aria-label="Help with ${escapeHTML(label)}">?</button>`
    : '';
  const timerData = timedSeconds
    ? `data-timer-seconds="${timedSeconds}" data-exercise-name="${escapeHTML(exerciseName)}" data-track="${escapeHTML(exerciseKey)}" data-set-index="${index}" data-set-label="${escapeHTML(label)}"`
    : '';
  return `
    <div class="set-row ${rowHelp ? 'has-help' : ''} ${timedSeconds ? 'timed-set-row' : ''} ${completed ? 'completed' : ''}">
      <span>${escapeHTML(label)}</span>
      <button class="set-control ${iconClass}" type="button" data-track="${escapeHTML(exerciseKey)}" data-set-index="${index}" ${timerData} aria-label="${completed ? 'Completed' : timedSeconds ? `Start ${label} timer` : `Complete ${label}`}"></button>
      ${rowHelpButton}
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
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.documentElement.classList.remove('today-active');
  document.body.classList.remove('today-active');
  document.documentElement.classList.add('workout-active');
  document.body.classList.add('workout-active');
  document.querySelector('.topbar')?.classList.add('hidden');
  document.querySelector('.bottom-nav')?.classList.add('hidden');

  const list = document.getElementById('exerciseList');
  list.innerHTML = '';

  state.current = sanitizeWorkout(state.current);
  if (!state.current) { renderToday(); return; }
  const shouldResetWorkoutScroll = state.current.sessionId !== renderedWorkoutSessionId;
  renderedWorkoutSessionId = state.current.sessionId || null;
  state.current.exercises = (state.current.exercises || []).map((exercise, index) => ({
    ...exercise,
    sessionKey: exerciseSessionKey(exercise, index)
  }));
  requestWorkoutWakeLock();
  if (!workoutCompletionState && isWorkoutFullyComplete()) {
    workoutCompletionState = {
      mode: 'full',
      previousTrackKey: openExerciseTrackKey
    };
    openExerciseTrackKey = null;
  }
  if (!workoutCompletionState && (!openExerciseTrackKey || !state.current.exercises.some(exercise => exerciseSessionKey(exercise) === openExerciseTrackKey))) {
    openExerciseTrackKey = firstIncompleteExerciseKey();
  }
  const topWorkoutTile = state.current.exercises[0] || null;
  const topWorkoutTileCompleted = Boolean(topWorkoutTile && isExerciseComplete(topWorkoutTile));
  document.body.classList.toggle('workout-top-completed', topWorkoutTileCompleted || Boolean(workoutCompletionState));
  document.body.classList.toggle('workout-completion-active', Boolean(workoutCompletionState));
  state.current.exercises.forEach((exercise, index) => {
    const exerciseKey = exerciseSessionKey(exercise, index);
    const isOpen = exerciseKey === openExerciseTrackKey;
    const isComplete = isExerciseComplete(exercise);
    const exerciseName = exerciseDisplayName(exercise);
    const roleLabel = exerciseWorkoutRoleLabel(exercise, state.current);
    const roleMarkup = roleLabel
      ? `<small class="exercise-role-label">${escapeHTML(roleLabel)}</small>`
      : '';
    const chipPrescription = isComplete ? '' : `<em>${escapeHTML(exerciseChipPrescription(exercise))}</em>`;
    const card = document.createElement('div');
    const isWarmup = exerciseName === 'Warm-up';
    card.className = `exercise-card workout-accordion-card ${isOpen ? 'open' : ''} ${isComplete ? 'completed' : ''} ${isWarmup ? 'workout-warmup-card' : ''}`;
    card.dataset.track = exerciseKey;
    const selectedRating = state.current.ratings[exerciseKey];
    if (!state.current.sets) state.current.sets = {};
    if (!state.current.sets[exerciseKey]) state.current.sets[exerciseKey] = Array.from({ length: exercise.setCount || 1 }, () => false);
    const completedSets = state.current.sets[exerciseKey];
    const timedSeconds = state.current.includeExerciseTimer ? getTimedExerciseSeconds(exercise) : null;
    const setRows = Array.from({ length: exercise.setCount || completedSets.length || 1 }, (_, index) => {
      return setControlMarkup(exercise, exerciseKey, index, Boolean(completedSets[index]), timedSeconds);
    }).join('');
    const help = exercise.isAddOn ? null : getExerciseHelp(exerciseName);
    const helpButton = help ? `<button class="exercise-help-btn" type="button" data-exercise-name="${escapeHTML(exerciseName)}" aria-label="Help with ${escapeHTML(exerciseName)}">?</button>` : '';
    const hasCommittedProgress = (state.current.sets?.[exerciseKey] || []).some(Boolean) || Boolean(state.current.ratings?.[exerciseKey]);
    const swapAudit = activeSwapAudit(exercise);
    const swapButton = exercise.isAddOn || hasCommittedProgress
      ? ''
      : swapAudit.finalCandidates.length
        ? `<button class="preview-icon-btn preview-swap-btn active-swap-btn" type="button" data-active-index="${index}" aria-label="Change ${escapeHTML(exerciseName)}"></button>`
        : `<button class="preview-icon-btn preview-swap-btn active-swap-btn swap-unavailable-btn" type="button" aria-disabled="true" data-swap-reason="${escapeHTML(swapAvailabilityCopy(swapAudit.reason))}" aria-label="Swap unavailable for ${escapeHTML(exerciseName)}. ${escapeHTML(swapAudit.reason)}"></button>`;
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
        <span>${roleMarkup}${escapeHTML(exerciseName)}</span>
        ${chipPrescription}
        <i aria-hidden="true"></i>
      </button>
      <div class="exercise-card-body">
        <div class="exercise-card-header">
          <div class="exercise-card-heading">
            ${roleMarkup}
            <h3>${escapeHTML(exerciseName)} - ${escapeHTML(exercise.prescription)}</h3>
          </div>
          <div class="exercise-card-actions">${swapButton}${helpButton}</div>
        </div>
        <div class="set-list">${setRows}</div>
        ${ratingBlock}
      </div>
    `;
    list.appendChild(card);
  });
  renderWorkoutCompletionTile(list);
  restoreActiveWorkoutTimer();
  if (shouldResetWorkoutScroll) {
    window.requestAnimationFrame(() => resetMainRouteScroll());
  }
}

function renderWorkoutCompletionTile(list) {
  if (!list) return;
  let tile = document.getElementById('workoutCompletionTile');
  if (!tile) {
    tile = document.createElement('section');
    tile.id = 'workoutCompletionTile';
    tile.className = 'workout-completion-tile';
    tile.setAttribute('aria-live', 'polite');
  }

  tile.classList.remove('hidden', 'open', 'partial', 'full', 'empty');
  if (!workoutCompletionState) {
    tile.innerHTML = '<button id="completeBtn" class="workout-completion-trigger" type="button">Complete</button>';
    list.appendChild(tile);
    return;
  }

  const mode = workoutCompletionState.mode;
  const content = mode === 'full'
    ? {
        title: 'Well done!',
        message: 'You showed up and that counts. Your progress is saved.',
        primaryLabel: 'Done',
        primaryAction: 'finish'
      }
    : mode === 'empty'
      ? {
          title: 'Workout not completed',
          message: 'If you complete this workout, as no exercise was marked as done, it will not count in your progress.',
          primaryLabel: 'Complete',
          primaryAction: 'discard'
        }
      : {
          title: 'Almost there!',
          message: 'Some items are unfinished and won’t be counted. Save this progress or go back to finish more.',
          primaryLabel: 'Save progress',
          primaryAction: 'save'
        };

  tile.classList.add('open', mode);
  tile.innerHTML = `
    <div class="workout-completion-content">
      <h2>${escapeHTML(content.title)}</h2>
      <p>${escapeHTML(content.message)}</p>
      <div class="workout-completion-actions">
        <button class="primary-btn" type="button" data-workout-completion-action="${content.primaryAction}">${escapeHTML(content.primaryLabel)}</button>
        ${mode === 'full' ? '' : '<button class="ghost-btn" type="button" data-workout-completion-action="back">Go back</button>'}
      </div>
    </div>
  `;
  list.appendChild(tile);
}

function openInlineWorkoutCompletion() {
  if (!state.current) return;
  const previousTrackKey = openExerciseTrackKey || firstIncompleteExerciseKey();
  const hasCompletedSet = (state.current.exercises || []).some(exercise => {
    return !exercise.isAddOn && (state.current.sets?.[exerciseSessionKey(exercise)] || []).some(Boolean);
  });
  workoutCompletionState = {
    mode: isWorkoutFullyComplete() ? 'full' : hasCompletedSet ? 'partial' : 'empty',
    previousTrackKey
  };
  openExerciseTrackKey = null;
  renderExercises();
}

function restoreWorkoutFromCompletion() {
  if (!workoutCompletionState || !state.current) return;
  const previousTrackKey = workoutCompletionState.previousTrackKey;
  workoutCompletionState = null;
  openExerciseTrackKey = (state.current.exercises || []).some(exercise => exerciseSessionKey(exercise) === previousTrackKey)
    ? previousTrackKey
    : firstIncompleteExerciseKey();
  renderExercises();
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
  const content = document.getElementById('exerciseHelpContent');
  if (content) {
    const distinctSuccess = workoutModule.distinctSuccessCriteria(help.movement, help.successCriteria);
    const sections = [
      ['Purpose', [help.purpose]],
      ['Starting position', [help.startingPosition]],
      ['Movement', help.movement],
      ['Success looks like', distinctSuccess],
      ['Focus', help.focus],
      ['Common mistakes', help.commonMistakes],
      ['Safety', [help.safety]]
    ].filter(([, values]) => Array.isArray(values) && values.some(Boolean));
    content.innerHTML = sections.map(([heading, values]) => `<section class="exercise-help-section"><h3>${escapeHTML(heading)}</h3>${values.length > 1 ? `<ul>${values.filter(Boolean).map(value => `<li>${escapeHTML(value)}</li>`).join('')}</ul>` : `<p>${escapeHTML(values.find(Boolean) || '')}</p>`}</section>`).join('');
  }
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
  return Number.isFinite(Number(exercise?.secondsPerSet)) ? Number(exercise.secondsPerSet) : null;
}

function markWorkoutSetDone(trackKey, setIndex, done = true) {
  if (!state.current || !trackKey || !Number.isFinite(Number(setIndex))) return;
  if (!state.current.sets) state.current.sets = {};
  const exercise = findCurrentExercise(trackKey);
  const index = Number(setIndex);
  state.current.sets[trackKey] = workoutModule.updateSetCompletion(
    state.current.sets[trackKey],
    index,
    exercise?.setCount || 1,
    done
  );
  if (exercise && isExerciseComplete(exercise)) {
    openNextIncompleteExercise(trackKey);
  } else {
    openExerciseTrackKey = trackKey;
  }
  if (isWorkoutFullyComplete()) {
    workoutCompletionState = {
      mode: 'full',
      previousTrackKey: trackKey
    };
    openExerciseTrackKey = null;
  }
  saveState();
  renderExercises();
}

function renderWorkoutTimer() {
  if (!activeTimer) return;
  const title = document.getElementById('timerTitle');
  const count = document.getElementById('timerCount');
  const snapshot = workoutModule.countdownTimerSnapshot(activeTimer);
  if (!snapshot) return;

  if (title) title.textContent = activeTimer.title || 'Timer';
  if (count) {
    if (snapshot.phase === 'prep') {
      count.textContent = snapshot.prepSeconds;
    } else if (snapshot.remainingSeconds <= 0) {
      count.textContent = '0';
    } else {
      count.textContent = String(snapshot.remainingSeconds);
    }
  }
}

function finishWorkoutTimer() {
  if (!activeTimer) return;
  const finishedTimer = activeTimer;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (state.current) {
    state.current.activeTimer = null;
    saveLocalStateOnly();
  }
  window.navigator?.vibrate?.(120);
  window.SomthingreatTimerSound?.playCompletion?.();
  if (finishedTimer.completeOnFinish && finishedTimer.trackKey) {
    markWorkoutSetDone(finishedTimer.trackKey, finishedTimer.setIndex, true);
    finishedTimer.pendingRestTimer = shouldStartRestTimerAfterSet(finishedTimer.trackKey);
  }
  activeTimer = finishedTimer;
  renderWorkoutTimer();
  if (timerAutoClose) clearTimeout(timerAutoClose);
  timerAutoClose = window.setTimeout(() => closeWorkoutTimer(false), 2500);
}

function tickWorkoutTimer() {
  if (!activeTimer) return;
  const snapshot = workoutModule.countdownTimerSnapshot(activeTimer);
  if (!snapshot) return closeWorkoutTimer(false);
  if (snapshot.finished) return finishWorkoutTimer();
  renderWorkoutTimer();
}

function showWorkoutTimer({ title, subtitle, seconds, prepSeconds = 0, trackKey = null, setIndex = null, completeOnFinish = false }) {
  const panel = document.getElementById('timerPanel');
  if (!panel || !seconds) return;

  requestWorkoutWakeLock();
  window.SomthingreatTimerSound?.unlock?.();
  closeWorkoutTimer(false);
  lastFocusedElement = document.activeElement;
  activeTimer = {
    title,
    subtitle,
    ...workoutModule.createCountdownTimer({ seconds, prepSeconds, trackKey, setIndex, completeOnFinish })
  };
  if (state.current) {
    state.current.activeTimer = { ...activeTimer };
    saveLocalStateOnly();
  }
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
  if (state.current?.activeTimer) {
    state.current.activeTimer = null;
    saveLocalStateOnly();
  }
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

function restoreActiveWorkoutTimer() {
  if (activeTimer || !state.current?.activeTimer) return;
  const restored = workoutModule.sanitizeCountdownTimer(state.current.activeTimer);
  if (!restored) {
    state.current.activeTimer = null;
    saveLocalStateOnly();
    return;
  }
  activeTimer = restored;
  const snapshot = workoutModule.countdownTimerSnapshot(activeTimer);
  if (snapshot?.finished) return finishWorkoutTimer();
  const panel = document.getElementById('timerPanel');
  renderWorkoutTimer();
  panel?.classList.remove('hidden');
  timerInterval = setInterval(tickWorkoutTimer, 1000);
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
  const exercises = state.current.exercises || [];
  if (!exercises.some(exercise => !exercise.isAddOn)) return false;
  return exercises.every(exercise => isExerciseComplete(exercise));
}

function completeWorkout(skipMissingRatingConfirm = false) {
  if (!state.current) return;
  openInlineWorkoutCompletion();
}

function closeWorkoutSession(sessionId) {
  if (!sessionId) return;
  if (!Array.isArray(state.closedWorkoutSessionIds)) state.closedWorkoutSessionIds = [];
  if (!state.closedWorkoutSessionIds.includes(sessionId)) state.closedWorkoutSessionIds.push(sessionId);
}

async function completeWorkoutWithoutProgress() {
  if (!state.current || workoutCompletionSaveInProgress) return;
  workoutCompletionSaveInProgress = true;
  const sessionId = state.current.sessionId;
  closeWorkoutSession(sessionId);
  persistenceDiagnostic('session-abandoned', { sessionId, lifecycleStatus: 'abandoned' });
  state.current = null;
  openExerciseTrackKey = null;
  workoutCompletionState = null;
  resetTodayAfterWorkout();
  releaseWorkoutWakeLock();
  saveState();
  try {
    await saveCloudState();
  } catch (error) {
    setSyncStatus('Cloud save will retry. Local progress is safely closed.');
  }
  renderToday();
  renderProgress();
  renderActivity();
  renderAccount();
  updateUpdateBanner();
  workoutCompletionSaveInProgress = false;
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

async function completeWorkoutNow(showFullConfirmation = true) {
  if (!state.current || workoutCompletionSaveInProgress) return;
  workoutCompletionSaveInProgress = true;
  const performedExercises = (state.current.exercises || []).filter((exercise, index) => {
    const completedSets = state.current.sets?.[exerciseSessionKey(exercise, index)] || [];
    return !exercise.isAddOn || completedSets.some(Boolean);
  });
  const completedMainExercises = performedExercises.filter(exercise => !exercise.isAddOn && areExerciseSetsComplete(exercise));
  const levelBeforeByTrack = {};
  performedExercises.forEach(exercise => {
    const key = exercise.progressionTrackKey || exercise.trackKey;
    if (key && state.levels[key]) levelBeforeByTrack[key] = state.levels[key].level;
  });
  const completedAt = new Date().toISOString();
  const sessionId = state.current.sessionId || createSessionId();
  const exerciseResults = performedExercises.map((ex, index) => {
    const exerciseKey = exerciseSessionKey(ex, index);
    const rating = state.current.ratings?.[exerciseKey] || null;
    return workoutModule.exerciseResult(ex, state.current.sets?.[exerciseKey] || [], rating);
  });
  if (!workoutModule.shouldRecordWorkoutResults(exerciseResults)) {
    workoutCompletionSaveInProgress = false;
    return;
  }
  exerciseResults.forEach(result => {
    const decision = workoutModule.applyExerciseResultToProgression(state.levels, result, getProfile());
    result.progressionApplied = decision.applied;
    result.progressionDecision = decision.reason;
  });
  const completionStatus = completedMainExercises.length === (state.current.exercises || []).filter(exercise => !exercise.isAddOn).length
    ? 'completed'
    : 'saved_partial';
  const historyEntry = {
    sessionId,
    startedAt: state.current.startedAt || new Date().toISOString(),
    date: completedAt,
    completedAt,
    workout: state.current.workoutName,
    mode: state.current.mode,
    energy: state.current.mode,
    status: completionStatus,
    completedCount: completedMainExercises.length,
    exercises: exerciseResults
  };
  state.history.push(historyEntry);
  persistenceDiagnostic('completion-confirmed', {
    sessionId,
    lifecycleStatus: completionStatus,
    completedAt,
    workoutDate: historyEntry.date,
    completedExerciseIds: exerciseResults.filter(result => result.completedSets > 0).map(result => result.exerciseId),
    completedSetCounts: Object.fromEntries(exerciseResults.map(result => [result.exerciseId, result.completedSets]))
  });
  const progressionEvents = exerciseResults.flatMap((result, position) => {
    const key = result.progressionTrackKey;
    const before = levelBeforeByTrack[key];
    const after = state.levels[key]?.level;
    if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return [];
    return [{
      position,
      eventType: after > before ? 'level_advanced' : 'level_regressed',
      progressionTrackKey: key,
      exerciseId: result.exerciseId,
      exerciseName: result.name,
      levelBefore: before,
      levelAfter: after
    }];
  });
  queueDetailedSession({
    sessionId,
    sessionType: 'workout',
    startedAt: historyEntry.startedAt,
    completedAt,
    status: completionStatus === 'completed' ? 'completed' : 'partial',
    energySelection: state.current.mode,
    workoutMode: state.current.mode,
    workoutName: state.current.workoutName,
    plannedExerciseCount: (state.current.exercises || []).filter(exercise => !exercise.isAddOn).length,
    completedExerciseCount: completedMainExercises.length,
    durationSeconds: Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(historyEntry.startedAt)) / 1000)),
    catalogVersion: APP_VERSION,
    stateSchemaVersion: stateStore.schemaVersion,
    exercises: exerciseResults.map((result, position) => ({
      position,
      exerciseId: result.exerciseId,
      exerciseName: result.name,
      recommendedExerciseId: result.swappedFromExerciseId || result.exerciseId,
      recommendedExerciseName: result.swappedFromExerciseName || result.name,
      wasSwapped: Boolean(result.swappedFromExerciseId),
      trackKey: result.trackKey,
      progressionTrackKey: result.progressionTrackKey,
      progressionEvidenceTarget: result.progressionEvidenceTarget,
      progressionMilestoneId: result.progressionMilestoneId,
      programmeRole: result.programmeRole,
      selectedMasterySkill: result.selectedMasterySkill,
      prescribedData: result.prescriptionData,
      prescribedText: result.prescription,
      plannedSets: result.targetSets,
      completedSets: result.completedSets,
      completedSetIndexes: result.completedSetIndexes,
      completionStatus: result.completionStatus,
      rating: result.rating,
      progressionApplied: result.progressionApplied,
      progressionDecision: result.progressionDecision,
      levelBefore: levelBeforeByTrack[result.progressionTrackKey] ?? null,
      levelAfter: state.levels[result.progressionTrackKey]?.level ?? null,
      isAddOn: result.isAddOn
    })),
    progressionEvents
  });
  state.rotationIndex = workoutModule.nextRotationIndexFromHistory(state.history, state.rotationIndex);
  state.progressInsights = { ...(state.progressInsights || {}), returningSeenWorkoutId: '' };
  closeWorkoutSession(sessionId);
  state.current = null;
  openExerciseTrackKey = null;
  workoutCompletionState = null;
  resetTodayAfterWorkout();
  releaseWorkoutWakeLock();
  saveState();
  try {
    await saveCloudState();
  } catch (error) {
    setSyncStatus('Cloud save will retry. Your completed workout is saved locally.');
  }
  flushPendingSessionRecords();
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
  workoutCompletionSaveInProgress = false;
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
  return goal === 'handstand' ? 'handstand' : goal === 'lsit' ? 'lsit' : goal === 'pistolSquat' ? 'pistolSquat' : goal === 'pullup' ? 'verticalPull' : null;
}

function getGoalJourneyTitle(goal) {
  return {
    pullup: 'Pull-up journey',
    handstand: 'Handstand journey',
    lsit: 'L-sit journey',
    pistolSquat: 'Pistol squat journey'
  }[goal] || 'Priority skill journey';
}

function hasCountableWorkoutProgress(item) {
  if (!item) return false;
  if (item.type === 'custom' || item.customType) return false;
  // Legacy workouts did not store completedCount. Earlier sanitization turned
  // that missing value into 0, so a zero cannot be treated as definitive when
  // the historical entry still contains performed exercises.
  if (Number.isFinite(item.completedCount) && item.completedCount > 0) return true;
  const exercises = Array.isArray(item.exercises) ? item.exercises : [];
  if (exercises.some(exercise => !exercise.isAddOn)) return true;
  const date = new Date(item.date);
  return !Number.isNaN(date.getTime());
}

function countableHistory() {
  return state.history.filter(hasCountableWorkoutProgress);
}

function isFullyCompletedWorkout(item) {
  if (!hasCountableWorkoutProgress(item)) return false;
  const exercises = (item.exercises || []).filter(exercise => !exercise.isAddOn);
  return exercises.length > 0 && exercises.every(exercise => exercise.completionStatus === 'completed');
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentRestAdvice() {
  const days = [...new Set(state.history.filter(isFullyCompletedWorkout).map(item => localDateKey(item.date)).filter(Boolean))].sort();
  const today = localDateKey(new Date());
  if (!days.includes(today)) return null;
  let start = days.length - 1;
  while (start > 0) {
    const current = new Date(`${days[start]}T12:00:00`);
    const previous = new Date(`${days[start - 1]}T12:00:00`);
    if ((current - previous) !== 86400000) break;
    start -= 1;
  }
  const sequence = days.slice(start);
  if (sequence.length < 3) return null;
  return { key: sequence[0], today };
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

function progressDotsMarkup(total, filled) {
  return Array.from({ length: Math.max(0, total) }, (_, index) => `<i class="progress-dot${index < filled ? ' is-filled' : ''}" aria-hidden="true"></i>`).join('');
}

function currentMonthProgressResults() {
  const now = new Date();
  return countableHistory()
    .filter(session => {
      const date = new Date(session.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .flatMap(session => (session.exercises || []).map(exercise => ({ session, exercise })))
    .filter(({ exercise }) => exercise.completionStatus === 'completed' && ['easy', 'good'].includes(exercise.rating));
}

function unlockEventId(session, exercise) {
  return [session.sessionId || historyEntryId(session), exercise.progressionTrackKey, exercise.progressionLevel, exercise.exerciseId].join(':');
}

function latestUnacknowledgedUnlock(trackKeys) {
  const validTrackKeys = new Set((trackKeys || []).filter(Boolean));
  const acknowledged = new Set(state.progressInsights?.acknowledgedUnlockIds || []);
  const safetyCutoff = Date.now() - 30 * 86400000;
  const tracks = getTracks();
  return countableHistory()
    .filter(session => new Date(session.date).getTime() >= safetyCutoff)
    .flatMap(session => (session.exercises || []).map(exercise => ({ session, exercise })))
    .filter(({ exercise }) => exercise.progressionApplied && validTrackKeys.has(exercise.progressionTrackKey) && Number.isFinite(Number(exercise.progressionLevel)))
    .map(({ session, exercise }) => {
      const id = unlockEventId(session, exercise);
      const track = tracks[exercise.progressionTrackKey] || baseTracks[exercise.progressionTrackKey] || [];
      const unlockedIndex = Number(exercise.progressionLevel);
      const currentLevel = Number(state.levels?.[exercise.progressionTrackKey]?.level || 0);
      return { id, session, exercise, track, unlockedIndex, currentLevel };
    })
    .filter(event => !acknowledged.has(event.id) && event.currentLevel >= event.unlockedIndex && event.track[event.unlockedIndex])
    .sort((a, b) => new Date(b.session.date) - new Date(a.session.date))
    .map(event => ({ id: event.id, name: event.track[event.unlockedIndex].name, index: event.unlockedIndex, trackKey: event.exercise.progressionTrackKey }))[0] || null;
}

function progressPatternData() {
  const recentSuccessful = currentMonthProgressResults().length;
  const recentProgressSummary = recentSuccessful > 0
    ? `${recentSuccessful} successful completion${recentSuccessful === 1 ? '' : 's'} this month`
    : null;
  const activeWeeks = workoutModule.consecutiveActiveWeeks(countableHistory());
  const strongPattern = activeWeeks > 0 ? `${activeWeeks} active week${activeWeeks === 1 ? '' : 's'} in a row` : null;
  return { recentProgressSummary, strongPattern };
}

function buildProgressCardData(goal, profile, trackKey, track) {
  const trackState = trackKey ? state.levels?.[trackKey] || {} : {};
  const level = track?.length ? Math.max(0, Math.min(Number(trackState.level || 0), track.length - 1)) : 0;
  const unlocked = latestUnacknowledgedUnlock([trackKey]);
  const pattern = progressPatternData();
  const focusAchieved = workoutModule.isTrackMastered(trackKey, trackState, track);
  const completedWorkoutCount = countableHistory().length;
  return {
    focusAchieved,
    achievedFocusName: focusAchieved ? `${goalLabels[goal] || 'Priority skill'} achieved` : null,
    recommendedFocusName: null,
    relevantReadinessSummary: null,
    recentUnlockedExercise: unlocked?.name || null,
    unlockEventId: unlocked?.id || null,
    strongPattern: pattern.strongPattern,
    recentProgressSummary: pattern.recentProgressSummary,
    completedWorkoutCount,
    currentFocusName: goalLabels[goal] || 'Pull-up',
    currentLevelName: track?.[level]?.name || null,
    planContinuationMessage: 'Continue with your next workout'
  };
}

function renderProgressCard(data) {
  const cardState = workoutModule.getProgressCardState(data);
  const content = workoutModule.getProgressCardContent(cardState, data);
  const card = document.getElementById('dynamicProgressCard');
  const mascot = document.getElementById('progressMascot');
  const headline = document.getElementById('progressCardHeadline');
  const description = document.getElementById('progressCardDescription');
  if (card) card.dataset.state = content.state;
  if (mascot) mascot.src = content.mascot;
  if (headline) headline.textContent = content.headline;
  if (description) description.textContent = content.description;
  const visitingProgress = document.getElementById('progress')?.classList.contains('active');
  if (visitingProgress && content.state === 'new_exercise_unlocked' && data.unlockEventId) {
    const ids = state.progressInsights?.acknowledgedUnlockIds || [];
    state.progressInsights = { ...(state.progressInsights || {}), acknowledgedUnlockIds: [...new Set([...ids, data.unlockEventId])].slice(-100) };
    saveState();
  }
}

function renderProgress() {
  const profile = getProfile();
  const goal = profile?.goal || 'pullup';
  const goalTrackKey = getGoalTrackKey(goal);
  const tracks = getTracks();
  const track = goalTrackKey ? (baseTracks[goalTrackKey] || []) : [];
  const level = track.length ? Math.max(0, Math.min(getTrackLevel(goalTrackKey), track.length - 1)) : 0;

  const heroTitle = document.getElementById('goalHeroTitle');
  if (heroTitle) heroTitle.textContent = goalLabels[goal] || 'Pull-up';
  const dotCount = track.length;
  const filledDots = Math.min(level + 1, track.length);
  const focusDots = document.getElementById('focusProgressDots');
  const goalHero = document.querySelector('.progress-screen .goal-hero');
  if (goalHero) goalHero.classList.toggle('has-no-dots', !dotCount);
  if (focusDots) {
    focusDots.classList.toggle('hidden', !dotCount);
    focusDots.innerHTML = progressDotsMarkup(dotCount, filledDots);
    focusDots.setAttribute('aria-label', dotCount ? `${filledDots} of ${dotCount} priority-skill levels reached` : 'No capability progression available');
  }
  const milestone = document.getElementById('focusNextMilestone');
  const focusAchieved = workoutModule.isTrackMastered(goalTrackKey, state.levels?.[goalTrackKey] || {}, track);
  const nextMilestone = !focusAchieved ? track[level + 1]?.name : null;
  if (milestone) {
    milestone.classList.toggle('hidden', !nextMilestone);
    milestone.textContent = nextMilestone ? `Next milestone: ${nextMilestone}` : '';
  }
  renderProgressCard(buildProgressCardData(goal, profile, goalTrackKey, track));

  const levels = document.getElementById('levelsList');
  if (!levels) return;
  levels.innerHTML = '';
  const skills = {
    verticalPull: 'Pull-up',
    handstand: 'Handstand',
    lsit: 'L-sit',
    pistolSquat: 'Pistol squat'
  };
  Object.entries(skills).forEach(([key, label]) => {
    const item = state.levels[key];
    const exerciseTrack = baseTracks[key] || tracks[key];
    if (!item || !Array.isArray(exerciseTrack) || !exerciseTrack.length) return;
    const capability = workoutModule.getMasteringSkillProgress(key, item, exerciseTrack);
    const stageCount = capability.stages.length;
    const reached = capability.completedStages;
    if (!stageCount) return;
    const row = document.createElement('div');
    row.className = 'level-row';
    row.innerHTML = `<strong>${escapeHTML(label)}</strong><div class="progress-dots skill-progress-dots" aria-label="${reached} of ${stageCount} capability stages completed">${progressDotsMarkup(stageCount, reached)}</div>`;
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
  const priorityOnly = needsPrioritySkillSelection();
  onboarding.classList.toggle('priority-selection-only', priorityOnly);
  document.querySelector('#onboardingStepOne .equipment-block')?.classList.toggle('hidden', priorityOnly);
  const stepTitle = document.getElementById('onboardingStepOneTitle');
  const stepCount = document.getElementById('onboardingStepOneCount');
  const nextButton = document.getElementById('onboardingNextBtn');
  if (stepTitle) stepTitle.textContent = priorityOnly ? 'Choose your priority skill' : 'Build your workout plan';
  if (stepCount) stepCount.textContent = priorityOnly ? '1/1' : '1/2';
  if (nextButton) nextButton.textContent = priorityOnly ? 'Save priority skill' : 'Next';
  hideAccountSubmenuPanel();
	  document.documentElement.classList.remove('welcome-active', 'account-active');
	  document.body.classList.remove('welcome-active', 'account-active');
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

  if (needsPrioritySkillSelection()) {
    if (!goal) {
      setPanelMessage('onboardingMessage', 'Choose a priority skill to continue.', 'error');
      return;
    }
    const { legacyGoal, prioritySkillRequired, ...preservedProfile } = state.profile || {};
    state.profile = { ...preservedProfile, goal, updatedAt: new Date().toISOString() };
    saveState();
    setPanelMessage('onboardingMessage', '');
    renderAll();
    return;
  }

  if (!goal || equipment.length === 0) {
    setPanelMessage('onboardingMessage', 'Choose a priority skill and equipment to continue.', 'error');
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
    setPanelMessage('onboardingMessage', 'Choose a priority skill, equipment, push-up level, and squat level to continue.', 'error');
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
  if (!state.onboardingBaseline) {
    state.onboardingBaseline = {
      version: 1,
      completedAt: state.profile.createdAt,
      goal,
      equipment: [...equipment],
      pushups,
      squats,
      deadHang,
      negativePullup,
      dip,
      initialLevels: Object.fromEntries(Object.entries(state.levels).map(([key, value]) => [key, value.level || 0]))
    };
  }
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
	    if (accountReturnState || accountHistoryEntryActive) closeAccountModal();
	    panel.classList.remove('account-main-mode');
	    hideAccountSubmenuPanel();
	    setAccountActive(false);
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

  captureAccountReturnState();
  ensureAccountHistoryEntry();
  hideNormalAppChrome();
  hideAccountSubmenuPanel();
  hideAllAccountViews();

  panel.classList.add('account-modal', 'account-open', 'account-main-mode');
  panel.classList.remove('account-password-mode');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  panel.inert = false;
  if (loggedIn) loggedIn.classList.remove('hidden');

  setAccountActive(true);
  renderAccountView('main', { panel, content: loggedIn });
  focusAccountViewHeading('main');
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
  panel.inert = true;
}

function hideAccountSubmenuPanel() {
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  if (!submenuPanel) return;
  submenuPanel.classList.remove('account-submenu-mode');
  submenuPanel.classList.add('hidden');
  submenuPanel.setAttribute('aria-hidden', 'true');
  submenuPanel.inert = true;
}

function openAccountSubmenu(view) {
  const submenuPanel = document.getElementById('accountSubmenuPanel');
  const submenuContent = document.getElementById('accountSubmenuContent');
  if (!submenuPanel || !submenuContent || !currentUser) return;

  captureAccountReturnState();
  ensureAccountHistoryEntry();
  hideNormalAppChrome();
  hideAllAccountViews();
  hideAccountMainPanel();
  setAccountActive(true);
  renderAccountView(view, { panel: submenuPanel, content: submenuContent });
  submenuPanel.classList.add('account-submenu-mode');
  submenuPanel.classList.remove('hidden');
  submenuPanel.setAttribute('aria-hidden', 'false');
  submenuPanel.inert = false;
  focusAccountViewHeading(view);
  updateUpdateBanner();
}

function renderAccountView(view, { panel = null, content = null } = {}) {
  hideAllAccountViews();
  const target = document.getElementById(`account${view[0].toUpperCase()}${view.slice(1)}View`);
  if (target) target.classList.remove('hidden');
  const title = document.getElementById('accountModalTitle');
  if (title) title.textContent = 'Menu';
  const submenuTitle = document.getElementById('accountSubmenuTitle');
  const viewTitle = target?.querySelector('.account-view-title')?.textContent?.trim();
  if (submenuTitle) submenuTitle.textContent = viewTitle || 'Submenu';

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
  if (view === 'tracker') setCustomChecklistMessage('');
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
  const passwordSection = document.getElementById('passwordAccountSection');
  if (passwordSection) passwordSection.classList.toggle('hidden', !canChangePassword());
  if (goalSummary) goalSummary.textContent = goalLabels[profile.goal] || 'Not set';
  if (equipmentSummary) {
    const equipment = (profile.equipment || []).filter(item => !deprecatedProfileEquipment.has(item));
    equipmentSummary.textContent = equipment.length
      ? equipment.map(item => equipmentLabels[item] || item).join(', ')
      : equipmentLabels.none;
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
  const selectableEquipment = (getProfile()?.equipment || []).filter(item => !deprecatedProfileEquipment.has(item));
  const equipment = selectableEquipment.length ? selectableEquipment : ['none'];
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
  if (!goal) return setPanelMessage('accountGoalMessage', 'Choose a priority skill first.', 'error');
  setPanelMessage('accountGoalMessage', 'Saving priority...', 'info');
  state.profile = { ...(state.profile || {}), goal, updatedAt: new Date().toISOString() };
  state.current = null;
  state.generated = null;
  state.selectedEnergy = null;
  saveState();
  renderAll();
  populateAccountGoal();
  renderAccountMainSummary();
  setPanelMessage('accountGoalMessage', 'Priority saved.', 'success');
}

async function saveAccountEquipment() {
  const selectedEquipment = Array.from(document.querySelectorAll('input[name="accountEquipment"]:checked')).map(input => input.value);
  if (selectedEquipment.length === 0) return setPanelMessage('accountEquipmentMessage', 'Choose at least one equipment option.', 'error');
  const preservedDeprecatedEquipment = (state.profile?.equipment || []).filter(item => deprecatedProfileEquipment.has(item));
  const equipment = [...new Set([...selectedEquipment, ...preservedDeprecatedEquipment])];
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
function activityEnergySummary() {
  const counts = new Map();
  countableHistory().forEach(item => {
    if (item.type === 'custom' || item.customType) return;
    const energy = item.energy || item.mode;
    if (!energyOptions[energy]) return;
    counts.set(energy, (counts.get(energy) || 0) + 1);
  });
  if (!counts.size) return '';
  const highestCount = Math.max(...counts.values());
  return Object.keys(energyOptions)
    .filter(energy => counts.get(energy) === highestCount)
    .map(energy => energyOptions[energy].title || energyOptions[energy].label || energy)
    .join(' & ');
}

function activityExerciseDetail(exercise) {
  const plannedSets = Number(exercise?.targetSets);
  const completedSets = Number(exercise?.completedSets);
  if (Number.isFinite(plannedSets) && plannedSets > 0 && Number.isFinite(completedSets)) {
    const rating = exercise.rating
      ? exercise.rating.charAt(0).toUpperCase() + exercise.rating.slice(1)
      : '';
    return `${Math.max(0, completedSets)}/${plannedSets} sets${rating ? ` - ${rating}` : ''}`;
  }
  return exercise?.prescription || '';
}

function renderActivity() {
  const yearSummary = document.getElementById('historyYearSummary');
  const monthSummary = document.getElementById('historyMonthSummary');
  const energySummary = document.getElementById('historyEnergySummary');
  const yearTitle = document.getElementById('historyYearTitle');
  const title = document.getElementById('historyMonthTitle');
  const calendar = document.getElementById('historyCalendar');
  const list = document.getElementById('historyList');
  if (!yearSummary || !monthSummary || !energySummary || !yearTitle || !title || !calendar || !list) return;

  const month = accountHistoryMonth.getMonth();
  const year = accountHistoryMonth.getFullYear();
  const now = new Date();
  const yearItems = workoutItemsForYear(accountHistoryMonth);
  const yearCount = yearItems.length;
  const monthItems = workoutItemsForMonth(accountHistoryMonth).sort((a, b) => a.parsedDate - b.parsedDate);
  const monthCount = monthItems.length;
  yearSummary.textContent = `This year: ${yearCount} workout${yearCount === 1 ? '' : 's'}`;
  monthSummary.textContent = `This month: ${monthCount} workout${monthCount === 1 ? '' : 's'}`;
  const commonEnergy = activityEnergySummary();
  energySummary.textContent = commonEnergy ? `Most common energy: ${commonEnergy}` : '';
  energySummary.classList.toggle('hidden', !commonEnergy);
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
        : `${workoutModule.workoutDisplayName(item.workout || 'Workout')} - ${energyOptions[item.mode]?.title || item.mode || 'Done'}`;
      const exercises = Array.isArray(item.exercises) ? item.exercises : [];
      const exerciseRows = exercises.map(exercise => {
        const detail = activityExerciseDetail(exercise);
        return `
          <div class="history-exercise-row">
            <span>${escapeHTML(exercise.name || 'Exercise')}</span>
            ${detail ? `<span class="history-exercise-result">${escapeHTML(detail)}</span>` : ''}
          </div>
        `;
      }).join('');
      return `
        <div class="history-item">
          <div class="history-item-header">
            <strong>${escapeHTML(dateLabel)}</strong>
            <span>${escapeHTML(label)}</span>
          </div>
          ${exerciseRows ? `<div class="history-item-exercises">${exerciseRows}</div>` : ''}
        </div>
      `;
    }).join('')
    : '';
}

async function initCloudSync() {
  if (!supabaseClient) {
    await revealPreparedApp();
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
    try {
      const { data } = await supabaseClient.auth.getSession();
      currentUser = data?.session?.user || null;
    } catch (error) {
      currentUser = null;
    }
    currentProfileId = null;
    if (currentUser) {
      await loadCloudState();
    } else {
      resetAuthUI('welcome');
    }
  }

	  await revealPreparedApp();
	  if (currentUser) preparedAuthUserId = currentUser.id;

	  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    currentProfileId = null;
    if (event === 'SIGNED_OUT') preparedAuthUserId = null;
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

    if (!currentUser && !passwordRecoveryMode) {
      resetAuthUI('welcome');
    }

	    if (event === 'SIGNED_IN' && currentUser && !passwordRecoveryMode) {
	      await prepareAuthenticatedApp();
	      return;
	    }

	    setAuthResolved(true);
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
      await prepareAuthenticatedApp();
    } catch (error) {
      setAuthResolved(true);
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
  resetAuthUI('welcome');
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
	    if (event.key === 'Escape') closeAccountModal();
	    renderModule.trapTabKey(event, accountSubmenuPanel);
	    return;
	  }

	  if (accountPanel?.classList.contains('account-open')) {
	    if (event.key === 'Escape') closeAccountModal();
	    renderModule.trapTabKey(event, accountPanel);
	  }
});

window.addEventListener('popstate', () => {
  if (accountHistoryBackInFlight) {
    accountHistoryBackInFlight = false;
    return;
  }
  if (!accountHistoryEntryActive) return;
  accountHistoryEntryActive = false;
  closeAccountModal(true);
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

  const activeSwapButton = event.target.closest('.active-swap-btn');
  if (activeSwapButton) {
    swapActiveExercise(Number(activeSwapButton.dataset.activeIndex));
    return;
  }

  const exerciseToggle = event.target.closest('.exercise-chip-toggle');
  if (exerciseToggle) {
    if (workoutCompletionState) return;
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
  if (feelButton && !energyScrollGesture) selectEnergy(feelButton.dataset.feel);
  if (feelButton) energyScrollGesture = false;
  if (event.target.id === 'dismissTodayEmptyState' || event.target.id === 'todayInfoAction') dismissTodayEmptyState();
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

  if (['includeWarmup', 'includeStretch', 'includeExerciseTimer', 'includeRestTimer'].includes(event.target.id)) {
    state.includeWarmup = Boolean(document.getElementById('includeWarmup')?.checked);
    state.includeStretch = Boolean(document.getElementById('includeStretch')?.checked);
    state.includeExerciseTimer = Boolean(document.getElementById('includeExerciseTimer')?.checked);
    state.includeRestTimer = Boolean(document.getElementById('includeRestTimer')?.checked);
    state.restTimerSeconds = 60;
    updateGeneratedWorkoutAddOns();
    saveState();
    renderGeneratedWorkout();
    updateAddOnSummary();
  }

  if (event.target.matches('input[name="restTimerSeconds"]')) {
    state.restTimerSeconds = 60;
    saveState();
    updateAddOnSummary();
  }

  if (event.target.id === 'closeWorkoutPreviewBtn') {
    state.generated = null;
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
    if (isWorkoutFullyComplete()) {
      workoutCompletionState = {
        mode: 'full',
        previousTrackKey: row.dataset.track
      };
      openExerciseTrackKey = null;
    }
    saveState();
    renderExercises();
  }

  if (event.target.id === 'completeBtn') {
    completeWorkout();
    return;
  }
  const completionAction = event.target.closest('[data-workout-completion-action]');
  if (completionAction) {
    const action = completionAction.dataset.workoutCompletionAction;
    if (action === 'back') restoreWorkoutFromCompletion();
    if (action === 'save' || action === 'finish') completeWorkoutNow(false);
    if (action === 'discard') completeWorkoutWithoutProgress();
    return;
  }

	  if (event.target.id === 'accountBtn' && currentUser) openAccountModal();
	  if (event.target.id === 'closeAccountModalBtn') closeAccountModal();
	  if (event.target.id === 'closeAccountSubmenuBtn') closeAccountModal();
	  if (event.target.id === 'accountPanel' && event.target.classList.contains('account-modal')) closeAccountModal();
	  const accountViewButton = event.target.closest('[data-account-view]');
	  if (accountViewButton) {
	    const view = accountViewButton.dataset.accountView;
	    showAccountView(view);
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
    const nextScreen = event.target.dataset.screen;
    resetMainRouteScroll();
    if (nextScreen !== 'today') resetTodaySession();
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    event.target.classList.add('active');
    event.target.setAttribute('aria-current', 'page');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(event.target.dataset.screen).classList.add('active');
    if (nextScreen === 'today') {
      renderToday();
    } else {
      document.body.classList.remove('workout-active');
      document.documentElement.classList.remove('workout-active');
      document.body.classList.remove('today-active');
      document.documentElement.classList.remove('today-active');
      document.querySelector('.topbar')?.classList.remove('hidden');
      syncBottomNavVisibility();
    }
    const title = document.getElementById('screenTitle');
    if (title) title.textContent = event.target.textContent;
    renderProgress();
    renderActivity();
    resetRouteScrollOnEntry();
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

preloadTodayMascots();
setupStarAnimation();
renderAll();
initCloudSync();
