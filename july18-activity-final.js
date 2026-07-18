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
    view.setUint32(28, sampleRate * 2, true);
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

  function installActivityDropdown() {
    const select = document.getElementById('activityQuickSelect');
    if (!select || document.getElementById('activityDropdownFinal')) return;

    document.getElementById('activityDropdown')?.remove();
    const wrapper = document.createElement('div');
    wrapper.id = 'activityDropdownFinal';
    wrapper.className = 'activity-dropdown-final';
    wrapper.innerHTML = `
      <button class="activity-dropdown-final__trigger" type="button" aria-haspopup="listbox" aria-expanded="false">Select an activity</button>
      <div class="activity-dropdown-final__menu hidden" role="listbox">
        ${Array.from(select.options).filter(option => option.value).map(option => `<button class="activity-dropdown-final__option" type="button" role="option" data-value="${option.value}">${option.textContent}</button>`).join('')}
      </div>`;
    select.insertAdjacentElement('beforebegin', wrapper);

    const trigger = wrapper.querySelector('.activity-dropdown-final__trigger');
    const menu = wrapper.querySelector('.activity-dropdown-final__menu');
    const setOpen = open => {
      menu.classList.toggle('hidden', !open);
      trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(menu.classList.contains('hidden'));
    });
    menu.addEventListener('click', event => {
      const option = event.target.closest('.activity-dropdown-final__option');
      if (!option) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      trigger.textContent = option.textContent;
      setOpen(false);
    });
    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });

    document.addEventListener('click', event => {
      if (event.target.id !== 'editCustomChecklistBtn') return;
      window.setTimeout(() => {
        trigger.textContent = select.value || 'Select an activity';
      }, 0);
    }, true);
  }

  function alignActivityTimerActions() {
    const toggle = document.getElementById('toggleActivityTimerBtn');
    const complete = document.getElementById('completeCustomChecklistBtn');
    const actions = complete?.closest('.custom-checklist-actions');
    if (!toggle || !actions || toggle.parentElement === actions) return;
    document.getElementById('activityTimerTarget')?.remove();
    toggle.classList.add('activity-timer-action');
    actions.insertBefore(toggle, complete);
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
    if (event.target.closest('#toggleActivityTimerBtn, [data-timer-seconds], .set-control.is-timer')) primeAudio();
  }, true);

  function install() {
    installActivityDropdown();
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
