const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const workout = fs.readFileSync(path.join(root, 'workout.css'), 'utf8');
const account = fs.readFileSync(path.join(root, 'account.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert.match(style, /--cream:\s*#F7F3E6;/);
assert.match(style, /\.confirm-panel\.workout-completion-panel\s*\{[^}]*background:\s*var\(--cream\)/s);
assert.match(workout, /\.energy-option\.selected,[^}]*background:\s*var\(--cream\)/s);
assert.match(workout, /background:\s*rgba\(247,\s*243,\s*230,\s*0\.7\)/);
assert.match(workout, /color:\s*rgba\(1,\s*45,\s*237,\s*0\.5\)/);

assert.doesNotMatch(html, /id="workoutMeta"/);
assert.doesNotMatch(html, /id="sessionTotalPreview"/);
assert.deepEqual(
  [...html.matchAll(/<div class="add-on-panel preview-add-on-panel"[\s\S]*?<\/div>/g)]
    .flatMap(match => [...match[0].matchAll(/<span>([^<]+)<\/span>/g)].map(label => label[1])),
  ['Warm-up', 'Stretch', 'Timer', 'Rest timer']
);

assert.match(workout, /\.preview-add-on-panel\s*\{[^}]*margin:\s*48px 0;/s);
assert.match(workout, /\.preview-add-on-panel \.add-on-row\s*\{[^}]*font-size:\s*16px;[^}]*font-weight:\s*400;/s);
assert.match(workout, /\.preview-add-on-panel \.add-on-row i\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
assert.match(workout, /\.generated-close-btn\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;/s);
assert.match(workout, /\.generated-close-btn\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*transform:\s*none;/s);
assert.match(workout, /\.generated-close-btn::before\s*\{[^}]*display:\s*block;[^}]*place-self:\s*center;[^}]*transform:\s*none;/s);
assert.doesNotMatch(html, /class="[^"]*(?:generated-close-btn|menu-close-btn|today-empty-close)[^"]*"[^>]*>[^<]+<\/button>/);
assert.match(workout, /\.generated-preview-list \.preview-row span\s*\{[^}]*color:\s*rgba\(1,\s*45,\s*237,\s*0\.35\)/s);
assert.match(account, /\.today-recovery-modal \.menu-close-btn\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;/s);
assert.match(account, /\.account-panel\.account-modal\.account-main-mode \.menu-close-btn,[\s\S]*?\.today-recovery-modal \.menu-close-btn\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*transform:\s*none;/s);

assert.match(workout, /\.exercise-help-content\s*\{[^}]*color:\s*var\(--main\)/s);
assert.match(workout, /\.exercise-help-section h3\s*\{[^}]*color:\s*rgba\(1,\s*45,\s*237,\s*0\.35\)/s);
assert.match(workout, /\.exercise-help-section p,[\s\S]*?\.exercise-help-section li\s*\{[^}]*color:\s*var\(--main\)/s);

const assetHash = relativePath => crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(root, relativePath), 'utf8').trim())
  .digest('hex');
assert.strictEqual(assetHash('Assets/EnergyCheck/great-a.svg'), 'c318acd8a4d38c9d8db8f03b46f107b3c89fc1d8ab7c57551a8d693fad59d8e2');
assert.strictEqual(assetHash('Assets/EnergyCheck/great-b.svg'), '37bc2ead6ef3485b05c8b80dc34ae1c1c783899ecdf5f0e450624524503e13bd');
assert.match(app, /great:\s*\['Assets\/EnergyCheck\/great-a\.svg',\s*'Assets\/EnergyCheck\/great-b\.svg'\]/);
assert.match(serviceWorker, /'\.\/Assets\/EnergyCheck\/great-a\.svg'/);
assert.match(serviceWorker, /'\.\/Assets\/EnergyCheck\/great-b\.svg'/);

const modalBlackRules = workout.slice(
  workout.indexOf('.generated-workout-modal {'),
  workout.indexOf('@media (min-width: 700px)')
);
assert.doesNotMatch(modalBlackRules, /#000(?:000)?|rgba\(0,\s*0,\s*0/);

console.log('Validated modal colors, preview add-ons, close targets, and energy-chip colors.');
