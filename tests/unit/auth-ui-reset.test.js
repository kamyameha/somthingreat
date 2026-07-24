const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function functionSource(name) {
  const patterns = [`function ${name}(`, `async function ${name}(`];
  const start = patterns.map(pattern => appSource.indexOf(pattern)).find(index => index >= 0);
  assert.ok(start >= 0, `${name} exists`);
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  add(...names) {
    names.forEach(name => this.names.add(name));
  }

  remove(...names) {
    names.forEach(name => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }
}

function element(...classes) {
  return {
    classList: new FakeClassList(...classes),
    attributes: {},
    inert: false,
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

const documentElement = element('today-active', 'workout-active', 'account-active', 'confirmation-active', 'recovery-boot');
const body = element('today-active', 'workout-active', 'account-active', 'confirmation-active', 'password-recovery-mode');
const app = element();
app.inert = true;
const bottomNav = element();
bottomNav.inert = true;
const topbar = element('hidden');
const screens = [element(), element()];
const elements = {
  accountPanel: element('hidden', 'account-modal', 'account-open', 'account-main-mode', 'account-password-mode'),
  accountSubmenuPanel: element('account-submenu-mode'),
  loggedOutAccount: element('hidden'),
  loggedInAccount: element(),
  accountBtn: element(),
  todayEmptyState: element(),
  generatedWorkoutCard: element(),
  confirmPanel: element(),
  exerciseHelpPanel: element(),
  timerPanel: element()
};

const document = {
  documentElement,
  body,
  getElementById: id => elements[id] || null,
  querySelector: selector => ({
    '.app': app,
    '.bottom-nav': bottomNav,
    '.topbar': topbar
  })[selector] || null,
  querySelectorAll: selector => selector === '.screen' ? screens : []
};

const context = {
  document,
  hideAccountSubmenuPanel() {
    elements.accountSubmenuPanel.classList.remove('account-submenu-mode');
    elements.accountSubmenuPanel.classList.add('hidden');
    elements.accountSubmenuPanel.setAttribute('aria-hidden', 'true');
  }
};
vm.createContext(context);
vm.runInContext(`${functionSource('applyLoggedOutAuthSurfaceState')}; this.applyLoggedOutAuthSurfaceState = applyLoggedOutAuthSurfaceState;`, context);
context.applyLoggedOutAuthSurfaceState();

for (const target of [documentElement, body]) {
  assert.ok(target.classList.contains('logged-out'));
  for (const staleClass of ['today-active', 'workout-active', 'account-active', 'confirmation-active']) {
    assert.ok(!target.classList.contains(staleClass), `${staleClass} removed`);
  }
}
assert.ok(!documentElement.classList.contains('recovery-boot'));
assert.ok(!body.classList.contains('password-recovery-mode'));
assert.ok(!elements.accountPanel.classList.contains('hidden'));
assert.ok(!elements.accountPanel.classList.contains('account-modal'));
assert.ok(elements.loggedOutAccount.classList.contains('hidden') === false);
assert.ok(elements.loggedInAccount.classList.contains('hidden'));
assert.ok(elements.accountSubmenuPanel.classList.contains('hidden'));
assert.strictEqual(elements.accountSubmenuPanel.attributes['aria-hidden'], 'true');
assert.strictEqual(app.inert, false);
assert.strictEqual(bottomNav.inert, false);
assert.ok(bottomNav.classList.contains('hidden'));
assert.ok(topbar.classList.contains('hidden') === false);
assert.ok(screens.every(screen => screen.classList.contains('auth-locked')));
for (const id of ['todayEmptyState', 'generatedWorkoutCard', 'confirmPanel', 'exerciseHelpPanel', 'timerPanel']) {
  assert.ok(elements[id].classList.contains('hidden'), `${id} hidden`);
}

const resetSource = functionSource('resetAuthUI');
assert.ok(resetSource.includes('clearAuthFields()'));
assert.ok(resetSource.includes('applyLoggedOutAuthSurfaceState()'));
assert.ok(resetSource.includes('setAuthMode(mode)'));
assert.ok(functionSource('setAuthMode').includes('applyLoggedOutAuthSurfaceState()'));
assert.ok(functionSource('logout').includes("resetAuthUI('welcome')"));
assert.ok(functionSource('checkCurrentAuthSession').includes("resetAuthUI('welcome')"));
assert.ok(appSource.slice(appSource.indexOf('supabaseClient.auth.onAuthStateChange')).includes("resetAuthUI('welcome')"));

console.log('Validated deterministic logged-out authentication UI reset.');
