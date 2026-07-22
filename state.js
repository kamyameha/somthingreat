(function () {
  const STORAGE_KEY = 'camille-calisthenics-v4';
  const LEGACY_STORAGE_KEY = 'camille-calisthenics-v2';
  const OLDER_LEGACY_STORAGE_KEY = 'camille-calisthenics-v1';
  const STATE_SCHEMA_VERSION = 4;

  function applyWorkoutCatalogMigrations(workoutModule) {
    if (!workoutModule || workoutModule.catalogMigrationsApplied) return;
    // Exercise instructions are authored in workouts.js. Keeping this migration
    // marker preserves compatibility without silently rewriting catalog content.
    workoutModule.catalogMigrationsApplied = true;
  }

  function create(config) {
    const {
      workoutModule,
      baseTracks,
      energyOptions,
      sanitizeWorkout,
      goalLabels,
      equipmentLabels,
      onSave
    } = config;

    applyWorkoutCatalogMigrations(workoutModule);

    const validProfileValues = {
      goals: new Set(Object.keys(goalLabels)),
      equipment: new Set(Object.keys(equipmentLabels)),
      pushups: new Set(['zero', 'oneFive', 'sixTen', 'tenPlus']),
      squats: new Set(['zeroFive', 'sixTen', 'tenPlus']),
      yesNo: new Set(['yes', 'no'])
    };

    function sanitizeProfile(profile) {
      if (!profile || typeof profile !== 'object') return null;
      const goal = validProfileValues.goals.has(profile.goal) ? profile.goal : null;
      const equipment = Array.isArray(profile.equipment)
        ? profile.equipment.filter(item => validProfileValues.equipment.has(item))
        : [];
      const cleanEquipment = equipment.includes('none') && equipment.length > 1
        ? equipment.filter(item => item !== 'none')
        : equipment;
      const pushups = validProfileValues.pushups.has(profile.pushups) ? profile.pushups : null;
      const squats = validProfileValues.squats.has(profile.squats) ? profile.squats : null;
      const deadHang = validProfileValues.yesNo.has(profile.deadHang) ? profile.deadHang : null;
      const negativePullup = validProfileValues.yesNo.has(profile.negativePullup) ? profile.negativePullup : null;
      const dip = validProfileValues.yesNo.has(profile.dip) ? profile.dip : null;

      if (!goal || !pushups || !squats || !cleanEquipment.length) return null;

      return {
        ...profile,
        goal,
        equipment: cleanEquipment,
        pushups,
        squats,
        deadHang: cleanEquipment.includes('pullupBar') ? deadHang : null,
        negativePullup: cleanEquipment.includes('pullupBar') ? negativePullup : null,
        dip: cleanEquipment.includes('dipBars') ? dip : null
      };
    }

    function sanitizeLevels(levels = {}, profile = null) {
      const defaults = workoutModule.createDefaultLevels();
      const migratedLevels = typeof workoutModule.migrateLevels === 'function'
        ? workoutModule.migrateLevels(levels)
        : levels;
      const tracks = workoutModule.getTracks(profile);
      Object.keys(defaults).forEach(key => {
        const source = migratedLevels[key] || {};
        const trackLength = Math.max(1, (tracks[key] || baseTracks[key] || []).length);
        const level = Number.isFinite(Number(source.level)) ? Number(source.level) : defaults[key].level;
        const points = Number.isFinite(Number(source.points)) ? Number(source.points) : defaults[key].points;
        defaults[key] = {
          level: Math.max(0, Math.min(Math.round(level), trackLength - 1)),
          points: Math.max(-6, Math.min(Math.round(points), 10)),
          positiveExposures: Number.isFinite(Number(source.positiveExposures)) ? Math.max(0, Number(source.positiveExposures)) : 0,
          difficultExposures: Number.isFinite(Number(source.difficultExposures)) ? Math.max(0, Number(source.difficultExposures)) : 0,
          levelExposures: Number.isFinite(Number(source.levelExposures)) ? Math.max(0, Math.round(Number(source.levelExposures))) : 0,
          plateauCount: Number.isFinite(Number(source.plateauCount)) ? Math.max(0, Math.min(Math.round(Number(source.plateauCount)), 3)) : 0
        };
      });
      return defaults;
    }

    function sanitizeHistory(history) {
      if (!Array.isArray(history)) return [];
      return history
        .filter(item => item && typeof item === 'object' && !Number.isNaN(new Date(item.date).getTime()))
        .map(item => ({
          date: new Date(item.date).toISOString(),
          startedAt: item.startedAt && !Number.isNaN(new Date(item.startedAt).getTime()) ? new Date(item.startedAt).toISOString() : null,
          workout: typeof item.workout === 'string' ? item.workout : 'Workout',
          mode: typeof item.mode === 'string' ? item.mode : 'normal',
          type: item.type === 'custom' ? 'custom' : 'workout',
          customType: ['rounds', 'minutes'].includes(item.customType) ? item.customType : null,
          target: Number.isFinite(Number(item.target)) ? Math.max(1, Math.round(Number(item.target))) : null,
          completedCount: Number.isFinite(Number(item.completedCount)) ? Math.max(0, Math.round(Number(item.completedCount))) : null,
          energy: ['great', 'normal', 'tired', 'exhausted'].includes(item.energy) ? item.energy : null,
          sessionId: typeof item.sessionId === 'string' ? item.sessionId : '',
          exercises: Array.isArray(item.exercises)
            ? item.exercises
                .filter(exercise => exercise && typeof exercise === 'object' && exercise.name)
                .map(exercise => {
                  const prescriptionData = workoutModule.normalizePrescriptionData(
                    exercise.prescriptionData,
                    exercise.prescription,
                    exercise.targetSets || exercise.setCount
                  );
                  return {
                  workoutExerciseId: typeof exercise.workoutExerciseId === 'string' ? exercise.workoutExerciseId : '',
                  exerciseId: typeof exercise.exerciseId === 'string' ? exercise.exerciseId : (typeof exercise.id === 'string' ? exercise.id : ''),
                  name: String(exercise.name),
                  prescription: workoutModule.prescriptionToString(prescriptionData),
                  prescriptionData,
                  targetSets: exercise.targetSets !== null && exercise.targetSets !== undefined && Number.isInteger(Number(exercise.targetSets))
                    ? Math.max(1, Number(exercise.targetSets))
                    : null,
                  completedSets: exercise.completedSets !== null && exercise.completedSets !== undefined && Number.isInteger(Number(exercise.completedSets))
                    ? Math.max(0, Number(exercise.completedSets))
                    : null,
                  completedSetIndexes: Array.isArray(exercise.completedSetIndexes)
                    ? exercise.completedSetIndexes.filter(value => Number.isInteger(Number(value))).map(Number)
                    : [],
                  completionStatus: ['completed', 'partial', 'skipped', 'failed'].includes(exercise.completionStatus)
                    ? exercise.completionStatus
                    : 'completed',
                  rating: ['easy', 'good', 'hard', 'failed'].includes(exercise.rating) ? exercise.rating : null,
                  progressionApplied: Boolean(exercise.progressionApplied),
                  progressionDecision: typeof exercise.progressionDecision === 'string' ? exercise.progressionDecision : null,
                  trackKey: typeof exercise.trackKey === 'string' ? exercise.trackKey : '',
                  progressionTrackKey: typeof exercise.progressionTrackKey === 'string' ? exercise.progressionTrackKey : '',
                  progressionLevel: Number.isFinite(Number(exercise.progressionLevel)) ? Number(exercise.progressionLevel) : null,
                  swappedFromExerciseId: typeof exercise.swappedFromExerciseId === 'string' ? exercise.swappedFromExerciseId : null,
                  swappedFromExerciseName: typeof exercise.swappedFromExerciseName === 'string' ? exercise.swappedFromExerciseName : null,
                  isAddOn: Boolean(exercise.isAddOn)
                  };
                })
            : []
        }));
    }

    function sanitizePendingSessionRecords(records) {
      if (!Array.isArray(records)) return [];
      return records
        .filter(record => record && typeof record === 'object' && typeof record.sessionId === 'string')
        .slice(-100)
        .map(record => JSON.parse(JSON.stringify(record)));
    }

    function sanitizeProgressInsights(insights) {
      const source = insights && typeof insights === 'object' ? insights : {};
      return {
        acknowledgedUnlockIds: Array.isArray(source.acknowledgedUnlockIds)
          ? Array.from(new Set(source.acknowledgedUnlockIds.filter(value => typeof value === 'string' && value).slice(-100)))
          : [],
        returningSeenWorkoutId: typeof source.returningSeenWorkoutId === 'string' ? source.returningSeenWorkoutId : ''
      };
    }

    function sanitizeRestAdvice(value) {
      const source = value && typeof value === 'object' ? value : {};
      return {
        acknowledgedSequenceKey: typeof source.acknowledgedSequenceKey === 'string' ? source.acknowledgedSequenceKey : '',
        lastShownDate: typeof source.lastShownDate === 'string' ? source.lastShownDate : ''
      };
    }

    function sanitizeCustomChecklist(checklist) {
      if (!checklist || typeof checklist !== 'object') return null;
      const type = ['rounds', 'minutes'].includes(checklist.type) ? checklist.type : 'rounds';
      const target = Number.isFinite(Number(checklist.target)) ? Math.max(1, Math.min(Math.round(Number(checklist.target)), type === 'minutes' ? 240 : 120)) : 0;
      if (!target) return null;
      const itemCount = type === 'minutes' ? Math.ceil(target / 5) : target;
      const items = Array.isArray(checklist.items)
        ? Array.from({ length: itemCount }, (_, index) => Boolean(checklist.items[index]))
        : Array.from({ length: itemCount }, () => false);
      return {
        name: typeof checklist.name === 'string' && checklist.name.trim() ? checklist.name.trim().slice(0, 40) : 'Custom checklist',
        type,
        target,
        items
      };
    }

    function sanitizeRecovery(recovery) {
      if (!recovery || typeof recovery !== 'object') return null;
      const validAreas = new Set([
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
      ]);
      const validModes = new Set(['reduce', 'rest']);
      const validDurations = new Set(['3days', '1week', '2weeks', '1month', 'untilRemoved']);
      const area = validAreas.has(recovery.area) ? recovery.area : '';
      const mode = validModes.has(recovery.mode) ? recovery.mode : 'reduce';
      const duration = validDurations.has(recovery.duration) ? recovery.duration : '';
      const createdAt = recovery.createdAt && !Number.isNaN(new Date(recovery.createdAt).getTime())
        ? new Date(recovery.createdAt).toISOString()
        : new Date().toISOString();
      const until = recovery.until && !Number.isNaN(new Date(recovery.until).getTime())
        ? new Date(recovery.until).toISOString()
        : null;

      if (!area || !duration) return null;
      if (until && new Date(until).getTime() < Date.now()) return null;

      return { area, mode, duration, until, createdAt };
    }

    function defaultState() {
      const levels = {};
      Object.assign(levels, workoutModule.createDefaultLevels());
      return {
        schemaVersion: STATE_SCHEMA_VERSION,
        rotationIndex: 0,
        levels,
        history: [],
        current: null,
        selectedEnergy: null,
        generated: null,
        customChecklist: null,
        profile: null,
        onboardingBaseline: null,
        includeWarmup: false,
        includeStretch: false,
        includeExerciseTimer: false,
        includeRestTimer: false,
        restTimerSeconds: 60,
        recovery: null,
        pendingSessionRecords: [],
        progressInsights: sanitizeProgressInsights(null),
        restAdvice: sanitizeRestAdvice(null),
        todayEmptyStateDismissed: false
      };
    }

    function migrateState(rawState) {
      if (!rawState || typeof rawState !== 'object') return defaultState();
      const previousVersion = Number(rawState.schemaVersion || 0);
      const migrated = { ...rawState };
      if (previousVersion < 4) {
        if (Number(migrated.rotationIndex) === 1) migrated.rotationIndex = 2;
        else if (Number(migrated.rotationIndex) === 2) migrated.rotationIndex = 1;
      }
      return { ...migrated, schemaVersion: STATE_SCHEMA_VERSION };
    }

    function sanitizeState(nextState) {
      if (!nextState || typeof nextState !== 'object') return defaultState();
      nextState = migrateState(nextState);

      nextState.profile = sanitizeProfile(nextState.profile);
      nextState.onboardingBaseline = nextState.onboardingBaseline && typeof nextState.onboardingBaseline === 'object'
        ? JSON.parse(JSON.stringify(nextState.onboardingBaseline))
        : null;
      nextState.levels = sanitizeLevels(nextState.levels, nextState.profile);
      nextState.history = sanitizeHistory(nextState.history);
      nextState.rotationIndex = Number.isFinite(Number(nextState.rotationIndex)) ? Math.max(0, Math.round(Number(nextState.rotationIndex))) : 0;
      if (typeof workoutModule.nextRotationIndexFromHistory === 'function') {
        nextState.rotationIndex = workoutModule.nextRotationIndexFromHistory(nextState.history, nextState.rotationIndex);
      }
      nextState.current = workoutModule.sanitizeWorkout(nextState.current);
      nextState.generated = workoutModule.sanitizeWorkout(nextState.generated);
      nextState.customChecklist = sanitizeCustomChecklist(nextState.customChecklist);
      nextState.selectedEnergy = energyOptions[nextState.selectedEnergy] ? nextState.selectedEnergy : null;
      nextState.includeWarmup = Boolean(nextState.includeWarmup);
      nextState.includeStretch = Boolean(nextState.includeStretch);
      nextState.includeExerciseTimer = Boolean(nextState.includeExerciseTimer);
      nextState.includeRestTimer = Boolean(nextState.includeRestTimer);
      nextState.restTimerSeconds = 60;
      nextState.recovery = sanitizeRecovery(nextState.recovery);
      nextState.pendingSessionRecords = sanitizePendingSessionRecords(nextState.pendingSessionRecords);
      nextState.progressInsights = sanitizeProgressInsights(nextState.progressInsights);
      nextState.restAdvice = sanitizeRestAdvice(nextState.restAdvice);
      nextState.todayEmptyStateDismissed = Boolean(nextState.todayEmptyStateDismissed);
      nextState.schemaVersion = STATE_SCHEMA_VERSION;

      if (!nextState.current && !nextState.generated && !nextState.selectedEnergy && !nextState.customChecklist) {
        nextState.includeWarmup = false;
        nextState.includeStretch = false;
        nextState.includeExerciseTimer = false;
        nextState.includeRestTimer = false;
        nextState.restTimerSeconds = 60;
      }

      return nextState;
    }

    function loadState() {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(OLDER_LEGACY_STORAGE_KEY);
      if (!saved) return defaultState();
      try {
        const parsed = JSON.parse(saved);
        const merged = { ...defaultState(), ...parsed };
        return sanitizeState(merged);
      } catch {
        return defaultState();
      }
    }

    function saveState(state) {
      const cleanState = sanitizeState(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
      if (typeof onSave === 'function') onSave(cleanState);
      return cleanState;
    }

    function writeLocalState(state) {
      const cleanState = sanitizeState(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
      return cleanState;
    }

    function publicState(state) {
      return {
        schemaVersion: STATE_SCHEMA_VERSION,
        rotationIndex: state.rotationIndex,
        levels: state.levels,
        history: state.history,
        current: state.current,
        selectedEnergy: state.selectedEnergy,
        generated: state.generated,
        customChecklist: state.customChecklist,
        profile: state.profile,
        onboardingBaseline: state.onboardingBaseline,
        includeWarmup: state.includeWarmup,
        includeStretch: state.includeStretch,
        includeExerciseTimer: state.includeExerciseTimer,
        includeRestTimer: state.includeRestTimer,
        restTimerSeconds: state.restTimerSeconds,
        recovery: state.recovery,
        pendingSessionRecords: state.pendingSessionRecords,
        progressInsights: state.progressInsights,
        restAdvice: state.restAdvice,
        todayEmptyStateDismissed: state.todayEmptyStateDismissed
      };
    }

    return {
      defaultState,
      loadState,
      migrateState,
      publicState,
      sanitizeState,
      saveState,
      writeLocalState,
      schemaVersion: STATE_SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      legacyStorageKeys: [LEGACY_STORAGE_KEY, OLDER_LEGACY_STORAGE_KEY]
    };
  }

  window.SomthingreatState = {
    create,
    STATE_SCHEMA_VERSION,
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    OLDER_LEGACY_STORAGE_KEY
  };
})();
