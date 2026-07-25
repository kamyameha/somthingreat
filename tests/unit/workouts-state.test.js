const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const storage = new Map();
const context = {
  console,
  Date,
  Math,
  window: {},
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'workouts.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'state.js'), 'utf8'), context);

const workouts = context.window.SomthingreatWorkouts;

function catalog(id) {
  return workouts.exerciseCatalog.find(item => item.id === id);
}

assert.deepStrictEqual(Array.from(workouts.validateWorkoutSystem()), []);
assert.strictEqual(new Set(workouts.exerciseCatalog.map(item => item.id)).size, workouts.exerciseCatalog.length);
assert.strictEqual(new Set(workouts.exerciseCatalog.map(item => item.name)).size, workouts.exerciseCatalog.length);

workouts.exerciseCatalog.forEach(item => {
  assert.ok(item.id && item.name, `identity: ${item.id}`);
  assert.ok(['strength', 'preparation'].includes(item.type), `type: ${item.id}`);
  assert.ok(Number.isInteger(item.setCount) && item.setCount > 0, `sets: ${item.id}`);
  assert.ok(item.prescriptionData, `structured prescription: ${item.id}`);
  assert.strictEqual(item.prescription, workouts.prescriptionToString(item.prescriptionData), `label: ${item.id}`);
  assert.ok(item.instructions.purpose, `purpose: ${item.id}`);
  assert.ok(item.instructions.startingPosition, `starting position: ${item.id}`);
  assert.ok(Array.isArray(item.instructions.movement) && item.instructions.movement.length, `movement: ${item.id}`);
  assert.ok(item.instructions.focus.length <= 3, `focus: ${item.id}`);
  assert.ok(item.instructions.commonMistakes.length <= 3, `mistakes: ${item.id}`);
  assert.ok(item.instructions.safety, `safety: ${item.id}`);
  assert.ok(Array.isArray(item.instructions.successCriteria) && item.instructions.successCriteria.length, `success criteria: ${item.id}`);
  assert.ok(item.instructions.successCriteria.length <= 3, `success criteria length: ${item.id}`);
  assert.ok(item.instructions.successCriteria.every(value => value && !/good form|proper technique/i.test(value)), `observable criteria: ${item.id}`);
  assert.strictEqual(item.instructions.visualRequired, true, `visual required: ${item.id}`);
  assert.ok(item.instructions.visualGuidance, `visual guidance: ${item.id}`);
  if (item.perSide) assert.ok(item.instructions.successCriteria.some(value => /each side|separately on each side/i.test(value)), `side semantics: ${item.id}`);
  if (item.prescriptionType === 'time') assert.ok(item.secondsPerSet > 0, `seconds: ${item.id}`);
  if (item.prescriptionType === 'reps') assert.ok(item.repsPerSet, `reps: ${item.id}`);
  assert.ok(!/\\d\\s*[-–]\\s*\\d/.test(item.prescription), `fixed target: ${item.id}`);
});

assert.deepStrictEqual(Array.from(workouts.movementTracks.pistolSquat, item => item.id), [
  'assisted-single-leg-sit-to-stand', 'elevated-pistol-squat', 'counterbalance-pistol-squat',
  'assisted-pistol-squat', 'pistol-squat-negative', 'full-pistol-squat'
]);
assert.deepStrictEqual(Array.from(workouts.movementTracks.handstandPushup, item => item.id), [
  'pike-hold', 'elevated-pike-hold', 'pike-push-up', 'feet-elevated-pike-push-up',
  'wall-handstand-push-up-negative', 'partial-wall-handstand-push-up', 'full-wall-handstand-push-up'
]);
assert.notStrictEqual(workouts.movementTracks.handstand, workouts.movementTracks.handstandPushup);
assert.notDeepStrictEqual(Array.from(workouts.movementTracks.handstand, item => item.id), Array.from(workouts.movementTracks.handstandPushup, item => item.id));
assert.ok(workouts.createDefaultLevels().pistolSquat);
assert.ok(workouts.createDefaultLevels().handstandPushup);
const expectedCapabilityStageCounts = {
  handstand: 6,
  crow: 3,
  lsit: 6,
  muscleupTransition: 5,
  handstandPushup: 5,
  pistolSquat: 5
};
Object.entries(expectedCapabilityStageCounts).forEach(([key, expectedCount]) => {
  const track = workouts.movementTracks[key] || workouts.baseTracks[key];
  const stages = workouts.masteringSkillStages[key];
  assert.strictEqual(stages.length, expectedCount, `capability stage count: ${key}`);
  assert.strictEqual(stages[stages.length - 1].endLevel, track.length - 1, `final capability threshold: ${key}`);
  assert.ok(stages.every((stage, index) => index === 0 || stage.endLevel > stages[index - 1].endLevel), `ordered capability stages: ${key}`);
  assert.strictEqual(workouts.getMasteringSkillProgress(key, { level: 0 }, track).completedStages, 0, `zero-dot support: ${key}`);
});
const handstandTrack = workouts.movementTracks.handstand;
assert.strictEqual(workouts.getMasteringSkillProgress('handstand', { level: 6 }, handstandTrack).completedStages, 2);
assert.strictEqual(workouts.getMasteringSkillProgress('handstand', { level: 7 }, handstandTrack).completedStages, 3);
assert.strictEqual(workouts.getMasteringSkillProgress('handstand', { level: 12, points: 0, positiveExposures: 0 }, handstandTrack).completedStages, 5);
assert.strictEqual(workouts.getMasteringSkillProgress('handstand', { level: 12, points: 7, positiveExposures: 3 }, handstandTrack).completedStages, 6);
assert.strictEqual(workouts.getProgressCardState({ focusAchieved: true, recentUnlockedExercise: 'X', strongPattern: 'Y' }), 'focus_achieved');
assert.strictEqual(workouts.getProgressCardState({ recentUnlockedExercise: 'X', strongPattern: 'Y' }), 'new_exercise_unlocked');
assert.strictEqual(workouts.getProgressCardState({ strongPattern: 'Y', isReturningUser: true }), 'strong_pattern');
assert.strictEqual(workouts.getProgressCardState({ isReturningUser: true, completedWorkoutCount: 0 }), 'new_user');
assert.strictEqual(workouts.getProgressCardState({ completedWorkoutCount: 0 }), 'new_user');
assert.strictEqual(workouts.getProgressCardState({ completedWorkoutCount: 1 }), 'regular');
const regularCard = workouts.getProgressCardContent('regular', {
  nextExerciseName: 'Flex-arm hang', remainingRequirement: '1 Easy completion or 2 Good completions'
});
assert.strictEqual(regularCard.description, 'Your training plan is underway');
assert.strictEqual(workouts.remainingProgressRequirement('horizontalPush', { points: 3, positiveExposures: 1 }), '1 Easy completion or 2 Good completions');
assert.strictEqual(workouts.getProgressCardContent('new_exercise_unlocked', { recentUnlockedExercise: 'Full push-up' }).description, 'Full push-up unlocked');
const refinedStates = [
  ['regular', { currentLevelName: 'Assisted pull-up', nextExerciseName: 'Flex-arm hang', remainingRequirement: '2 Easy completions' }],
  ['new_user', { currentFocusName: 'Pull-up' }],
  ['new_exercise_unlocked', { recentUnlockedExercise: 'Full push-up', nextExerciseName: 'Decline push-up', remainingRequirement: '2 Good completions' }],
  ['strong_pattern', { strongPattern: '4 workouts completed this month', nextExerciseName: 'Flex-arm hang', remainingRequirement: '2 Easy completions' }],
  ['focus_achieved', { achievedFocusName: 'Pull-up achieved' }],
  ['returning_user', { currentFocusName: 'Pull-up' }]
].map(([stateName, data]) => workouts.getProgressCardContent(stateName, data));
assert.ok(refinedStates.every(content => typeof content.description === 'string' && content.description.length > 0));
assert.strictEqual(refinedStates.find(content => content.state === 'strong_pattern').description, '4 workouts completed this month');
assert.strictEqual(refinedStates.find(content => content.state === 'new_exercise_unlocked').description, 'Full push-up unlocked');
assert.strictEqual(workouts.getProgressCardContent('focus_achieved', { achievedFocusName: 'Pull-up achieved' }).description, 'Pull-up achieved');
const generalCard = workouts.getProgressCardContent('regular', { recentProgressSummary: '3 successful completions this month' });
assert.strictEqual(generalCard.description, '3 successful completions this month');

const activeWeekHistory = [
  { date: '2025-12-29T12:00:00' },
  { date: '2026-01-05T12:00:00' },
  { date: '2026-01-12T12:00:00' }
];
assert.strictEqual(workouts.consecutiveActiveWeeks(activeWeekHistory, new Date('2026-01-14T12:00:00')), 3);
assert.strictEqual(workouts.consecutiveActiveWeeks(activeWeekHistory.slice(0, 2), new Date('2026-01-14T12:00:00')), 2, 'current-week grace');
assert.deepStrictEqual(Array.from(workouts.getRotation(null, {}).map(item => item.name)), ['Push', 'Lower Body', 'Pull', 'Skills']);
const rotationCases = [
  ['Push', 1],
  ['Lower Body', 2],
  ['Legs & core', 2],
  ['Legs + Core', 2],
  ['Pull', 3],
  ['Skills', 0]
];
rotationCases.forEach(([workoutName, expected]) => {
  assert.strictEqual(workouts.nextRotationIndexFromHistory([{ date: '2026-07-20T12:00:00Z', workout: workoutName, type: 'workout' }], 0), expected, `rotation after ${workoutName}`);
});
const rotationHistory = [
  { date: '2026-07-20T09:00:00Z', workout: 'Push', type: 'workout', completedCount: 1 },
  { date: '2026-07-20T10:00:00Z', workout: 'Counter', type: 'custom', customType: 'rounds' },
  { date: '2026-07-20T11:00:00Z', workout: 'Pull', type: 'workout', completedCount: 1 }
];
assert.strictEqual(workouts.nextRotationIndexFromHistory(rotationHistory, 0), 3, 'latest same-day workout wins and counters are ignored');
assert.strictEqual(workouts.getTodayWorkout({ mode: 'normal', state: { rotationIndex: 2, history: [rotationHistory[0]], levels: workouts.createDefaultLevels() }, profile: { goal: 'pullup', equipment: ['floor'] } }).workoutName, 'Lower Body', 'history overrides stale index');
assert.strictEqual(workouts.workoutDisplayName('Legs & core'), 'Lower Body', 'legacy workout names use the new display label');
const generalLevels = workouts.createDefaultLevels();
assert.strictEqual(workouts.getGeneralFitnessProgress(generalLevels).completedStages, 0);
['horizontalPush', 'verticalPull', 'squat', 'antiExtension'].forEach(key => {
  generalLevels[key].level = workouts.movementTracks[key].length - 1;
});
assert.strictEqual(workouts.getGeneralFitnessProgress(generalLevels).completedStages, 5);
generalLevels.antiExtension.level = 0;
assert.strictEqual(workouts.getGeneralFitnessProgress(generalLevels).completedStages, 0);
const skillsWorkout = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 3, levels: workouts.createDefaultLevels() },
  profile: { goal: 'pullup', equipment: ['pullupBar'] }
});
assert.ok(skillsWorkout.exercises.some(item => item.progressionTrackKey === 'pistolSquat'));
assert.ok(skillsWorkout.exercises.some(item => item.progressionTrackKey === 'handstandPushup'));
const integratedCoreTracks = new Set(['antiExtension', 'compression', 'lateralCore', 'lsit']);
for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
  for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
    const workout = workouts.getTodayWorkout({
      mode,
      state: { rotationIndex, levels: workouts.createDefaultLevels() },
      profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
    });
    assert.ok(workout.exercises.some(item => integratedCoreTracks.has(item.progressionTrackKey)), `integrated core: ${workout.workoutName} ${mode}`);
    assert.strictEqual(workout.exercises.length, workouts.energyOptions[mode].exerciseCount, `energy exercise count: ${workout.workoutName} ${mode}`);
    assert.notStrictEqual(workout.workoutName, 'Core');
    const allowedTracks = new Set(workouts.workoutEligibleTracks[workout.workoutName]);
    assert.ok(
      workout.exercises.every(item => allowedTracks.has(item.progressionTrackKey)),
      `category-preserving tracks: ${workout.workoutName} ${mode}`
    );
  }
}

const pullOnlyState = {
  rotationIndex: 2,
  levels: workouts.createDefaultLevels()
};
for (const equipment of [['floor'], ['floor', 'pullupBar']]) {
  for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
    const pullWorkout = workouts.getTodayWorkout({
      mode,
      state: pullOnlyState,
      profile: { goal: 'pullup', equipment }
    });
    assert.strictEqual(pullWorkout.workoutName, 'Pull');
    assert.ok(
      pullWorkout.exercises.every(item => workouts.workoutEligibleTracks.Pull.includes(item.progressionTrackKey)),
      `Pull fallback remains in category: ${mode} ${equipment.join(',')}`
    );
    assert.ok(
      pullWorkout.exercises.every(item => item.id !== 'bodyweight-good-morning'),
      `Bodyweight good morning excluded from Pull: ${mode} ${equipment.join(',')}`
    );
    assert.strictEqual(
      pullWorkout.exercises.length,
      workouts.energyOptions[mode].exerciseCount,
      `Pull preserves ${mode} exercise count: ${equipment.join(',')}`
    );
  }
}

const duplicateMainWorkout = {
  ...workouts.getTodayWorkout({
    mode: 'normal',
    state: { rotationIndex: 1, levels: workouts.createDefaultLevels() },
    profile: { goal: 'general', equipment: ['floor'] }
  }),
  exercises: [
    workouts.normalizeExercise({
      ...catalog('bodyweight-squat'),
      trackKey: 'squat',
      progressionTrackKey: 'squat'
    })
  ]
};
const validatedSections = workouts.validateWorkoutSections(
  duplicateMainWorkout,
  [{ id: 'warmup-test', isAddOn: true, movementExerciseIds: ['bodyweight-squat'] }],
  {
    state: { levels: workouts.createDefaultLevels() },
    profile: { goal: 'general', equipment: ['floor'] }
  }
);
assert.strictEqual(validatedSections.length, 1, 'a same-category replacement is retained');
assert.notStrictEqual(validatedSections[0].id, 'bodyweight-squat', 'warm-up/main collision is replaced by stable ID');
assert.ok(
  workouts.workoutEligibleTracks['Lower Body'].includes(validatedSections[0].progressionTrackKey),
  'duplicate replacement preserves workout category'
);
const addOnValidatedWorkout = workouts.applyWorkoutAddOns({
  ...duplicateMainWorkout,
  exercises: [
    duplicateMainWorkout.exercises[0],
    workouts.normalizeExercise({
      ...catalog('bodyweight-good-morning'),
      trackKey: 'posteriorChain',
      progressionTrackKey: 'posteriorChain'
    })
  ]
}, { warmup: true, stretch: true }, {
  state: { levels: workouts.createDefaultLevels() },
  profile: { goal: 'general', equipment: ['floor'] }
});
const allSectionIds = addOnValidatedWorkout.exercises.flatMap(item => (
  item.isAddOn ? [item.id, ...(item.movementExerciseIds || [])] : [item.id]
));
assert.strictEqual(new Set(allSectionIds).size, allSectionIds.length, 'final preview workout has no cross-section ID collisions');

assert.strictEqual(workouts.prescriptionToString({ sets: 3, seconds: 20 }), '3 × 20s');
assert.strictEqual(workouts.prescriptionToString({ sets: 3, reps: 8 }), '3 × 8');
const legacyRangeLabel = ['3 × 6', '10'].join('-');
assert.strictEqual(workouts.prescriptionToString(workouts.normalizePrescriptionData(null, legacyRangeLabel, 3)), '3 × 8');
const obsoleteStructuredRange = { sets: 3, ['reps' + 'Min']: 6, ['reps' + 'Max']: 10 };
assert.strictEqual(workouts.prescriptionToString(workouts.normalizePrescriptionData(obsoleteStructuredRange, legacyRangeLabel, 3)), '3 × 8');
const pike = workouts.normalizeExercise({ ...catalog('pike-hold'), trackKey: 'handstand', progressionTrackKey: 'handstand' });
const pushTrack = workouts.movementTracks.horizontalPush;
const unlockedSwaps = workouts.getValidSwapCandidates(pushTrack[2], pushTrack, { unlockedLevel: 2 });
assert.ok(unlockedSwaps.length > 0, 'eligible unlocked exercise has a swap');
assert.ok(unlockedSwaps.every(item => pushTrack.indexOf(item) <= 2), 'locked later stages are excluded from swaps');
assert.deepStrictEqual(Array.from(workouts.getValidSwapCandidates(pushTrack[0], pushTrack, { unlockedLevel: 0 })), [], 'valid non-swappable first stage');
const swapAudit = workouts.getSwapCandidateAudit({ ...pushTrack[2], trackKey: 'horizontalPush', progressionTrackKey: 'horizontalPush' }, {
  profile: { goal: 'pullup', equipment: ['floor'] },
  state: { levels: { horizontalPush: { level: 2 } } },
  unlockedLevel: 2
});
assert.ok(swapAudit.candidateCountBeforeFiltering >= swapAudit.candidateCountAfterEquipment);
assert.ok(swapAudit.candidateCountAfterEquipment >= swapAudit.candidateCountAfterRecovery);
assert.ok(swapAudit.candidateCountAfterRecovery >= swapAudit.candidateCountAfterProgression);
assert.ok(swapAudit.candidateCountFinal > 0);
const lockedSwapAudit = workouts.getSwapCandidateAudit({ ...pushTrack[0], trackKey: 'horizontalPush', progressionTrackKey: 'horizontalPush' }, {
  profile: { goal: 'pullup', equipment: ['floor'] }, state: { levels: { horizontalPush: { level: 0 } } }, unlockedLevel: 0
});
assert.strictEqual(lockedSwapAudit.candidateCountFinal, 0);
assert.match(lockedSwapAudit.reason, /locked progression stages/);
const unlockedWallPushAudit = workouts.getSwapCandidateAudit({ ...pushTrack[0], trackKey: 'horizontalPush', progressionTrackKey: 'horizontalPush' }, {
  profile: { goal: 'pullup', equipment: ['floor'] }, state: { levels: { horizontalPush: { level: 1 } } }, unlockedLevel: 1
});
assert.ok(unlockedWallPushAudit.candidateCountFinal > 0, 'Wall push-up exposes Swap when a same-track replacement is unlocked');
assert.strictEqual(workouts.executableRounds(pike).length, 3);
assert.ok(workouts.executableRounds(pike).every(round => round.seconds === 20));

const original = workouts.normalizeExercise({
  ...catalog('wrist-preparation'),
  workoutExerciseId: 'session-slot-handstand-1',
  prescriptionData: { sets: 2, reps: 8 },
  trackKey: 'handstand',
  progressionTrackKey: 'handstand'
});
const swapped = workouts.createSwapReplacement(original, catalog('pike-hold'), 'great');
assert.strictEqual(swapped.id, 'pike-hold');
assert.strictEqual(swapped.prescription, '3 × 20s');
assert.strictEqual(swapped.setCount, 3);
assert.strictEqual(swapped.secondsPerSet, 20);
assert.strictEqual(swapped.prescriptionType, 'time');
assert.strictEqual(swapped.repsPerSet, null);
assert.deepStrictEqual(Object.keys(swapped).filter(key => key.startsWith('reps') && key !== 'repsPerSet'), []);
assert.strictEqual(swapped.swappedFromExerciseId, 'wrist-preparation');
assert.strictEqual(workouts.executableRounds(swapped).length, 3);

const swappedTwice = workouts.createSwapReplacement(swapped, catalog('wall-walk-preparation'), 'great');
assert.strictEqual(swappedTwice.id, 'wall-walk-preparation');
assert.strictEqual(swappedTwice.swappedFromExerciseId, 'wrist-preparation');
assert.strictEqual(swappedTwice.prescriptionType, 'reps');
assert.strictEqual(swappedTwice.secondsPerSet, null);
assert.strictEqual(swappedTwice.setCount, 3);
assert.strictEqual(swappedTwice.workoutExerciseId, original.workoutExerciseId);

assert.throws(
  () => workouts.createSwapReplacement(original, catalog('bodyweight-squat'), 'great'),
  /Invalid cross-progression swap/
);

const sameFamilyOriginal = workouts.normalizeExercise({
  ...catalog('wall-push-up'),
  workoutExerciseId: 'session-slot-horizontal-push-1',
  trackKey: 'horizontalPush',
  progressionTrackKey: 'horizontalPush'
});
const sameFamilySwap = workouts.createSwapReplacement(sameFamilyOriginal, catalog('high-incline-push-up'), 'great');
assert.strictEqual(sameFamilySwap.workoutExerciseId, sameFamilyOriginal.workoutExerciseId);
assert.strictEqual(sameFamilySwap.id, 'high-incline-push-up');
assert.strictEqual(sameFamilySwap.progressionTrackKey, 'horizontalPush');
const sameFamilyResult = workouts.exerciseResult(sameFamilySwap, [true, true, true], 'easy');
assert.strictEqual(sameFamilyResult.exerciseId, 'high-incline-push-up');
assert.strictEqual(sameFamilyResult.swappedFromExerciseId, 'wall-push-up');
assert.strictEqual(sameFamilyResult.progressionTrackKey, 'horizontalPush');

const nextWorkoutLevels = workouts.createDefaultLevels();
nextWorkoutLevels.horizontalPush.points = 4;
nextWorkoutLevels.horizontalPush.positiveExposures = 1;
workouts.applyExerciseResultToProgression(nextWorkoutLevels, sameFamilyResult);
assert.strictEqual(nextWorkoutLevels.horizontalPush.level, 1);
assert.strictEqual(nextWorkoutLevels.squat.level, 0);
const nextWorkout = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 0, levels: nextWorkoutLevels },
  profile: { goal: 'general', equipment: ['none'] }
});
const nextHorizontalPush = nextWorkout.exercises.find(item => item.progressionTrackKey === 'horizontalPush');
assert.ok(nextHorizontalPush);
assert.strictEqual(nextHorizontalPush.level, 2);

const crossTypeLevels = workouts.createDefaultLevels();
crossTypeLevels.handstand.points = 6;
crossTypeLevels.handstand.positiveExposures = 2;
const crossTypeResult = workouts.exerciseResult(swapped, [true, true, true], 'easy');
workouts.applyExerciseResultToProgression(crossTypeLevels, crossTypeResult);
assert.strictEqual(crossTypeResult.exerciseId, 'pike-hold');
assert.strictEqual(crossTypeResult.progressionTrackKey, 'handstand');
assert.strictEqual(crossTypeLevels.handstand.level, 1);
assert.strictEqual(crossTypeLevels.verticalPush.level, 0);

const partial = workouts.exerciseResult(swapped, [true, true, false], 'hard');
assert.strictEqual(partial.targetSets, 3);
assert.strictEqual(partial.completedSets, 2);
assert.deepStrictEqual(Array.from(partial.completedSetIndexes), [0, 1]);
assert.strictEqual(partial.completionStatus, 'partial');
assert.strictEqual(partial.exerciseId, 'pike-hold');
assert.strictEqual(partial.rating, 'hard');

const complete = workouts.exerciseResult(swapped, [true, true, true], 'good');
assert.strictEqual(complete.completedSets, 3);
assert.strictEqual(complete.completionStatus, 'completed');

function progressionScenario(flags, rating) {
  const levels = workouts.createDefaultLevels();
  const exercise = workouts.normalizeExercise({
    ...catalog('wall-push-up'),
    trackKey: 'horizontalPush',
    progressionTrackKey: 'horizontalPush'
  });
  const result = workouts.exerciseResult(exercise, flags, rating);
  const decision = workouts.applyExerciseResultToProgression(levels, result);
  return { decision, track: levels.horizontalPush };
}

const oneOfThreeEasy = progressionScenario([true, false, false], 'easy');
assert.deepStrictEqual({ ...oneOfThreeEasy.decision }, { applied: false, reason: 'positive-rating-requires-full-completion' });
assert.strictEqual(oneOfThreeEasy.track.points, 0);
assert.strictEqual(oneOfThreeEasy.track.positiveExposures, 0);

const twoOfThreeGood = progressionScenario([true, true, false], 'good');
assert.strictEqual(twoOfThreeGood.decision.applied, false);
assert.strictEqual(twoOfThreeGood.track.points, 0);
assert.strictEqual(twoOfThreeGood.track.positiveExposures, 0);

const twoOfThreeHard = progressionScenario([true, true, false], 'hard');
assert.deepStrictEqual({ ...twoOfThreeHard.decision }, { applied: true, reason: 'partial-difficulty-signal' });
assert.strictEqual(twoOfThreeHard.track.points, 0);
assert.strictEqual(twoOfThreeHard.track.difficultExposures, 1);

const threeOfThreeEasy = progressionScenario([true, true, true], 'easy');
assert.deepStrictEqual({ ...threeOfThreeEasy.decision }, { applied: true, reason: 'full-completion' });
assert.strictEqual(threeOfThreeEasy.track.points, 2);
assert.strictEqual(threeOfThreeEasy.track.positiveExposures, 1);

const zeroOfThree = progressionScenario([false, false, false], 'easy');
assert.deepStrictEqual({ ...zeroOfThree.decision }, { applied: false, reason: 'no-completed-sets-or-rating' });
assert.strictEqual(zeroOfThree.track.points, 0);
assert.strictEqual(workouts.shouldRecordWorkoutResults([workouts.exerciseResult(sameFamilySwap, [false, false, false], 'easy')]), false);
assert.strictEqual(workouts.shouldRecordWorkoutResults([workouts.exerciseResult(sameFamilySwap, [true, false, false], null)]), true);

const timerStart = 1_000_000;
const resumableTimer = workouts.createCountdownTimer({
  seconds: 20,
  prepSeconds: 3,
  trackKey: 'pike-instance',
  setIndex: 1,
  completeOnFinish: true
}, timerStart);
assert.deepStrictEqual(
  { ...workouts.countdownTimerSnapshot(resumableTimer, timerStart) },
  { phase: 'prep', prepSeconds: 3, remainingSeconds: 20, finished: false }
);
assert.strictEqual(workouts.countdownTimerSnapshot(resumableTimer, timerStart + 13_000).remainingSeconds, 10);
assert.strictEqual(workouts.timerShouldCompleteSet(resumableTimer, timerStart + 22_999), false);
assert.strictEqual(workouts.timerShouldCompleteSet(resumableTimer, timerStart + 23_000), true);

const persistedTimer = workouts.sanitizeCountdownTimer(JSON.parse(JSON.stringify(resumableTimer)));
assert.strictEqual(workouts.countdownTimerSnapshot(persistedTimer, timerStart + 8_000).remainingSeconds, 15);
assert.strictEqual(workouts.timerShouldCompleteSet(persistedTimer, timerStart + 8_000), false);
// Closing/cancelling discards the timer; no set-completion decision can be true.
assert.strictEqual(workouts.timerShouldCompleteSet(null, timerStart + 23_000), false);

const repFlags = workouts.updateSetCompletion([], 0, 3, true);
assert.deepStrictEqual(Array.from(repFlags), [true, false, false]);
const correctedRepFlags = workouts.updateSetCompletion(repFlags, 0, 3, false);
assert.deepStrictEqual(Array.from(correctedRepFlags), [false, false, false]);
const ratingWithoutCompletion = workouts.exerciseResult(sameFamilySwap, correctedRepFlags, 'easy');
assert.strictEqual(ratingWithoutCompletion.completedSets, 0);
assert.strictEqual(workouts.applyExerciseResultToProgression(workouts.createDefaultLevels(), ratingWithoutCompletion).applied, false);

const attempts = catalog('full-lsit-attempts');
assert.strictEqual(attempts.prescription, '5 × 1 attempt');
assert.strictEqual(attempts.setCount, 5);
assert.strictEqual(workouts.executableRounds(attempts).length, 5);

const fullMuscleUp = catalog('full-muscle-up');
assert.ok(fullMuscleUp);
assert.strictEqual(workouts.exerciseCatalog.filter(item => item.id === 'full-muscle-up').length, 1);
assert.strictEqual(workouts.movementTracks.muscleupFull[workouts.movementTracks.muscleupFull.length - 1].id, 'full-muscle-up');
assert.ok(fullMuscleUp.instructions.successCriteria.some(value => /without jumping, band assistance, or foot assistance/i.test(value)));
const muscleHelp = workouts.getExerciseHelp('full-muscle-up');
assert.ok(muscleHelp.successCriteria.length);
assert.ok(muscleHelp.movement.length >= 6);

const lockedReadiness = workouts.evaluateAdvancedSkillEligibility('full-muscle-up', {
  profile: { goal: 'muscleup', equipment: ['pullupBar'] },
  state: { levels: workouts.createDefaultLevels(), history: [] }
});
assert.strictEqual(lockedReadiness.eligible, false);
assert.strictEqual(lockedReadiness.state, 'locked');
assert.ok(lockedReadiness.checks.some(check => !check.met));
assert.ok(!lockedReadiness.checks.some(check => check.key.startsWith('pending:') || check.key === 'visual'));
assert.strictEqual(workouts.evaluateAdvancedSkillEligibility('full-muscle-up', { config: null }).eligible, false);

const readyState = { levels: workouts.createDefaultLevels(), history: [{ exercises: [
  { exerciseId: 'slow-negative-muscle-up', progressionTrackKey: 'muscleupTransition', completionStatus: 'completed' },
  { exerciseId: 'slow-negative-muscle-up', progressionTrackKey: 'muscleupTransition', completionStatus: 'completed' }
] }] };
readyState.levels.verticalPull.level = 9;
readyState.levels.dipStrength.level = 8;
readyState.levels.muscleupTransition.level = 4;
readyState.levels.muscleupTransition.positiveExposures = 3;
readyState.levels.muscleupPower.level = 3;
readyState.levels.muscleupPower.positiveExposures = 3;
const readyResult = workouts.evaluateAdvancedSkillEligibility('full-muscle-up', { profile: { goal: 'muscleup', equipment: ['pullupBar'] }, state: readyState });
assert.strictEqual(readyResult.eligible, true);
workouts.applyRating(readyState.levels, 'muscleupTransition', 'easy');
assert.strictEqual(readyState.levels.muscleupTransition.level, 4);
assert.ok(readyState.levels.muscleupTransition.positiveExposures >= 3);
assert.strictEqual(workouts.evaluateAdvancedSkillEligibility('full-muscle-up', { profile: { goal: 'muscleup', equipment: ['pullupBar'] }, state: readyState }).eligible, true);
const eligibleFullSwap = workouts.createSwapReplacement(
  workouts.normalizeExercise({ ...catalog('full-muscle-up-attempt'), trackKey: 'muscleupFull', progressionTrackKey: 'muscleupFull' }),
  fullMuscleUp, 'great', null,
  { profile: { goal: 'muscleup', equipment: ['pullupBar'] }, state: readyState }
);
assert.strictEqual(eligibleFullSwap.id, 'full-muscle-up');
assert.strictEqual(workouts.evaluateAdvancedSkillEligibility('full-muscle-up', { profile: { goal: 'pullup', equipment: ['pullupBar'] }, state: readyState }).eligible, false);
assert.strictEqual(workouts.evaluateAdvancedSkillEligibility('full-muscle-up', { profile: { goal: 'muscleup', equipment: ['pullupBar'] }, state: { ...readyState, recovery: { area: 'shoulder', mode: 'rest' } } }).eligible, false);
assert.ok(workouts.validateEligibilityConfig({ impossible: { status: 'configured', requirements: [{ trackKey: 'muscleupPower', minLevel: 99 }] } }).some(error => /exceeds/.test(error)));
assert.throws(() => workouts.createSwapReplacement(
  workouts.normalizeExercise({ ...catalog('full-muscle-up-attempt'), trackKey: 'muscleupFull', progressionTrackKey: 'muscleupFull' }),
  fullMuscleUp,
  'great', null,
  { profile: { goal: 'muscleup', equipment: ['pullupBar'] }, state: { levels: workouts.createDefaultLevels(), history: [] } }
), /not eligible for generation/);
const assistedResult = workouts.exerciseResult(workouts.normalizeExercise({ ...catalog('assisted-muscle-up'), trackKey: 'muscleupFull', progressionTrackKey: 'muscleupFull' }), [true, true, true, true, true], 'easy');
assert.strictEqual(assistedResult.exerciseId, 'assisted-muscle-up');
assert.notStrictEqual(assistedResult.exerciseId, 'full-muscle-up');
const partialFull = workouts.exerciseResult(workouts.normalizeExercise({ ...fullMuscleUp, trackKey: 'muscleupFull', progressionTrackKey: 'muscleupFull' }), [true, false, false], 'easy');
assert.strictEqual(workouts.applyExerciseResultToProgression(workouts.createDefaultLevels(), partialFull).applied, false);
const fullResult = workouts.exerciseResult(workouts.normalizeExercise({ ...fullMuscleUp, trackKey: 'muscleupFull', progressionTrackKey: 'muscleupFull' }), [true, true, true], 'easy');
assert.strictEqual(fullResult.exerciseId, 'full-muscle-up');
assert.strictEqual(fullResult.progressionTrackKey, 'muscleupFull');

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const renderSource = fs.readFileSync(path.join(root, 'render.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workoutCssSource = fs.readFileSync(path.join(root, 'workout.css'), 'utf8');
assert.ok(appSource.includes("['Success looks like', distinctSuccess]"));
assert.ok(appSource.includes(".filter(([, values]) => Array.isArray(values) && values.some(Boolean))"));
assert.ok(indexSource.includes('exerciseHelpContent'));
assert.ok(appSource.includes('Number.isFinite(item.completedCount) && item.completedCount > 0'));
assert.ok(appSource.includes('exercises.some(exercise => !exercise.isAddOn)'));
assert.ok(appSource.includes("handstandPushup: 'Handstand push-up'"));
assert.ok(appSource.includes("pistolSquat: 'Pistol squat'"));
const focusLabelsSource = appSource.match(/const goalLabels = \{([\s\S]*?)\n\};/)?.[1] || '';
assert.ok(!/pistolSquat|handstandPushup/.test(focusLabelsSource));
assert.ok(!appSource.includes('21 * 86400000'));
assert.ok(appSource.includes('30 * 86400000'));
assert.ok(appSource.includes('acknowledgedUnlockIds'));
assert.ok(appSource.includes("returningSeenWorkoutId: ''"));
assert.ok(appSource.includes("goal === 'general' ? null : getGoalTrackKey(goal)"));
assert.ok(appSource.includes("const dotCount = goal === 'general' ? 0 : track.length"));
assert.ok(appSource.includes("item.type === 'custom' || item.customType"));
assert.ok(appSource.includes("Rest might help"));
assert.ok(renderSource.includes('Math.floor(currentElapsed(readActivityTimer()) / 60)'));
assert.ok(renderSource.includes("showCompletionScreen({ title: 'Well done!'"));
assert.ok(appSource.includes('getMasteringSkillProgress(key, item, exerciseTrack)'));
assert.ok(!appSource.includes("Number(item.level || 0) + 1"));
assert.ok(indexSource.includes('dynamicProgressCard'));
assert.ok(indexSource.includes('focusProgressDots'));
assert.ok(indexSource.includes('focusNextMilestone'));
assert.ok(indexSource.includes('authLoadingScreen'));
assert.ok(indexSource.includes('activity-summary-line focus-next-milestone'));
assert.strictEqual((indexSource.match(/id="onboardingConfirmation"/g) || []).length, 1);
assert.ok(indexSource.includes("<h2>You're set.</h2>"));
assert.ok(indexSource.includes("Choose today's energy to generate a workout."));
assert.ok(indexSource.includes('class="today-recovery-modal hidden"'));
assert.ok(appSource.includes('if (!authResolved)'));
assert.ok(appSource.includes("querySelectorAll('.welcome-star')"));
assert.ok(appSource.includes('state.current.sessionId !== renderedWorkoutSessionId'), 'new workout sessions reset the scroll owner');
assert.ok(appSource.includes('class="preview-icon-btn preview-swap-btn swap-unavailable-btn"'), 'preview reserves disabled Swap position');
assert.ok(appSource.includes('class="preview-icon-btn preview-swap-btn active-swap-btn swap-unavailable-btn"'), 'active workout reserves disabled Swap position');
assert.ok(indexSource.includes('id="swapAvailabilityMessage"'));
assert.match(workoutCssSource, /html\.workout-active,\s*body\.workout-active\s*\{[\s\S]*?overflow:\s*hidden;/);
assert.match(workoutCssSource, /body\.workout-active \.app\s*\{[\s\S]*?padding:\s*0 0 env\(safe-area-inset-bottom\);[\s\S]*?overflow-y:\s*auto;/);
assert.match(workoutCssSource, /body\.workout-active #today\.active\s*\{[\s\S]*?flex:\s*0 0 auto;/);
assert.match(workoutCssSource, /#exerciseList\s*\{[\s\S]*?flex:\s*0 0 auto;/);
assert.ok(indexSource.includes('Mastering skills'));

assert.deepStrictEqual(Array.from(workouts.distinctSuccessCriteria(['Same sentence.'], ['same sentence!'])), []);

const stateStore = context.window.SomthingreatState.create({
  workoutModule: workouts,
  baseTracks: workouts.baseTracks,
  energyOptions: workouts.energyOptions,
  sanitizeWorkout: workouts.sanitizeWorkout,
  goalLabels: { pullup: 'Pull-up', general: 'General' },
  equipmentLabels: { none: 'None', floor: 'Floor' }
});
const state = stateStore.defaultState();
state.history.push({
  date: new Date().toISOString(),
  workout: 'Skills',
  mode: 'great',
  completedCount: 0,
  exercises: [partial]
});
const sanitized = stateStore.sanitizeState(state);
assert.ok(sanitized.levels.pistolSquat);
assert.ok(sanitized.levels.handstandPushup);
assert.deepStrictEqual(Array.from(sanitized.progressInsights.acknowledgedUnlockIds), []);
assert.strictEqual(sanitized.progressInsights.returningSeenWorkoutId, '');
assert.strictEqual(sanitized.restAdvice.acknowledgedSequenceKey, '');
assert.strictEqual(sanitized.history[0].exercises[0].completedSets, 2);
assert.strictEqual(sanitized.history[0].exercises[0].targetSets, 3);
assert.strictEqual(sanitized.history[0].exercises[0].exerciseId, 'pike-hold');
assert.strictEqual(sanitized.history[0].exercises[0].rating, 'hard');

const legacyRangeState = stateStore.defaultState();
legacyRangeState.history.push({
  date: new Date().toISOString(),
  workout: 'Push',
  mode: 'normal',
  completedCount: 3,
  exercises: [{ name: 'Medium incline push-up', prescription: legacyRangeLabel, targetSets: 3, completedSets: 3 }]
});
const sanitizedLegacyRange = stateStore.sanitizeState(legacyRangeState);
assert.deepStrictEqual(JSON.parse(JSON.stringify(sanitizedLegacyRange.history[0].exercises[0].prescriptionData)), { sets: 3, perSide: false, reps: 8 });
assert.strictEqual(sanitizedLegacyRange.history[0].exercises[0].prescription, '3 × 8');

const migratedPull = stateStore.sanitizeState({ ...stateStore.defaultState(), schemaVersion: 3, rotationIndex: 1 });
const migratedLegs = stateStore.sanitizeState({ ...stateStore.defaultState(), schemaVersion: 3, rotationIndex: 2 });
assert.strictEqual(migratedPull.rotationIndex, 2);
assert.strictEqual(migratedLegs.rotationIndex, 1);

const temporaryTodayState = stateStore.defaultState();
temporaryTodayState.selectedEnergy = 'great';
temporaryTodayState.generated = workouts.getTodayWorkout({ mode: 'great', state: temporaryTodayState, profile: null });
temporaryTodayState.includeWarmup = true;
temporaryTodayState.includeStretch = true;
temporaryTodayState.includeExerciseTimer = true;
temporaryTodayState.includeRestTimer = true;
const inMemoryTodayState = stateStore.saveState(temporaryTodayState);
const persistedTodayState = JSON.parse(storage.get(stateStore.storageKey));
assert.strictEqual(inMemoryTodayState.selectedEnergy, 'great');
assert.ok(inMemoryTodayState.generated);
assert.strictEqual(persistedTodayState.selectedEnergy, null);
assert.strictEqual(persistedTodayState.generated, null);
assert.strictEqual(persistedTodayState.includeWarmup, false);
assert.strictEqual(persistedTodayState.includeStretch, false);
assert.strictEqual(persistedTodayState.includeExerciseTimer, false);
assert.strictEqual(persistedTodayState.includeRestTimer, false);
assert.strictEqual(stateStore.loadState().selectedEnergy, null);

function resumableWorkout(sessionId, updatedAt, completedFlags = [true, false, false]) {
  const workout = workouts.getTodayWorkout({
    mode: 'normal',
    state: stateStore.defaultState(),
    profile: null
  });
  const first = workout.exercises[0];
  const trackKey = first.sessionKey || first.workoutExerciseId || `${first.trackKey}-0-${first.id}`;
  return {
    ...workout,
    sessionId,
    startedAt: '2026-07-24T08:00:00.000Z',
    updatedAt,
    lifecycleStatus: 'active',
    ratings: {},
    sets: { [trackKey]: completedFlags }
  };
}

function completedHistory(sessionId, date = '2026-07-24T09:00:00.000Z', status = 'completed') {
  return {
    sessionId,
    startedAt: '2026-07-24T08:00:00.000Z',
    date,
    workout: 'Lower Body',
    mode: 'normal',
    energy: 'normal',
    status,
    completedCount: status === 'completed' ? 3 : 1,
    exercises: [{
      exerciseId: 'bodyweight-squat',
      name: 'Bodyweight squat',
      prescription: '3 × 9',
      targetSets: 3,
      completedSets: status === 'completed' ? 3 : 1,
      completedSetIndexes: status === 'completed' ? [0, 1, 2] : [0],
      completionStatus: status === 'completed' ? 'completed' : 'partial',
      rating: 'good',
      trackKey: 'squat',
      progressionTrackKey: 'squat'
    }]
  };
}

const completedSessionId = 'session-full-completion';
const completedLocalState = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T09:00:01.000Z',
  history: [completedHistory(completedSessionId)],
  current: null,
  closedWorkoutSessionIds: [completedSessionId]
};
const staleCloudState = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T08:30:00.000Z',
  history: [],
  current: resumableWorkout(completedSessionId, '2026-07-24T08:30:00.000Z')
};
const reconciledCompletion = stateStore.reconcileStates(completedLocalState, staleCloudState);
assert.strictEqual(reconciledCompletion.current, null, 'completed workout must not reopen from stale cloud state');
assert.strictEqual(reconciledCompletion.history.length, 1, 'completed Activity record must survive restart');
assert.strictEqual(reconciledCompletion.history[0].sessionId, completedSessionId);
assert.ok(reconciledCompletion.closedWorkoutSessionIds.includes(completedSessionId));

const staleDelayedSave = stateStore.reconcileStates(reconciledCompletion, staleCloudState);
assert.strictEqual(staleDelayedSave.current, null, 'delayed active save must not downgrade a closed session');
assert.strictEqual(staleDelayedSave.history.length, 1, 'delayed active save must not remove history');

const interruptedSessionId = 'session-interrupted';
const olderInterruptedCloud = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T08:10:00.000Z',
  current: resumableWorkout(interruptedSessionId, '2026-07-24T08:10:00.000Z', [false, false, false])
};
const latestInterruptedLocal = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T08:20:00.000Z',
  current: resumableWorkout(interruptedSessionId, '2026-07-24T08:20:00.000Z', [true, false, false])
};
const reconciledInterruption = stateStore.reconcileStates(latestInterruptedLocal, olderInterruptedCloud);
assert.strictEqual(reconciledInterruption.current.sessionId, interruptedSessionId);
assert.strictEqual(reconciledInterruption.current.updatedAt, '2026-07-24T08:20:00.000Z');
assert.strictEqual(reconciledInterruption.history.length, 0, 'interrupted progress must not invent Activity history');

const dayTwoCloudRestore = {
  ...staleCloudState,
  lastUpdatedAt: '2026-07-25T06:00:00.000Z',
  current: resumableWorkout(completedSessionId, '2026-07-24T08:30:00.000Z')
};
const reconciledRollover = stateStore.reconcileStates(completedLocalState, dayTwoCloudRestore);
assert.strictEqual(reconciledRollover.current, null, 'date rollover must not reopen a completed session');
assert.strictEqual(reconciledRollover.history[0].date, '2026-07-24T09:00:00.000Z');

const partialSessionId = 'session-saved-partial';
const partialLocalState = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T10:00:00.000Z',
  history: [completedHistory(partialSessionId, '2026-07-24T10:00:00.000Z', 'saved_partial')],
  current: null,
  closedWorkoutSessionIds: [partialSessionId]
};
const partialStaleCloud = {
  ...stateStore.defaultState(),
  lastUpdatedAt: '2026-07-24T09:55:00.000Z',
  current: resumableWorkout(partialSessionId, '2026-07-24T09:55:00.000Z')
};
const reconciledPartial = stateStore.reconcileStates(partialLocalState, partialStaleCloud);
assert.strictEqual(reconciledPartial.current, null, 'saved partial workout must not reopen');
assert.strictEqual(reconciledPartial.history[0].status, 'saved_partial');
assert.strictEqual(reconciledPartial.history.length, 1, 'saved partial history must not duplicate');

console.log(`Validated ${workouts.exerciseCatalog.length} exercises and workout lifecycle regression cases.`);
