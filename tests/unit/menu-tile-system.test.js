const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const account = fs.readFileSync(path.join(root, 'account.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const render = fs.readFileSync(path.join(root, 'render.js'), 'utf8');

const mainHeader = html.match(/<div class="account-modal-header account-tile-header">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
assert.match(mainHeader, /account-header-brand-tile/);
assert.match(mainHeader, /<img class="account-menu-logo" src="Assets\/somthingreat\.svg" alt="Somthingreat"/);
assert.match(mainHeader, /id="closeAccountModalBtn"[^>]*aria-label="Close menu"/);

const submenuHeaderStart = html.indexOf('<section id="accountSubmenuPanel"');
const submenuHeader = html.slice(submenuHeaderStart, html.indexOf('<div id="accountGoalView"', submenuHeaderStart));
assert.match(submenuHeader, /account-header-back-tile/);
assert.match(submenuHeader, /id="accountSubmenuBackBtn"[^>]*data-account-view="main"[^>]*aria-label="Back to menu"/);
assert.doesNotMatch(submenuHeader, /account-menu-logo/);
assert.match(submenuHeader, /id="closeAccountSubmenuBtn"[^>]*aria-label="Close menu"/);

assert.match(account, /--account-header-height:\s*200px/);
assert.match(account, /grid-template-columns:\s*minmax\(0,\s*252fr\)\s+minmax\(0,\s*142fr\)/);
assert.match(account, /\.account-panel\.account-modal\.account-main-mode \.menu-close-btn::before,[\s\S]*?width:\s*34px;[\s\S]*?height:\s*34px;/);
assert.match(account, /\.account-submenu-panel \.account-back-btn::before\s*\{[^}]*34px[^}]*arrow-left\.svg/s);
assert.match(account, /min-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - var\(--account-header-height\) - var\(--account-tile-gap\)\)/);
assert.match(account, /padding:\s*52px 28px calc\(44px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(account, /\.account-panel\.account-modal\.account-main-mode \.account-modal-content,[\s\S]*?overflow:\s*visible !important;/);
assert.match(account, /\.account-submenu-panel \.account-submenu-panel__content\s*\{[\s\S]*?overflow:\s*visible !important;/);
assert.match(account, /\.account-panel\.account-modal\.account-main-mode,[\s\S]*?overflow-y:\s*auto !important;/);
assert.match(account, /\.account-section h3\s*\{[\s\S]*?color:\s*#F7F3E6;/);

const menuMain = html.match(/<div id="accountMainView"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || '';
assert.match(menuMain, /<h3>Preferences<\/h3>[\s\S]*?>Priority skill <[\s\S]*?>Equipment <[\s\S]*?>Recovery </);
assert.match(menuMain, /<h3>Extra activity<\/h3>[\s\S]*data-account-view="tracker">Tracker<\/button>/);
assert.doesNotMatch(menuMain, /data-account-view="(?:counter|timer)"/);
assert.match(menuMain, /<h3>Security<\/h3>[\s\S]*?>Password</);
assert.match(menuMain, /<h3>Assistance<\/h3>[\s\S]*?>Support</);

const priorityView = html.match(/<div id="accountGoalView"[\s\S]*?<\/div>\s*<button id="saveAccountGoalBtn"/)?.[0] || '';
const priorityValues = [...priorityView.matchAll(/name="accountGoal" value="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(priorityValues, ['pullup', 'pistolSquat', 'handstand', 'lsit']);
assert.match(priorityView, /Choose the skill you want to progress faster\./);
assert.match(account, /\.account-goal-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(html, /id="saveAccountGoalBtn"[^>]*>Update priority<\/button>/);

const trackerView = html.match(/<div id="accountTrackerView"[\s\S]*?<\/section>\s*<\/div>/)?.[0] || '';
assert.match(trackerView, /<h2[^>]*>Extra activity<\/h2>/);
assert.match(trackerView, /Count rounds or track time outside your workouts\./);
assert.ok(trackerView.indexOf('id="customChecklistNameInput"') < trackerView.indexOf('class="custom-type-row"'));
assert.ok(trackerView.indexOf('class="custom-type-row"') < trackerView.indexOf('id="customChecklistTargetInput"'));
assert.ok(trackerView.indexOf('id="customChecklistTargetInput"') < trackerView.indexOf('id="createCustomChecklistBtn"'));
assert.match(trackerView, /placeholder="Select an activity"/);
assert.match(trackerView, /placeholder="Enter the target"/);
assert.match(trackerView, /value="rounds"[\s\S]*?>Rounds</);
assert.match(trackerView, /value="minutes"[\s\S]*?>Minutes</);
assert.match(trackerView, />Create tracker<\/button>/);
assert.match(account, /\.custom-type-row label:has\(input:checked\)[\s\S]*?background:\s*#F7F3E6 !important;[\s\S]*?color:\s*var\(--main\) !important;/);

assert.match(app, /ACCOUNT_SUBMENU_VIEWS = new Set\(\[[^\]]*'tracker'/);
assert.match(render, /state\.customChecklist = \{ name, type, target, items:/);
assert.match(render, /saveActivityTimer\(/);
assert.match(render, /closeAccountModal\(\);\s*renderToday\(\);\s*renderCustomChecklist\(\);/);
assert.match(render, /state\.history\.push\(\{ type: 'custom'/);

console.log('Validated the shared tile menu, priority grid, and persistent Extra Activity tracker.');
