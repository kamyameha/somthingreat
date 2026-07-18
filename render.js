(function () {
  const ACTIVITY_TIMER_KEY = 'somthingreat-activity-timer';
  let activityTimerInterval = null;
  let editingActivityCounter = false;

  function setButtonLoading(button, isLoading, label) {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
      button.textContent = label || button.dataset.idleText;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }
    button.textContent = button.dataset.idleText || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }

  function setMessage(element, message, type = 'info') {
    if (!element) return;
    element.textContent = message || '';
    element.dataset.type = type;
  }

  function focusFirstInteractive(container) {
    if (!container) return;
    const target = container.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (target && typeof target.focus === 'function') target.focus();
  }

  function trapTabKey(event, container) {
    if (event.key !== 'Tab' || !container) return;
    const focusable = Array.from(container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function readActivityTimer() {
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

  function ensureActivityToggle(actions, complete) {
    let toggle = document.getElementById('toggleActivityTimerBtn');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'toggleActivityTimerBtn';
      toggle.className = 'activity-timer-action';
      toggle.type = 'button';
      toggle.dataset.state = 'paused';
      toggle.setAttribute('aria-label', 'Start timer');
    }
    if (toggle.parentElement !== actions || toggle.nextElementSibling !== complete) actions.insertBefore(toggle, complete);
    return toggle;
  }

  function removeActivityToggle() {
    document.getElementById('toggleActivityTimerBtn')?.remove();
  }

  function updateActivityTimerUI(checklist, timer) {
    const elapsed = Math.min(checklist.target * 60, currentElapsed(timer));
    const count = document.getElementById('activityTimerCount');
    const toggle = document.getElementById('toggleActivityTimerBtn');
    if (count) count.textContent = formatClock(elapsed);
    if (toggle) {
      toggle.dataset.state = timer.running ? 'running' : 'paused';
      toggle.setAttribute('aria-label', timer.running ? 'Pause timer' : elapsed > 0 ? 'Resume timer' : 'Start timer');
    }
    if (elapsed < checklist.target * 60 || !timer.running) return;
    timer.elapsedSeconds = checklist.target * 60;
    timer.running = false;
    timer.startedAt = null;
    if (!timer.completedSoundPlayed) {
      timer.completedSoundPlayed = true;
      window.SomthingreatTimerSound?.playCompletion?.();
    }
    saveActivityTimer(timer);
    stopActivityTimerInterval();
    if (toggle) {
      toggle.dataset.state = 'paused';
      toggle.setAttribute('aria-label', 'Timer completed');
    }
  }

  function renderMinuteCounter(checklist, items, actions, complete) {
    let timer = readActivityTimer();
    if (!timer || timer.target !== checklist.target || timer.name !== checklist.name) {
      timer = { name: checklist.name, target: checklist.target, elapsedSeconds: 0, running: false, startedAt: null, completedSoundPlayed: false };
      saveActivityTimer(timer);
    }
    items.innerHTML = '<div class="activity-timer" aria-live="polite"><p id="activityTimerCount" class="activity-timer-count">0:00</p></div>';
    ensureActivityToggle(actions, complete);
    updateActivityTimerUI(checklist, timer);
    stopActivityTimerInterval();
    activityTimerInterval = window.setInterval(() => {
      const latest = readActivityTimer();
      if (latest) updateActivityTimerUI(checklist, latest);
    }, 500);
  }

  function injectActivityCounterUI() {
    const card = document.getElementById('customChecklistCard');
    if (card) {
      const heading = card.querySelector('h2');
      const copy = card.querySelector('p');
      if (heading) heading.textContent = 'Activity counter';
      if (copy) copy.remove();
    }
    const form = document.getElementById('customChecklistForm');
    const nameInput = document.getElementById('customChecklistNameInput');
    const targetInput = document.getElementById('customChecklistTargetInput');
    const createButton = document.getElementById('createCustomChecklistBtn');
    if (!form || !nameInput) return;
    nameInput.classList.add('hidden');
    if (targetInput) targetInput.placeholder = 'Target';
    if (createButton) createButton.textContent = 'Create counter';
    let select = document.getElementById('activityQuickSelect');
    if (!select) {
      select = document.createElement('select');
      select.id = 'activityQuickSelect';
      select.className = 'activity-select';
      select.setAttribute('aria-label', 'Select an activity');
      select.innerHTML = '<option value="">Select an activity</option><option value="Stairs">Stairs</option><option value="Walking">Walking</option><option value="Mobility">Mobility</option><option value="Cycling">Cycling</option>';
      form.insertBefore(select, nameInput);
      select.addEventListener('change', () => { nameInput.value = select.value; });
    }
  }

  function installActivityCounter() {
    if (typeof state === 'undefined' || typeof renderCustomChecklist !== 'function') return;
    injectActivityCounterUI();

    window.renderCustomChecklist = renderCustomChecklist = function () {
      const checklist = state.customChecklist;
      if (!checklist) return;
      const active = document.getElementById('customChecklistActive');
      const title = document.getElementById('customChecklistTitle');
      const meta = document.getElementById('customChecklistMeta');
      const items = document.getElementById('customChecklistItems');
      const complete = document.getElementById('completeCustomChecklistBtn');
      const actions = complete?.closest('.custom-checklist-actions');
      if (!active || !title || !meta || !items || !complete || !actions) return;
      active.classList.remove('hidden');
      title.textContent = `${checklist.name} - ${checklist.target} ${checklist.type === 'minutes' ? `minute${checklist.target === 1 ? '' : 's'}` : `round${checklist.target === 1 ? '' : 's'}`}`;
      meta.classList.add('hidden');
      meta.textContent = '';
      if (checklist.type === 'minutes') {
        renderMinuteCounter(checklist, items, actions, complete);
      } else {
        stopActivityTimerInterval();
        removeActivityToggle();
        items.innerHTML = checklist.items.map((checked, index) => `<label class="set-row custom-checklist-row ${checked ? 'completed' : ''}"><span>Round ${index + 1}</span><input type="checkbox" data-custom-check-index="${index}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label>`).join('');
      }
      complete.disabled = false;
    };

    window.createCustomChecklist = createCustomChecklist = function () {
      const select = document.getElementById('activityQuickSelect');
      const name = select?.value || document.getElementById('customChecklistNameInput')?.value.trim() || '';
      const type = document.querySelector('input[name="customChecklistType"]:checked')?.value || 'rounds';
      const target = Math.round(Number(document.getElementById('customChecklistTargetInput')?.value || 0));
      const max = type === 'minutes' ? 240 : 120;
      if (!name) return setCustomChecklistMessage('Select an activity first.', 'error');
      if (!target || target < 1) return setCustomChecklistMessage(type === 'minutes' ? 'Enter the timer length in minutes.' : 'Enter how many rounds to count.', 'error');
      if (target > max) return setCustomChecklistMessage(type === 'minutes' ? 'Keep it to 240 minutes or less.' : 'Keep it to 120 rounds or less.', 'error');
      const previous = editingActivityCounter ? state.customChecklist : null;
      state.customChecklist = { name, type, target, items: type === 'rounds' ? Array.from({ length: target }, (_, index) => Boolean(previous?.type === 'rounds' && previous.items?.[index])) : [] };
      if (type === 'minutes') {
        const oldTimer = readActivityTimer();
        saveActivityTimer(previous?.type === 'minutes' && oldTimer ? { ...oldTimer, name, target, completedSoundPlayed: false } : { name, target, elapsedSeconds: 0, running: false, startedAt: null, completedSoundPlayed: false });
      } else saveActivityTimer(null);
      editingActivityCounter = false;
      if (select) select.value = '';
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
      const select = document.getElementById('activityQuickSelect');
      const name = document.getElementById('customChecklistNameInput');
      const target = document.getElementById('customChecklistTargetInput');
      const type = document.querySelector(`input[name="customChecklistType"][value="${checklist.type}"]`);
      if (select) select.value = checklist.name;
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
      removeActivityToggle();
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
          showCompletionScreen({ title: 'Almost there!', message: 'Some rounds are unfinished and won’t be counted. Save this progress or go back to finish more.', actionLabel: 'Save progress', cancelLabel: 'Go back', onConfirm: () => completeCustomChecklist(true) });
          return;
        }
        countedTarget = checklist.items.filter(Boolean).length;
      } else countedTarget = Math.max(1, Math.min(checklist.target, Math.ceil(currentElapsed(readActivityTimer()) / 60)));
      const prescription = customChecklistUnitLabel(checklist.type, countedTarget);
      state.history.push({ type: 'custom', date: new Date().toISOString(), workout: checklist.name, mode: 'custom', customType: checklist.type, target: countedTarget, exercises: [{ name: checklist.name, prescription, trackKey: 'custom', isAddOn: false }] });
      stopActivityTimerInterval();
      saveActivityTimer(null);
      removeActivityToggle();
      state.customChecklist = null;
      saveState();
      renderToday();
      renderProgress();
      renderActivity();
      renderAccount();
      showWorkoutStatus('Activity saved.', 'Your activity counter is saved in your history.');
      updateUpdateBanner();
    };

    document.addEventListener('click', event => {
      const toggle = event.target.closest('#toggleActivityTimerBtn');
      if (!toggle) return;
      const timer = readActivityTimer();
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
      if (state.customChecklist?.type === 'minutes') updateActivityTimerUI(state.customChecklist, timer);
    });
    if (state.customChecklist) renderCustomChecklist();
  }

  window.SomthingreatRender = { setButtonLoading, setMessage, focusFirstInteractive, trapTabKey, installActivityCounter };
  window.addEventListener('load', installActivityCounter, { once: true });
})();

(function () {
  const SOUND_KEY = 'somthingreat-timer-sound';

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

  function normalise(value = '') {
    return String(value).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function reorderAddOnActions(root = document) {
    root.querySelectorAll?.('button').forEach(button => {
      const label = normalise(button.getAttribute('aria-label') || button.title || button.textContent);
      if (!label) return;
      const isHelp = label.includes('how to') || label.includes('instruction') || label === 'help' || label === '?';
      const isTimer = label.includes('timer') || label.includes('start 30') || label.includes('start timer');
      if (isHelp) button.dataset.addonHelp = 'true';
      if (isTimer) button.dataset.addonTimer = 'true';
    });
    root.querySelectorAll?.('[data-addon-help]').forEach(help => {
      const container = help.parentElement;
      if (!container) return;
      const timer = Array.from(container.children).find(child => child.matches?.('[data-addon-timer]'));
      if (timer && timer.previousElementSibling !== help) container.insertBefore(help, timer);
    });
  }

  window.SomthingreatTimerSound = { enabled: soundEnabled, playCompletion: playCompletionSound };

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) reorderAddOnActions(node);
    }));
  });
  reorderAddOnActions();
  observer.observe(document.body, { childList: true, subtree: true });
})();

(function () {
  if (typeof renderGeneratedWorkout !== 'function' || typeof getTracks !== 'function') return;

  function prescriptionType(exercise) {
    const text = `${exercise?.prescription || ''} ${exercise?.basePrescription || ''}`.toLowerCase();
    return /\b(?:s|sec|secs|second|seconds|min|mins|minute|minutes)\b/.test(text) ? 'time' : 'reps';
  }

  function swapCandidates(exercise) {
    if (!exercise || exercise.isAddOn) return [];
    const tracks = getTracks();
    const trackKey = exercise.progressionTrackKey || exercise.trackKey;
    const sourceTrack = tracks[trackKey] || [];
    const recovery = typeof getActiveRecovery === 'function' ? getActiveRecovery() : null;
    const usedIds = new Set((state.generated?.exercises || []).map(item => item?.id).filter(Boolean));
    const allowed = sourceTrack.filter(candidate => {
      if (!candidate || candidate.id === exercise.id || usedIds.has(candidate.id)) return false;
      if (recovery && !workoutModule.isExerciseAllowedForRecovery(candidate, recovery)) return false;
      return true;
    });
    const sameType = allowed.filter(candidate => prescriptionType(candidate) === prescriptionType(exercise));
    const pool = sameType.length ? sameType : allowed;
    return pool.sort((a, b) =>
      Math.abs((a.difficulty || 1) - (exercise.difficulty || 1)) -
      Math.abs((b.difficulty || 1) - (exercise.difficulty || 1))
    );
  }

  function swapExercise(index) {
    const current = state.generated?.exercises?.[index];
    if (!current) return;
    const candidates = swapCandidates(current);
    if (!candidates.length) return;
    const previousIds = Array.isArray(current.previewSwapIds) ? current.previewSwapIds : [];
    const next = candidates.find(candidate => !previousIds.includes(candidate.id)) || candidates[0];
    state.generated.exercises[index] = {
      ...next,
      trackKey: current.trackKey || next.trackKey,
      progressionTrackKey: current.progressionTrackKey || current.trackKey || next.progressionTrackKey || next.trackKey,
      prescription: current.prescription || next.prescription,
      basePrescription: next.prescription,
      setCount: current.setCount || next.setCount || 1,
      previewSwapIds: [...previousIds, current.id].filter(Boolean)
    };
    saveState();
    renderGeneratedWorkout();
  }

  function enhancePreview() {
    const generated = state.generated;
    const preview = document.getElementById('previewList');
    if (!generated || !preview) return;
    preview.innerHTML = '';
    (generated.exercises || []).filter(Boolean).forEach((exercise, index) => {
      const name = exerciseDisplayName(exercise);
      const hasHelp = Boolean(getExerciseHelp(name));
      const canSwap = swapCandidates(exercise).length > 0;
      const row = document.createElement('div');
      row.className = 'preview-row preview-action-row';
      row.innerHTML = `
        <div class="preview-exercise-copy">
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(exercise.prescription)}</span>
        </div>
        <div class="preview-exercise-actions">
          ${canSwap ? `<button class="preview-icon-btn preview-swap-btn" type="button" data-preview-index="${index}" aria-label="Change ${escapeHTML(name)}"></button>` : ''}
          ${hasHelp ? `<button class="preview-icon-btn preview-help-btn exercise-help-btn" type="button" data-exercise-name="${escapeHTML(name)}" aria-label="How to do ${escapeHTML(name)}">?</button>` : ''}
        </div>`;
      preview.appendChild(row);
    });
  }

  const originalRenderGeneratedWorkout = renderGeneratedWorkout;
  window.renderGeneratedWorkout = renderGeneratedWorkout = function () {
    originalRenderGeneratedWorkout.apply(this, arguments);
    enhancePreview();
  };

  document.addEventListener('click', event => {
    const swapButton = event.target.closest('.preview-swap-btn');
    if (!swapButton) return;
    event.preventDefault();
    event.stopPropagation();
    swapExercise(Number(swapButton.dataset.previewIndex));
  }, true);

  if (!document.getElementById('generatedWorkoutCard')?.classList.contains('hidden')) enhancePreview();
})();
