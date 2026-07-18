(function () {
  const SOUND_KEY = 'somthingreat-timer-sound';
  const ACTIVITY_TIMER_KEY = 'somthingreat-activity-timer';
  let completionAudio = null;
  let audioPrimed = false;
  let workoutTimerAtZero = false;

  function soundEnabled() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  }

  function createCompletionWavUrl() {
    const sampleRate = 44100;
    const duration = 0.48;
    const samples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index += 1) {
      const time = index / sampleRate;
      const frequency = time < 0.22 ? 659.25 : 880;
      const localTime = time < 0.22 ? time : time - 0.22;
      const localDuration = time < 0.22 ? 0.22 : duration - 0.22;
      const envelope = Math.sin(Math.PI * Math.min(1, localTime / localDuration));
      const value = Math.sin(2 * Math.PI * frequency * time) * envelope * 0.35;
      view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, value)) * 0x7fff, true);
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function getCompletionAudio() {
    if (completionAudio) return completionAudio;
    completionAudio = new Audio(createCompletionWavUrl());
    completionAudio.preload = 'auto';
    completionAudio.playsInline = true;
    try {
      if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (_) {}
    return completionAudio;
  }

  async function primeAudio() {
    if (audioPrimed || !soundEnabled()) return;
    const audio = getCompletionAudio();
    const previousVolume = audio.volume;
    try {
      audio.volume = 0;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume || 1;
      audioPrimed = true;
    } catch (_) {
      audio.volume = previousVolume || 1;
    }
  }

  async function playCompletionSound() {
    if (!soundEnabled()) return;
    const audio = getCompletionAudio();
    try {
      audio.volume = 1;
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.warn('Completion sound unavailable:', error);
    }
  }

  function restoreNativeActivitySelect() {
    document.getElementById('activityDropdownFinal')?.remove();
    document.getElementById('activityDropdown')?.remove();
    const select = document.getElementById('activityQuickSelect');
    if (!select) return;
    select.hidden = false;
    select.removeAttribute('aria-hidden');
    select.classList.add('recovery-select', 'activity-select');
  }

  function styleActivityToggle(toggle) {
    toggle.className = 'activity-timer-toggle activity-timer-action';
    toggle.textContent = '';
    const styles = {
      position: 'static',
      display: 'grid',
      placeItems: 'center',
      width: '68px',
      minWidth: '68px',
      maxWidth: '68px',
      height: '46px',
      minHeight: '46px',
      margin: '0',
      padding: '0',
      border: '1px solid #012ded',
      borderRadius: '20px',
      background: '#012ded',
      backgroundColor: '#012ded',
      color: 'transparent',
      opacity: '1',
      visibility: 'visible',
      boxShadow: 'none',
      transform: 'none'
    };
    Object.entries(styles).forEach(([property, value]) => {
      const cssProperty = property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
      toggle.style.setProperty(cssProperty, value, 'important');
    });
  }

  function alignActivityTimerActions() {
    const timer = document.querySelector('#customChecklistItems .activity-timer');
    const complete = document.getElementById('completeCustomChecklistBtn');
    const actions = complete?.closest('.custom-checklist-actions');
    if (!actions) return;

    const toggles = Array.from(document.querySelectorAll('[id="toggleActivityTimerBtn"]'));
    if (!timer) {
      toggles.forEach(toggle => toggle.remove());
      return;
    }

    const toggle = toggles.find(button => button.closest('#customChecklistItems .activity-timer')) || toggles[toggles.length - 1];
    if (!toggle) return;
    toggles.forEach(button => {
      if (button !== toggle) button.remove();
    });

    document.querySelectorAll('#activityTimerTarget').forEach(target => target.remove());
    document.querySelectorAll('.activity-timer-controls').forEach(controls => {
      controls.style.setProperty('display', 'none', 'important');
    });
    styleActivityToggle(toggle);
    if (toggle.parentElement !== actions) actions.insertBefore(toggle, complete);

    const timerState = readActivityTimer();
    toggle.dataset.state = timerState?.running ? 'running' : 'paused';
    toggle.setAttribute('aria-label', timerState?.running ? 'Pause timer' : Number(timerState?.elapsedSeconds || 0) > 0 ? 'Resume timer' : 'Start timer');
  }

  function readActivityTimer() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVITY_TIMER_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function currentElapsed(timer) {
    if (!timer) return 0;
    const base = Math.max(0, Number(timer.elapsedSeconds || 0));
    if (!timer.running || !timer.startedAt) return base;
    return base + Math.max(0, Math.floor((Date.now() - Number(timer.startedAt)) / 1000));
  }

  function monitorActivityTimer() {
    const timer = readActivityTimer();
    if (!timer || timer.finalAudioPlayed) return;
    if (currentElapsed(timer) < Number(timer.target || 0) * 60) return;
    timer.finalAudioPlayed = true;
    timer.completedSoundPlayed = true;
    timer.elapsedSeconds = Number(timer.target || 0) * 60;
    timer.running = false;
    timer.startedAt = null;
    localStorage.setItem(ACTIVITY_TIMER_KEY, JSON.stringify(timer));
    playCompletionSound();
  }

  function monitorWorkoutTimer() {
    const panel = document.getElementById('timerPanel');
    const count = document.getElementById('timerCount');
    const visible = panel && !panel.classList.contains('hidden');
    const isZero = visible && count?.textContent?.trim() === '0';
    if (isZero && !workoutTimerAtZero) playCompletionSound();
    workoutTimerAtZero = isZero;
  }

  document.addEventListener('click', event => {
    const activityToggle = event.target.closest('#toggleActivityTimerBtn');
    if (activityToggle) {
      // quality-audit.js updates the timer first and re-renders its markup.
      // Normalise the new markup immediately in the same click, before paint.
      queueMicrotask(alignActivityTimerActions);
      return;
    }
    if (event.target.closest('[data-timer-seconds], .set-control.is-timer')) primeAudio();
  }, true);

  function install() {
    restoreNativeActivitySelect();
    alignActivityTimerActions();
  }

  install();
  new MutationObserver(() => {
    install();
    monitorWorkoutTimer();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(() => {
    alignActivityTimerActions();
    monitorActivityTimer();
    monitorWorkoutTimer();
  }, 250);
})();