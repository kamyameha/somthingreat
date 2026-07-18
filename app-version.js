(function (scope) {
  const APP_VERSION = '2026.07.18.153000';

  scope.APP_VERSION = APP_VERSION;
  scope.SOMTHINGREAT_VERSION = APP_VERSION;

  const workouts = scope.SomthingreatWorkouts;
  if (workouts) {
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

    removeFromArray(workouts.exerciseCatalog);
    Object.values(workouts.movementTracks || {}).forEach(removeFromArray);
    Object.values(workouts.baseTracks || {}).forEach(removeFromArray);

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

    workouts.exerciseCatalog.forEach(item => {
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

    const originalSanitizeWorkout = workouts.sanitizeWorkout;
    workouts.sanitizeWorkout = workout => {
      const sanitized = originalSanitizeWorkout(workout);
      if (!sanitized) return null;
      const exercises = (sanitized.exercises || []).filter(exercise => !removedExerciseIds.has(exercise?.id));
      exercises.forEach(exercise => {
        const catalogMatch = workouts.exerciseCatalog.find(item => item.id === exercise.id || item.name === exercise.name);
        if (!catalogMatch) return;
        exercise.instructions = catalogMatch.instructions;
        exercise.prescriptionData = catalogMatch.prescriptionData;
        exercise.prescription = catalogMatch.prescription;
      });
      return exercises.length ? { ...sanitized, exercises } : null;
    };
  }

  if (typeof document !== 'undefined') {
    ['preview-actions.css', 'bottom-nav-polish.css', 'polish-ui.css', 'ios-tabbar.css', 'quality-audit.css'].forEach(href => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `${href}?v=${APP_VERSION}`;
      document.head.appendChild(style);
    });

    scope.addEventListener('load', () => {
      ['preview-actions.js', 'quality-audit.js'].forEach(src => {
        const script = document.createElement('script');
        script.src = `${src}?v=${APP_VERSION}`;
        document.body.appendChild(script);
      });
    }, { once: true });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION };
  }
})(typeof self !== 'undefined' ? self : globalThis);