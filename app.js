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
  bands: 'Resistance bands'
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
  return tracks;
}

function getRotation() {
  const goal = getProfile()?.goal || 'pullup';
  const skillTrack = goal === 'handstand' ? 'handstand' : goal === 'lsit' ? 'lsit' : goal === 'muscleup' ? 'muscleup' : goal === 'general' ? 'crow' : 'pullup';
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
  great: { label: '😊 Great', mode: 'normal', title: 'Great', description: 'Standard workout · estimated duration 20 min.' },
  normal: { label: '🙂 Normal', mode: 'normal', title: 'Normal', description: 'Standard workout · estimated duration 20 min.' },
  tired: { label: '😴 Tired', mode: 'reduced', title: 'Tired', description: 'Reduced volume · estimated duration 15 min.' },
  exhausted: { label: '🤒 Exhausted', mode: 'minimum', title: 'Exhausted', description: 'Minimum workout suggested · estimated duration 10 min.' }
};

function defaultState() {
  const levels = {};
  Object.keys(baseTracks).forEach(key => levels[key] = { level: 0, points: 0 });
  return { rotationIndex: 0, levels, history: [], current: null, selectedEnergy: null, generated: null, profile: null };
}

let state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(OLDER_LEGACY_STORAGE_KEY);
  if (!saved) return defaultState();
  try {
    const parsed = JSON.parse(saved);
    const merged = { ...defaultState(), ...parsed };
    merged.levels = { ...defaultState().levels, ...(parsed.levels || {}) };
    return merged;
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
    profile: state.profile
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

function setAuthMode(mode = 'welcome') {
  const welcome = document.getElementById('authWelcome');
  const login = document.getElementById('authLoginForm');
  const reset = document.getElementById('authResetForm');
  if (!welcome || !login || !reset) return;
  welcome.classList.toggle('hidden', mode !== 'welcome');
  login.classList.toggle('hidden', mode !== 'login');
  reset.classList.toggle('hidden', mode !== 'reset');
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
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  button.textContent = isHidden ? 'Hide' : 'Show';
  button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}


function getExercise(trackKey) {
  const trackState = state.levels[trackKey];
  const track = getTracks()[trackKey] || baseTracks[trackKey];
  return { trackKey, ...track[Math.min(trackState.level, track.length - 1)], level: trackState.level + 1 };
}

function getTodayWorkout(mode = 'normal') {
  const rotation = getRotation();
  const workout = rotation[state.rotationIndex % rotation.length];
  const count = mode === 'minimum' ? 2 : workout.tracks.length;
  return {
    mode,
    workoutName: workout.name,
    exercises: workout.tracks.slice(0, count).map(getExercise)
  };
}

function modeLabel(mode) {
  if (mode === 'minimum') return '10 min · Minimum Mode';
  if (mode === 'reduced') return '15 min · Reduced Mode';
  return '20 min · Standard Mode';
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
  saveState();
  renderSelectedEnergy();
}

function renderSelectedEnergy() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  document.getElementById('energyCard').classList.add('hidden');
  document.getElementById('selectedEnergyCard').classList.remove('hidden');
  document.getElementById('generatedWorkoutCard').classList.add('hidden');
  document.getElementById('exercisePreview').classList.add('hidden');
  document.getElementById('selectedEnergyTitle').textContent = option.label;
  document.getElementById('selectedEnergyDescription').textContent = option.description;
}

function generateWorkout() {
  const option = energyOptions[state.selectedEnergy || 'normal'];
  state.generated = getTodayWorkout(option.mode);
  saveState();
  renderGeneratedWorkout();
}

function renderGeneratedWorkout() {
  const generated = state.generated || getTodayWorkout('normal');
  document.getElementById('generatedWorkoutCard').classList.remove('hidden');
  document.getElementById('exercisePreview').classList.remove('hidden');
  document.getElementById('workoutName').textContent = generated.workoutName;
  document.getElementById('workoutMeta').textContent = modeLabel(generated.mode);

  const preview = document.getElementById('previewList');
  preview.innerHTML = '';
  generated.exercises.forEach(exercise => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `<strong>${exercise.name}</strong><span>${exercise.prescription}</span>`;
    preview.appendChild(row);
  });
}

function startWorkout() {
  if (!state.generated) generateWorkout();
  state.current = { ...state.generated, ratings: {}, sets: {} };
  state.current.exercises.forEach(exercise => {
    state.current.sets[exercise.trackKey] = [false, false, false];
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
  titleCard.innerHTML = `<p class="muted-light">Today's workout</p><h2>${state.current.workoutName}</h2><p>${modeLabel(state.current.mode)}</p>`;
  list.appendChild(titleCard);

  state.current.exercises.forEach((exercise) => {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    const selectedRating = state.current.ratings[exercise.trackKey];
    if (!state.current.sets) state.current.sets = {};
    if (!state.current.sets[exercise.trackKey]) state.current.sets[exercise.trackKey] = [false, false, false];
    const completedSets = state.current.sets[exercise.trackKey];
    card.innerHTML = `
      <h3>${exercise.name}<span>L${exercise.level}</span></h3>
      <p class="prescription">${exercise.prescription}</p>
      <div class="set-row"><span>Set 1</span><input type="checkbox" data-track="${exercise.trackKey}" data-set-index="0" ${completedSets[0] ? 'checked' : ''}></div>
      <div class="set-row"><span>Set 2</span><input type="checkbox" data-track="${exercise.trackKey}" data-set-index="1" ${completedSets[1] ? 'checked' : ''}></div>
      <div class="set-row"><span>Set 3</span><input type="checkbox" data-track="${exercise.trackKey}" data-set-index="2" ${completedSets[2] ? 'checked' : ''}></div>
      <p class="rating-label">How was it?</p>
      <div class="rating-row" data-track="${exercise.trackKey}">
        <button data-rating="easy" class="${selectedRating === 'easy' ? 'selected' : ''}">Easy</button>
        <button data-rating="good" class="${selectedRating === 'good' ? 'selected' : ''}">Good</button>
        <button data-rating="hard" class="${selectedRating === 'hard' ? 'selected' : ''}">Hard</button>
        <button data-rating="failed" class="${selectedRating === 'failed' ? 'selected' : ''}">Failed</button>
      </div>
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
  const ratedCount = Object.keys(state.current.ratings).length;
  if (ratedCount < state.current.exercises.length) {
    const ok = confirm('Some exercises are not rated yet. Complete workout anyway?');
    if (!ok) return;
  }

  Object.entries(state.current.ratings).forEach(([trackKey, rating]) => applyRating(trackKey, rating));
  state.history.push({ date: new Date().toISOString(), workout: state.current.workoutName, mode: state.current.mode });
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
    <div class="journey-summary current-stage"><p class="eyebrow">Current stage</p><strong>${current.name}</strong><span>${current.prescription}</span></div>
    <div class="journey-summary"><p class="eyebrow">Next milestone</p><strong>${level >= track.length - 1 ? 'Goal unlocked' : next.name}</strong><span>${level >= track.length - 1 ? 'Keep training and consolidate.' : next.prescription}</span></div>
    <div class="journey-summary"><p class="eyebrow">Completed</p><strong>${level === 0 ? 'Starting now' : `${level} milestone${level > 1 ? 's' : ''} completed`}</strong><span>${level === 0 ? 'Your first milestone is in progress.' : track.slice(0, level).map(s => s.name).join(' · ')}</span></div>
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

  if (!SUPABASE_READY) {
    panel.classList.remove('hidden');
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
    panel.classList.add('hidden');
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
  } else {
    panel.classList.remove('hidden');
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    screens.forEach(screen => screen.classList.add('auth-locked'));
    if (bottomNav) bottomNav.classList.add('hidden');
    if (accountBtn) accountBtn.classList.add('hidden');
  }
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

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    currentProfileId = null;
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryMode = true;
    if (event === 'SIGNED_IN' && !passwordRecoveryMode) passwordRecoveryMode = false;
    if (event === 'SIGNED_OUT') passwordRecoveryMode = false;
    if (currentUser && !passwordRecoveryMode) await loadCloudState();
    renderAll();
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
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return setAuthMessage(friendlyAuthError(error.message), 'error');
  passwordRecoveryMode = false;
  currentUser = data?.session?.user || currentUser;
  currentProfileId = null;
  if (currentUser) await loadCloudState();
  setAuthMessage('Logged in. Loading your progress...', 'success');
  renderAll();
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
  setAuthMode('welcome');
  renderAll();
}


document.addEventListener('click', event => {
  if (event.target.id === 'welcomeNextBtn') {
    welcomeDismissed = true;
    updateWelcomeGate();
    return;
  }

  if (event.target.matches('.feel-btn')) selectEnergy(event.target.dataset.feel);

  if (event.target.id === 'changeEnergyBtn') {
    state.selectedEnergy = null;
    state.generated = null;
    saveState();
    renderToday();
  }

  if (event.target.id === 'generateWorkoutBtn') generateWorkout();
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

  if (event.target.id === 'accountBtn' && currentUser) document.getElementById('accountPanel').classList.toggle('hidden');
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
    document.getElementById('screenTitle').textContent = event.target.textContent;
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
});

const importInput = document.getElementById('importInput');
if (importInput) {
  importInput.addEventListener('change', event => {
    if (event.target.files[0]) importProgress(event.target.files[0]);
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js');
}

setupStarAnimation();
renderAll();
initCloudSync();
