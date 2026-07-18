(function () {
  const AUDIT_KEY = 'somthingreat-quality-audit-2026-07-18';
  const SOUND_KEY = 'somthingreat-timer-sound';
  const ACTIVITY_TIMER_KEY = 'somthingreat-activity-timer';
  let editingActivityCounter = false;
  let activityTimerInterval = null;

  function normalise(value = '') {
    return String(value).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function soundEnabled() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  }

  function playCompletionSound() {
    if (!soundEnabled()) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const now = context.currentTime;
      [659.25, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.16);
        oscillator.stop(now + index * 0.16 + 0.26);
      });
      window.setTimeout(() => context.close().catch(() => {}), 800);
    } catch (error) {
      console.warn('Timer sound unavailable:', error);
    }
  }

  function reorderAddOnActions(root = document) {
    root.querySelectorAll('button').forEach(button => {
      const label = normalise(button.getAttribute('aria-label') || button.title || button.textContent);
      if (!label) return;
      const isHelp = label.includes('how to') || label.includes('instruction') || label === 'help' || label === '?';
      const isTimer = label.includes('timer') || label.includes('start 30') || label.includes('start timer');
      if (isHelp) button.dataset.addonHelp = 'true';
      if (isTimer) button.dataset.addonTimer = 'true';
    });

    root.querySelectorAll('[data-addon-help]').forEach(help => {
      const container = help.parentElement;
      if (!container) return;
      const timer = Array.from(container.children).find(child => child.matches?.('[data-addon-timer]'));
      if (timer && timer.previousElementSibling !== help) container.insertBefore(help, timer);
    });
  }

  function observedLevelForTrack(trackKey, track, history) {
    if (!Array.isArray(track) || !track.length) return null;
    const names = new Set();
    (history || []).forEach(entry => {
      (entry.exercises || []).forEach(exercise => {
        if (exercise.isAddOn) return;
        if (exercise.trackKey === trackKey || (trackKey === 'squat' && exercise.trackKey === 'legs') || (trackKey === 'antiExtension' && exercise.trackKey === 'core')) {
          names.add(normalise(exercise.name));
        }
      });
    });
    let observed = null;
    track.forEach((exercise, index) => {
      if (names.has(normalise(exercise.name))) observed = Math.max(observed ?? 0, index);
    });
    return observed;
  }

  function resetTrackToEvidence(trackKey, observed) {
    if (!state?.levels?.[trackKey] || observed === null) return false;
    const current = Number(state.levels[trackKey].level || 0);
    if (current <= observed) return false;
    state.levels[trackKey] = {
      ...state.levels[trackKey], level: observed, points: 0, positiveExposures: 0,
      difficultExposures: 0, levelExposures: 0, plateauCount: 0
    };
    return true;
  }

  function recalibrateLegacyLegsAndCore() {
    try {
      if (localStorage.getItem(AUDIT_KEY) === 'done') return;
      if (typeof state === 'undefined' || !state?.levels || !window.SomthingreatWorkouts) return;
      const tracks = window.SomthingreatWorkouts.getTracks(state.profile, state);
      const squatLevel = observedLevelForTrack('squat', tracks.squat || [], state.history || []);
      const coreLevel = observedLevelForTrack('antiExtension', tracks.antiExtension || [], state.history || []);
      let changed = false;
      changed = resetTrackToEvidence('squat', squatLevel) || changed;
      changed = resetTrackToEvidence('antiExtension', coreLevel) || changed;
      if (state.levels.legs && squatLevel !== null && Number(state.levels.legs.level || 0) > squatLevel) {
        state.levels.legs = { ...state.levels.legs, level: squatLevel, points: 0, positiveExposures: 0, difficultExposures: 0, levelExposures: 0, plateauCount: 0 };
        changed = true;
      }
      if (state.levels.core && coreLevel !== null && Number(state.levels.core.level || 0) > coreLevel) {
        state.levels.core = { ...state.levels.core, level: coreLevel, points: 0, positiveExposures: 0, difficultExposures: 0, levelExposures: 0, plateauCount: 0 };
        changed = true;
      }
      if (changed && typeof saveState === 'function') {
        saveState();
        if (typeof renderAll === 'function') renderAll();
      }
      localStorage.setItem(AUDIT_KEY, 'done');
    } catch (error) {
      console.warn('Progress recalibration skipped:', error);
    }
  }

  function injectActivityCounterCopy() {
    const card = document.getElementById('customChecklistCard');
    if (card) {
      const heading = card.querySelector('h2');
      const copy = card.querySelector('p');
      if (heading) heading.textContent = 'Activity counter';
      if (copy) copy.textContent = 'Keep count of rounds, or run a timer for a timed activity.';
    }
    const form = document.getElementById('customChecklistForm');
    const nameInput = document.getElementById('customChecklistNameInput');
    const targetInput = document.getElementById('customChecklistTargetInput');
    const createButton = document.getElementById('createCustomChecklistBtn');
    if (nameInput) nameInput.placeholder = 'What are you doing?';
    if (targetInput) targetInput.placeholder = 'Target';
    if (createButton) createButton.textContent = 'Create counter';
    if (form && nameInput && !document.getElementById('activityQuickChoices')) {
      const choices = document.createElement('div');
      choices.id = 'activityQuickChoices';
      choices.className = 'activity-quick-choices recovery-mode-row';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', 'Quick activity selection');
      choices.innerHTML = ['Stairs', 'Walking', 'Mobility', 'Cycling'].map(label =>
        `<label class="option-row activity-quick-option"><input type="radio" name="activityQuickChoice" value="${label}"><span>${label}</span></label>`
      ).join('');
      form.insertBefore(choices, nameInput);
      choices.addEventListener('change', event => {
        if (!event.target.matches('input[name="activityQuickChoice"]')) return;
        nameInput.value = event.target.value;
        nameInput.focus({ preventScroll: true });
        nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      });
      nameInput.addEventListener('input', () => {
        const selected = choices.querySelector('input:checked');
        if (selected && selected.value !== nameInput.value.trim()) selected.checked = false;
      });
    }
  }

  function activityTimerState() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVITY_TIMER_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function saveActivityTimer(timer) {
    if (!timer) localStorage.removeItem(ACTIVITY_TIMER_KEY);
    else localStorage.setItem(ACTIVITY_TIMER_KEY, JSON.stringify(timer));
  }

  function currentElapsed(timer) {
    if (!timer) return 0;
    const base = Math.max(0, Number(timer.elapsedSeconds || 0));
    if (!timer.running || !timer.startedAt) return base;
    return base + Math.max(0, Math.floor((Date.now() - Number(timer.startedAt)) / 1000));
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function stopActivityTimerInterval() {
    if (activityTimerInterval) window.clearInterval(activityTimerInterval);
    activityTimerInterval = null;
  }

  function renderMinuteCounter(checklist, items) {
    let timer = activityTimerState();
    if (!timer || timer.target !== checklist.target || timer.name !== checklist.name) {
      timer = { name: checklist.name, target: checklist.target, elapsedSeconds: 0, running: false, startedAt: null, completedSoundPlayed: false };
      saveActivityTimer(timer);
    }
    items.innerHTML = `
      <div class="activity-timer" aria-live="polite">
        <p id="activityTimerCount" class="activity-timer-count">0:00 / ${formatClock(checklist.target * 60)}</p>
        <button id="toggleActivityTimerBtn" class="primary-btn" type="button">Start</button>
      </div>`;

    const update = () => {
      const latest = activityTimerState() || timer;
      const elapsed = Math.min(checklist.target * 60, currentElapsed(latest));
      const count = document.getElementById('activityTimerCount');
      const toggle = document.getElementById('toggleActivityTimerBtn');
      if (count) count.textContent = `${formatClock(elapsed)} / ${formatClock(checklist.target * 60)}`;
      if (toggle) toggle.textContent = latest.running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start';
      if (elapsed >= checklist.target * 60 && latest.running) {
        latest.elapsedSeconds = checklist.target * 60;
        latest.running = false;
        latest.startedAt = null;
        if (!latest.completedSoundPlayed) {
          latest.completedSoundPlayed = true;
          playCompletionSound();
        }
        saveActivityTimer(latest);
        stopActivityTimerInterval();
      }
    };
    update();
    stopActivityTimerInterval();
    activityTimerInterval = window.setInterval(update, 500);
  }

  const originalRenderCustomChecklist = window.renderCustomChecklist;
  window.renderCustomChecklist = renderCustomChecklist = function () {
    const checklist = state.customChecklist;
    if (!checklist) return;
    const active = document.getElementById('customChecklistActive');
    const title = document.getElementById('customChecklistTitle');
    const meta = document.getElementById('customChecklistMeta');
    const items = document.getElementById('customChecklistItems');
    const complete = document.getElementById('completeCustomChecklistBtn');
    if (!active || !title || !meta || !items || !complete) return;
    active.classList.remove('hidden');
    title.textContent = checklist.name;
    meta.classList.remove('hidden');
    meta.textContent = checklist.type === 'minutes'
      ? `${checklist.target} minute timer`
      : `${checklist.items.filter(Boolean).length} of ${checklist.target} rounds completed`;
    if (checklist.type === 'minutes') {
      renderMinuteCounter(checklist, items);
    } else {
      stopActivityTimerInterval();
      items.innerHTML = checklist.items.map((checked, index) => `
        <label class="set-row custom-checklist-row ${checked ? 'completed' : ''}">
          <span>Round ${index + 1}</span>
          <input type="checkbox" data-custom-check-index="${index}" ${checked ? 'checked' : ''}>
          <i aria-hidden="true"></i>
        </label>`).join('');
    }
    complete.disabled = false;
  };

  window.createCustomChecklist = createCustomChecklist = function () {
    const name = document.getElementById('customChecklistNameInput')?.value.trim() || 'Activity';
    const type = document.querySelector('input[name="customChecklistType"]:checked')?.value || 'rounds';
    const target = Math.round(Number(document.getElementById('customChecklistTargetInput')?.value || 0));
    const max = type === 'minutes' ? 240 : 120;
    if (!target || target < 1) {
      setCustomChecklistMessage(type === 'minutes' ? 'Enter the timer length in minutes.' : 'Enter how many rounds to count.', 'error');
      return;
    }
    if (target > max) {
      setCustomChecklistMessage(type === 'minutes' ? 'Keep it to 240 minutes or less.' : 'Keep it to 120 rounds or less.', 'error');
      return;
    }
    const previous = editingActivityCounter ? state.customChecklist : null;
    state.customChecklist = {
      name: name.slice(0, 40), type, target,
      items: type === 'rounds' ? Array.from({ length: target }, (_, index) => Boolean(previous?.type === 'rounds' && previous.items?.[index])) : []
    };
    if (type === 'minutes') {
      const oldTimer = activityTimerState();
      saveActivityTimer(previous?.type === 'minutes' && oldTimer
        ? { ...oldTimer, name: name.slice(0, 40), target, completedSoundPlayed: false }
        : { name: name.slice(0, 40), target, elapsedSeconds: 0, running: false, startedAt: null, completedSoundPlayed: false });
    } else {
      saveActivityTimer(null);
    }
    editingActivityCounter = false;
    const button = document.getElementById('createCustomChecklistBtn');
    if (button) button.textContent = 'Create counter';
    resetCustomChecklistForm();
    saveState();
    renderToday();
  };

  window.openCustomChecklistEdit = openCustomChecklistEdit = function () {
    const checklist = state.customChecklist;
    if (!checklist) return;
    editingActivityCounter = true;
    document.getElementById('customChecklistActive')?.classList.add('hidden');
    document.getElementById('energyCard')?.classList.remove('hidden');
    document.getElementById('customChecklistCard')?.classList.remove('hidden');
    document.getElementById('customChecklistForm')?.classList.remove('hidden');
    const name = document.getElementById('customChecklistNameInput');
    const target = document.getElementById('customChecklistTargetInput');
    const type = document.querySelector(`input[name="customChecklistType"][value="${checklist.type}"]`);
    if (name) name.value = checklist.name;
    if (target) target.value = checklist.target;
    if (type) type.checked = true;
    const button = document.getElementById('createCustomChecklistBtn');
    if (button) button.textContent = 'Update counter';
    setCustomChecklistMessage('');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  window.cancelCustomChecklist = cancelCustomChecklist = function () {
    stopActivityTimerInterval();
    saveActivityTimer(null);
    editingActivityCounter = false;
    state.customChecklist = null;
    saveState();
    renderToday();
  };

  window.completeCustomChecklist = completeCustomChecklist = function (skipIncompleteConfirm = false) {
    const checklist = state.customChecklist;
    if (!checklist) return;
    let countedTarget = checklist.target;
    if (checklist.type === 'rounds') {
      if (!skipIncompleteConfirm && !checklist.items.every(Boolean)) {
        showCompletionScreen({
          title: 'Almost there!',
          message: 'Some rounds are unfinished and won’t be counted. Save this progress or go back to finish more.',
          actionLabel: 'Save progress', cancelLabel: 'Go back',
          onConfirm: () => completeCustomChecklist(true)
        });
        return;
      }
      countedTarget = checklist.items.filter(Boolean).length;
    } else {
      const timer = activityTimerState();
      countedTarget = Math.max(1, Math.min(checklist.target, Math.ceil(currentElapsed(timer) / 60)));
    }
    const prescription = customChecklistUnitLabel(checklist.type, countedTarget);
    state.history.push({
      type: 'custom', date: new Date().toISOString(), workout: checklist.name, mode: 'custom',
      customType: checklist.type, target: countedTarget,
      exercises: [{ name: checklist.name, prescription, trackKey: 'custom', isAddOn: false }]
    });
    stopActivityTimerInterval();
    saveActivityTimer(null);
    state.customChecklist = null;
    saveState();
    renderToday(); renderProgress(); renderActivity(); renderAccount();
    showWorkoutStatus('Activity saved.', 'Your activity counter is saved in your history.');
    updateUpdateBanner();
  };

  document.addEventListener('click', event => {
    if (event.target.id === 'toggleActivityTimerBtn') {
      const timer = activityTimerState();
      if (!timer) return;
      if (timer.running) {
        timer.elapsedSeconds = currentElapsed(timer);
        timer.running = false;
        timer.startedAt = null;
      } else if (timer.elapsedSeconds < timer.target * 60) {
        timer.running = true;
        timer.startedAt = Date.now();
      }
      saveActivityTimer(timer);
      renderCustomChecklist();
    }
  }, true);

  function installTimerSound() {
    if (typeof tickWorkoutTimer !== 'function') return;
    window.tickWorkoutTimer = tickWorkoutTimer = function () {
      if (!activeTimer) return;
      if (activeTimer.phase === 'prep') {
        activeTimer.prepSeconds -= 1;
        if (activeTimer.prepSeconds <= 0) activeTimer.phase = 'active';
        renderWorkoutTimer();
        return;
      }
      activeTimer.remainingSeconds -= 1;
      if (activeTimer.remainingSeconds <= 0) {
        activeTimer.remainingSeconds = 0;
        playCompletionSound();
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
    };
  }

  function injectSettings() {
    try { ACCOUNT_SUBMENU_VIEWS.add('settings'); } catch (_) {}
    const security = document.getElementById('passwordAccountSection');
    if (security && !document.getElementById('settingsAccountSection')) {
      const section = document.createElement('div');
      section.id = 'settingsAccountSection';
      section.className = 'account-section';
      section.innerHTML = '<h3>Settings</h3><button class="account-list-btn" type="button" data-account-view="settings">Sound <span id="accountSoundSummary">On</span></button>';
      security.parentElement.insertBefore(section, security);
    }
    const passwordView = document.getElementById('accountPasswordView');
    if (passwordView && !document.getElementById('accountSettingsView')) {
      const view = document.createElement('div');
      view.id = 'accountSettingsView';
      view.className = 'account-view hidden';
      view.innerHTML = `
        <button class="text-btn" type="button" data-account-view="main" aria-label="Back to account">← Back</button>
        <h2 class="account-view-title account-heading-focus-target" tabindex="-1">Sound</h2>
        <p class="muted">Play a sound when an exercise, rest or activity timer finishes.</p>
        <label class="option-row settings-sound-option"><input id="timerSoundSetting" type="checkbox"><span>Timer sound</span></label>`;
      passwordView.parentElement.insertBefore(view, passwordView);
      const input = view.querySelector('#timerSoundSetting');
      input.checked = soundEnabled();
      input.addEventListener('change', () => {
        localStorage.setItem(SOUND_KEY, input.checked ? 'on' : 'off');
        const summary = document.getElementById('accountSoundSummary');
        if (summary) summary.textContent = input.checked ? 'On' : 'Off';
      });
    }
    const summary = document.getElementById('accountSoundSummary');
    if (summary) summary.textContent = soundEnabled() ? 'On' : 'Off';
  }

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) reorderAddOnActions(node);
    }));
  });

  injectActivityCounterCopy();
  injectSettings();
  installTimerSound();
  reorderAddOnActions();
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(recalibrateLegacyLegsAndCore, 2500);
})();