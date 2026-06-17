const INITIAL_AUTH_SEARCH = window.location.search || '';
const INITIAL_AUTH_HASH = window.location.hash || '';
const STORAGE_KEY = 'camille-calisthenics-v4';
const LEGACY_STORAGE_KEY = 'camille-calisthenics-v2';
const OLDER_LEGACY_STORAGE_KEY = 'camille-calisthenics-v1';
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
        detectSessionInUrl: true
      }
    })
  : null;
window.appSupabaseClient = supabaseClient;

let currentUser = null;
let currentProfileId = null;
let syncTimer = null;
let welcomeDismissed = false;
function isPasswordRecoveryUrl() {
  // Use the original URL captured before Supabase can consume/clean auth params.
  // A password-reset redirect can look like:
  //   ?reset-password=1#access_token=...&type=recovery
  // or, depending on provider/browser, only carry the custom reset-password flag.
  const current = `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`;
  const initial = `${INITIAL_AUTH_SEARCH.replace(/^\?/, '')}&${INITIAL_AUTH_HASH.replace(/^#/, '')}`;
  const params = new URLSearchParams(`${initial}&${current}`);
  return (
    params.get('reset-password') === '1' ||
    params.get('type') === 'recovery' ||
    params.get('event') === 'PASSWORD_RECOVERY'
  );
}

function clearAuthUrlParams() {
  if (!window.location.hash && !window.location.search) return;
  window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
}

let passwordRecoveryMode = isPasswordRecoveryUrl();
let accountHistoryMonth = new Date();
const ADMIN_EMAILS = ['grascam@gmail.com'];

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
  setWelcomeVisible(!welcomeDismissed && !currentUser);
}


const baseTracks = {
  pushup: [
    { name: 'Incline push-up', prescription: '3 × 5' },
    { name: 'Incline push-up', prescription: '3 × 8' },
    { name: 'Incline push-up', prescription: '3 × 10' },
    { name: 'Lower incline push-up', prescription: '3 × 5' },
    { name: 'Lower incline push-up', prescription: '3 × 8' },
    { name: 'Knee push-up', prescription: '3 × 5' },
    { name: 'Knee push-up', prescription: '3 × 8' },
    { name: 'Full push-up', prescription: '3 × 3' },
    { name: 'Full push-up', prescription: '3 × 5' },
    { name: 'Full push-up', prescription: '3 × 8' }
  ],
  pullup: [
    { name: 'Dead hang + negative pull-up', prescription: '3 × 20s + 3 × 1' },
    { name: 'Dead hang + negative pull-up', prescription: '3 × 30s + 3 × 2' },
    { name: 'Dead hang + negative pull-up', prescription: '3 × 40s + 3 × 3' },
    { name: 'Scapular pull-up', prescription: '3 × 5' },
    { name: 'Scapular pull-up', prescription: '3 × 8' },
    { name: 'Assisted pull-up', prescription: '3 × 3' },
    { name: 'First pull-up attempt', prescription: '5 attempts' }
  ],
  dip: [
    { name: 'Negative dip', prescription: '3 × 2' },
    { name: 'Negative dip', prescription: '3 × 4' },
    { name: 'Dip', prescription: '3 × 1' },
    { name: 'Dip', prescription: '3 × 2' },
    { name: 'Dip', prescription: '3 × 3' },
    { name: 'Dip', prescription: '3 × 5' }
  ],
  legs: [
    { name: 'Bodyweight squat', prescription: '3 × 10' },
    { name: 'Bodyweight squat', prescription: '3 × 15' },
    { name: 'Reverse lunge', prescription: '3 × 8/side' },
    { name: 'Reverse lunge', prescription: '3 × 10/side' },
    { name: 'Kettlebell deadlift', prescription: '3 × 10' },
    { name: 'Goblet squat', prescription: '3 × 8' }
  ],
  core: [
    { name: 'Plank', prescription: '3 × 20s' },
    { name: 'Plank', prescription: '3 × 30s' },
    { name: 'Plank', prescription: '3 × 45s' },
    { name: 'Hollow hold', prescription: '3 × 15s' },
    { name: 'Hollow hold', prescription: '3 × 30s' },
    { name: 'Hanging knee raise', prescription: '3 × 5' },
    { name: 'Hanging knee raise', prescription: '3 × 10' }
  ],
  crow: [
    { name: 'Crow weight shift', prescription: '5 × 10s' },
    { name: 'Crow one-foot lift', prescription: '5 attempts/side' },
    { name: 'Crow hold', prescription: '5 × 3s' },
    { name: 'Crow hold', prescription: '5 × 5s' },
    { name: 'Crow hold', prescription: '5 × 10s' },
    { name: 'Crow hold', prescription: '3 × 20s' }
  ],
  lsit: [
    { name: 'Tuck sit', prescription: '5 × 10s' },
    { name: 'Tuck sit', prescription: '5 × 20s' },
    { name: 'Extended tuck', prescription: '5 × 10s' },
    { name: 'Extended tuck', prescription: '5 × 20s' },
    { name: 'One-leg L-sit', prescription: '5 × 10s/side' },
    { name: 'L-sit', prescription: '5 attempts' }
  ],
  handstand: [
    { name: 'Wall plank hold', prescription: '3 × 20s' },
    { name: 'Pike hold', prescription: '3 × 20s' },
    { name: 'Wall walk', prescription: '3 × 3' },
    { name: 'Chest-to-wall handstand', prescription: '3 × 20s' },
    { name: 'Handstand kick-up practice', prescription: '5 min' }
  ],
  muscleup: [
    { name: 'Explosive row / pull practice', prescription: '3 × 5' },
    { name: 'Negative pull-up', prescription: '3 × 3' },
    { name: 'High pull-up practice', prescription: '3 × 3' },
    { name: 'Transition drill', prescription: '5 attempts' },
    { name: 'Muscle-up attempt', prescription: '5 attempts' }
  ],
  rope: [
    { name: 'Jump rope', prescription: '3 × 30s' },
    { name: 'Jump rope', prescription: '3 × 45s' },
    { name: 'Jump rope', prescription: '3 × 60s' },
    { name: 'Jump rope', prescription: '5 min easy' }
  ]
};

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

function getProfile() {
  return state?.profile || null;
}

function getTracks() {
  const profile = getProfile();
  const equipment = profile?.equipment || [];
  const hasPullupBar = equipment.includes('pullupBar');
  const hasDipBars = equipment.includes('dipBars');
  const hasBands = equipment.includes('bands');
  const hasJumpRope = equipment.includes('jumpRope');
  const tracks = JSON.parse(JSON.stringify(baseTracks));

  if (!hasPullupBar) {
    tracks.pullup = [
      { name: 'Prone Y raise', prescription: '3 × 8' },
      { name: 'Superman hold', prescription: '3 × 20s' },
      { name: 'Reverse snow angel', prescription: '3 × 8' },
      { name: 'Table row', prescription: '3 × 5' },
      { name: 'Table row', prescription: '3 × 8' },
      { name: 'Pull-up bar recommended', prescription: 'Keep building pulling strength' }
    ];
  } else if (hasBands) {
    tracks.pullup[5] = { name: 'Band-assisted pull-up', prescription: '3 × 3' };
  }

  if (!hasDipBars) {
    tracks.dip = [
      { name: 'Bench dip prep', prescription: '3 × 5' },
      { name: 'Bench dip', prescription: '3 × 8' },
      { name: 'Bench dip', prescription: '3 × 10' },
      { name: 'Close-grip push-up', prescription: '3 × 5' },
      { name: 'Dip bars recommended', prescription: 'Keep building pushing strength' }
    ];
  }

  tracks.legs = [
    { name: 'Bodyweight squat', prescription: '3 × 10' },
    { name: 'Bodyweight squat', prescription: '3 × 15' },
    { name: 'Reverse lunge', prescription: '3 × 8/side' },
    { name: 'Reverse lunge', prescription: '3 × 10/side' },
    { name: 'Split squat', prescription: '3 × 6/side' },
    { name: 'Split squat', prescription: '3 × 8/side' }
  ];

  if (!hasPullupBar) {
    // Muscle-up work needs a pull-up bar. If the user does not have one,
    // do not generate muscle-up-specific exercises. The pull-up track already
    // gets swapped to safe no-bar pulling prep above.
    tracks.muscleup = [];

    tracks.core = [
      { name: 'Plank', prescription: '3 × 20s' },
      { name: 'Plank', prescription: '3 × 30s' },
      { name: 'Plank', prescription: '3 × 45s' },
      { name: 'Hollow hold', prescription: '3 × 15s' },
      { name: 'Hollow hold', prescription: '3 × 30s' },
      { name: 'Reverse crunch', prescription: '3 × 8' },
      { name: 'Reverse crunch', prescription: '3 × 12' }
    ];
  }
  if (!hasJumpRope) {
    // Jump rope exercises should only appear when the user explicitly selects a rope.
    tracks.rope = [];
  }

  return tracks;
}

function getRotation() {
  const profile = getProfile();
  const goal = profile?.goal || 'pullup';
  const equipment = profile?.equipment || [];
  const hasPullupBar = equipment.includes('pullupBar');
  const skillTrack = goal === 'handstand'
    ? 'handstand'
    : goal === 'lsit'
      ? 'lsit'
      : goal === 'muscleup' && hasPullupBar
        ? 'muscleup'
        : goal === 'general'
          ? 'crow'
          : 'pullup';
  return [
    { name: 'Push', tracks: ['pushup', 'dip', 'core'] },
    { name: 'Pull', tracks: ['pullup', 'core'] },
    { name: 'Legs + Core', tracks: ['legs', 'core'] },
    { name: 'Skills', tracks: [skillTrack, 'lsit', 'core'].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3) }
  ];
}

function hasCompletedProfile() {
  return Boolean(state.profile?.goal && state.profile?.equipment && state.profile?.pushups && state.profile?.squats);
}


const legacyRotation = [
  { name: 'Push', tracks: ['pushup', 'dip', 'core'] },
  { name: 'Pull', tracks: ['pullup', 'core', 'rope'] },
  { name: 'Legs + Core', tracks: ['legs', 'core', 'rope'] },
  { name: 'Skills', tracks: ['crow', 'lsit', 'pullup'] }
];

const energyOptions = {
  great: {
    label: 'Great',
    mode: 'great',
    title: 'Great',
    description: 'Full session · 4 exercises · full sets and reps.',
    exerciseCount: 4,
    setMultiplier: 1,
    repMultiplier: 1,
    levelShift: 0,
    icon: 'Assets/Energy/great-icon.png'
  },
  normal: {
    label: 'Normal',
    mode: 'normal',
    title: 'Normal',
    description: 'Standard session · 4 exercises · slightly reduced sets and reps.',
    exerciseCount: 4,
    setMultiplier: 0.8,
    repMultiplier: 0.85,
    levelShift: 0,
    icon: 'Assets/Energy/normal-icon.png'
  },
  tired: {
    label: 'Tired',
    mode: 'tired',
    title: 'Tired',
    description: 'Shorter session · 3 exercises · reduced volume.',
    exerciseCount: 3,
    setMultiplier: 0.8,
    repMultiplier: 0.85,
    levelShift: 0,
    icon: 'Assets/Energy/tired-icon.png'
  },
  exhausted: {
    label: 'Exhausted',
    mode: 'exhausted',
    title: 'Exhausted',
    description: 'Minimum session · 3 easier exercises · low sets and reps.',
    exerciseCount: 3,
    setMultiplier: 0.55,
    repMultiplier: 0.65,
    levelShift: -1,
    icon: 'Assets/Energy/exhaustive-icon.png'
  }
};


const workoutAddOns = {
  warmup: {
    trackKey: 'warmup',
    name: '2-min full-body warm-up',
    prescription: '2 min · 30s each',
    setCount: 4,
    isAddOn: true,
    addOnType: 'warmup',
    setLabels: ['March in place', 'Arm circles', 'Hip circles', 'Bodyweight squats']
  },
  stretch: {
    trackKey: 'stretch',
    name: '2-min full-body stretch',
    prescription: '2 min · 30s each',
    setCount: 4,
    isAddOn: true,
    addOnType: 'stretch',
    setLabels: ['Hamstring stretch', 'Quad stretch', 'Chest opener', "Child\'s pose"]
  }
};

function getSelectedAddOns() {
  return {
    warmup: Boolean(state.includeWarmup),
    stretch: Boolean(state.includeStretch)
  };
}

function getExtraSessionMinutes(addOns = getSelectedAddOns()) {
  return (addOns.warmup ? 2 : 0) + (addOns.stretch ? 2 : 0);
}

function cloneAddOn(addOn) {
  return JSON.parse(JSON.stringify(addOn));
}

function applyWorkoutAddOns(workout, addOns = getSelectedAddOns()) {
  const exercises = [...(workout.exercises || [])];
  if (addOns.warmup) exercises.unshift(cloneAddOn(workoutAddOns.warmup));
  if (addOns.stretch) exercises.push(cloneAddOn(workoutAddOns.stretch));
  return {
    ...workout,
    includeWarmup: addOns.warmup,
    includeStretch: addOns.stretch,
    extraMinutes: getExtraSessionMinutes(addOns),
    exercises
  };
}

function sessionTotalLabel(workout) {
  const extra = workout?.extraMinutes || 0;
  if (!extra) return 'Workout only';
  return `+ ${extra} min add-ons`;
}

function normalizeExercise(exercise) {
  if (!exercise || typeof exercise !== 'object') return null;
  if (!exercise.name || !exercise.prescription) return null;
  const normalized = { ...exercise };
  normalized.trackKey = normalized.trackKey || `exercise-${normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  normalized.setCount = normalized.setCount || getSetCount(normalized.prescription);
  return normalized;
}

function sanitizeWorkout(workout) {
  if (!workout || typeof workout !== 'object') return null;
  if (!Array.isArray(workout.exercises)) return null;

  const exercises = workout.exercises.map(normalizeExercise).filter(Boolean);
  if (!exercises.length) return null;

  return {
    ...workout,
    ratings: workout.ratings || {},
    sets: workout.sets || {},
    exercises
  };
}

function sanitizeState(nextState) {
  if (!nextState || typeof nextState !== 'object') return defaultState();

  nextState.current = sanitizeWorkout(nextState.current);
  nextState.generated = sanitizeWorkout(nextState.generated);
  nextState.includeWarmup = Boolean(nextState.includeWarmup);
  nextState.includeStretch = Boolean(nextState.includeStretch);

  if (!nextState.current && !nextState.generated && !nextState.selectedEnergy) {
    nextState.includeWarmup = false;
    nextState.includeStretch = false;
  }

  return nextState;
}

function defaultState() {
  const levels = {};
  Object.keys(baseTracks).forEach(key => levels[key] = { level: 0, points: 0 });
  return { rotationIndex: 0, levels, history: [], current: null, selectedEnergy: null, generated: null, profile: null, includeWarmup: false, includeStretch: false };
}

let state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(OLDER_LEGACY_STORAGE_KEY);
  if (!saved) return defaultState();
  try {
    const parsed = JSON.parse(saved);
    const merged = { ...defaultState(), ...parsed };
    merged.levels = { ...defaultState().levels, ...(parsed.levels || {}) };
    return sanitizeState(merged);
  } catch {
    return defaultState();
  }
}


function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function publicState() {
  return {
    rotationIndex: state.rotationIndex,
    levels: state.levels,
    history: state.history,
    current: state.current,
    selectedEnergy: state.selectedEnergy,
    generated: state.generated,
    profile: state.profile,
    includeWarmup: state.includeWarmup,
    includeStretch: state.includeStretch
  };
}

function queueCloudSave() {
  if (!supabaseClient || !currentUser || !currentProfileId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveCloudState, 500);
}

function normaliseEmail(email = '') {
  return email.trim().toLowerCase();
}
function isAdminUser() {
  return Boolean(currentUser?.email && ADMIN_EMAILS.includes(normaliseEmail(currentUser.email)));
}

function getCompletedWorkoutCount(savedState) {
  return Array.isArray(savedState?.history) ? savedState.history.length : 0;
}

function formatAdminGoal(savedState) {
  const goal = savedState?.profile?.goal;
  return goalLabels[goal] || goal || 'Not set';
}

function formatAdminActive(profile, savedState) {
  if (profile?.deleted_at) return 'N';
  if (profile?.current_auth_user_id) return 'Y';
  return savedState ? 'Y' : 'N';
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
    state = { ...defaultState(), ...cloudState };
    state.levels = { ...defaultState().levels, ...(cloudState.levels || {}) };
    state = sanitizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (legacyState) await saveCloudState();
    renderAll();
    setSyncStatus(legacyState ? 'Progress recovered and upgraded.' : 'Progress loaded.');
  } else {
    await saveCloudState();
    setSyncStatus('New recovery profile created.');
  }
}

function setSyncStatus(message) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = message;
}


function setAuthMessage(message, type = 'info') {
  const el = document.getElementById('authMessage');
  if (!el) return;
  const activeAuthForm = document.querySelector('#loggedOutAccount > div:not(.hidden)');
  const submit = activeAuthForm?.querySelector('.account-submit');
  const switchLink = activeAuthForm?.querySelector('.auth-switch');
  if (activeAuthForm && submit && el.parentElement !== activeAuthForm) {
    activeAuthForm.insertBefore(el, switchLink || submit.nextSibling);
  } else if (activeAuthForm && submit && el.previousElementSibling !== submit) {
    activeAuthForm.insertBefore(el, switchLink || submit.nextSibling);
  }
  el.textContent = message || '';
  el.dataset.type = type;
}

function friendlyAuthError(message = '') {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) return 'Email or password is incorrect.';
  if (lower.includes('already registered') || lower.includes('already exists')) return 'An account already exists with this email. Try logging in instead.';
  if (lower.includes('password') && lower.includes('characters')) return 'Password is too short. Use at least 6 characters.';
  if (lower.includes('email')) return 'Please enter a valid email address.';
  if (lower.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
  return message || 'Something went wrong. Please try again.';
}

function withTimeout(promise, ms = 12000, message = 'Request timed out. Check your connection and try again.') {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), ms))
  ]);
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
  const welcome = document.getElementById('authWelcome');
  const login = document.getElementById('authLoginForm');
  const reset = document.getElementById('authResetForm');
  if (!welcome || !login || !reset) return;

  const isReset = mode === 'reset';
  document.body.classList.toggle('password-recovery-mode', isReset);

  // Reset password is a standalone flow. It must never share the page with
  // onboarding or app screens, even though Supabase temporarily logs the user in.
  if (isReset) {
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


function getEnergyConfig(mode = 'normal') {
  return Object.values(energyOptions).find(option => option.mode === mode) || energyOptions.normal;
}

function isTrackAvailable(trackKey, tracks = getTracks()) {
  return Array.isArray(tracks[trackKey]) && tracks[trackKey].length > 0;
}

function getExercise(trackKey, config = energyOptions.great) {
  const tracks = getTracks();
  const track = isTrackAvailable(trackKey, tracks) ? tracks[trackKey] : tracks.core;
  const safeTrackKey = isTrackAvailable(trackKey, tracks) ? trackKey : 'core';
  const trackState = state.levels[safeTrackKey] || { level: 0, points: 0 };
  const baseLevel = Math.min(trackState.level, track.length - 1);
  const adjustedLevel = Math.max(0, Math.min(baseLevel + (config.levelShift || 0), track.length - 1));
  const baseExercise = track[adjustedLevel];
  const prescription = adaptPrescription(baseExercise.prescription, config);

  return {
    trackKey: safeTrackKey,
    ...baseExercise,
    prescription,
    basePrescription: baseExercise.prescription,
    level: adjustedLevel + 1,
    originalLevel: baseLevel + 1,
    setCount: getSetCount(prescription)
  };
}

function buildWorkoutTracks(workout, desiredCount) {
  const availableTracks = getTracks();
  const fillByWorkout = {
    Push: ['pushup', 'dip', 'core', 'legs', 'rope'],
    Pull: ['pullup', 'core', 'rope', 'legs', 'pushup'],
    'Legs + Core': ['legs', 'core', 'rope', 'pushup', 'pullup'],
    Skills: ['core', 'lsit', 'crow', 'handstand', 'pullup', 'rope']
  };
  const tracks = [...workout.tracks].filter(trackKey => isTrackAvailable(trackKey, availableTracks));
  const fillers = (fillByWorkout[workout.name] || ['core', 'legs', 'pushup', 'pullup', 'rope'])
    .filter(trackKey => isTrackAvailable(trackKey, availableTracks));

  fillers.forEach(trackKey => {
    if (tracks.length < desiredCount && !tracks.includes(trackKey)) tracks.push(trackKey);
  });

  return tracks.slice(0, desiredCount);
}

function adaptPrescription(prescription, config = energyOptions.great) {
  const setMultiplier = config.setMultiplier ?? 1;
  const repMultiplier = config.repMultiplier ?? 1;

  let adapted = prescription.replace(/(\d+)\s*×\s*(\d+)(s?)(\/side)?/g, (_, sets, reps, seconds, side = '') => {
    const nextSets = Math.max(1, Math.round(Number(sets) * setMultiplier));
    const nextReps = Math.max(1, Math.round(Number(reps) * repMultiplier));
    return `${nextSets} × ${nextReps}${seconds || ''}${side || ''}`;
  });

  adapted = adapted.replace(/(\d+)\s+attempts(\/side)?/g, (_, attempts, side = '') => {
    const nextAttempts = Math.max(1, Math.round(Number(attempts) * repMultiplier));
    return `${nextAttempts} attempts${side || ''}`;
  });

  adapted = adapted.replace(/(\d+)\s+min/g, (_, minutes) => {
    const nextMinutes = Math.max(1, Math.round(Number(minutes) * repMultiplier));
    return `${nextMinutes} min`;
  });

  return adapted;
}

function getSetCount(prescription) {
  const setMatch = prescription.match(/(\d+)\s*×/);
  if (setMatch) return Math.max(1, Number(setMatch[1]));
  const attemptMatch = prescription.match(/(\d+)\s+attempts/);
  if (attemptMatch) return Math.max(1, Number(attemptMatch[1]));
  return 1;
}

function getTodayWorkout(mode = 'normal') {
  const rotation = getRotation();
  const workout = rotation[state.rotationIndex % rotation.length];
  const config = getEnergyConfig(mode);
  const tracks = buildWorkoutTracks(workout, config.exerciseCount);

  return {
    mode: config.mode,
    workoutName: workout.name,
    energyTitle: config.title,
    energyDescription: config.description,
    exercises: tracks.map(trackKey => getExercise(trackKey, config))
  };
}

function modeLabel(mode) {
  if (mode === 'great') return 'Great · 4 exercises · Full volume';
  if (mode === 'normal') return 'Normal · 4 exercises · Reduced volume';
  if (mode === 'tired' || mode === 'reduced') return 'Tired · 3 exercises · Reduced volume';
  if (mode === 'exhausted' || mode === 'minimum') return 'Exhausted · 3 easier exercises · Minimum volume';
  return 'Workout';
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
    const levelLabel = exercise.isAddOn ? 'Add-on' : (exercise.originalLevel && exercise.originalLevel !== exercise.level ? `L${exercise.level} · easier` : `L${exercise.level}`);
    const ratingBlock = exercise.isAddOn ? '' : `
      <p class="rating-label">How was it?</p>
      <div class="rating-row" data-track="${exercise.trackKey}">
        <button data-rating="easy" class="${selectedRating === 'easy' ? 'selected' : ''}">Easy</button>
        <button data-rating="good" class="${selectedRating === 'good' ? 'selected' : ''}">Good</button>
        <button data-rating="hard" class="${selectedRating === 'hard' ? 'selected' : ''}">Hard</button>
        <button data-rating="failed" class="${selectedRating === 'failed' ? 'selected' : ''}">Failed</button>
      </div>`;
    card.innerHTML = `
      <h3>${exercise.name}<span>${levelLabel}</span></h3>
      <p class="prescription">${exercise.prescription}</p>
      ${setRows}
      ${ratingBlock}
    `;
    list.appendChild(card);
  });
  document.getElementById('completeBtn').classList.remove('hidden');
}

function applyRating(trackKey, rating) {
  const trackState = state.levels[trackKey];
  const delta = { easy: 2, good: 1, hard: 0, failed: -1 }[rating];
  trackState.points += delta;

  if (trackState.points >= 3) {
    trackState.level = Math.min(trackState.level + 1, (getTracks()[trackKey] || baseTracks[trackKey]).length - 1);
    trackState.points = 0;
  }
  if (trackState.points <= -2) {
    trackState.level = Math.max(trackState.level - 1, 0);
    trackState.points = 0;
  }
}

function completeWorkout() {
  if (!state.current) return;
  const rateableExercises = state.current.exercises.filter(exercise => !exercise.isAddOn);
  const ratedCount = Object.keys(state.current.ratings).length;
  if (ratedCount < rateableExercises.length) {
    const ok = confirm('Some exercises are not rated yet. Complete workout anyway?');
    if (!ok) return;
  }

  Object.entries(state.current.ratings).forEach(([trackKey, rating]) => {
    if (state.levels[trackKey]) applyRating(trackKey, rating);
  });
  state.history.push({ date: new Date().toISOString(), workout: state.current.workoutName, mode: state.current.mode, exercises: state.current.exercises.map(ex => ({ name: ex.name, prescription: ex.prescription, trackKey: ex.trackKey, isAddOn: Boolean(ex.isAddOn) })) });
  state.rotationIndex = (state.rotationIndex + 1) % getRotation().length;
  state.current = null;
  state.selectedEnergy = null;
  state.generated = null;
  saveState();
  alert('Workout complete. See you next time.');
  renderToday();
  renderGoals();
  renderProgress();
}

function getTrackLevel(trackKey) {
  return state.levels[trackKey]?.level || 0;
}

function renderGoals() {
  const profile = getProfile();
  const goal = profile?.goal || 'pullup';
  const goalTrackKey = goal === 'handstand' ? 'handstand' : goal === 'lsit' ? 'lsit' : goal === 'muscleup' ? 'muscleup' : 'pullup';
  const tracks = getTracks();
  const track = tracks[goalTrackKey] || tracks.pullup;
  const level = getTrackLevel(goalTrackKey);
  const current = track[Math.min(level, track.length - 1)];
  const next = track[Math.min(level + 1, track.length - 1)];
  const percent = Math.round(((level + 1) / track.length) * 100);

  const heroTitle = document.getElementById('goalHeroTitle');
  if (heroTitle) heroTitle.textContent = goalLabels[goal] || 'First Pull-Up';
  document.getElementById('pullupStage').textContent = `Current stage: ${current.name}`;
  document.getElementById('pullupProgressBar').style.width = `${percent}%`;
  document.getElementById('pullupNext').textContent = level >= track.length - 1
    ? `Milestone reached: ${goalLabels[goal] || 'Goal'} unlocked`
    : `Next milestone: ${next.name}`;

  const journey = document.getElementById('pullupJourney');
  journey.innerHTML = `
    <div class="journey-summary current-stage"><div><p class="eyebrow">Current stage</p><strong>${current.name}</strong><span>${current.prescription}</span></div><em>Now</em></div>
    <div class="journey-summary"><div><p class="eyebrow">Next milestone</p><strong>${level >= track.length - 1 ? 'Goal unlocked' : next.name}</strong><span>${level >= track.length - 1 ? 'Keep training and consolidate.' : next.prescription}</span></div><em>Next</em></div>
    <div class="journey-summary"><div><p class="eyebrow">Completed</p><strong>${level === 0 ? 'Starting now' : `${level} milestone${level > 1 ? 's' : ''} completed`}</strong><span>${level === 0 ? 'Your first milestone is in progress.' : track.slice(0, level).map(s => s.name).join(' · ')}</span></div><em>${level}/${track.length}</em></div>
  `;

  const skills = [
    { key: 'pullup', label: 'Pull-Up' },
    { key: 'handstand', label: 'Handstand' },
    { key: 'lsit', label: 'L-Sit' },
    { key: 'muscleup', label: 'Muscle-Up' }
  ].filter(skill => skill.key !== goalTrackKey).slice(0, 3);
  const skillList = document.getElementById('skillList');
  skillList.innerHTML = '';
  skills.forEach(skill => {
    const skillTrack = tracks[skill.key] || baseTracks[skill.key];
    const skillLevel = getTrackLevel(skill.key);
    const currentSkill = skillTrack[Math.min(skillLevel, skillTrack.length - 1)];
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML = `<div><strong>${skill.label}</strong><p>${currentSkill.name} · ${currentSkill.prescription}</p></div><span>Level ${skillLevel + 1}/${skillTrack.length}</span>`;
    skillList.appendChild(row);
  });
}

function renderProgress() {
  const now = new Date();
  const monthly = state.history.filter(item => {
    const d = new Date(item.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  document.getElementById('monthlyCount').textContent = monthly;

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
    const exerciseTrack = getTracks()[key] || baseTracks[key];
    const exercise = exerciseTrack[Math.min(item.level, exerciseTrack.length - 1)];
    if (!exercise) return;
    const row = document.createElement('div');
    row.className = 'level-row';
    row.innerHTML = `<div><strong>${labels[key]}</strong><p>${exercise.name} · ${exercise.prescription}</p></div><span>L${item.level + 1}</span>`;
    levels.appendChild(row);
  });
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calisthenics-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = { ...defaultState(), ...JSON.parse(reader.result) };
      saveState();
      renderToday();
      renderProgress();
      alert('Progress imported.');
    } catch {
      alert('Could not import this file.');
    }
  };
  reader.readAsText(file);
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
    alert('Please complete goal, equipment, push-ups and squats.');
    return;
  }
  if (equipment.includes('pullupBar') && (!deadHang || !negativePullup)) {
    alert('Please answer the pull-up bar questions.');
    return;
  }
  if (equipment.includes('dipBars') && !dip) {
    alert('Please answer the dip bars question.');
    return;
  }

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


function renderAll() {
  renderToday();
  renderGoals();
  renderProgress();
  renderAccount();
  renderOnboarding();
  updateWelcomeGate();
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

  if (passwordRecoveryMode && currentUser) {
    panel.classList.remove('hidden');
    panel.classList.remove('account-modal');
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
}

function closeAccountModal() {
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  panel.classList.remove('account-open');
  panel.classList.add('hidden');
  showAccountView('main');
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
  if (panel) panel.scrollTop = 0;
  if (content) content.scrollTop = 0;
  if (view === 'goal') populateAccountGoal();
  if (view === 'equipment') populateAccountEquipment();
  if (view === 'history') renderAccountHistory();
  if (view === 'admin') renderAdminDashboard();
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
    const count = state.history.length;
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
  if (!goal) return alert('Choose a goal first.');
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
  if (equipment.length === 0) return alert('Choose at least one equipment option.');
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
  if (!supabaseClient || !currentUser) return;
  const message = document.getElementById('accountPasswordMessage');
  const password = document.getElementById('accountNewPasswordInput')?.value;
  const confirmPassword = document.getElementById('accountConfirmPasswordInput')?.value;
  if (message) message.textContent = '';
  if (!password || !confirmPassword) {
    if (message) message.textContent = 'Enter and confirm your new password.';
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
  if (message) message.textContent = 'Updating password...';
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    if (message) message.textContent = friendlyAuthError(error.message);
    return;
  }
  document.getElementById('accountNewPasswordInput').value = '';
  document.getElementById('accountConfirmPasswordInput').value = '';
  if (message) message.textContent = 'Password updated.';
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

  const monthItems = state.history
    .map(item => ({ ...item, parsedDate: new Date(item.date) }))
    .filter(item => item.parsedDate.getMonth() === month && item.parsedDate.getFullYear() === year)
    .sort((a, b) => a.parsedDate - b.parsedDate);

  const byDay = new Map();
  monthItems.forEach(item => {
    const day = item.parsedDate.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  calendar.innerHTML = '';
  for (let i = 0; i < mondayOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'history-day history-empty';
    calendar.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const workouts = byDay.get(day) || [];
    cell.className = `history-day${workouts.length ? ' has-workout' : ''}`;
    cell.innerHTML = `<span>${day}</span>${workouts.length ? '<strong>✓</strong>' : ''}`;
    calendar.appendChild(cell);
  }

  list.innerHTML = monthItems.length
    ? monthItems.map(item => `<div class="history-item"><strong>${item.parsedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</strong><span>${item.workout || 'Workout'} · ${energyOptions[item.mode]?.title || item.mode || 'Done'}</span></div>`).join('')
    : '<p class="muted">No workouts completed this month yet.</p>';
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
  const rows = (profiles || []).map(profile => {
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

  message.textContent = `${rows.length} user${rows.length === 1 ? '' : 's'}`;
  list.innerHTML = rows.length
    ? rows.map(row => `
      <div class="admin-user-row">
        <div>
          <strong>${escapeHTML(row.email)}</strong>
          <span>${escapeHTML(row.goal)}</span>
        </div>
        <div class="admin-user-stats">
          <span>Active: ${escapeHTML(row.active)}</span>
          <span>${row.completed} workout${row.completed === 1 ? '' : 's'}</span>
        </div>
      </div>
    `).join('')
    : '<p class="muted">No users found yet.</p>';
}

async function initCloudSync() {
  if (!supabaseClient) {
    renderAll();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  currentProfileId = null;
  passwordRecoveryMode = passwordRecoveryMode || isPasswordRecoveryUrl();
  // Supabase turns a password reset link into a temporary logged-in session.
  // If the page was opened from a recovery URL, keep the user on the reset form
  // instead of continuing into the app like a normal login.
  if (currentUser && !passwordRecoveryMode) await loadCloudState();
  renderAll();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    currentProfileId = null;
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryMode = true;
    if (event === 'SIGNED_IN' && !passwordRecoveryMode) passwordRecoveryMode = false;
    if (event === 'SIGNED_OUT') passwordRecoveryMode = false;

    // Do not block the UI on cloud sync. If Supabase profile/state loading is slow,
    // users must still leave the auth screen instead of staying on “Logging in...”.
    renderAll();
    if (currentUser && !passwordRecoveryMode) loadCloudStateInBackground();
  });
}

async function signUp() {
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
}

async function login() {
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
}

async function sendPasswordReset() {
  if (!supabaseClient) return setAuthMessage('Account connection is not configured yet.', 'error');
  const email = document.getElementById('loginEmailInput')?.value.trim();
  if (!email) return setAuthMessage('Enter your email first, then tap Forgot password.', 'error');

  const redirectUrl = new URL(window.location.href);
  redirectUrl.searchParams.set('reset-password', '1');
  redirectUrl.hash = '';
  const redirectTo = redirectUrl.toString();

  setAuthMessage('Sending reset link...', 'info');
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
  setAuthMessage('Password reset link sent. Check your email.', 'success');
}

async function updatePasswordFromRecovery() {
  if (!supabaseClient || !currentUser) return setAuthMessage('Open the reset link from your email first.', 'error');
  const password = document.getElementById('resetPasswordInput')?.value;
  const confirmPassword = document.getElementById('resetConfirmPasswordInput')?.value;
  if (!password || !confirmPassword) return setAuthMessage('Enter and confirm your new password.', 'error');
  if (password.length < 6) return setAuthMessage('Password must be at least 6 characters.', 'error');
  if (password !== confirmPassword) return setAuthMessage('Passwords do not match.', 'error');

  setAuthMessage('Updating password...', 'info');
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
  passwordRecoveryMode = false;
  clearAuthUrlParams();
  currentProfileId = null;
  if (currentUser) await loadCloudState();
  clearAuthFields();
  setAuthMessage('Password updated. You are logged in.', 'success');
  renderAll();
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
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

  const feelButton = event.target.closest('.feel-btn');
  if (feelButton) selectEnergy(feelButton.dataset.feel);

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
  if (event.target.id === 'signupBtn') signUp();
  if (event.target.id === 'loginBtn') login();
  if (event.target.id === 'forgotPasswordBtn') sendPasswordReset();
  if (event.target.id === 'resetPasswordBtn') updatePasswordFromRecovery();
  if (event.target.id === 'logoutBtn') logout();
  if (event.target.matches('[data-toggle-password]')) togglePasswordVisibility(event.target);
  if (event.target.id === 'saveProfileBtn') saveProfileFromOnboarding();
  if (event.target.id === 'exportBtn' || event.target.id === 'backupBtn') exportProgress();

  if (event.target.id === 'resetBtn' && confirm('Reset all progress?')) {
    state = defaultState();
    saveState();
    renderToday();
    renderGoals();
    renderProgress();
  }

  if (event.target.matches('.nav-btn')) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
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

const importInput = document.getElementById('importInput');
if (importInput) {
  importInput.addEventListener('change', event => {
    if (event.target.files[0]) importProgress(event.target.files[0]);
  });
}

function activateWaitingServiceWorker(registration) {
  if (registration && registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then(registration => {
    if (registration.waiting) {
      activateWaitingServiceWorker(registration);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaitingServiceWorker(registration);
        }
      });
    });

    // Ask the browser to check for a new service worker whenever the app opens.
    registration.update();
  }).catch(error => {
    console.warn('Service worker registration failed:', error);
  });
}

registerServiceWorker();

setupStarAnimation();
renderAll();
initCloudSync();
