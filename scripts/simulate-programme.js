const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'workouts.js'), 'utf8'), context);
const workouts = context.window.SomthingreatWorkouts;

const priorities = ['pullup', 'handstand', 'lsit', 'pistolSquat'];
const modes = ['great', 'normal', 'tired', 'exhausted'];
const equipmentCombinations = [
  ['none'],
  ['bands'],
  ['pullupBar'],
  ['dipBars'],
  ['pullupBar', 'bands'],
  ['pullupBar', 'dipBars'],
  ['dipBars', 'bands'],
  ['pullupBar', 'dipBars', 'bands']
];
const stages = [
  { name: 'beginner', ratio: 0 },
  { name: 'middle', ratio: 0.5 },
  { name: 'final', ratio: 1 }
];
const recoveryScenarios = [
  { name: 'none', recovery: null },
  { name: 'shoulder-rest', recovery: { area: 'leftShoulder', mode: 'rest' } },
  { name: 'wrist-reduce', recovery: { area: 'leftWrist', mode: 'reduce' } },
  { name: 'knee-rest', recovery: { area: 'leftKnee', mode: 'rest' } },
  { name: 'ankle-rest', recovery: { area: 'leftAnkle', mode: 'rest' } }
];
const householdEquipment = new Set(['floor', 'wall', 'stable-elevated-surface', 'stable-table', 'chair']);
const inactiveExerciseIds = new Set([
  'jump-rope',
  'elevated-pike-hold',
  'pike-push-up',
  'feet-elevated-pike-push-up',
  'wall-handstand-push-up-negative',
  'partial-wall-handstand-push-up',
  'full-wall-handstand-push-up',
  'hollow-body-strength',
  'straight-bar-support-development',
  'explosive-pull-up',
  'straight-bar-dip-preparation',
  'low-bar-transition-drill',
  'feet-assisted-transition',
  'band-assisted-transition',
  'jumping-muscle-up-transition',
  'slow-negative-muscle-up',
  'assisted-muscle-up',
  'full-muscle-up-attempt',
  'full-muscle-up',
  'controlled-muscle-up-repetitions'
]);

function levelsAt(ratio) {
  const levels = workouts.createDefaultLevels();
  Object.keys(levels).forEach(trackKey => {
    const track = workouts.baseTracks[trackKey] || [];
    if (!track.length) return;
    const level = Math.round((track.length - 1) * ratio);
    levels[trackKey].level = level;
    levels[trackKey].milestoneId = track[level]?.id || null;
  });
  return levels;
}

const report = {
  scenarios: 0,
  complete: 0,
  safelyReduced: 0,
  baselineScenarios: 0,
  baselineComplete: 0,
  baselineSafelyReduced: 0,
  baselinePrioritySkillLabExercises: 0,
  baselineSecondarySkillLabExercises: 0,
  baselineSkillLabScenarios: 0,
  generationFailures: {},
  reducedByPriority: {},
  reducedByWorkout: {},
  reducedByMode: {},
  reducedByEquipment: {},
  reducedByRecovery: {},
  workoutCounts: {},
  prioritySkillLabExercises: 0,
  secondarySkillLabExercises: 0,
  skillLabScenarios: 0,
  reachedExerciseIds: new Set(),
  reachedTrackKeys: new Set(),
  horizontalPullLimitedScenarios: 0,
  violations: [],
  reducedConfigurations: [],
  representativeCompositions: []
};

for (const priority of priorities) {
  for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
    for (const stage of stages) {
      for (const mode of modes) {
        for (const equipment of equipmentCombinations) {
          for (const recoveryScenario of recoveryScenarios) {
            const state = {
              rotationIndex,
              levels: levelsAt(stage.ratio),
              history: [],
              generationHistory: [],
              recovery: recoveryScenario.recovery
            };
            const profile = { goal: priority, equipment };
            const generated = workouts.getTodayWorkout({ mode, state, profile });
            const scenario = `${priority}/${generated.workoutName}/${stage.name}/${mode}/${equipment.join('+')}/${recoveryScenario.name}`;
            const expectedCount = workouts.energyOptions[mode].exerciseCount;
            report.scenarios += 1;
            report.workoutCounts[generated.workoutName] = Number(report.workoutCounts[generated.workoutName] || 0) + 1;
            if (
              stage.name === 'beginner' &&
              mode === 'normal' &&
              equipment.length === 3 &&
              recoveryScenario.name === 'none'
            ) {
              report.representativeCompositions.push({
                priority,
                workout: generated.workoutName,
                exercises: generated.exercises.map(exercise => ({
                  id: exercise.id,
                  track: exercise.sourceTrack,
                  role: exercise.workoutRole
                }))
              });
            }
            generated.exercises.forEach(exercise => {
              report.reachedExerciseIds.add(exercise.id);
              report.reachedTrackKeys.add(exercise.sourceTrack || exercise.progressionTrackKey);
            });
            if (generated.exercises.length === expectedCount && !generated.generationFailure) report.complete += 1;
            else {
              report.safelyReduced += 1;
              const failureCode = generated.generationFailure?.code || 'reduced-without-diagnostic';
              report.generationFailures[failureCode] = Number(report.generationFailures[failureCode] || 0) + 1;
              report.reducedByPriority[priority] = Number(report.reducedByPriority[priority] || 0) + 1;
              report.reducedByWorkout[generated.workoutName] = Number(report.reducedByWorkout[generated.workoutName] || 0) + 1;
              report.reducedByMode[mode] = Number(report.reducedByMode[mode] || 0) + 1;
              const equipmentKey = equipment.join('+');
              report.reducedByEquipment[equipmentKey] = Number(report.reducedByEquipment[equipmentKey] || 0) + 1;
              report.reducedByRecovery[recoveryScenario.name] = Number(report.reducedByRecovery[recoveryScenario.name] || 0) + 1;
              if (report.reducedConfigurations.length < 30) {
                report.reducedConfigurations.push({
                  scenario,
                  exercises: generated.exercises.map(exercise => exercise.id),
                  failureCode
                });
              }
            }
            if (recoveryScenario.name === 'none') {
              report.baselineScenarios += 1;
              if (generated.exercises.length === expectedCount && !generated.generationFailure) report.baselineComplete += 1;
              else report.baselineSafelyReduced += 1;
            }
            if (generated.developmentDiagnostics.horizontalPullLimitation) report.horizontalPullLimitedScenarios += 1;

            const ids = generated.exercises.map(exercise => exercise.id);
            if (new Set(ids).size !== ids.length) report.violations.push(`${scenario}: duplicate stable exercise identity`);
            if (ids.some(id => inactiveExerciseIds.has(id))) report.violations.push(`${scenario}: inactive exercise generated`);
            if (generated.exercises.length > expectedCount) report.violations.push(`${scenario}: too many exercises`);
            if (generated.exercises.length < expectedCount && !generated.generationFailure) report.violations.push(`${scenario}: reduced without diagnostic`);
            if (generated.totalFatigue > generated.fatigueBudget.max + generated.fatigueBudget.tolerance) report.violations.push(`${scenario}: fatigue budget exceeded`);
            if (generated.totalSkill > generated.skillLimit) report.violations.push(`${scenario}: skill budget exceeded`);
            if (generated.exercises.some(exercise => (
              (exercise.equipment || []).some(item => !householdEquipment.has(item) && !equipment.includes(item))
            ))) report.violations.push(`${scenario}: unavailable equipment used`);
            if (recoveryScenario.recovery && generated.exercises.some(exercise => (
              !workouts.isExerciseAllowedForRecovery(exercise, recoveryScenario.recovery)
            ))) report.violations.push(`${scenario}: recovery restriction violated`);

            const trackCounts = generated.exercises.reduce((counts, exercise) => {
              const key = exercise.sourceTrack || exercise.progressionTrackKey;
              counts[key] = Number(counts[key] || 0) + 1;
              return counts;
            }, {});
            if (Math.max(0, ...Object.values(trackCounts)) > 2) report.violations.push(`${scenario}: more than two exercises from one track`);

            if (generated.workoutName === 'Skill lab') {
              report.skillLabScenarios += 1;
              report.prioritySkillLabExercises += generated.exercises.filter(exercise => exercise.workoutRole === 'primaryFocus').length;
              report.secondarySkillLabExercises += generated.exercises.filter(exercise => exercise.workoutRole === 'focusAccessory').length;
              if (recoveryScenario.name === 'none') {
                report.baselineSkillLabScenarios += 1;
                report.baselinePrioritySkillLabExercises += generated.exercises.filter(exercise => exercise.workoutRole === 'primaryFocus').length;
                report.baselineSecondarySkillLabExercises += generated.exercises.filter(exercise => exercise.workoutRole === 'focusAccessory').length;
              }
            }

            if (mode === 'normal' && recoveryScenario.name === 'none' && !generated.generationFailure) {
              const sourceTracks = new Set(generated.exercises.map(exercise => exercise.sourceTrack));
              if (generated.workoutName === 'Push' && !['horizontalPush', 'verticalPush', 'dipStrength'].every(key => sourceTracks.has(key))) {
                report.violations.push(`${scenario}: Push family coverage incomplete`);
              }
              if (generated.workoutName === 'Lower Body' && !['squat', 'posteriorChain', 'unilateral'].every(key => sourceTracks.has(key))) {
                report.violations.push(`${scenario}: Lower Body family coverage incomplete`);
              }
              if (generated.workoutName === 'Pull' && equipment.includes('pullupBar') && !['verticalPull', 'scapularPull'].every(key => sourceTracks.has(key))) {
                report.violations.push(`${scenario}: Pull bar-family coverage incomplete`);
              }
              if (generated.workoutName === 'Pull' && equipment.includes('bands') && !sourceTracks.has('horizontalPull')) {
                report.violations.push(`${scenario}: available loaded horizontal Pull omitted`);
              }
              if (generated.workoutName === 'Skill lab') {
                if (generated.exercises.filter(exercise => exercise.workoutRole === 'primaryFocus').length < 2) report.violations.push(`${scenario}: priority exposure below two`);
                if (generated.exercises.filter(exercise => exercise.workoutRole === 'focusAccessory').length < 1) report.violations.push(`${scenario}: secondary skill missing`);
              }
            }
          }
        }
      }
    }
  }
}

const serializableReport = {
  ...report,
  reachedExerciseIds: [...report.reachedExerciseIds].sort(),
  reachedTrackKeys: [...report.reachedTrackKeys].sort(),
  averagePriorityExercisesPerSkillLab: Number((report.prioritySkillLabExercises / report.skillLabScenarios).toFixed(2)),
  averageSecondaryExercisesPerSkillLab: Number((report.secondarySkillLabExercises / report.skillLabScenarios).toFixed(2)),
  baselineAveragePriorityExercisesPerSkillLab: Number((report.baselinePrioritySkillLabExercises / report.baselineSkillLabScenarios).toFixed(2)),
  baselineAverageSecondaryExercisesPerSkillLab: Number((report.baselineSecondarySkillLabExercises / report.baselineSkillLabScenarios).toFixed(2))
};
console.log(JSON.stringify(serializableReport, null, 2));
if (report.violations.length) process.exitCode = 1;
