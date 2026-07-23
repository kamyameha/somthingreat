(function () {
  const SOUND_KEY = 'somthingreat-timer-sound';
  const workoutModule = window.SomthingreatWorkouts;

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function workoutItemsForMonth(history = [], date = new Date()) {
    const month = date.getMonth();
    const year = date.getFullYear();
    return history
      .map(item => ({ ...item, parsedDate: new Date(item.date) }))
      .filter(item => item.parsedDate.getMonth() === month && item.parsedDate.getFullYear() === year);
  }

  function workoutCountForMonth(history = [], date = new Date()) {
    return workoutItemsForMonth(history, date).length;
  }

  function groupItemsByDay(items = []) {
    const byDay = new Map();
    items.forEach(item => {
      const day = item.parsedDate.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    });
    return byDay;
  }

  function renderHistoryCalendar(calendar, monthDate, monthItems) {
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();
    const byDay = groupItemsByDay(monthItems);
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const mondayOffset = (firstDay.getDay() + 6) % 7;

    calendar.innerHTML = '';
    for (let i = 0; i < mondayOffset; i += 1) {
      const empty = document.createElement('div');
      empty.className = 'history-day history-empty';
      calendar.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cell = document.createElement('div');
      const workouts = byDay.get(day) || [];
      cell.className = `history-day${workouts.length ? ' has-workout' : ''}`;
      cell.innerHTML = `<span>${day}</span>`;
      calendar.appendChild(cell);
    }
  }

  function renderHistoryList(list, monthItems, energyOptions) {
    list.innerHTML = monthItems.length
      ? monthItems.map(item => {
        const label = item.type === 'custom'
          ? `${item.workout || 'Custom checklist'} · Custom checklist`
          : `${workoutModule.workoutDisplayName(item.workout || 'Workout')} · ${energyOptions[item.mode]?.title || item.mode || 'Done'}`;
        return `<div class="history-item"><strong>${escapeHTML(item.parsedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</strong><span>${escapeHTML(label)}</span></div>`;
      }).join('')
      : '<p class="muted">No workouts completed this month yet.</p>';
  }

  function soundEnabled() {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  }

  function placeAccountFooterLast() {
    const main = document.getElementById('accountMainView');
    const footer = main?.querySelector('.account-menu-footer');
    if (main && footer && main.lastElementChild !== footer) main.appendChild(footer);
  }

  function syncSoundState(row, legacy) {
    const enabled = soundEnabled();
    const input = row?.querySelector(`input[value="${enabled ? 'on' : 'off'}"]`);
    if (input) input.checked = true;
    if (legacy) legacy.checked = enabled;
    const summary = document.getElementById('accountSoundSummary');
    if (summary) summary.textContent = enabled ? 'On' : 'Off';
  }

  function installSoundSettings() {
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
      view.innerHTML = '<button class="text-btn" type="button" data-account-view="main" aria-label="Back to account">← Back</button><h2 class="account-view-title account-heading-focus-target" tabindex="-1">Sound</h2><p class="muted">Play a sound when a timer ends. On iPhone, silent mode must be off.</p><label class="option-row settings-sound-option"><input id="timerSoundSetting" type="checkbox"><span>Timer sound</span></label><div class="sound-state-row" role="radiogroup" aria-label="Timer sound"><label class="sound-state-option"><input type="radio" name="timerSoundState" value="on"><span>On</span></label><label class="sound-state-option"><input type="radio" name="timerSoundState" value="off"><span>Off</span></label></div>';
      passwordView.parentElement.insertBefore(view, passwordView);
    }

    const view = document.getElementById('accountSettingsView');
    const legacy = document.getElementById('timerSoundSetting');
    const row = view?.querySelector('.sound-state-row');
    if (row && !row.dataset.bound) {
      row.dataset.bound = 'true';
      row.addEventListener('change', event => {
        if (!event.target.matches('input[name="timerSoundState"]')) return;
        localStorage.setItem(SOUND_KEY, event.target.value === 'on' ? 'on' : 'off');
        syncSoundState(row, legacy);
      });
    }
    syncSoundState(row, legacy);
  }

  function installAccountEnhancements() {
    placeAccountFooterLast();
    installSoundSettings();
  }

  window.SomthingreatAccount = {
    workoutItemsForMonth,
    workoutCountForMonth,
    renderHistoryCalendar,
    renderHistoryList,
    installAccountEnhancements
  };

  window.addEventListener('load', installAccountEnhancements, { once: true });
})();
