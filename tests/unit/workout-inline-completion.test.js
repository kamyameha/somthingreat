const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workout = fs.readFileSync(path.join(root, 'workout.css'), 'utf8');

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
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

const exercises = [
  { sessionKey: 'one', isAddOn: false },
  { sessionKey: 'two', isAddOn: false }
];
let renders = 0;
const context = {
  state: {
    current: {
      exercises,
      sets: {
        one: [true],
        two: [false]
      }
    }
  },
  exerciseSessionKey: exercise => exercise.sessionKey,
  firstIncompleteExerciseKey: () => 'two',
  isWorkoutFullyComplete: () => false,
  renderExercises: () => { renders += 1; }
};
vm.createContext(context);
vm.runInContext(`
  let openExerciseTrackKey = 'two';
  let workoutCompletionState = null;
  ${functionSource('openInlineWorkoutCompletion')}
  ${functionSource('restoreWorkoutFromCompletion')}
  this.openInlineWorkoutCompletion = openInlineWorkoutCompletion;
  this.restoreWorkoutFromCompletion = restoreWorkoutFromCompletion;
  this.readCompletionState = () => workoutCompletionState;
  this.readOpenTrack = () => openExerciseTrackKey;
`, context);

context.openInlineWorkoutCompletion();
assert.deepEqual({ ...context.readCompletionState() }, { mode: 'partial', previousTrackKey: 'two' });
assert.equal(context.readOpenTrack(), null);
assert.equal(renders, 1);

context.restoreWorkoutFromCompletion();
assert.equal(context.readCompletionState(), null);
assert.equal(context.readOpenTrack(), 'two');
assert.equal(renders, 2);

context.isWorkoutFullyComplete = () => true;
context.openInlineWorkoutCompletion();
assert.equal(context.readCompletionState().mode, 'full');

assert.match(html, /id="workoutCompletionTile"/);
assert.match(html, /id="completeBtn"[^>]*>Complete<\/button>/);
assert.match(functionSource('renderWorkoutCompletionTile'), /if \(!tile\) \{\s*tile = document\.createElement\('section'\)/s);
assert.match(functionSource('completeWorkout'), /openInlineWorkoutCompletion\(\)/);
assert.doesNotMatch(functionSource('completeWorkout'), /showCompletionScreen/);
assert.doesNotMatch(functionSource('completeWorkout'), /renderToday|completeWorkoutNow|completeWorkoutWithoutProgress/);
assert.match(appSource, /if \(action === 'save' \|\| action === 'finish'\) completeWorkoutNow\(false\)/);
assert.match(appSource, /if \(isWorkoutFullyComplete\(\)\) \{\s*workoutCompletionState = \{\s*mode: 'full'/s);
assert.match(functionSource('markWorkoutSetDone'), /if \(isWorkoutFullyComplete\(\)\) \{\s*workoutCompletionState = \{\s*mode: 'full'/s);
assert.match(functionSource('renderExercises'), /if \(!workoutCompletionState && isWorkoutFullyComplete\(\)\)/);

assert.match(workout, /--workout-collapsed-height:\s*88px/);
assert.match(workout, /#exerciseList\s*\{[^}]*display:\s*flex;[^}]*gap:\s*0;/s);
assert.match(workout, /#exerciseList\s*\{[^}]*width:\s*100%/s);
assert.match(workout, /\.workout-accordion-card\s*\{[^}]*height:\s*var\(--workout-collapsed-height\)/s);
assert.match(workout, /\.exercise-chip-toggle\s*\{[^}]*padding:\s*0 20px;/s);
assert.match(workout, /\.exercise-chip-toggle span\s*\{[^}]*min-height:\s*1\.25em;[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;[^}]*line-height:\s*1\.25;/s);
assert.match(workout, /\.workout-accordion-card\.completed \.exercise-chip-toggle\s*\{[^}]*background:\s*var\(--cream\)/s);
assert.match(workout, /\.workout-accordion-card\.workout-warmup-card \.exercise-chip-toggle\s*\{[^}]*background:\s*#ffffff/s);
assert.match(workout, /\.workout-accordion-card\.open\s*\{[^}]*flex:\s*1 0 auto/s);
assert.match(workout, /\.workout-completion-tile\.open\s*\{[^}]*flex:\s*1 0 auto/s);
assert.match(workout, /\.workout-active \.today-mascot-stage\s*\{[^}]*display:\s*none !important/s);
assert.match(functionSource('renderExercises'), /classList\.remove\('today-active'\)/);
assert.doesNotMatch(functionSource('renderExercises'), /Today's workout|workout-started-title/);
const renderTodaySource = functionSource('renderToday');
assert.ok(renderTodaySource.indexOf('if (state.current)') < renderTodaySource.indexOf('todayIsActive'));
assert.match(renderTodaySource, /document\.getElementById\('completeBtn'\)\?\.classList\.add\('hidden'\)/);
let activeWorkoutRenders = 0;
const activeWorkoutContext = {
  state: { current: { sessionId: 'active-workout' } },
  renderExercises: () => { activeWorkoutRenders += 1; }
};
vm.createContext(activeWorkoutContext);
vm.runInContext(`${renderTodaySource}; this.renderToday = renderToday;`, activeWorkoutContext);
assert.doesNotThrow(() => activeWorkoutContext.renderToday());
assert.equal(activeWorkoutRenders, 1);
assert.match(workout, /body\.workout-active \.app\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*padding:\s*0;[^}]*background:\s*#000000/s);
assert.match(workout, /body\.workout-active \.app\s*\{[^}]*padding-inline:\s*0/s);
assert.match(html, /<div class="workout-safe-area" aria-hidden="true"><\/div>\s*<section id="exerciseList">/s);
assert.match(workout, /\.workout-safe-area\s*\{[^}]*display:\s*none/s);
assert.match(workout, /body\.workout-active \.workout-safe-area\s*\{[^}]*display:\s*block;[^}]*flex:\s*0 0 env\(safe-area-inset-top\);[^}]*height:\s*env\(safe-area-inset-top\);[^}]*background:\s*#ffffff/s);
assert.doesNotMatch(workout, /#exerciseList > \.workout-accordion-card:first-child[^}]*padding-top:\s*env\(safe-area-inset-top\)/s);
assert.match(workout, /\.workout-accordion-card \.active-swap-btn\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px/s);
assert.match(workout, /\.workout-accordion-card \.exercise-help-btn\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px/s);
assert.match(workout, /\.set-control\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px/s);

const resetAfterWorkoutSource = functionSource('resetTodayAfterWorkout');
assert.match(resetAfterWorkoutSource, /state\.selectedEnergy = 'normal'/);
assert.match(resetAfterWorkoutSource, /state\.generated = null/);
assert.match(resetAfterWorkoutSource, /energyGrid\.scrollLeft = 0/);
assert.match(resetAfterWorkoutSource, /energyGrid\.dataset\.initialPositioned = 'false'/);
assert.match(functionSource('completeWorkoutWithoutProgress'), /resetTodayAfterWorkout\(\)/);
assert.match(functionSource('completeWorkoutNow'), /resetTodayAfterWorkout\(\)/);
assert.match(functionSource('positionInitialEnergySelector'), /const targetFeel = state\.selectedEnergy \|\| 'normal'/);
assert.doesNotMatch(functionSource('positionInitialEnergySelector'), /\|\| state\.selectedEnergy \|\|/);
assert.match(workout, /\.workout-accordion-card \.rating-row\s*\{[^}]*background:\s*rgba\(1,\s*45,\s*237,\s*0\.15\)/s);
assert.match(workout, /\.workout-accordion-card \.rating-row button\.selected\s*\{[^}]*background:\s*var\(--main\);[^}]*color:\s*#ffffff/s);

console.log('Validated continuous workout tiles and inline full/partial completion state.');
