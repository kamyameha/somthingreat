(function () {
  const SOUND_KEY = 'somthingreat-timer-sound';

  function placeAccountFooterLast() {
    const main = document.getElementById('accountMainView');
    const footer = main?.querySelector('.account-menu-footer');
    if (!main || !footer) return;
    if (main.lastElementChild !== footer) main.appendChild(footer);
  }

  function installSoundStates() {
    const view = document.getElementById('accountSettingsView');
    const legacy = document.getElementById('timerSoundSetting');
    if (!view || !legacy || view.querySelector('.sound-state-row')) return;

    const row = document.createElement('div');
    row.className = 'sound-state-row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', 'Timer sound');
    row.innerHTML = `
      <label class="sound-state-option"><input type="radio" name="timerSoundState" value="on"><span>On</span></label>
      <label class="sound-state-option"><input type="radio" name="timerSoundState" value="off"><span>Off</span></label>`;
    legacy.closest('label')?.insertAdjacentElement('afterend', row);

    const sync = () => {
      const enabled = localStorage.getItem(SOUND_KEY) !== 'off';
      const input = row.querySelector(`input[value="${enabled ? 'on' : 'off'}"]`);
      if (input) input.checked = true;
      legacy.checked = enabled;
      const summary = document.getElementById('accountSoundSummary');
      if (summary) summary.textContent = enabled ? 'On' : 'Off';
    };
    row.addEventListener('change', event => {
      if (!event.target.matches('input[name="timerSoundState"]')) return;
      const enabled = event.target.value === 'on';
      localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
      legacy.checked = enabled;
      legacy.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    sync();
  }

  function useRecoveryStyleActivitySelect() {
    const select = document.getElementById('activityQuickSelect');
    if (!select) return;
    document.getElementById('activityDropdown')?.remove();
    select.classList.add('recovery-select', 'activity-select');
    select.hidden = false;
    select.removeAttribute('aria-hidden');
  }

  function install() {
    placeAccountFooterLast();
    installSoundStates();
    useRecoveryStyleActivitySelect();
  }

  install();
  new MutationObserver(install).observe(document.body, { childList: true, subtree: true });
})();