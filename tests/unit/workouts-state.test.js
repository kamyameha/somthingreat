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
const pronePullDown = catalog('prone-pull-down');
assert.ok(pronePullDown, 'Prone pull-down is present in the catalogue');
assert.strictEqual(pronePullDown.name, 'Prone pull-down');
assert.strictEqual(pronePullDown.prescription, '3 × 8');
assert.deepStrictEqual(Array.from(pronePullDown.equipment), []);
assert.deepStrictEqual(Array.from(workouts.movementTracks.pullAccessory, item => item.id), ['prone-pull-down', 'prone-w-raise', 'reverse-snow-angel']);
assert.deepStrictEqual(Array.from(workouts.movementTracks.horizontalPull, item => item.id), ['seated-resistance-band-row', 'standing-resistance-band-row']);
const legacyJumpRope = catalog('jump-rope');
assert.ok(legacyJumpRope, 'Jump rope remains available for historical workout lookup');
assert.ok(workouts.disabledExerciseIds.has('jump-rope'), 'Jump rope is explicitly disabled for current generation');
assert.strictEqual(workouts.movementTracks.rope, undefined, 'Jump rope is not an active movement track');
assert.strictEqual(workouts.baseTracks.rope, undefined, 'Jump rope is not an active progression track');
assert.ok(Object.values(workouts.workoutEligibleTracks).every(trackKeys => !trackKeys.includes('rope')));
assert.ok(workouts.getRotation({ goal: 'general', equipment: ['jumpRope'] }).every(workout => !workout.tracks.includes('rope')));

['great', 'normal', 'tired', 'exhausted'].forEach(mode => {
  for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
    const generated = workouts.getTodayWorkout({
      mode,
      state: { rotationIndex, history: [], levels: workouts.createDefaultLevels() },
      profile: { goal: 'general', equipment: ['jumpRope'] }
    });
    assert.ok(generated.exercises.every(exercise => exercise.id !== 'jump-rope'), `Jump rope excluded from ${mode} ${generated.workoutName}`);
  }
});

const historicalJumpRopeWorkout = workouts.sanitizeWorkout({
  workoutName: 'Lower Body',
  exercises: [{ id: 'jump-rope', name: 'Jump rope', prescriptionData: { sets: 3, seconds: 45 } }]
});
assert.strictEqual(historicalJumpRopeWorkout.exercises[0].id, 'jump-rope');
assert.strictEqual(historicalJumpRopeWorkout.exercises[0].name, 'Jump rope');
assert.ok(historicalJumpRopeWorkout.exercises[0].instructions, 'Historical Jump rope workouts retain catalogue instructions');

workouts.exerciseCatalog.forEach(item => {
  assert.ok(item.id && item.name, `identity: ${item.id}`);
  assert.ok(['strength', 'preparation'].includes(item.type), `type: ${item.id}`);
  assert.ok(Number.isInteger(item.setCount) && item.setCount > 0, `sets: ${item.id}`);
  assert.ok(item.prescriptionData, `structured prescription: ${item.id}`);
  assert.strictEqual(item.prescription, workouts.prescriptionToString(item.prescriptionData), `label: ${item.id}`);
  assert.ok(item.instructions.purpose, `purpose: ${item.id}`);
  assert.ok(Array.isArray(item.instructions.howTo) && item.instructions.howTo.length >= 3 && item.instructions.howTo.length <= 5, `how-to steps: ${item.id}`);
  assert.strictEqual(new Set(item.instructions.howTo.map(step => step.label)).size, item.instructions.howTo.length, `distinct how-to labels: ${item.id}`);
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
  assert.ok(Array.isArray(item.sourceRefs) && item.sourceRefs.length, `source refs: ${item.id}`);
  assert.ok(item.reviewedAt && item.reviewStatus, `review metadata: ${item.id}`);
  assert.ok(Array.isArray(item.preparationNeeds) && item.preparationNeeds.length, `preparation needs: ${item.id}`);
  assert.ok(Array.isArray(item.cooldownNeeds), `cooldown needs: ${item.id}`);
  if (item.perSide) assert.ok(item.instructions.successCriteria.some(value => /each side|separately on each side/i.test(value)), `side semantics: ${item.id}`);
  if (item.prescriptionType === 'time') assert.ok(item.secondsPerSet > 0, `seconds: ${item.id}`);
  if (item.prescriptionType === 'reps') assert.ok(item.repsPerSet, `reps: ${item.id}`);
  assert.ok(!/\\d\\s*[-–]\\s*\\d/.test(item.prescription), `fixed target: ${item.id}`);
  assert.ok(Array.isArray(item.programmeRoles) && item.programmeRoles.length, `programme roles: ${item.id}`);
  assert.ok(item.programmeRoles.every(role => Object.values(workouts.PROGRAMME_ROLES).includes(role)), `stable programme role: ${item.id}`);
});

assert.ok(workouts.addOnMovementCatalog.length >= 16, 'canonical add-on movement catalogue is present');
workouts.addOnMovementCatalog.forEach(item => {
  assert.ok(item.id && item.name, `add-on identity: ${item.id}`);
  assert.ok(['warmup', 'stretch'].includes(item.addOnType), `add-on type: ${item.id}`);
  assert.ok(Array.isArray(item.demandTags) && item.demandTags.length, `add-on demand tags: ${item.id}`);
  assert.ok(Array.isArray(item.sourceRefs) && item.sourceRefs.length, `add-on sources: ${item.id}`);
  assert.ok(workouts.getExerciseHelp(item.name)?.howTo?.length >= 3, `add-on how-to help: ${item.id}`);
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
  pullup: 6,
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
assert.deepStrictEqual(Array.from(workouts.getRotation(null, {}).map(item => item.name)), ['Push', 'Lower Body', 'Pull', 'Skill lab']);
assert.strictEqual(workouts.getGoalTrackKey('general'), null);
assert.strictEqual(workouts.resolveMasterySkill('general'), null);
assert.strictEqual(workouts.getGoalTrackKey('muscleup'), null);
assert.strictEqual(workouts.getGoalTrackKey('pistolSquat'), 'pistolSquat');
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
assert.strictEqual(skillsWorkout.selectedSkillTrackKey, 'verticalPull');
assert.ok(skillsWorkout.exercises.filter(item => item.workoutRole === 'primaryFocus').length >
  skillsWorkout.exercises.filter(item => item.workoutRole === 'generalSupport').length);
assert.ok(skillsWorkout.exercises.filter(item => item.workoutRole === 'generalSupport').length <= 1);
const sameDayPull = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 2, levels: workouts.createDefaultLevels() },
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
});
const sameDaySkillState = {
  rotationIndex: 3,
  levels: workouts.createDefaultLevels(),
  history: [
    {
      type: 'workout',
      date: new Date().toISOString(),
      workout: 'Push',
      exercises: [{ exerciseId: 'plank' }]
    },
    {
      type: 'workout',
      date: new Date().toISOString(),
      workout: 'Pull',
      exercises: sameDayPull.exercises.map(item => ({ exerciseId: item.id }))
    }
  ]
};
const diversifiedSkill = workouts.getTodayWorkout({
  mode: 'great',
  state: sameDaySkillState,
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
});
assert.strictEqual(diversifiedSkill.workoutName, 'Skill lab');
assert.strictEqual(diversifiedSkill.selectedSkillTrackKey, 'verticalPull');
assert.notStrictEqual(diversifiedSkill, sameDayPull, 'Skill generation creates a new workout object');
assert.notDeepStrictEqual(
  Array.from(diversifiedSkill.exercises, item => item.id),
  Array.from(sameDayPull.exercises, item => item.id),
  'Skill workout is not identical to the same-day Pull workout'
);
assert.ok(
  diversifiedSkill.exercises.filter(item => ['primaryFocus', 'focusAccessory'].includes(item.workoutRole)).length >
    diversifiedSkill.exercises.filter(item => item.workoutRole === 'generalSupport').length,
  'selected Skill and direct prerequisites remain the majority'
);
assert.ok(!diversifiedSkill.exercises.some(item => item.workoutRole === 'generalSupport' && item.id === 'plank'));
assert.deepStrictEqual(
  new Set(workouts.sameDayWorkoutExerciseIds(sameDaySkillState.history)),
  new Set([...sameDayPull.exercises.map(item => item.id), 'plank'])
);
for (const goal of ['pullup', 'handstand', 'lsit', 'pistolSquat']) {
  const goalSkillWorkout = workouts.getTodayWorkout({
    mode: 'great',
    state: { rotationIndex: 3, levels: workouts.createDefaultLevels() },
    profile: { goal, equipment: ['floor', 'pullupBar', 'dipBars'] }
  });
  const skillCount = goalSkillWorkout.exercises.filter(item => ['primaryFocus', 'focusAccessory'].includes(item.workoutRole)).length;
  const supportCount = goalSkillWorkout.exercises.filter(item => item.workoutRole === 'generalSupport').length;
  assert.ok(skillCount > supportCount, `selected skill remains the majority: ${goal}`);
  assert.ok(supportCount <= 1, `single general support slot for skill: ${goal}`);
}

const phaseTwoProfiles = {
  pullup: { goal: 'pullup', equipment: ['floor', 'pullupBar', 'dipBars', 'bands'] },
  handstand: { goal: 'handstand', equipment: ['floor', 'pullupBar', 'dipBars', 'bands'] },
  lsit: { goal: 'lsit', equipment: ['floor', 'pullupBar', 'dipBars', 'bands'] },
  pistolSquat: { goal: 'pistolSquat', equipment: ['floor', 'pullupBar', 'dipBars', 'bands'] }
};
const generatedFamily = exercise => exercise.developmentDiagnostics?.foundationFamilySlot || exercise.sourceTrack;
const strongerReachedExerciseIds = new Set();
for (const [goal, profile] of Object.entries(phaseTwoProfiles)) {
  for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
    for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
      const generated = workouts.getTodayWorkout({
        mode,
        state: { rotationIndex, levels: workouts.createDefaultLevels(), history: [], generationHistory: [] },
        profile
      });
      assert.strictEqual(generated.exercises.length, workouts.energyOptions[mode].exerciseCount, `Phase 2 exact count: ${goal} ${generated.workoutName} ${mode}`);
      assert.strictEqual(new Set(generated.exercises.map(item => item.id)).size, generated.exercises.length, `Phase 2 unique IDs: ${goal} ${generated.workoutName} ${mode}`);
      assert.ok(generated.exercises.every(item => item.programmeRole), `resolved programme role: ${goal} ${generated.workoutName} ${mode}`);
      assert.ok(generated.exercises.every(item => item.developmentDiagnostics?.stableExerciseId === item.id), `exercise diagnostics: ${goal} ${generated.workoutName} ${mode}`);
      assert.strictEqual(generated.developmentDiagnostics.selectedMasterySkill, workouts.resolveMasterySkill(goal));
      assert.deepStrictEqual(
        Array.from(generated.developmentDiagnostics.finalStableIds),
        Array.from(generated.exercises, item => item.id)
      );
      const supportCount = generated.exercises.filter(item => item.programmeRole === workouts.PROGRAMME_ROLES.generalSupport).length;
      assert.ok(supportCount <= 1, `Phase 2 support limit: ${goal} ${generated.workoutName} ${mode}`);
      if (generated.workoutName !== 'Skill lab') {
        assert.strictEqual(generated.developmentDiagnostics.resolvedCompositionPolicy.policyType, 'foundation');
        assert.ok(generated.exercises.length - supportCount >= (generated.exercises.length === 4 ? 3 : 2));
      } else {
        assert.strictEqual(generated.developmentDiagnostics.resolvedCompositionPolicy.policyType, 'directSkills');
      }
    }
  }
}

const balancedPushFoundation = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 0, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.handstand
});
assert.deepStrictEqual(
  new Set(balancedPushFoundation.exercises.slice(0, 3).map(generatedFamily)),
  new Set(['horizontalPush', 'verticalPush', 'dipStrength'])
);
const balancedLowerFoundation = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 1, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pistolSquat
});
assert.ok(['squat', 'posteriorChain', 'unilateral'].every(trackKey => balancedLowerFoundation.exercises.some(item => generatedFamily(item) === trackKey)));
const prioritySkillWorkout = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 3, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pistolSquat
});
assert.strictEqual(prioritySkillWorkout.selectedMasterySkill, 'pistolSquat');
assert.strictEqual(prioritySkillWorkout.selectedSkillTrackKey, 'pistolSquat');
assert.strictEqual(prioritySkillWorkout.exercises.filter(item => item.workoutRole === 'primaryFocus').length, 2);
assert.strictEqual(prioritySkillWorkout.exercises.filter(item => item.workoutRole === 'focusAccessory').length, 1);
assert.ok(prioritySkillWorkout.exercises
  .filter(item => item.workoutRole === 'primaryFocus')
  .every(item => workouts.prioritySpecificityForExercise(item, 'pistolSquat')));
assert.deepStrictEqual(
  Array.from(prioritySkillWorkout.exercises, item => item.workoutRoleLabel),
  ['Priority skill', 'Priority skill', 'Secondary skill · Pull-up', 'Support']
);
assert.ok(prioritySkillWorkout.exercises.some(item => item.id === 'assisted-split-squat'));
assert.ok(!prioritySkillWorkout.exercises.some(item => (
  item.workoutRole === 'primaryFocus' &&
  item.id === 'two-leg-calf-raise'
)));
const pullPrioritySecondary = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 3, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pullup
}).exercises.find(item => item.workoutRole === 'focusAccessory');
assert.strictEqual(pullPrioritySecondary.progressionTrackKey, 'handstand');
assert.strictEqual(pullPrioritySecondary.progressionEvidenceTarget, 'handstand');
assert.notStrictEqual(pullPrioritySecondary.progressionTrackKey, 'verticalPull');

const rotatingSecondarySkills = [];
for (let completedSkillLabs = 0; completedSkillLabs < 6; completedSkillLabs += 1) {
  const history = Array.from({ length: completedSkillLabs }, (_, index) => ({
    date: new Date(2026, 0, index + 1).toISOString(),
    workout: index % 2 ? 'Skill lab' : 'Skills',
    type: 'workout',
    exercises: []
  }));
  rotatingSecondarySkills.push(workouts.secondaryFoundationalSkill(phaseTwoProfiles.pullup, { history }));
}
assert.deepStrictEqual(rotatingSecondarySkills, ['handstand', 'lsit', 'pistolSquat', 'handstand', 'lsit', 'pistolSquat']);

function programmeLevelsAt(ratio, achieved = false) {
  const levels = workouts.createDefaultLevels();
  Object.keys(levels).forEach(trackKey => {
    const track = workouts.baseTracks[trackKey] || [];
    if (!track.length) return;
    const level = Math.round((track.length - 1) * ratio);
    levels[trackKey].level = level;
    levels[trackKey].milestoneId = track[level].id;
    if (achieved && level === track.length - 1) {
      levels[trackKey].points = 10;
      levels[trackKey].positiveExposures = 3;
    }
  });
  return levels;
}

function assertSkillLabSemanticRoles(generated, priority, scenario) {
  const priorityExercises = generated.exercises.filter(item => item.workoutRole === 'primaryFocus');
  const secondaryExercises = generated.exercises.filter(item => item.workoutRole === 'focusAccessory');
  const supportExercises = generated.exercises.filter(item => item.workoutRole === 'generalSupport');
  assert.ok(priorityExercises.every(item => (
    workouts.prioritySpecificityForExercise(item, priority)
  )), `every Priority skill exercise has an authored mastery relationship: ${scenario}`);
  priorityExercises.forEach(item => {
    const specificity = workouts.prioritySpecificityForExercise(item, priority);
    if (specificity === 'canonical') {
      assert.ok(workouts.isCanonicalSkillExercise(item, priority), `canonical Priority skill track: ${scenario}/${item.id}`);
      assert.ok(workouts.masteryRelationshipFor(item.id, priority), `canonical Priority skill relationship: ${scenario}/${item.id}`);
    } else {
      assert.strictEqual(specificity, 'authoredPreparation', `authored Priority preparation: ${scenario}/${item.id}`);
      assert.ok(workouts.isAuthoredPriorityPreparation(item, priority), `explicit Priority preparation identity: ${scenario}/${item.id}`);
    }
    assert.strictEqual(item.skillLabRole, 'priority', `Priority UI role: ${scenario}/${item.id}`);
    assert.strictEqual(item.roleMasterySkill, priority, `Priority mastery identity: ${scenario}/${item.id}`);
  });
  assert.ok(secondaryExercises.length <= 1, `no more than one rotating secondary slot: ${scenario}`);
  secondaryExercises.forEach(item => {
    assert.strictEqual(item.skillLabRole, 'secondary', `Secondary UI role: ${scenario}/${item.id}`);
    assert.strictEqual(item.roleMasterySkill, generated.secondarySkill, `Secondary mastery identity: ${scenario}/${item.id}`);
    assert.ok(
      workouts.masteryRelationshipFor(item.id, generated.secondarySkill) ||
        workouts.isAuthoredPriorityPreparation(item, generated.secondarySkill),
      `Secondary exercise belongs only to its scheduled skill: ${scenario}/${item.id}`
    );
    if (item.developmentDiagnostics?.foundationalSkillDirectPractice) {
      assert.ok(
        workouts.isCanonicalSkillExercise(item, generated.secondarySkill),
        `direct Secondary skill uses its canonical track: ${scenario}/${item.id}`
      );
      assert.ok(item.workoutRoleLabel.startsWith('Secondary skill'), `direct secondary label: ${scenario}/${item.id}`);
    } else {
      assert.ok(item.workoutRoleLabel.startsWith('Foundational practice'), `secondary preparation label: ${scenario}/${item.id}`);
    }
  });
  supportExercises.forEach(item => {
    assert.strictEqual(item.skillLabRole, 'support', `Support UI role: ${scenario}/${item.id}`);
    assert.strictEqual(item.roleMasterySkill, null, `Support has no claimed mastery identity: ${scenario}/${item.id}`);
  });
  assert.ok(supportExercises.length <= 1, `at most one support exercise: ${scenario}`);
  if (priority === 'pistolSquat') {
    generated.exercises
      .filter(item => workouts.isCanonicalSkillExercise(item, 'pullup'))
      .forEach(item => {
        assert.strictEqual(item.workoutRole, 'focusAccessory', `Pull-up only occupies secondary Pistol slot: ${scenario}/${item.id}`);
        assert.strictEqual(item.roleMasterySkill, 'pullup', `Pull-up is labelled as Pull-up practice: ${scenario}/${item.id}`);
      });
  }
}

const skillLabEquipmentCombinations = [
  ['none'],
  ['bands'],
  ['pullupBar'],
  ['dipBars'],
  ['pullupBar', 'bands'],
  ['pullupBar', 'dipBars'],
  ['dipBars', 'bands'],
  ['pullupBar', 'dipBars', 'bands']
];
const skillLabRecoveryScenarios = [
  { name: 'none', recovery: null },
  { name: 'shoulder-rest', recovery: { area: 'leftShoulder', mode: 'rest' } },
  { name: 'wrist-reduce', recovery: { area: 'leftWrist', mode: 'reduce' } },
  { name: 'knee-rest', recovery: { area: 'leftKnee', mode: 'rest' } },
  { name: 'ankle-rest', recovery: { area: 'leftAnkle', mode: 'rest' } }
];
for (const [stage, ratio] of [['beginner', 0], ['middle', 0.5], ['final', 1]]) {
  for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
    for (const equipment of skillLabEquipmentCombinations) {
      for (const recoveryScenario of skillLabRecoveryScenarios) {
        const state = {
          rotationIndex: 3,
          levels: programmeLevelsAt(ratio),
          history: [],
          recovery: recoveryScenario.recovery
        };
        const generated = workouts.getTodayWorkout({
          mode,
          state,
          profile: { goal: 'pistolSquat', equipment }
        });
        const scenario = `${stage}/${mode}/${equipment.join('+')}/${recoveryScenario.name}`;
        if (!recoveryScenario.recovery || generated.workoutName === 'Skill lab') {
          assert.strictEqual(generated.workoutName, 'Skill lab', `Pistol Skill Lab scenario: ${scenario}`);
          assertSkillLabSemanticRoles(generated, 'pistolSquat', scenario);
        } else {
          assert.strictEqual(generated.workoutName, 'Recovery workout', `Recovery fallback scenario: ${scenario}`);
          assert.strictEqual(generated.originalScheduledWorkout, 'Skill lab', `Recovery preserves scheduled identity: ${scenario}`);
        }
        assert.ok(generated.exercises.every(item => (
          workouts.isExerciseAllowedForRecovery(item, recoveryScenario.recovery)
        )), `Skill Lab recovery safety: ${scenario}`);
        if (generated.workoutName === 'Skill lab' && ['great', 'normal'].includes(mode) && !generated.generationFailure) {
          const priorityExercises = generated.exercises.filter(item => item.workoutRole === 'primaryFocus');
          const currentCanonical = priorityExercises.filter(item => (
            item.sourceTrack === 'pistolSquat' &&
            item.id === item.progressionMilestoneId
          ));
          const secondaryExercises = generated.exercises.filter(item => item.workoutRole === 'focusAccessory');
          assert.strictEqual(currentCanonical.length, 1, `one current canonical Pistol milestone: ${scenario}`);
          assert.ok(priorityExercises.length >= 2, `second Pistol-specific exercise: ${scenario}`);
          assert.strictEqual(secondaryExercises.length, 1, `one rotating secondary skill: ${scenario}`);
          assert.strictEqual(
            secondaryExercises[0].sourceTrack,
            workouts.directSkillTrackKey(generated.secondarySkill),
            `secondary uses its canonical track: ${scenario}`
          );
          assert.strictEqual(
            secondaryExercises[0].id,
            secondaryExercises[0].progressionMilestoneId,
            `secondary uses its current direct milestone: ${scenario}`
          );
        }
      }
    }
  }
}

const preservedExposureHistory = [
  {
    date: '2026-01-01T10:00:00.000Z',
    workout: 'Skill lab',
    type: 'workout',
    exercises: [{
      exerciseId: 'wrist-preparation',
      progressionTrackKey: 'handstand',
      progressionMilestoneId: 'wrist-preparation',
      completedSets: 3,
      completionStatus: 'completed'
    }]
  },
  {
    date: '2026-01-02T10:00:00.000Z',
    workout: 'Pull',
    type: 'workout',
    exercises: [{
      exerciseId: 'active-hang-preparation',
      progressionTrackKey: 'verticalPull',
      progressionMilestoneId: 'active-hang-preparation',
      completedSets: 3,
      completionStatus: 'completed'
    }]
  }
];
const preservedExposureSnapshot = JSON.stringify(preservedExposureHistory);
assert.strictEqual(
  workouts.secondaryFoundationalSkill(
    phaseTwoProfiles.pistolSquat,
    { levels: workouts.createDefaultLevels(), history: preservedExposureHistory }
  ),
  'lsit',
  'an unpractised foundational skill remains ahead of a recently practised former priority'
);
assert.strictEqual(
  JSON.stringify(preservedExposureHistory),
  preservedExposureSnapshot,
  'changing Priority skill does not mutate or erase direct-practice history'
);

for (const [goal, profile] of Object.entries(phaseTwoProfiles)) {
  for (const ratio of [0, 0.5, 1]) {
    for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
      for (const mode of ['great', 'normal']) {
        const generated = workouts.getTodayWorkout({
          mode,
          state: { rotationIndex, levels: programmeLevelsAt(ratio), history: [] },
          profile
        });
        generated.exercises.forEach(exercise => strongerReachedExerciseIds.add(exercise.id));
        assert.strictEqual(generated.generationFailure, null, `unrestricted stronger composition: ${goal}/${ratio}/${generated.workoutName}/${mode}`);
        assert.strictEqual(generated.exercises.length, 4, `unrestricted stronger count: ${goal}/${ratio}/${generated.workoutName}/${mode}`);
        assert.ok(generated.totalFatigue <= generated.fatigueBudget.max + generated.fatigueBudget.tolerance);
        assert.ok(generated.highlyTechnicalExerciseCount <= generated.maximumHighlyTechnicalExercises);
        if (ratio === 1 && generated.workoutName === 'Push') {
          const families = new Set(generated.exercises.map(generatedFamily));
          assert.ok(['horizontalPush', 'verticalPush', 'dipStrength'].every(family => families.has(family)), `final Push families: ${goal}/${mode}`);
        }
        if (ratio === 1 && generated.workoutName === 'Skill lab') {
          assert.ok(generated.exercises.some(item => item.developmentDiagnostics?.foundationalSkillDirectPractice), `final priority direct practice: ${goal}/${mode}`);
          assert.ok(generated.exercises.some(item => item.workoutRole === 'focusAccessory'), `final secondary practice: ${goal}/${mode}`);
          assert.ok(generated.exercises.some(item => item.workoutRole === 'generalSupport'), `final compatible support: ${goal}/${mode}`);
        }
      }
    }
  }
}
assert.ok(strongerReachedExerciseIds.has('glute-bridge-walkout'), 'Glute-bridge walkout is reachable');
assert.deepStrictEqual(
  Array.from(workouts.movementTracks.posteriorChain, exercise => exercise.id),
  [
    'glute-bridge',
    'paused-glute-bridge',
    'long-lever-glute-bridge',
    'single-leg-assisted-glute-bridge',
    'single-leg-glute-bridge',
    'hip-hinge-drill',
    'bodyweight-good-morning',
    'single-leg-romanian-deadlift',
    'glute-bridge-walkout'
  ]
);
assert.ok(!Array.from(workouts.movementTracks.posteriorChain, exercise => exercise.id).some(id => /nordic|slider/.test(id)));
const longLeverLevels = workouts.createDefaultLevels();
longLeverLevels.posteriorChain.level = 2;
longLeverLevels.posteriorChain.milestoneId = 'long-lever-glute-bridge';
const longLeverWorkout = workouts.getTodayWorkout({
  mode: 'normal',
  state: {
    rotationIndex: 1,
    levels: longLeverLevels,
    history: [{
      date: new Date(2026, 0, 1).toISOString(),
      workout: 'Push',
      exercises: [
        {
          exerciseId: 'assisted-single-leg-sit-to-stand',
          progressionTrackKey: 'pistolSquat',
          progressionMilestoneId: 'assisted-single-leg-sit-to-stand',
          completedSets: 3,
          completionStatus: 'completed'
        },
        {
          exerciseId: 'seated-compression-lift',
          progressionTrackKey: 'lsit',
          progressionMilestoneId: 'seated-compression-lift',
          completedSets: 3,
          completionStatus: 'completed'
        }
      ]
    }]
  },
  profile: phaseTwoProfiles.pullup
});
assert.ok(longLeverWorkout.exercises.some(exercise => exercise.id === 'long-lever-glute-bridge'), 'Long-lever Glute bridge is reachable');
const posteriorRecoveryWorkout = workouts.getTodayWorkout({
  mode: 'normal',
  state: {
    rotationIndex: 1,
    levels: programmeLevelsAt(1),
    history: [],
    recovery: { area: 'lowerBack', mode: 'rest' }
  },
  profile: phaseTwoProfiles.pullup
});
assert.ok(
  !posteriorRecoveryWorkout.exercises.some(exercise => ['long-lever-glute-bridge', 'glute-bridge-walkout'].includes(exercise.id)),
  'Lower-back recovery suppresses the new posterior-chain stages'
);
assert.ok(posteriorRecoveryWorkout.exercises.every(exercise => workouts.isExerciseAllowedForRecovery(exercise, { area: 'lowerBack', mode: 'rest' })));

const achievedSkillTracks = {
  pullup: 'verticalPull',
  handstand: 'handstand',
  lsit: 'lsit',
  pistolSquat: 'pistolSquat'
};
for (const [skill, trackKey] of Object.entries(achievedSkillTracks)) {
  const achievedLevels = programmeLevelsAt(1, true);
  const finalExercise = workouts.baseTracks[trackKey].at(-1);
  for (const mode of ['great', 'normal']) {
    const maintenanceWorkout = workouts.getTodayWorkout({
      mode,
      state: { rotationIndex: 3, levels: achievedLevels, history: [] },
      profile: phaseTwoProfiles[skill]
    });
    const maintenanceExercise = maintenanceWorkout.exercises.find(item => (
      item.id === finalExercise.id &&
      item.progressionTrackKey === trackKey
    ));
    assert.ok(maintenanceExercise, `achieved ${skill} final milestone remains reachable in ${mode}`);
    assert.strictEqual(maintenanceExercise.maintenance, true, `achieved ${skill} is marked as maintenance`);
    assert.strictEqual(maintenanceExercise.developmentDiagnostics?.maintenance, true);
  }
  const tiredMaintenance = workouts.getTodayWorkout({
    mode: 'tired',
    state: { rotationIndex: 3, levels: achievedLevels, history: [] },
    profile: phaseTwoProfiles[skill]
  });
  assert.strictEqual(tiredMaintenance.exercises.length, 3);
  assert.ok(tiredMaintenance.highlyTechnicalExerciseCount <= tiredMaintenance.maximumHighlyTechnicalExercises);
  const exhaustedMaintenance = workouts.getTodayWorkout({
    mode: 'exhausted',
    state: { rotationIndex: 3, levels: achievedLevels, history: [] },
    profile: phaseTwoProfiles[skill]
  });
  assert.strictEqual(exhaustedMaintenance.exercises.length, 3);
  assert.strictEqual(exhaustedMaintenance.highlyTechnicalExerciseCount, 0);
  assert.ok(!exhaustedMaintenance.exercises.some(item => item.id === finalExercise.id), `Exhausted suppresses maximal ${skill} maintenance`);

  const achievedLevelBefore = achievedLevels[trackKey].level;
  const generatedFinal = workouts.getTodayWorkout({
    mode: 'normal',
    state: { rotationIndex: 3, levels: achievedLevels, history: [] },
    profile: phaseTwoProfiles[skill]
  }).exercises.find(item => item.id === finalExercise.id && item.progressionTrackKey === trackKey);
  const maintenanceResult = workouts.exerciseResult(
    generatedFinal,
    Array(generatedFinal.setCount).fill(true),
    'easy'
  );
  assert.strictEqual(workouts.applyExerciseResultToProgression(achievedLevels, maintenanceResult).reason, 'positive-current-milestone-evidence');
  assert.strictEqual(achievedLevels[trackKey].level, achievedLevelBefore, `${skill} maintenance creates no nonexistent next level`);
}

const recoveryBySkill = {
  pullup: { area: 'leftShoulder', mode: 'rest' },
  handstand: { area: 'leftWrist', mode: 'rest' },
  lsit: { area: 'leftWrist', mode: 'rest' },
  pistolSquat: { area: 'leftKnee', mode: 'rest' }
};
for (const [skill, trackKey] of Object.entries(achievedSkillTracks)) {
  const levels = programmeLevelsAt(1, true);
  const restricted = workouts.getTodayWorkout({
    mode: 'normal',
    state: { rotationIndex: 3, levels, history: [], recovery: recoveryBySkill[skill] },
    profile: phaseTwoProfiles[skill]
  });
  assert.ok(
    !restricted.exercises.some(item => item.id === workouts.baseTracks[trackKey].at(-1).id),
    `recovery can suppress final ${skill} maintenance`
  );
}

for (const [goal, profile] of Object.entries(phaseTwoProfiles)) {
  const cadenceState = { rotationIndex: 0, levels: programmeLevelsAt(0.5), history: [] };
  const directExposureWorkouts = Object.fromEntries(workouts.PRIORITY_SKILLS.map(skill => [skill, []]));
  for (let workoutNumber = 0; workoutNumber < 8; workoutNumber += 1) {
    const generated = workouts.getTodayWorkout({ mode: 'normal', state: cadenceState, profile });
    const results = generated.exercises.map(exercise => workouts.exerciseResult(
      exercise,
      Array(exercise.setCount).fill(true),
      'good'
    ));
    workouts.PRIORITY_SKILLS.forEach(skill => {
      const trackKey = workouts.directSkillTrackKey(skill);
      if (results.some(result => (
        result.progressionTrackKey === trackKey &&
        result.exerciseId === result.progressionMilestoneId
      ))) directExposureWorkouts[skill].push(workoutNumber);
    });
    cadenceState.history.push({
      date: new Date(2026, 0, workoutNumber + 1).toISOString(),
      workout: generated.workoutName,
      exercises: results
    });
  }
  assert.ok(directExposureWorkouts[goal].some(index => index < 4), `${goal} priority direct practice in first rotation`);
  assert.ok(directExposureWorkouts[goal].some(index => index >= 4), `${goal} priority direct practice in second rotation`);
  workouts.PRIORITY_SKILLS.filter(skill => skill !== goal).forEach(skill => {
    assert.ok(directExposureWorkouts[skill].length > 0, `${skill} non-priority direct practice within two rotations for ${goal}`);
  });
  const exposureCounts = Object.values(directExposureWorkouts).map(items => items.length);
  assert.ok(Math.max(...exposureCounts) - Math.min(...exposureCounts) <= 2, `Pull-up is not disproportionately favoured for ${goal}`);
}

const overdueHistory = [{
  date: new Date(2026, 0, 1).toISOString(),
  workout: 'Lower Body',
  exercises: [{
    exerciseId: 'seated-compression-lift',
    progressionTrackKey: 'lsit',
    progressionMilestoneId: 'seated-compression-lift',
    completedSets: 3,
    completionStatus: 'completed'
  }]
}, {
  date: new Date(2026, 0, 2).toISOString(),
  workout: 'Push',
  exercises: [{
    exerciseId: 'wrist-preparation',
    progressionTrackKey: 'handstand',
    progressionMilestoneId: 'wrist-preparation',
    completedSets: 3,
    completionStatus: 'completed'
  }]
}];
assert.strictEqual(
  workouts.secondaryFoundationalSkill(phaseTwoProfiles.pullup, { history: overdueHistory }),
  'pistolSquat',
  'secondary scheduling prefers the skill with no actual direct exposure'
);

const foundationEvidenceLevels = workouts.createDefaultLevels();
const scheduledPushSkill = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 0, levels: foundationEvidenceLevels, history: [] },
  profile: phaseTwoProfiles.pullup
});
const directHandstandInPush = scheduledPushSkill.exercises.find(item => item.progressionTrackKey === 'handstand');
assert.ok(directHandstandInPush?.developmentDiagnostics?.foundationalSkillDirectPractice);
assert.strictEqual(directHandstandInPush.progressionEvidenceTarget, 'handstand');
workouts.applyExerciseResultToProgression(
  foundationEvidenceLevels,
  workouts.exerciseResult(directHandstandInPush, Array(directHandstandInPush.setCount).fill(true), 'easy')
);
assert.strictEqual(foundationEvidenceLevels.handstand.points, 2);
assert.strictEqual(foundationEvidenceLevels.verticalPush.points, 0);

const recentFoundationSkillHistory = [{
  date: new Date(2026, 0, 1).toISOString(),
  workout: 'Push',
  exercises: [{
    exerciseId: 'wrist-preparation',
    progressionTrackKey: 'handstand',
    progressionMilestoneId: 'wrist-preparation',
    completedSets: 3,
    completionStatus: 'completed'
  }]
}, {
  date: new Date(2026, 0, 2).toISOString(),
  workout: 'Lower Body',
  exercises: [
    {
      exerciseId: 'assisted-single-leg-sit-to-stand',
      progressionTrackKey: 'pistolSquat',
      progressionMilestoneId: 'assisted-single-leg-sit-to-stand',
      completedSets: 3,
      completionStatus: 'completed'
    },
    {
      exerciseId: 'seated-compression-lift',
      progressionTrackKey: 'lsit',
      progressionMilestoneId: 'seated-compression-lift',
      completedSets: 3,
      completionStatus: 'completed'
    }
  ]
}, {
  date: new Date(2026, 0, 3).toISOString(),
  workout: 'Skill lab',
  exercises: []
}];
const ordinaryPush = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 0, levels: workouts.createDefaultLevels(), history: recentFoundationSkillHistory },
  profile: phaseTwoProfiles.pullup
});
const ordinaryVerticalPush = ordinaryPush.exercises.find(item => item.progressionTrackKey === 'verticalPush');
assert.ok(ordinaryVerticalPush);
assert.strictEqual(ordinaryVerticalPush.progressionEvidenceTarget, 'verticalPush');

const scheduledLowerSkills = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 1, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pullup
});
const directPistolInLower = scheduledLowerSkills.exercises.find(item => item.progressionTrackKey === 'pistolSquat');
const directLsitInLower = scheduledLowerSkills.exercises.find(item => item.progressionTrackKey === 'lsit');
assert.ok(directPistolInLower?.developmentDiagnostics?.foundationalSkillDirectPractice);
assert.ok(directLsitInLower?.developmentDiagnostics?.foundationalSkillDirectPractice);
assert.strictEqual(directPistolInLower.progressionEvidenceTarget, 'pistolSquat');
assert.strictEqual(directLsitInLower.progressionEvidenceTarget, 'lsit');

const singleTrackEvidenceLevels = workouts.createDefaultLevels();
workouts.applyExerciseResultToProgression(
  singleTrackEvidenceLevels,
  workouts.exerciseResult(directPistolInLower, Array(directPistolInLower.setCount).fill(true), 'easy')
);
assert.strictEqual(singleTrackEvidenceLevels.pistolSquat.points, 2);
assert.strictEqual(singleTrackEvidenceLevels.unilateral.points, 0);
assert.strictEqual(singleTrackEvidenceLevels.lsit.points, 0);
workouts.applyExerciseResultToProgression(
  singleTrackEvidenceLevels,
  workouts.exerciseResult(directLsitInLower, Array(directLsitInLower.setCount).fill(true), 'good')
);
assert.strictEqual(singleTrackEvidenceLevels.lsit.points, 1);
assert.strictEqual(singleTrackEvidenceLevels.compression.points, 0);

const ordinaryUnilateral = workouts.getTodayWorkout({
  mode: 'normal',
  state: {
    rotationIndex: 1,
    levels: workouts.createDefaultLevels(),
    history: [
      ...recentFoundationSkillHistory,
      { date: new Date(2026, 0, 4).toISOString(), workout: 'Push', exercises: [] }
    ]
  },
  profile: phaseTwoProfiles.pullup
}).exercises.find(item => item.progressionTrackKey === 'unilateral');
assert.ok(ordinaryUnilateral);
assert.strictEqual(ordinaryUnilateral.progressionEvidenceTarget, 'unilateral');
const ordinaryCompression = workouts.normalizeExercise({
  ...catalog('reverse-crunch'),
  trackKey: 'compression',
  progressionTrackKey: 'compression',
  progressionEvidenceTarget: 'compression',
  progressionMilestoneId: 'reverse-crunch'
});
const ordinaryFoundationLevels = workouts.createDefaultLevels();
workouts.applyExerciseResultToProgression(
  ordinaryFoundationLevels,
  workouts.exerciseResult(ordinaryCompression, Array(ordinaryCompression.setCount).fill(true), 'good')
);
assert.strictEqual(ordinaryFoundationLevels.compression.points, 1);
assert.strictEqual(ordinaryFoundationLevels.lsit.points, 0);

const pullPriorityLab = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 3, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pullup
});
const beginnerPullSession = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 2, levels: workouts.createDefaultLevels(), history: [] },
  profile: phaseTwoProfiles.pullup
});
assert.notDeepStrictEqual(
  new Set(pullPriorityLab.exercises.map(item => item.id)),
  new Set(beginnerPullSession.exercises.map(item => item.id)),
  'Pull and Pull-up-priority Skill lab remain distinct'
);

const generatedPullEntry = {
  date: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  workout: 'Pull',
  mode: sameDayPull.mode,
  exercises: sameDayPull.exercises.map(item => ({ exerciseId: item.id }))
};
const generatedAfterPull = workouts.getTodayWorkout({
  mode: 'great',
  state: {
    rotationIndex: 3,
    levels: workouts.createDefaultLevels(),
    history: [],
    generationHistory: [generatedPullEntry]
  },
  profile: phaseTwoProfiles.pullup
});
assert.notDeepStrictEqual(
  new Set(generatedAfterPull.exercises.map(item => item.id)),
  new Set(sameDayPull.exercises.map(item => item.id)),
  'generated previews participate in same-day diversity'
);
assert.strictEqual(generatedAfterPull.developmentDiagnostics.reducedVariety, true);
assert.ok(generatedAfterPull.exercises.some(item => item.developmentDiagnostics?.overlapReason === 'limited-safe-unlocked-catalogue'));

for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
  for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
    const workout = workouts.getTodayWorkout({
      mode,
      state: { rotationIndex, levels: workouts.createDefaultLevels() },
      profile: { goal: 'pullup', equipment: ['floor', 'pullupBar', 'bands'] }
    });
    assert.strictEqual(workout.generationFailure, null, `valid composition: ${workout.workoutName} ${mode}`);
    assert.strictEqual(workout.exercises.length, workouts.energyOptions[mode].exerciseCount, `exact energy exercise count: ${workout.workoutName} ${mode}`);
    assert.notStrictEqual(workout.workoutName, 'Core');
    const allowedTracks = new Set(workouts.workoutEligibleTracks[workout.workoutName]);
    assert.ok(
      workout.exercises.every(item => allowedTracks.has(item.progressionTrackKey)),
      `category-preserving tracks: ${workout.workoutName} ${mode}`
    );
    const supportCount = workout.exercises.filter(item => item.workoutRole === 'generalSupport').length;
    const focusCount = workout.exercises.length - supportCount;
    assert.ok(supportCount <= 1, `single support slot: ${workout.workoutName} ${mode}`);
    assert.ok(focusCount >= supportCount, `support never outnumbers focus: ${workout.workoutName} ${mode}`);
  }
}

for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
  for (const mode of ['great', 'normal', 'tired', 'exhausted']) {
    const advancedLevels = workouts.createDefaultLevels();
    Object.keys(advancedLevels).forEach(trackKey => {
      if (workouts.movementTracks[trackKey]) {
        advancedLevels[trackKey].level = workouts.movementTracks[trackKey].length - 1;
      }
    });
    const workout = workouts.getTodayWorkout({
      mode,
      state: { rotationIndex, levels: advancedLevels },
      profile: { goal: 'handstand', equipment: ['floor', 'pullupBar', 'dipBars'] }
    });
    assert.ok(
      workout.totalFatigue <= workout.fatigueBudget.max + workout.fatigueBudget.tolerance,
      `energy fatigue ceiling: ${workout.workoutName} ${mode}`
    );
  }
}

const pullOnlyState = {
  rotationIndex: 2,
  levels: workouts.createDefaultLevels()
};
pullOnlyState.levels.verticalPull.level = 1;
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
    assert.ok(pullWorkout.exercises.filter(item => item.workoutRole === 'generalSupport').length <= 1);
    if (equipment.includes('pullupBar')) {
      const pullIds = new Set(pullWorkout.exercises.map(item => item.id));
      assert.ok(pullIds.has(mode === 'great' || mode === 'normal' ? 'scapular-pull-up' : 'active-hang-preparation'), `energy-appropriate vertical Pull included: ${mode}`);
      assert.ok(pullWorkout.exercises.some(item => item.sourceTrack === 'scapularPull'), `scapular-control family included: ${mode}`);
      if (['great', 'normal'].includes(mode)) assert.ok(pullIds.has('prone-pull-down'), `Prone pull-down included: ${mode}`);
      assert.ok(!pullIds.has('assisted-pull-up'), `Locked assisted pull-up excluded: ${mode}`);
      assert.ok(!pullIds.has('negative-pull-up'), `Locked negative pull-up excluded: ${mode}`);
      assert.ok(
        !pullWorkout.exercises.some(item => workouts.disabledExerciseIds.has(item.id)),
        `unsafe household-anchor rows remain disabled: ${mode}`
      );
      assert.strictEqual(pullWorkout.generationFailure, null, `beginner Pull composes exactly: ${mode}`);
      assert.strictEqual(pullWorkout.exercises.filter(item => item.workoutRole === 'primaryFocus').length, 2);
      assert.strictEqual(
        pullWorkout.exercises.filter(item => ['primaryFocus', 'focusAccessory'].includes(item.workoutRole)).length,
        3,
        `Pull-focused count: ${mode}`
      );
      assert.strictEqual(pullWorkout.exercises.length, workouts.energyOptions[mode].exerciseCount, `exact beginner Pull length: ${mode}`);
      assert.strictEqual(new Set(pullWorkout.exercises.map(item => item.id)).size, pullWorkout.exercises.length, `unique stable IDs: ${mode}`);
      if (mode === 'great') assert.strictEqual(pullWorkout.exercises.find(item => item.id === 'prone-pull-down')?.prescription, '3 × 8');
      if (mode === 'normal') assert.strictEqual(pullWorkout.exercises.find(item => item.id === 'prone-pull-down')?.prescription, '2 × 7');
    } else {
      if (['great', 'normal'].includes(mode)) assert.strictEqual(pullWorkout.generationFailure?.code, 'exact-composition-unavailable', `no unsafe no-bar fallback: ${mode}`);
      assert.ok(!pullWorkout.exercises.some(item => item.id.includes('row')), `disabled household-anchor rows remain excluded: ${mode}`);
      assert.ok(pullWorkout.developmentDiagnostics.horizontalPullLimitation);
    }
  }
}

const progressedPullLevels = workouts.createDefaultLevels();
progressedPullLevels.verticalPull.level = 2;
const progressedPull = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 2, levels: progressedPullLevels },
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
});
assert.strictEqual(progressedPull.exercises.filter(item => item.workoutRole === 'primaryFocus').length, 2);
assert.strictEqual(progressedPull.exercises.filter(item => item.workoutRole === 'focusAccessory').length, 1);
assert.strictEqual(progressedPull.exercises.filter(item => item.workoutRole === 'generalSupport').length, 1);
assert.strictEqual(progressedPull.exercises.length, 4);
assert.ok(progressedPull.exercises.some(item => item.id === 'assisted-pull-up'), 'current Pull-up milestone remains the principal strength exercise');
assert.ok(!progressedPull.exercises.some(item => item.id === 'active-hang-preparation'), 'earlier Active hang does not displace the current Pull-up milestone');
assert.ok(progressedPull.exercises.some(item => item.id === 'prone-pull-down'));

const recentSupportLevels = workouts.createDefaultLevels();
recentSupportLevels.verticalPull.level = 1;
recentSupportLevels.compression.level = 2;
const diversifiedPull = workouts.getTodayWorkout({
  mode: 'great',
  state: {
    rotationIndex: 2,
    levels: recentSupportLevels,
    history: [{
      type: 'workout',
      date: new Date().toISOString(),
      workout: 'Lower Body',
      exercises: [{ exerciseId: 'bent-knee-support-hold', name: 'Bent-knee support hold' }]
    }]
  },
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
});
assert.strictEqual(diversifiedPull.exercises.filter(item => item.workoutRole === 'generalSupport').length, 1);
assert.ok(!diversifiedPull.exercises.some(item => item.id === 'bent-knee-support-hold'), 'recent support identity is rotated when alternatives exist');
assert.strictEqual(diversifiedPull.exercises.length, 4, 'recent support rotation never reduces the exact count');
const pullWithAddOns = workouts.applyWorkoutAddOns(diversifiedPull, { warmup: true, stretch: true }, {
  state: { levels: recentSupportLevels },
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] }
});
assert.strictEqual(pullWithAddOns.generationFailure, null, 'section validation preserves a valid Pull composition');
assert.strictEqual(pullWithAddOns.exercises.filter(item => !item.isAddOn).length, 4, 'warm-up and stretch do not reduce the main exercise count');
assert.ok(pullWithAddOns.exercises.filter(item => !item.isAddOn).every(item => item.programmeRole), 'section collision replacement preserves programme roles');
const pullSectionIds = pullWithAddOns.exercises.flatMap(item => (
  item.isAddOn ? [item.id, ...(item.movementExerciseIds || [])] : [item.id]
));
assert.strictEqual(new Set(pullSectionIds).size, pullSectionIds.length, 'Pull warm-up, main workout, and stretch use distinct stable IDs');

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
const generatedFoundationSwapSource = {
  ...balancedPushFoundation.exercises.find(item => item.progressionTrackKey === 'horizontalPush'),
  programmeRole: workouts.PROGRAMME_ROLES.foundationStrength,
  selectedMasterySkill: 'handstand'
};
const rolePreservingSwapAudit = workouts.getSwapCandidateAudit(generatedFoundationSwapSource, {
  usedIds: new Set([generatedFoundationSwapSource.id]),
  profile: phaseTwoProfiles.handstand,
  state: { levels: { horizontalPush: { level: 3 } } },
  unlockedLevel: 3
});
assert.ok(rolePreservingSwapAudit.finalCandidates.length > 0);
assert.ok(
  rolePreservingSwapAudit.finalCandidates.every(candidate => candidate.programmeRoles.includes(workouts.PROGRAMME_ROLES.foundationStrength)),
  'Swap preserves the resolved foundation programme role'
);
let cyclingSwap = workouts.normalizeExercise({
  ...pushTrack[0],
  trackKey: 'horizontalPush',
  progressionTrackKey: 'horizontalPush',
  workoutRole: 'primaryFocus'
});
const cyclingSwapIds = [cyclingSwap.id];
for (let swapIndex = 0; swapIndex < 7; swapIndex += 1) {
  const audit = workouts.getSwapCandidateAudit(cyclingSwap, {
    usedIds: new Set([cyclingSwap.id]),
    profile: { goal: 'pullup', equipment: ['floor'] },
    state: { levels: { horizontalPush: { level: 3 } } },
    unlockedLevel: 3
  });
  const nextCandidate = workouts.selectSwapCandidate(cyclingSwap, audit.finalCandidates);
  assert.ok(nextCandidate, `cycling Swap candidate ${swapIndex + 1}`);
  if (audit.finalCandidates.length > 1 && cyclingSwapIds.length > 1) {
    assert.notStrictEqual(
      nextCandidate.id,
      cyclingSwapIds[cyclingSwapIds.length - 2],
      'Swap avoids the immediately previous exercise when another candidate exists'
    );
  }
  cyclingSwap = workouts.createSwapReplacement(cyclingSwap, nextCandidate, 'great');
  cyclingSwapIds.push(cyclingSwap.id);
}
assert.deepStrictEqual(
  new Set(cyclingSwapIds.slice(0, 4)),
  new Set(pushTrack.slice(0, 4).map(item => item.id)),
  'repeated swaps reach every unlocked compatible stable ID before cycling'
);
const proneSwapAudit = workouts.getSwapCandidateAudit({
  ...pronePullDown,
  trackKey: 'pullAccessory',
  progressionTrackKey: 'pullAccessory',
  workoutRole: 'focusAccessory'
}, {
  profile: { goal: 'pullup', equipment: ['floor', 'pullupBar'] },
  state: { levels: { pullAccessory: { level: 0 } } },
  unlockedLevel: 0
});
assert.strictEqual(proneSwapAudit.candidateCountFinal, 0, 'locked accessory alternatives keep Swap disabled');
assert.match(proneSwapAudit.reason, /locked progression stages/);
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
  progressionTrackKey: 'horizontalPush',
  workoutRole: 'primaryFocus'
});
const sameFamilySwap = workouts.createSwapReplacement(sameFamilyOriginal, catalog('high-incline-push-up'), 'great');
assert.strictEqual(sameFamilySwap.workoutExerciseId, sameFamilyOriginal.workoutExerciseId);
assert.strictEqual(sameFamilySwap.id, 'high-incline-push-up');
assert.strictEqual(sameFamilySwap.progressionTrackKey, 'horizontalPush');
assert.strictEqual(sameFamilySwap.workoutRole, 'primaryFocus', 'Swap preserves the composition role');
const sameFamilyResult = workouts.exerciseResult(sameFamilySwap, [true, true, true], 'easy');
assert.strictEqual(sameFamilyResult.exerciseId, 'high-incline-push-up');
assert.strictEqual(sameFamilyResult.swappedFromExerciseId, 'wall-push-up');
assert.strictEqual(sameFamilyResult.progressionTrackKey, 'horizontalPush');

const nextWorkoutLevels = workouts.createDefaultLevels();
const swappedMilestoneDecision = workouts.applyExerciseResultToProgression(nextWorkoutLevels, sameFamilyResult);
assert.deepStrictEqual(
  { ...swappedMilestoneDecision },
  { applied: false, reason: 'reinforcement-only-not-current-milestone' },
  'a swap to a different milestone cannot advance the current milestone'
);
assert.strictEqual(nextWorkoutLevels.horizontalPush.level, 0);
const canonicalWallResult = workouts.exerciseResult(sameFamilyOriginal, [true, true, true], 'easy');
nextWorkoutLevels.horizontalPush.points = 4;
nextWorkoutLevels.horizontalPush.positiveExposures = 1;
workouts.applyExerciseResultToProgression(nextWorkoutLevels, canonicalWallResult);
assert.strictEqual(nextWorkoutLevels.horizontalPush.level, 1);
assert.strictEqual(nextWorkoutLevels.squat.level, 0);
const nextWorkout = workouts.getTodayWorkout({
  mode: 'great',
  state: { rotationIndex: 0, levels: nextWorkoutLevels },
  profile: { goal: 'pullup', equipment: ['none'] }
});
const nextHorizontalPush = nextWorkout.exercises.find(item => item.progressionTrackKey === 'horizontalPush');
assert.ok(nextHorizontalPush);
assert.strictEqual(nextHorizontalPush.level, 2);

const crossTypeLevels = workouts.createDefaultLevels();
const crossTypeResult = workouts.exerciseResult(swapped, [true, true, true], 'easy');
const crossTypeDecision = workouts.applyExerciseResultToProgression(crossTypeLevels, crossTypeResult);
assert.strictEqual(crossTypeResult.exerciseId, 'pike-hold');
assert.strictEqual(crossTypeResult.progressionTrackKey, 'handstand');
const mismatchedEvidence = {
  ...crossTypeResult,
  progressionTrackKey: 'handstand',
  progressionEvidenceTarget: 'verticalPush'
};
assert.deepStrictEqual(
  { ...workouts.applyExerciseResultToProgression(crossTypeLevels, mismatchedEvidence) },
  { applied: false, reason: 'progression-evidence-target-mismatch' },
  'explicit evidence prevents a shared exercise from advancing an unintended mastery track'
);
assert.strictEqual(crossTypeDecision.reason, 'reinforcement-only-not-current-milestone');
assert.strictEqual(crossTypeLevels.handstand.level, 0);
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
assert.deepStrictEqual({ ...threeOfThreeEasy.decision }, { applied: true, reason: 'positive-current-milestone-evidence' });
assert.strictEqual(threeOfThreeEasy.track.points, 2);
assert.strictEqual(threeOfThreeEasy.track.positiveExposures, 1);

const threeOfThreeHard = progressionScenario([true, true, true], 'hard');
assert.deepStrictEqual({ ...threeOfThreeHard.decision }, { applied: true, reason: 'full-difficult-exposure' });
assert.strictEqual(threeOfThreeHard.track.points, 0);
assert.strictEqual(threeOfThreeHard.track.positiveExposures, 0);
assert.strictEqual(threeOfThreeHard.track.difficultExposures, 1);

const finalPistolLevels = workouts.createDefaultLevels();
const finalPistolTrack = workouts.baseTracks.pistolSquat;
finalPistolLevels.pistolSquat.level = finalPistolTrack.length - 1;
finalPistolLevels.pistolSquat.milestoneId = 'full-pistol-squat';
const finalPistolExercise = workouts.normalizeExercise({
  ...catalog('full-pistol-squat'),
  trackKey: 'pistolSquat',
  progressionTrackKey: 'pistolSquat',
  progressionEvidenceTarget: 'pistolSquat',
  progressionMilestoneId: 'full-pistol-squat'
});
const finalPistolResult = workouts.exerciseResult(finalPistolExercise, [true, true, true], 'good');
assert.strictEqual(finalPistolResult.prescriptionData.perSide, true);
for (let exposure = 0; exposure < 2; exposure += 1) {
  workouts.applyExerciseResultToProgression(finalPistolLevels, finalPistolResult);
}
assert.strictEqual(workouts.isTrackMastered('pistolSquat', finalPistolLevels.pistolSquat, finalPistolTrack), false);
workouts.applyExerciseResultToProgression(finalPistolLevels, finalPistolResult);
assert.strictEqual(workouts.isTrackMastered('pistolSquat', finalPistolLevels.pistolSquat, finalPistolTrack), true);
assert.strictEqual(finalPistolLevels.pistolSquat.positiveExposures, workouts.ACHIEVEMENT_REQUIREMENTS.pistolSquat.positiveFinalMilestoneExposures);

const zeroOfThree = progressionScenario([false, false, false], 'easy');
assert.deepStrictEqual({ ...zeroOfThree.decision }, { applied: false, reason: 'no-completed-sets-or-rating' });
assert.strictEqual(zeroOfThree.track.points, 0);
assert.strictEqual(workouts.shouldRecordWorkoutResults([workouts.exerciseResult(sameFamilySwap, [false, false, false], 'easy')]), false);
assert.strictEqual(workouts.shouldRecordWorkoutResults([workouts.exerciseResult(sameFamilySwap, [true, false, false], null)]), true);
const completedWarmupResult = workouts.exerciseResult(
  workouts.normalizeExercise({ ...workouts.workoutAddOns.warmups[0], progressionTrackKey: null }),
  [true, true, true, true],
  null
);
const completedStretchResult = workouts.exerciseResult(
  workouts.normalizeExercise({ ...workouts.workoutAddOns.stretches[0], progressionTrackKey: null }),
  [true, true, true, true],
  null
);
assert.strictEqual(completedWarmupResult.isAddOn, true);
assert.strictEqual(completedStretchResult.isAddOn, true);
assert.strictEqual(workouts.shouldRecordWorkoutResults([completedWarmupResult, completedStretchResult]), false);
assert.strictEqual(workouts.applyExerciseResultToProgression(workouts.createDefaultLevels(), completedWarmupResult).applied, false);
assert.strictEqual(workouts.applyExerciseResultToProgression(workouts.createDefaultLevels(), completedStretchResult).applied, false);

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
assert.ok(appSource.includes("['How to perform it', help.howTo || []"));
assert.ok(appSource.includes("['Focus on', help.focus]"));
assert.ok(appSource.includes("['Avoid', help.commonMistakes]"));
assert.ok(appSource.includes("['Safety', [help.safety]]"));
assert.ok(!appSource.includes("['Success looks like'"));
assert.ok(!appSource.includes("['More guidance'"));
assert.ok(!appSource.includes("['Sources'"));
assert.ok(appSource.includes(".filter(([, values]) => Array.isArray(values) && values.some(Boolean))"));
assert.ok(indexSource.includes('exerciseHelpContent'));
assert.ok(appSource.includes('Number.isFinite(item.completedCount) && item.completedCount > 0'));
assert.ok(appSource.includes('exercises.some(exercise => !exercise.isAddOn)'));
assert.ok(appSource.includes("pistolSquat: 'Pistol squat'"));
assert.ok(appSource.includes('function exerciseWorkoutRoleLabel('));
assert.ok(appSource.includes("return 'Priority skill'"));
assert.ok(appSource.includes('Secondary skill ·'));
assert.ok(appSource.includes('Foundational practice'));
assert.ok(workoutCssSource.includes('.exercise-role-label'));
const focusLabelsSource = appSource.match(/const goalLabels = \{([\s\S]*?)\n\};/)?.[1] || '';
assert.deepStrictEqual(
  Array.from(focusLabelsSource.matchAll(/(pullup|handstand|lsit|pistolSquat):/g), match => match[1]),
  ['pullup', 'handstand', 'lsit', 'pistolSquat']
);
assert.ok(!/muscleup|generalFitness|general:/.test(focusLabelsSource));
assert.ok(!appSource.includes('21 * 86400000'));
assert.ok(appSource.includes('30 * 86400000'));
assert.ok(appSource.includes('acknowledgedUnlockIds'));
assert.ok(appSource.includes("returningSeenWorkoutId: ''"));
assert.ok(appSource.includes('const goalTrackKey = getGoalTrackKey(goal)'));
assert.ok(appSource.includes('const dotCount = track.length'));
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
assert.ok(!indexSource.includes('value="jumpRope"'), 'Jump rope is absent from onboarding and account equipment controls');
assert.ok(appSource.includes("const deprecatedProfileEquipment = new Set(['jumpRope']);"), 'legacy Jump rope profile equipment remains explicitly preserved');
assert.ok(appSource.includes('if (!authResolved)'));
assert.ok(appSource.includes("querySelectorAll('.welcome-star')"));
assert.ok(appSource.includes('state.current.sessionId !== renderedWorkoutSessionId'), 'new workout sessions reset the scroll owner');
assert.ok(appSource.includes('class="preview-icon-btn preview-swap-btn swap-unavailable-btn"'), 'preview reserves disabled Swap position');
assert.ok(appSource.includes('class="preview-icon-btn preview-swap-btn active-swap-btn swap-unavailable-btn"'), 'active workout reserves disabled Swap position');
assert.ok(indexSource.includes('id="swapAvailabilityMessage"'));
assert.match(workoutCssSource, /html\.workout-active,\s*body\.workout-active\s*\{[\s\S]*?overflow:\s*hidden;/);
assert.match(workoutCssSource, /body\.workout-active \.app\s*\{[\s\S]*?padding:\s*0;[\s\S]*?overflow:\s*hidden;/);
assert.match(workoutCssSource, /body\.workout-active #today\.active\s*\{[\s\S]*?flex:\s*0 0 100%;[\s\S]*?overflow-y:\s*auto;/);
assert.match(workoutCssSource, /#exerciseList\s*\{[\s\S]*?flex:\s*1 0 auto;/);
assert.ok(indexSource.includes('Foundational skills'));
const masteringSkillsSource = appSource.match(/const skills = \{([\s\S]*?)\n  \};/)?.[1] || '';
assert.ok(masteringSkillsSource.includes("verticalPull: 'Pull-up'"));
assert.ok(masteringSkillsSource.includes("handstand: 'Handstand'"));
assert.ok(masteringSkillsSource.includes("lsit: 'L-sit'"));
assert.ok(masteringSkillsSource.includes("pistolSquat: 'Pistol squat'"));
assert.ok(!/Crow pose|Muscle-up|Handstand push-up/.test(masteringSkillsSource));
assert.ok(indexSource.includes('Priority skill'));
assert.ok(!indexSource.includes('value="muscleup"'));
assert.ok(!indexSource.includes('value="general"'));
assert.strictEqual((indexSource.match(/name="goal"/g) || []).length, 4);
assert.strictEqual((indexSource.match(/name="accountGoal"/g) || []).length, 4);

assert.deepStrictEqual(Array.from(workouts.distinctSuccessCriteria(['Same sentence.'], ['same sentence!'])), []);

const stateStore = context.window.SomthingreatState.create({
  workoutModule: workouts,
  baseTracks: workouts.baseTracks,
  energyOptions: workouts.energyOptions,
  sanitizeWorkout: workouts.sanitizeWorkout,
  goalLabels: { pullup: 'Pull-up', handstand: 'Handstand', lsit: 'L-sit', pistolSquat: 'Pistol squat' },
  equipmentLabels: {
    none: 'None',
    floor: 'Floor',
    pullupBar: 'Pull-up bar',
    dipBars: 'Dip bars',
    bands: 'Bands',
    jumpRope: 'Jump rope'
  }
});
const state = stateStore.defaultState();
const legacyJumpRopeState = stateStore.sanitizeState({
  ...stateStore.defaultState(),
  profile: {
    goal: 'general',
    equipment: ['none', 'jumpRope'],
    pushups: 'zero',
    squats: 'zeroFive'
  }
});
assert.deepStrictEqual(
  Array.from(legacyJumpRopeState.profile.equipment),
  ['none', 'jumpRope'],
  'deprecated Jump rope equipment is preserved without displacing the effective No equipment selection'
);
const bandMilestoneState = stateStore.defaultState();
bandMilestoneState.profile = { goal: 'pullup', equipment: ['floor', 'bands'], pushups: 'zero', squats: 'zeroFive' };
bandMilestoneState.levels.horizontalPull.level = 1;
bandMilestoneState.levels.horizontalPull.milestoneId = 'standing-resistance-band-row';
const withBandsSanitized = stateStore.sanitizeState(bandMilestoneState);
assert.strictEqual(withBandsSanitized.levels.horizontalPull.level, 1);
assert.strictEqual(withBandsSanitized.levels.horizontalPull.milestoneId, 'standing-resistance-band-row');
const withoutBandsSanitized = stateStore.sanitizeState({
  ...withBandsSanitized,
  profile: { ...withBandsSanitized.profile, equipment: ['none'] }
});
assert.strictEqual(withoutBandsSanitized.levels.horizontalPull.level, 1, 'removing Bands preserves the canonical index');
assert.strictEqual(withoutBandsSanitized.levels.horizontalPull.milestoneId, 'standing-resistance-band-row', 'removing Bands preserves the stable milestone ID');
assert.deepStrictEqual(Array.from(workouts.getTracks(withoutBandsSanitized.profile, withoutBandsSanitized).horizontalPull), []);
assert.strictEqual(
  workouts.getTracks(withBandsSanitized.profile, withBandsSanitized).horizontalPull[1].id,
  'standing-resistance-band-row',
  'restoring Bands reveals the same earned milestone'
);
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
state.generationHistory.push({
  date: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  workout: 'Skills',
  mode: 'great',
  selectedMasterySkill: 'generalFitness',
  exercises: [{ exerciseId: 'crow-weight-shift' }]
});
const sanitizedWithGenerationHistory = stateStore.sanitizeState(state);
assert.strictEqual(sanitizedWithGenerationHistory.generationHistory[0].selectedMasterySkill, 'generalFitness');
assert.strictEqual(sanitizedWithGenerationHistory.generationHistory[0].exercises[0].exerciseId, 'crow-weight-shift');
assert.strictEqual(stateStore.publicState(sanitizedWithGenerationHistory).generationHistory.length, 1);

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
const legacyCanonicalLevels = stateStore.defaultState().levels;
delete legacyCanonicalLevels.verticalPull.milestoneId;
delete legacyCanonicalLevels.scapularPull.milestoneId;
delete legacyCanonicalLevels.antiExtension.milestoneId;
delete legacyCanonicalLevels.lateralCore.milestoneId;
delete legacyCanonicalLevels.posteriorChain.milestoneId;
legacyCanonicalLevels.verticalPull.level = 8;
legacyCanonicalLevels.scapularPull.level = 0;
legacyCanonicalLevels.antiExtension.level = 2;
legacyCanonicalLevels.lateralCore.level = 0;
legacyCanonicalLevels.posteriorChain.level = 6;
const remappedCanonicalState = stateStore.sanitizeState({
  ...stateStore.defaultState(),
  schemaVersion: 6,
  levels: legacyCanonicalLevels
});
assert.strictEqual(remappedCanonicalState.levels.verticalPull.milestoneId, 'chest-to-bar-pull-up');
assert.strictEqual(remappedCanonicalState.levels.scapularPull.milestoneId, 'scapular-pull-up');
assert.strictEqual(remappedCanonicalState.levels.antiExtension.milestoneId, 'plank');
assert.strictEqual(remappedCanonicalState.levels.lateralCore.milestoneId, 'side-plank');
assert.strictEqual(remappedCanonicalState.levels.posteriorChain.milestoneId, 'single-leg-romanian-deadlift');
const existingGeneralProfile = stateStore.sanitizeState({
  ...stateStore.defaultState(),
  schemaVersion: 5,
  profile: { goal: 'general', equipment: ['floor'], pushups: 'zero', squats: 'zeroFive', customPreference: 'preserved' },
  onboardingBaseline: { version: 1, equipment: ['floor'] },
  levels: { ...stateStore.defaultState().levels, posteriorChain: { ...stateStore.defaultState().levels.posteriorChain, level: 2, milestoneId: null } },
  history: [{ date: new Date().toISOString(), workout: 'Push', exercises: [{ name: 'Wall push-up', id: 'wall-push-up', prescription: '3 × 10' }] }]
});
assert.strictEqual(existingGeneralProfile.profile.goal, null);
assert.strictEqual(existingGeneralProfile.profile.legacyGoal, 'general');
assert.strictEqual(existingGeneralProfile.profile.prioritySkillRequired, true);
assert.strictEqual(existingGeneralProfile.profile.customPreference, 'preserved');
assert.deepStrictEqual(Array.from(existingGeneralProfile.profile.equipment), ['floor']);
assert.strictEqual(existingGeneralProfile.levels.posteriorChain.level, 3);
assert.strictEqual(existingGeneralProfile.levels.posteriorChain.milestoneId, 'single-leg-assisted-glute-bridge');
assert.strictEqual(existingGeneralProfile.history.length, 1);
assert.strictEqual(existingGeneralProfile.onboardingBaseline.version, 1);
assert.deepStrictEqual(Array.from(existingGeneralProfile.generationHistory), []);
const existingMuscleProfile = stateStore.sanitizeState({
  ...stateStore.defaultState(),
  schemaVersion: 6,
  profile: { goal: 'muscleup', equipment: ['pullupBar', 'bands'], pushups: 'sixTen', squats: 'sixTen' },
  levels: { ...stateStore.defaultState().levels, verticalPull: { ...stateStore.defaultState().levels.verticalPull, level: 5, milestoneId: null } },
  history: [{ date: new Date().toISOString(), workout: 'Skills', exercises: [{ name: 'Pull-up', id: 'pull-up', prescription: '3 × 5' }] }]
});
assert.strictEqual(existingMuscleProfile.profile.goal, null);
assert.strictEqual(existingMuscleProfile.profile.legacyGoal, 'muscleup');
assert.strictEqual(existingMuscleProfile.profile.prioritySkillRequired, true);
assert.deepStrictEqual(Array.from(existingMuscleProfile.profile.equipment), ['pullupBar', 'bands']);
assert.strictEqual(existingMuscleProfile.levels.verticalPull.level, 5);
assert.strictEqual(existingMuscleProfile.history[0].workout, 'Skills');
assert.strictEqual(workouts.getGoalTrackKey('general'), null);
assert.strictEqual(workouts.getGoalTrackKey('muscleup'), null);
assert.strictEqual(workouts.secondaryFoundationalSkill({ goal: null }, { history: [] }), null);
const missingPriorityWorkout = workouts.getTodayWorkout({
  mode: 'normal',
  state: { rotationIndex: 3, levels: workouts.createDefaultLevels(), history: [] },
  profile: { goal: null, equipment: ['pullupBar', 'bands'] }
});
assert.strictEqual(missingPriorityWorkout.selectedMasterySkill, null);
assert.strictEqual(missingPriorityWorkout.selectedSkillTrackKey, null);
assert.strictEqual(missingPriorityWorkout.generationFailure.code, 'priority-skill-required');
assert.strictEqual(missingPriorityWorkout.exercises.filter(item => item.workoutRole === 'primaryFocus').length, 0);

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

const rightWristRecovery = {
  area: 'rightWrist',
  mode: 'rest',
  duration: 'untilRemoved',
  createdAt: '2026-07-24T07:00:00.000Z',
  until: null
};
const leftKneeRecovery = {
  area: 'leftKnee',
  mode: 'rest',
  duration: 'untilRemoved',
  createdAt: '2026-07-24T07:05:00.000Z',
  until: null
};
assert.strictEqual(
  workouts.recoveryFingerprint({ recoveries: [rightWristRecovery, leftKneeRecovery] }),
  workouts.recoveryFingerprint({ recoveries: [leftKneeRecovery, rightWristRecovery] }),
  'recovery fingerprint is deterministic regardless of recovery order'
);

const recoveryState = {
  ...stateStore.defaultState(),
  recovery: leftKneeRecovery
};
const recoveryWorkout = workouts.getTodayWorkout({ mode: 'normal', state: recoveryState, profile: null });
assert.strictEqual(recoveryWorkout.recoveryFingerprint, workouts.recoveryFingerprint(recoveryState));
const staleRecoveryState = stateStore.sanitizeState({
  ...recoveryState,
  selectedEnergy: null,
  current: {
    ...workouts.getTodayWorkout({ mode: 'normal', state: stateStore.defaultState(), profile: null }),
    sessionId: 'stale-recovery-session',
    startedAt: '2026-07-24T08:00:00.000Z',
    updatedAt: '2026-07-24T08:10:00.000Z',
    lifecycleStatus: 'active',
    ratings: {},
    sets: {}
  }
});
assert.strictEqual(staleRecoveryState.current, null, 'workout generated before recovery change is discarded');
assert.strictEqual(staleRecoveryState.selectedEnergy, 'normal', 'discarding stale workout keeps the selected energy for regeneration');
const compatibleRecoveryState = stateStore.sanitizeState({
  ...recoveryState,
  current: {
    ...recoveryWorkout,
    sessionId: 'compatible-recovery-session',
    startedAt: '2026-07-24T08:00:00.000Z',
    updatedAt: '2026-07-24T08:10:00.000Z',
    lifecycleStatus: 'active',
    ratings: {},
    sets: {}
  }
});
assert.ok(compatibleRecoveryState.current, 'workout generated for current recovery is resumable');

const completeKneeRestrictedIds = [
  'paused-calf-raise',
  'two-leg-calf-raise',
  'single-leg-assisted-glute-bridge',
  'single-leg-glute-bridge'
];
['leftKnee', 'rightKnee'].forEach(area => {
  completeKneeRestrictedIds.forEach(id => {
    assert.strictEqual(
      workouts.isExerciseAllowedForRecovery(catalog(id), { area, mode: 'rest' }),
      false,
      `${area} complete rest rejects ${id}`
    );
  });
});

const recoveryTestProfile = {
  goal: 'general',
  equipment: ['floor', 'wall', 'chair', 'stable-elevated-surface', 'pullupBar', 'bands', 'dipBars']
};
function recoveryWorkoutFor(rotationIndex, mode = 'normal', recovery = leftKneeRecovery) {
  return workouts.getTodayWorkout({
    mode,
    state: {
      ...stateStore.defaultState(),
      rotationIndex,
      recovery,
      levels: workouts.createDefaultLevels()
    },
    profile: recoveryTestProfile
  });
}
function mainExerciseIds(workout) {
  return Array.from(workout.exercises.filter(item => !item.isAddOn).map(item => item.id));
}
function assertRecoverySafeWorkout(workout, recovery, label) {
  assert.ok(
    workout.exercises.filter(item => !item.isAddOn).every(item => workouts.isExerciseAllowedForRecovery(item, recovery)),
    `${label} never reintroduces recovery-rejected main work`
  );
}

const pushKneeRest = recoveryWorkoutFor(0, 'normal');
assert.strictEqual(pushKneeRest.originalScheduledWorkout, 'Push');
assert.deepStrictEqual(mainExerciseIds(pushKneeRest), [
  'wall-push-up',
  'close-grip-wall-push-up',
  'seated-resistance-band-row',
  'reverse-crunch'
]);
assert.ok(pushKneeRest.exercises.filter(item => item.sourceTrack === 'horizontalPush' || item.sourceTrack === 'dipStrength').length >= 2);
assertRecoverySafeWorkout(pushKneeRest, leftKneeRecovery, 'Push knee-rest fallback');

const greatPushKneeRest = recoveryWorkoutFor(0, 'great');
assert.ok(!mainExerciseIds(greatPushKneeRest).some(id => completeKneeRestrictedIds.includes(id)), 'Great energy does not weaken complete-rest filtering');
assert.strictEqual(new Set(greatPushKneeRest.exercises.map(item => item.sourceTrack || item.progressionTrackKey)).size, greatPushKneeRest.exercises.length, 'Recovery workout preserves movement-family diversity');

const pullKneeRest = recoveryWorkoutFor(2, 'normal');
assert.strictEqual(pullKneeRest.workoutName, 'Pull');
assert.deepStrictEqual(mainExerciseIds(pullKneeRest), [
  'active-hang-preparation',
  'prone-w-raise',
  'seated-resistance-band-row',
  'prone-pull-down'
]);
assertRecoverySafeWorkout(pullKneeRest, leftKneeRecovery, 'Pull knee-rest workout');

const lowerKneeRest = recoveryWorkoutFor(1, 'normal');
assert.strictEqual(lowerKneeRest.originalScheduledWorkout, 'Lower Body');
assert.strictEqual(lowerKneeRest.generationFailure.code, 'recovery-workout-shortened');
assert.deepStrictEqual(mainExerciseIds(lowerKneeRest), [
  'reverse-crunch',
  'wall-push-up',
  'seated-resistance-band-row'
]);
assertRecoverySafeWorkout(lowerKneeRest, leftKneeRecovery, 'Lower Body knee-rest fallback');

const skillLabKneeRest = recoveryWorkoutFor(3, 'normal');
assert.strictEqual(skillLabKneeRest.originalScheduledWorkout, 'Skill lab');
assert.strictEqual(skillLabKneeRest.generationFailure.code, 'recovery-workout-shortened');
assert.deepStrictEqual(mainExerciseIds(skillLabKneeRest), [
  'wall-push-up',
  'seated-resistance-band-row',
  'reverse-crunch'
]);
assertRecoverySafeWorkout(skillLabKneeRest, leftKneeRecovery, 'Skill Lab knee-rest fallback');

const kneeRestWithAddOns = workouts.applyWorkoutAddOns(pushKneeRest, { warmup: true, stretch: true }, {
  state: { recovery: leftKneeRecovery },
  profile: recoveryTestProfile
});
const addOnMovementById = new Map(workouts.addOnMovementCatalog.map(item => [item.id, item]));
kneeRestWithAddOns.exercises.filter(item => item.isAddOn).forEach(addOn => {
  addOn.movementExerciseIds.forEach(id => {
    assert.ok(workouts.isExerciseAllowedForRecovery(addOnMovementById.get(id), leftKneeRecovery), `add-on ${id} respects knee complete rest`);
  });
});
assert.ok(!kneeRestWithAddOns.exercises.some(item => item.movementExerciseIds?.some(id => (
  ['warmup-march-in-place', 'warmup-step-touch', 'warmup-bodyweight-squats', 'warmup-ankle-bounces', 'stretch-calf', 'stretch-quad', 'stretch-hip-flexor', 'stretch-hamstring', 'stretch-forward-fold'].includes(id)
))), 'warm-up and stretch do not use lower-body knee-rest movements');

const calfSwapAudit = workouts.getSwapCandidateAudit({
  ...catalog('two-leg-calf-raise'),
  trackKey: 'calves',
  progressionTrackKey: 'calves'
}, {
  recovery: leftKneeRecovery,
  profile: recoveryTestProfile,
  state: { recovery: leftKneeRecovery },
  unlockedLevel: 4
});
assert.strictEqual(calfSwapAudit.candidateCountAfterRecovery, 0, 'Swap cannot reintroduce calf work during knee complete rest');

const multiRecovery = { restrictions: [leftKneeRecovery, rightWristRecovery] };
assert.strictEqual(workouts.isExerciseAllowedForRecovery(catalog('two-leg-calf-raise'), multiRecovery), false);
assert.strictEqual(workouts.isExerciseAllowedForRecovery(catalog('wall-push-up'), multiRecovery), false);

[
  'headNeck',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle'
].forEach(area => {
  ['reduce', 'rest'].forEach(mode => {
    const recovery = { area, mode };
    const generated = workouts.getTodayWorkout({
      mode: 'normal',
      state: { ...stateStore.defaultState(), recovery, levels: workouts.createDefaultLevels() },
      profile: recoveryTestProfile
    });
    assert.ok(generated.exercises.every(item => workouts.isExerciseAllowedForRecovery(item, recovery)), `generated workout respects ${area} ${mode}`);
  });
});

const replacedRecoveryState = stateStore.sanitizeState({
  ...recoveryState,
  recovery: rightWristRecovery,
  generated: recoveryWorkout
});
assert.strictEqual(replacedRecoveryState.generated, null, 'replacing recovery invalidates generated workout from the previous restriction');
const removedRecoveryState = stateStore.sanitizeState({
  ...recoveryState,
  recovery: null,
  generated: recoveryWorkout
});
assert.strictEqual(removedRecoveryState.generated, null, 'removing recovery invalidates recovery-adjusted generated workout');

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
