const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootPath = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(rootPath, 'app.js'), 'utf8');
const account = fs.readFileSync(path.join(rootPath, 'account.css'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
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

  toggle(name, force) {
    const enabled = force === undefined ? !this.names.has(name) : Boolean(force);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

const element = (...classes) => ({
  classList: new FakeClassList(...classes),
  attributes: {},
  inert: false,
  scrollTop: 0,
  style: { backgroundColor: '' },
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
});

function runCloseFlow(route) {
  const isToday = route === 'today';
  const isWorkout = route === 'workout';
  const root = element('account-active', ...(isToday ? ['today-active'] : []), ...(isWorkout ? ['workout-active'] : []));
  const body = element('account-active', ...(isToday ? ['today-active'] : []), ...(isWorkout ? ['workout-active'] : []));
  const app = element();
  app.scrollTop = 91;
  const panel = element('account-open', 'account-main-mode');
  panel.scrollTop = 310;
  const submenu = element('account-submenu-mode');
  submenu.scrollTop = 170;
  const theme = { content: '#1c1c1c' };
  const focused = { isConnected: true, focusCount: 0, focus() { this.focusCount += 1; } };
  const activeElement = { blurCount: 0, blur() { this.blurCount += 1; } };
  const scrollingElement = { scrollTop: 45 };
  let bottomNavSyncs = 0;
  let mascotSyncs = 0;

  const document = {
    documentElement: root,
    body,
    activeElement,
    scrollingElement,
    getElementById: id => ({ accountPanel: panel, accountSubmenuPanel: submenu }[id] || null),
    querySelector: selector => ({
      '.app': app,
      'meta[name="theme-color"]': theme
    })[selector] || null
  };

  const context = {
    document,
    window: {
      location: { href: 'https://somthingreat.test/' },
      history: {
        state: {},
        backCount: 0,
        back() { this.backCount += 1; },
        pushState() {}
      },
      requestAnimationFrame(callback) { callback(); }
    },
    hideAllAccountViews() {},
    updateUpdateBanner() {},
    syncBottomNavVisibility() { bottomNavSyncs += 1; },
    syncTodayMascotSources() { mascotSyncs += 1; },
    focused,
    setMetaContent(name, content) {
      assert.strictEqual(name, 'theme-color');
      theme.content = content;
    }
  };
  vm.createContext(context);
  vm.runInContext(`
    var accountReturnState = {
      activeScreenId: '${isToday ? 'today' : route}',
      appScrollTop: 91,
      documentScrollTop: 45,
      rootTodayActive: ${isToday},
      bodyTodayActive: ${isToday},
      rootWorkoutActive: ${isWorkout},
      bodyWorkoutActive: ${isWorkout},
      rootBackgroundColor: '#ffffff',
      bodyBackgroundColor: '#ffffff',
      themeColor: '#ffffff',
      focusedElement: focused
    };
    var accountHistoryEntryActive = false;
    var accountHistoryBackInFlight = false;
    ${functionSource('setAccountActive')}
    ${functionSource('restoreAccountReturnState')}
    ${functionSource('closeAccountModal')}
    this.closeAccountModal = closeAccountModal;
  `, context);
  context.closeAccountModal();

  assert.ok(panel.classList.contains('hidden'), `${route}: main menu hidden`);
  assert.ok(submenu.classList.contains('hidden'), `${route}: submenu hidden`);
  assert.ok(!panel.classList.contains('account-main-mode'), `${route}: main mode removed`);
  assert.ok(!submenu.classList.contains('account-submenu-mode'), `${route}: submenu mode removed`);
  assert.strictEqual(panel.inert, true, `${route}: hidden main menu inert`);
  assert.strictEqual(submenu.inert, true, `${route}: hidden submenu inert`);
  assert.strictEqual(panel.scrollTop, 0, `${route}: main menu scroll cleared`);
  assert.strictEqual(submenu.scrollTop, 0, `${route}: submenu scroll cleared`);
  assert.ok(!root.classList.contains('account-active'), `${route}: root menu class removed`);
  assert.ok(!body.classList.contains('account-active'), `${route}: body menu class removed`);
  assert.strictEqual(root.classList.contains('today-active'), isToday, `${route}: root Today state restored`);
  assert.strictEqual(body.classList.contains('today-active'), isToday, `${route}: body Today state restored`);
  assert.strictEqual(root.classList.contains('workout-active'), isWorkout, `${route}: root workout state restored`);
  assert.strictEqual(body.classList.contains('workout-active'), isWorkout, `${route}: body workout state restored`);
  assert.strictEqual(app.scrollTop, 91, `${route}: app scroll restored`);
  assert.strictEqual(scrollingElement.scrollTop, 45, `${route}: document scroll restored`);
  assert.strictEqual(root.style.backgroundColor, '#ffffff', `${route}: root theme restored`);
  assert.strictEqual(body.style.backgroundColor, '#ffffff', `${route}: body theme restored`);
  assert.strictEqual(theme.content, '#ffffff', `${route}: theme-color restored`);
  assert.strictEqual(focused.focusCount, 1, `${route}: previous focus restored`);
  assert.strictEqual(activeElement.blurCount, 1, `${route}: hidden control blurred`);
  assert.strictEqual(bottomNavSyncs, 1, `${route}: navigation restored`);
  assert.strictEqual(mascotSyncs, isToday ? 1 : 0, `${route}: Today artwork refreshed only on Today`);
}

for (const route of ['today', 'progress', 'activity', 'workout']) {
  runCloseFlow(route);
  runCloseFlow(route);
}

assert.ok(functionSource('openAccountMain').indexOf('captureAccountReturnState()') < functionSource('openAccountMain').indexOf('hideNormalAppChrome()'));
assert.ok(functionSource('openAccountSubmenu').indexOf('captureAccountReturnState()') < functionSource('openAccountSubmenu').indexOf('hideNormalAppChrome()'));
assert.match(functionSource('closeAccountModal'), /setAccountActive\(false\);\s*restoreAccountReturnState\(\);/);
assert.match(source, /window\.addEventListener\('popstate',[\s\S]*closeAccountModal\(true\)/);
assert.match(functionSource('openAccountMain'), /ensureAccountHistoryEntry\(\)/);
assert.match(functionSource('openAccountSubmenu'), /ensureAccountHistoryEntry\(\)/);
assert.match(functionSource('resetAuthUI'), /accountReturnState \|\| accountHistoryEntryActive\) closeAccountModal\(\)/);
assert.match(functionSource('renderAccount'), /!currentUser[\s\S]*accountReturnState \|\| accountHistoryEntryActive\) closeAccountModal\(\)/);
assert.doesNotMatch(account, /body\.account-active \.app/);

console.log('Validated repeatable Menu cleanup for Today, Progress, Activity, and workout states.');
