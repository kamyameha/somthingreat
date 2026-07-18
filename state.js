(function () {
  const STORAGE_KEY = 'camille-calisthenics-v4';
  const LEGACY_STORAGE_KEY = 'camille-calisthenics-v2';
  const OLDER_LEGACY_STORAGE_KEY = 'camille-calisthenics-v1';
  const STATE_SCHEMA_VERSION = 1;

  function applyWorkoutCatalogMigrations(workoutModule) {
    if (!workoutModule || workoutModule.catalogMigrationsApplied) return;

    const removedExerciseIds = new Set([
      'standing-towel-row-isometric',
      'seated-towel-row-isometric',
      'high-angle-table-row',
      'bent-knee-inverted-row',
      'straight-leg-inverted-row',
      'feet-elevated-inverted-row'
    ]);

    const removeFromArray = items => {
      if (!Array.isArray(items)) return;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (removedExerciseIds.has(items[index]?.id)) items.splice(index, 1);
      }
    };

    removeFromArray(workoutModule.exerciseCatalog);
    Object.values(workoutModule.movementTracks || {}).forEach(removeFromArray);
    Object.values(workoutModule.baseTracks || {}).forEach(removeFromArray);

    const familyCues = {
      'horizontal-push': 'Keep your body in one straight line, lower with control, and finish each repetition by pressing the surface away without shrugging.',
      'vertical-push': 'Keep your ribs controlled, press through the full arm, and avoid letting your head or lower back move ahead of the rest of your body.',
      'dip-strength': 'Keep the shoulders down, move only through a comfortable depth, and press evenly through both arms.',
      'horizontal-pull': 'Start by drawing the shoulder blades back, pull the chest toward the support, and lower until the arms are long without losing body tension.',
      'vertical-pull': 'Begin from active shoulders, lead the movement with the elbows, and lower under control instead of dropping into the bottom position.',
      'scapular-pull': 'Keep the elbows straight and create the movement only by drawing the shoulder blades down and together.',
      squat: 'Keep the whole foot planted, let the knees track in the same direction as the toes, and stand by pushing the floor away.',
      unilateral: 'Keep most of your weight through the working foot, control the knee position, and use support before balance changes your technique.',
      'posterior-chain': 'Brace gently before moving, drive through the heels, and finish by squeezing the glutes rather than arching the lower back.',
      calves: 'Rise straight up through the big-toe side of the foot, pause briefly at the top, and lower without bouncing.',
      'anti-extension': 'Keep the ribs drawn toward the pelvis, breathe without losing abdominal tension, and stop before the lower back changes position.',
      compression: 'Stay tall through the spine, press the hands down, and lift from the lower abdomen rather than swinging the legs.',
      'lateral-core': 'Keep the shoulder stacked, hips lifted, and head, ribs, and pelvis aligned while breathing normally.',
      lsit: 'Press strongly through the hands, keep the shoulders away from the ears, and prioritise a clean short hold over a longer collapsed one.',
      handstand: 'Push tall through the shoulders, keep the ribs controlled, and use the wall or floor exit before balance is lost.',
      crow: 'Spread the fingers, shift weight gradually, and keep looking slightly forward instead of directly beneath you.',
      'muscle-up': 'Keep the pull powerful and close to the body, then control the transition rather than forcing it with the wrists or shoulders.',
      rope: 'Stay light on the feet, keep the elbows near the ribs, and turn the rope mainly from the wrists.'
    };

    const instructionOverrides = {
      'paused-glute-bridge': {
        purpose: 'Builds glute and hamstring strength while teaching you to hold full hip extension without using the lower back.',
        setup: 'Lie on your back with knees bent, feet flat and hip-width apart, and heels close enough that your fingertips can nearly reach them. Keep your ribs relaxed and arms by your sides.',
        execution: 'Press evenly through both heels and squeeze your glutes to lift the hips until your shoulders, hips, and knees form a straight line. Hold the top position for two full seconds without arching your back, then lower slowly until the hips lightly touch the floor.',
        safety: 'You should feel the pause mainly in your glutes. Reduce the height if you feel pressure in the lower back or hamstring cramping. Stop if the movement causes pain. Persistent or significant pain should be assessed by a healthcare professional.'
      },
      plank: {
        purpose: 'Builds whole-body core tension and teaches you to resist lower-back extension.',
        setup: 'Place your hands directly beneath your shoulders, spread your fingers, and step both feet back until your body forms a straight line from head to heels.',
        execution: 'Push the floor away, gently tuck your ribs toward your pelvis, squeeze your glutes, and keep your head in line with your spine. Hold while breathing slowly without letting the hips sag or rise.',
        safety: 'Use a forearm plank if your wrists are uncomfortable. End the hold as soon as you cannot keep the lower back neutral. Stop if the movement causes pain. Persistent or significant pain should be assessed by a healthcare professional.'
      },
      'bodyweight-squat': {
        purpose: 'Builds basic leg strength and control through the hips, knees, and ankles.',
        setup: 'Stand with feet around shoulder-width apart and toes turned slightly outward. Keep the whole foot in contact with the floor and hold the arms forward if it helps your balance.',
        execution: 'Sit the hips down between the heels while allowing the knees to travel in the same direction as the toes. Descend only as far as you can keep the heels down and torso controlled, then push through the whole foot to stand tall.',
        safety: 'Use a smaller depth or a stable support if balance or knee comfort changes your form. Stop if the movement causes pain. Persistent or significant pain should be assessed by a healthcare professional.'
      }
    };

    const singleTarget = item => {
      const data = item?.prescriptionData;
      if (!data || !data.repsMin || !data.repsMax) return;
      const target = Math.max(1, Math.round((Number(data.repsMin) + Number(data.repsMax)) / 2));
      item.prescriptionData = { ...data, reps: target };
      delete item.prescriptionData.repsMin;
      delete item.prescriptionData.repsMax;
      item.prescription = `${data.sets || 1} × ${target}${data.perSide ? '/side' : ''}`;
    };

    workoutModule.exerciseCatalog.forEach(item => {
      singleTarget(item);
      const override = instructionOverrides[item.id];
      if (override) {
        item.instructions = { ...item.instructions, ...override };
        return;
      }
      if (!item.instructions) return;
      const familyCue = familyCues[item.movementFamily];
      if (familyCue && !item.instructions.execution.includes(familyCue)) {
        item.instructions.execution = `${item.instructions.execution} ${familyCue}`;
      }
      if (item.instructions.setup && item.instructions.setup.length < 55) {
        item.instructions.setup = `${item.instructions.setup} Make sure the position is stable and that you can complete the full movement without rushing.`;
      }
    });

    const originalSanitizeWorkout = workoutModule.sanitizeWorkout;
    workoutModule.sanitizeWorkout = workout => {
      const sanitized = originalSanitizeWorkout(workout);
      if (!sanitized) return null;
      const exercises = (sanitized.exercises || []).filter(exercise => !removedExerciseIds.has(exercise?.id));
      exercises.forEach(exercise => {
        const catalogMatch = workoutModule.exerciseCatalog.find(item => item.id === exercise.id || item.name === exercise.name);
        if (!catalogMatch) return;
        exercise.instructions = catalogMatch.instructions;
        exercise.prescriptionData = catalogMatch.prescriptionData;
        exercise.prescription = catalogMatch.prescription;
      });
      return exercises.length ? { ...sanitized, exercises } : null;
    };

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
          workout: typeof item.workout === 'string' ? item.workout : 'Workout',
          mode: typeof item.mode === 'string' ? item.mode : 'normal',
          type: item.type === 'custom' ? 'custom' : 'workout',
          customType: ['rounds', 'minutes'].includes(item.customType) ? item.customType : null,
          target: Number.isFinite(Number(item.target)) ? Math.max(1, Math.round(Number(item.target))) : null,
          exercises: Array.isArray(item.exercises)
            ? item.exercises
                .filter(exercise => exercise && typeof exercise === 'object' && exercise.name)
                .map(exercise => ({
                  name: String(exercise.name),
                  prescription: typeof exercise.prescription === 'string' ? exercise.prescription : '',
                  trackKey: typeof exercise.trackKey === 'string' ? exercise.trackKey : '',
                  isAddOn: Boolean(exercise.isAddOn)
                }))
            : []
        }));
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
        includeWarmup: false,
        includeStretch: false,
        includeExerciseTimer: false,
        includeRestTimer: false,
        restTimerSeconds: 60,
        recovery: null,
        todayEmptyStateDismissed: false
      };
    }

    function migrateState(rawState) {
      if (!rawState || typeof rawState !== 'object') return defaultState();
      return { ...rawState, schemaVersion: STATE_SCHEMA_VERSION };
    }

    function sanitizeState(nextState) {
      if (!nextState || typeof nextState !== 'object') return defaultState();
      nextState = migrateState(nextState);

      nextState.profile = sanitizeProfile(nextState.profile);
      nextState.levels = sanitizeLevels(nextState.levels, nextState.profile);
      nextState.history = sanitizeHistory(nextState.history);
      nextState.rotationIndex = Number.isFinite(Number(nextState.rotationIndex)) ? Math.max(0, Math.round(Number(nextState.rotationIndex))) : 0;
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
        includeWarmup: state.includeWarmup,
        includeStretch: state.includeStretch,
        includeExerciseTimer: state.includeExerciseTimer,
        includeRestTimer: state.includeRestTimer,
        restTimerSeconds: state.restTimerSeconds,
        recovery: state.recovery,
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