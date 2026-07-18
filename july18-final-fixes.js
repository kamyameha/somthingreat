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

  function installActivityDropdown() {
    const select = document.getElementById('activityQuickSelect');
    if (!select || document.getElementById('activityDropdown')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'activityDropdown';
    wrapper.className = 'activity-dropdown';
    wrapper.innerHTML = `
      <button id="activityDropdownButton" class="activity-dropdown-button" type="button" aria-haspopup="listbox" aria-expanded="false">Select an activity</button>
      <div id="activityDropdownMenu" class="activity-dropdown-menu hidden" role="listbox">
        ${Array.from(select.options).filter(option => option.value).map(option => `<button class="activity-dropdown-option" type="button" role="option" data-value="${option.value}">${option.textContent}</button>`).join('')}
      </div>`;
    select.insertAdjacentElement('beforebegin', wrapper);

    const button = wrapper.querySelector('#activityDropdownButton');
    const menu = wrapper.querySelector('#activityDropdownMenu');
    const setOpen = open => {
      menu.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(menu.classList.contains('hidden'));
    });
    menu.addEventListener('click', event => {
      const option = event.target.closest('.activity-dropdown-option');
      if (!option) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      button.textContent = option.textContent;
      setOpen(false);
    });
    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });

    const originalReset = window.resetCustomChecklistForm;
    if (typeof originalReset === 'function') {
      window.resetCustomChecklistForm = resetCustomChecklistForm = function () {
        originalReset();
        select.value = '';
        button.textContent = 'Select an activity';
        setOpen(false);
      };
    }

    document.addEventListener('click', event => {
      if (event.target.id !== 'editCustomChecklistBtn') return;
      window.setTimeout(() => {
        const value = document.getElementById('customChecklistNameInput')?.value || '';
        select.value = value;
        button.textContent = value || 'Select an activity';
      }, 0);
    }, true);
  }

  function install() {
    placeAccountFooterLast();
    installSoundStates();
    installActivityDropdown();
  }

  install();
  new MutationObserver(install).observe(document.body, { childList: true, subtree: true });
})();