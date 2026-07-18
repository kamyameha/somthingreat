(function () {
  const AUDIT_KEY = 'somthingreat-quality-audit-2026-07-18';
  const SOUND_KEY = 'somthingreat-timer-sound';

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
      ...state.levels[trackKey],
      level: observed,
      points: 0,
      positiveExposures: 0,
      difficultExposures: 0,
      levelExposures: 0,
      plateauCount: 0
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

  function installWorkoutTimerSound() {
    if (typeof tickWorkoutTimer !== 'function' || tickWorkoutTimer.__soundInstalled) return;
    const originalTick = tickWorkoutTimer;
    let wasAboveZero = false;
    window.tickWorkoutTimer = tickWorkoutTimer = function () {
      const before = activeTimer?.phase === 'active' ? Number(activeTimer.remainingSeconds || 0) : null;
      originalTick();
      const after = activeTimer?.phase === 'active' ? Number(activeTimer.remainingSeconds || 0) : null;
      if (before !== null && before > 0 && after === 0 && !wasAboveZero) playCompletionSound();
      wasAboveZero = after > 0;
    };
    tickWorkoutTimer.__soundInstalled = true;
  }

  window.SomthingreatTimerSound = {
    enabled: soundEnabled,
    playCompletion: playCompletionSound
  };

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) reorderAddOnActions(node);
    }));
  });

  reorderAddOnActions();
  observer.observe(document.body, { childList: true, subtree: true });
  installWorkoutTimerSound();
  window.setTimeout(recalibrateLegacyLegsAndCore, 2500);
})();