(function () {
  const PAIN_NOTICE = 'Stop if the movement causes pain. Persistent or significant pain should be assessed by a healthcare professional.';
  const HOUSEHOLD_EQUIPMENT = new Set(['floor', 'wall', 'stable-elevated-surface', 'stable-table', 'chair']);
  const BASIC_STRENGTH_TRACKS = new Set([
    'horizontalPush',
    'verticalPush',
    'dipStrength',
    'horizontalPull',
    'verticalPull',
    'scapularPull',
    'squat',
    'unilateral',
    'posteriorChain',
    'calves',
    'antiExtension',
    'compression',
    'lateralCore',
    'pushup',
    'pullup',
    'dip',
    'legs',
    'core'
  ]);

  const legacyTrackMap = {
    pushup: ['horizontalPush'],
    pullup: ['horizontalPull', 'verticalPull', 'scapularPull'],
    dip: ['dipStrength'],
    legs: ['squat', 'unilateral', 'posteriorChain', 'calves'],
    core: ['antiExtension', 'compression', 'lateralCore'],
    handstand: ['handstand'],
    lsit: ['lsit', 'compression'],
    muscleup: ['muscleupFoundation', 'muscleupPower', 'muscleupTransition', 'muscleupFull'],
    crow: ['crow'],
    rope: ['rope']
  };

  function prescriptionToString(prescription) {
    if (typeof prescription === 'string') return prescription;
    if (!prescription || typeof prescription !== 'object') return '';
    const sets = prescription.sets || 1;
    if (prescription.seconds) return `${sets} × ${prescription.seconds}s`;
    if (prescription.minutes) return `${prescription.minutes} min`;
    if (prescription.attempts) return `${prescription.attempts} attempts${prescription.perSide ? '/side' : ''}`;
    if (prescription.repsMin && prescription.repsMax) {
      return `${sets} × ${prescription.repsMin}-${prescription.repsMax}${prescription.perSide ? '/side' : ''}`;
    }
    if (prescription.reps) return `${sets} × ${prescription.reps}${prescription.perSide ? '/side' : ''}`;
    return '';
  }

  function exercise(id, name, movementFamily, difficulty, prescription, options = {}) {
    const primaryAreas = options.primaryAreas || [];
    const loadedAreas = options.loadedAreas || primaryAreas;
    const setup = options.setup || `Set up for ${name.toLowerCase()} with a stable position.`;
    const execution = options.execution || 'Move with control and stop the set before your form breaks.';
    const safety = options.safety || PAIN_NOTICE;
    return {
      id,
      name,
      movementFamily,
      difficulty,
      equipment: options.equipment || [],
      primaryAreas,
      loadedAreas,
      contraindicationTags: options.contraindicationTags || loadedAreas.map(area => `${area}-load`),
      type: options.type || 'strength',
      prescriptionData: prescription,
      prescription: prescriptionToString(prescription),
      instructions: {
        purpose: options.purpose || `${name} builds ${movementFamily.replace(/-/g, ' ')} capacity.`,
        setup,
        execution,
        safety
      },
      progressionNote: options.progressionNote || '',
      phase: options.phase || null,
      highSkill: Boolean(options.highSkill),
      explosive: Boolean(options.explosive),
      unilateral: Boolean(options.unilateral)
    };
  }

  const exerciseCatalog = [
    exercise('wall-push-up', 'Wall push-up', 'horizontal-push', 1, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['wall'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      purpose: 'Practices the full-body push-up line with very low load.',
      setup: 'Place hands on a wall at chest height and step back until your body is straight.',
      execution: 'Lower chest toward the wall, keep ribs tucked, then press the wall away.',
      safety: 'Keep wrists comfortable and step closer to the wall if your shoulders shrug. ' + PAIN_NOTICE
    }),
    exercise('high-incline-push-up', 'High incline push-up', 'horizontal-push', 2, { sets: 3, repsMin: 6, repsMax: 10 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use a counter, high table, or other surface that cannot slide.',
      execution: 'Hold a straight line from head to heels, lower under control, and press back up.',
      safety: 'The surface must be stable. Use a higher surface if your hips sag. ' + PAIN_NOTICE
    }),
    exercise('medium-incline-push-up', 'Medium incline push-up', 'horizontal-push', 3, { sets: 3, repsMin: 6, repsMax: 10 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands on a stable bench, sofa edge, or step around mid-thigh height.',
      execution: 'Lower the chest to the surface while keeping elbows controlled, then press up.',
      safety: 'Choose a surface that cannot tip. Return to a higher incline if reps get messy. ' + PAIN_NOTICE
    }),
    exercise('low-incline-push-up', 'Low incline push-up', 'horizontal-push', 4, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set hands on a low stable step or platform.',
      execution: 'Lower slowly with a straight body line and press up without letting hips drop.',
      safety: 'Use a higher incline when the low surface changes your body line. ' + PAIN_NOTICE
    }),
    exercise('eccentric-push-up', 'Eccentric push-up', 'horizontal-push', 5, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a high plank on the floor.',
      execution: 'Lower for three to five seconds, set knees down, then reset to the top.',
      safety: 'Do not collapse to the floor. Use incline push-ups if lowering is not controlled. ' + PAIN_NOTICE
    }),
    exercise('full-push-up-singles', 'Full push-up singles', 'horizontal-push', 6, { sets: 5, reps: 1 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start from a quiet high plank with hands under or slightly wider than shoulders.',
      execution: 'Complete one clean rep, rest, and repeat for quality.',
      safety: 'Stop each single before your hips sag or elbows flare hard. ' + PAIN_NOTICE
    }),
    exercise('full-push-up', 'Full push-up', 'horizontal-push', 7, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a high plank with a straight line from head to heels.',
      execution: 'Lower under control and press the floor away as one piece.',
      safety: 'End the set when your body line breaks. ' + PAIN_NOTICE
    }),
    exercise('tempo-push-up', 'Tempo push-up', 'horizontal-push', 8, { sets: 3, repsMin: 4, repsMax: 6 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set up like a full push-up.',
      execution: 'Lower for three seconds, press smoothly, and keep the body quiet.',
      safety: 'Keep reps crisp; slow tempo should not turn into collapsing. ' + PAIN_NOTICE
    }),
    exercise('pause-push-up', 'Pause push-up', 'horizontal-push', 9, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a full push-up position.',
      execution: 'Pause briefly near the bottom, stay tight, then press back up.',
      safety: 'Use a smaller range if the pause causes shoulder discomfort. ' + PAIN_NOTICE
    }),
    exercise('close-grip-push-up', 'Close-grip push-up', 'horizontal-push', 10, { sets: 3, repsMin: 3, repsMax: 6 }, {
      equipment: ['floor'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands slightly closer than a normal push-up.',
      execution: 'Keep elbows near the body, lower with control, and press up strongly.',
      safety: 'Move hands wider if wrists or elbows feel crowded. ' + PAIN_NOTICE
    }),
    exercise('decline-push-up', 'Decline push-up', 'horizontal-push', 11, { sets: 3, repsMin: 3, repsMax: 6 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place feet on a low stable surface and hands on the floor.',
      execution: 'Keep a straight line, lower calmly, and press up without piking hips.',
      safety: 'Use a low surface that cannot slide. Skip if shoulder pressure feels sharp. ' + PAIN_NOTICE
    }),

    exercise('close-grip-wall-push-up', 'Close-grip wall push-up', 'dip-strength', 1, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['wall'],
      primaryAreas: ['triceps', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands close together on a wall.',
      execution: 'Lower with elbows close to your sides and press back to straight arms.',
      safety: 'Keep shoulders down and step closer if elbows feel irritated. ' + PAIN_NOTICE
    }),
    exercise('close-grip-incline-push-up', 'Close-grip incline push-up', 'dip-strength', 2, { sets: 3, repsMin: 6, repsMax: 10 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['triceps', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use a stable high surface with hands slightly narrower than shoulders.',
      execution: 'Keep elbows close, lower under control, and press up tall.',
      safety: 'Use a higher surface if elbows flare or shoulders pinch. ' + PAIN_NOTICE
    }),
    exercise('close-grip-push-up-dip-prep', 'Close-grip push-up', 'dip-strength', 3, { sets: 3, repsMin: 4, repsMax: 6 }, {
      equipment: ['floor'],
      primaryAreas: ['triceps', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a push-up position with hands slightly closer than normal.',
      execution: 'Keep elbows close to your sides and press the floor away strongly.',
      safety: 'Widen hands slightly if wrists or elbows feel crowded. ' + PAIN_NOTICE
    }),
    exercise('top-support-hold', 'Top support hold on dip bars', 'dip-strength', 4, { sets: 4, seconds: 10 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'shoulder', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Hold the top of dip bars with arms straight and feet clear or lightly assisted.',
      execution: 'Push tall through the bars, keep shoulders down, and hold a quiet position.',
      safety: 'Use stable dip bars and step down before shoulders shrug. ' + PAIN_NOTICE
    }),
    exercise('scapular-support-movement', 'Scapular support movement', 'dip-strength', 5, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['dipBars'],
      primaryAreas: ['shoulder', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in the top support on dip bars.',
      execution: 'Keep elbows straight, let shoulders rise slightly, then press tall again.',
      safety: 'Move only through a comfortable shoulder range. ' + PAIN_NOTICE
    }),
    exercise('feet-assisted-dip', 'Feet-assisted dip', 'dip-strength', 6, { sets: 3, repsMin: 4, repsMax: 6 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use dip bars with feet lightly on the floor or a support.',
      execution: 'Lower a small controlled range, use legs only as much as needed, then press up.',
      safety: 'Avoid deep shoulder positions and keep support stable. ' + PAIN_NOTICE
    }),
    exercise('negative-dip', 'Negative dip', 'dip-strength', 7, { sets: 3, repsMin: 2, repsMax: 4 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start at the top of stable dip bars.',
      execution: 'Lower slowly, then use feet or a step to return to the top.',
      safety: 'Do not chase depth if shoulders feel pinched. ' + PAIN_NOTICE
    }),
    exercise('partial-dip', 'Partial dip', 'dip-strength', 8, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start tall on dip bars.',
      execution: 'Use a controlled partial range and press back to straight arms.',
      safety: 'Keep the range pain-free and shoulders down. ' + PAIN_NOTICE
    }),
    exercise('full-dip-singles', 'Full dip singles', 'dip-strength', 9, { sets: 5, reps: 1 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start tall on dip bars with shoulders set.',
      execution: 'Perform one clean dip, rest, and repeat for quality.',
      safety: 'Stop before tired reps turn into shoulder collapse. ' + PAIN_NOTICE
    }),
    exercise('full-dip', 'Full dip', 'dip-strength', 10, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use stable dip bars and begin from a tall support.',
      execution: 'Lower under control, keep shoulders down, and press back to the top.',
      safety: 'Use only a comfortable depth. ' + PAIN_NOTICE
    }),
    exercise('tempo-dip', 'Tempo dip', 'dip-strength', 11, { sets: 3, repsMin: 2, repsMax: 4 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set up like a full dip.',
      execution: 'Lower for three seconds and press up smoothly without bouncing.',
      safety: 'Tempo is for control, not forcing depth. ' + PAIN_NOTICE
    }),

    exercise('standing-towel-row-isometric', 'Standing towel row isometric', 'horizontal-pull', 1, { sets: 3, seconds: 15 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Hold both ends of a towel anchored around a stable post or closed-door handle you have checked carefully.',
      execution: 'Lean back slightly and pull the towel as if rowing while the body stays still.',
      safety: 'Only use an anchor that cannot move or open. ' + PAIN_NOTICE
    }),
    exercise('seated-towel-row-isometric', 'Seated towel row isometric', 'horizontal-pull', 2, { sets: 3, seconds: 20 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Sit tall and loop a towel around your feet or a stable low anchor.',
      execution: 'Pull elbows back and hold shoulder blades gently together.',
      safety: 'Keep the neck relaxed and do not yank the towel. ' + PAIN_NOTICE
    }),
    exercise('high-angle-table-row', 'High-angle table row', 'horizontal-pull', 3, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use only a heavy stable table or rail that cannot tip or slide.',
      execution: 'Keep knees bent, pull chest toward the edge, and lower slowly.',
      safety: 'Skip this if the structure is not unquestionably stable. ' + PAIN_NOTICE
    }),
    exercise('bent-knee-inverted-row', 'Bent-knee inverted row', 'horizontal-pull', 4, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Lie under a stable table or low bar with knees bent.',
      execution: 'Pull chest up, keep body from shoulders to knees straight, and lower with control.',
      safety: 'Do not use furniture that rocks, slides, or feels light. ' + PAIN_NOTICE
    }),
    exercise('straight-leg-inverted-row', 'Straight-leg inverted row', 'horizontal-pull', 5, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a stable low bar or heavy table and straighten the legs.',
      execution: 'Keep the body long, pull chest toward the anchor, and lower slowly.',
      safety: 'Use bent knees if the straight-leg version changes your shoulder position. ' + PAIN_NOTICE
    }),
    exercise('feet-elevated-inverted-row', 'Feet-elevated inverted row', 'horizontal-pull', 6, { sets: 3, repsMin: 4, repsMax: 6 }, {
      equipment: ['stable-table', 'stable-elevated-surface'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a stable row anchor and place feet on a low stable surface.',
      execution: 'Pull with a quiet body and pause briefly near the top.',
      safety: 'Both the row anchor and foot support must be stable. ' + PAIN_NOTICE
    }),

    exercise('active-hang-preparation', 'Active hang preparation', 'vertical-pull', 1, { sets: 3, seconds: 10 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'grip'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Hang from a pull-up bar with feet able to step down easily.',
      execution: 'Gently pull shoulders down away from ears and hold a quiet active hang.',
      safety: 'Step down before grip or shoulder control fades. ' + PAIN_NOTICE
    }),
    exercise('scapular-pull-up', 'Scapular pull-up', 'vertical-pull', 2, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Hang from the bar with straight arms.',
      execution: 'Without bending elbows, pull shoulders down, rise slightly, then relax with control.',
      safety: 'Avoid swinging or bending elbows. ' + PAIN_NOTICE
    }),
    exercise('assisted-pull-up', 'Assisted pull-up', 'vertical-pull', 3, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a chair, foot support, or light band assistance with a pull-up bar.',
      execution: 'Pull chest toward the bar and use only enough help to move smoothly.',
      safety: 'Check the support before each set. ' + PAIN_NOTICE
    }),
    exercise('flexed-arm-hang', 'Flexed-arm hang', 'vertical-pull', 4, { sets: 4, seconds: 8 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Step or jump carefully to the top of a pull-up.',
      execution: 'Hold chin near the bar with shoulders active, then step down safely.',
      safety: 'Use a step and stop before grip fails. ' + PAIN_NOTICE
    }),
    exercise('negative-pull-up', 'Negative pull-up', 'vertical-pull', 5, { sets: 3, repsMin: 2, repsMax: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a step to begin at the top of a pull-up.',
      execution: 'Lower as slowly as you can while keeping shoulders active.',
      safety: 'Step down before the lowering turns into a drop. ' + PAIN_NOTICE
    }),
    exercise('partial-pull-up', 'Partial pull-up', 'vertical-pull', 6, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from an active hang on a pull-up bar.',
      execution: 'Pull through the range you control, pause briefly, and lower calmly.',
      safety: 'Keep the body quiet and avoid kicking. ' + PAIN_NOTICE
    }),
    exercise('strict-pull-up-singles', 'Strict pull-up singles', 'vertical-pull', 7, { sets: 5, reps: 1 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from a still active hang.',
      execution: 'Perform one strict pull-up, rest fully, and repeat.',
      safety: 'Do not grind swinging reps. ' + PAIN_NOTICE
    }),
    exercise('strict-pull-up', 'Strict pull-up', 'vertical-pull', 8, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from a still hang with shoulders active.',
      execution: 'Pull chin over the bar, keep body quiet, and lower with control.',
      safety: 'Stop before reps become swinging attempts. ' + PAIN_NOTICE
    }),
    exercise('chest-to-bar-pull-up', 'Chest-to-bar pull-up', 'vertical-pull', 9, { sets: 3, repsMin: 2, repsMax: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from a still hang on a pull-up bar.',
      execution: 'Pull higher than a normal pull-up, aiming chest toward the bar.',
      safety: 'Only use this when strict pull-ups are controlled. ' + PAIN_NOTICE
    }),
    exercise('high-pull-up', 'High pull-up', 'vertical-pull', 10, { sets: 3, repsMin: 2, repsMax: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start fresh from a pull-up bar with a quiet body.',
      execution: 'Pull explosively but under control, trying to bring the bar lower on the chest.',
      safety: 'Rest fully and skip if reps become jerky. ' + PAIN_NOTICE,
      explosive: true
    }),

    exercise('supported-chair-squat', 'Supported chair squat', 'squat', 1, { sets: 3, repsMin: 8, repsMax: 10 }, {
      equipment: ['chair'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand in front of a chair and lightly hold support if needed.',
      execution: 'Sit back to touch the chair, then stand by pressing through the feet.',
      safety: 'Use a higher chair or smaller range if knees feel irritated. ' + PAIN_NOTICE
    }),
    exercise('chair-squat', 'Chair squat', 'squat', 2, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['chair'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand just in front of a stable chair.',
      execution: 'Tap the chair with control and stand without rocking.',
      safety: 'Keep knees tracking with toes. ' + PAIN_NOTICE
    }),
    exercise('bodyweight-squat', 'Bodyweight squat', 'squat', 3, { sets: 3, repsMin: 10, repsMax: 15 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand with feet about shoulder-width.',
      execution: 'Sit hips down and back, keep knees tracking with toes, and stand tall.',
      safety: 'Use a smaller range if knees or hips feel irritated. ' + PAIN_NOTICE
    }),
    exercise('tempo-squat', 'Tempo squat', 'squat', 4, { sets: 3, repsMin: 6, repsMax: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Set up like a bodyweight squat.',
      execution: 'Lower for three seconds, stand smoothly, and keep balance centered.',
      safety: 'Slow tempo should feel controlled, not painful. ' + PAIN_NOTICE
    }),
    exercise('pause-squat', 'Pause squat', 'squat', 5, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Set feet in your normal squat stance.',
      execution: 'Pause briefly at a comfortable bottom position, then stand with control.',
      safety: 'Pause only at a depth you own. ' + PAIN_NOTICE
    }),
    exercise('narrow-squat', 'Narrow squat', 'squat', 6, { sets: 3, repsMin: 5, repsMax: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Bring feet a little closer than your normal squat.',
      execution: 'Squat with control while knees continue to track with toes.',
      safety: 'Return to regular stance if knees feel crowded. ' + PAIN_NOTICE
    }),
    exercise('assisted-split-squat', 'Assisted split squat', 'unilateral', 7, { sets: 3, repsMin: 5, repsMax: 8, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Take a split stance and hold a wall or chair for balance.',
      execution: 'Lower straight down in a comfortable range and stand through the front foot.',
      safety: 'Use support and a shorter range if knees feel irritated. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('split-squat', 'Split squat', 'unilateral', 8, { sets: 3, repsMin: 5, repsMax: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand in a long split stance.',
      execution: 'Lower vertically, keep front foot planted, and drive up with control.',
      safety: 'Use support if balance limits the set. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('bulgarian-split-squat', 'Bulgarian split squat', 'unilateral', 9, { sets: 3, repsMin: 4, repsMax: 6, perSide: true }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Place the rear foot on a low stable surface.',
      execution: 'Lower in control and stand through the front leg.',
      safety: 'Use a low surface and hold support if balance is shaky. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('assisted-shrimp-squat', 'Assisted shrimp squat', 'unilateral', 10, { sets: 3, repsMin: 2, repsMax: 4, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand on one leg near a wall or support.',
      execution: 'Bend the standing knee, lightly use the support, and return with control.',
      safety: 'Keep the range small and controlled. ' + PAIN_NOTICE,
      unilateral: true,
      highSkill: true
    }),
    exercise('shrimp-squat', 'Shrimp squat', 'unilateral', 11, { sets: 3, repsMin: 1, repsMax: 3, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand tall on one leg with the other knee bent behind you.',
      execution: 'Lower in a small controlled range and stand without bouncing.',
      safety: 'Use the assisted version if control or knee comfort is not clear. ' + PAIN_NOTICE,
      unilateral: true,
      highSkill: true
    }),

    exercise('glute-bridge', 'Glute bridge', 'posterior-chain', 1, { sets: 3, repsMin: 10, repsMax: 15 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with knees bent and feet flat.',
      execution: 'Press through heels, lift hips by squeezing glutes, then lower slowly.',
      safety: 'Keep the lower back quiet and use a smaller lift if needed. ' + PAIN_NOTICE
    }),
    exercise('paused-glute-bridge', 'Paused glute bridge', 'posterior-chain', 2, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Set up like a glute bridge.',
      execution: 'Pause for two seconds at the top before lowering.',
      safety: 'The pause should be felt in glutes, not the lower back. ' + PAIN_NOTICE
    }),
    exercise('single-leg-assisted-glute-bridge', 'Single-leg assisted glute bridge', 'posterior-chain', 3, { sets: 3, repsMin: 6, repsMax: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with one foot doing most of the work and the other foot lightly assisting.',
      execution: 'Lift hips evenly, pause briefly, and lower with control.',
      safety: 'Keep hips level and switch to two-leg bridges if the back takes over. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('single-leg-glute-bridge', 'Single-leg glute bridge', 'posterior-chain', 4, { sets: 3, repsMin: 5, repsMax: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with one foot planted and the other leg lifted.',
      execution: 'Drive through the planted foot and lift hips without twisting.',
      safety: 'Keep the range small if hips shift. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('hip-hinge-drill', 'Hip hinge drill', 'posterior-chain', 5, { sets: 3, repsMin: 8, repsMax: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Stand tall with soft knees and hands on hips.',
      execution: 'Push hips back, keep spine neutral, then stand by squeezing glutes.',
      safety: 'Move in a range where the back stays calm. ' + PAIN_NOTICE
    }),
    exercise('bodyweight-good-morning', 'Bodyweight good morning', 'posterior-chain', 6, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Stand tall with hands across chest or behind head.',
      execution: 'Hinge hips back, keep a long spine, and return to tall.',
      safety: 'Do not round or force range. ' + PAIN_NOTICE
    }),
    exercise('single-leg-romanian-deadlift', 'Single-leg Romanian deadlift', 'posterior-chain', 7, { sets: 3, repsMin: 5, repsMax: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back', 'ankle'],
      setup: 'Stand on one leg near a wall for optional balance support.',
      execution: 'Hinge forward as the back leg reaches behind, then stand tall with control.',
      safety: 'Use support and a small range if balance affects form. ' + PAIN_NOTICE,
      unilateral: true
    }),

    exercise('two-leg-calf-raise', 'Two-leg calf raise', 'calves', 1, { sets: 3, repsMin: 12, repsMax: 18 }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand tall near a wall for balance.',
      execution: 'Rise onto the balls of both feet and lower slowly.',
      safety: 'Use support if balance is unsteady. ' + PAIN_NOTICE
    }),
    exercise('paused-calf-raise', 'Paused calf raise', 'calves', 2, { sets: 3, repsMin: 10, repsMax: 15 }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand tall near support.',
      execution: 'Rise up, pause briefly at the top, and lower under control.',
      safety: 'Keep ankles tracking straight. ' + PAIN_NOTICE
    }),
    exercise('single-leg-assisted-calf-raise', 'Single-leg assisted calf raise', 'calves', 3, { sets: 3, repsMin: 8, repsMax: 12, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand on one foot and hold a wall lightly.',
      execution: 'Rise on one foot, use the wall only for balance, and lower slowly.',
      safety: 'Switch to two-leg raises if the ankle wobbles. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('single-leg-calf-raise', 'Single-leg calf raise', 'calves', 4, { sets: 3, repsMin: 6, repsMax: 10, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand on one foot near optional support.',
      execution: 'Rise tall on the ball of the foot and lower slowly.',
      safety: 'Use support without bouncing. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('elevated-single-leg-calf-raise', 'Elevated single-leg calf raise', 'calves', 5, { sets: 3, repsMin: 5, repsMax: 8, perSide: true }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Use a low stable step and hold support.',
      execution: 'Lower heel slightly below the step, rise tall, and control the range.',
      safety: 'Use a small range and a stable step. ' + PAIN_NOTICE,
      unilateral: true
    }),

    exercise('forearm-plank', 'Forearm plank', 'anti-extension', 1, { sets: 3, seconds: 20 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['shoulder'],
      setup: 'Place forearms on the floor and step feet back.',
      execution: 'Make a straight line from head to heels and breathe steadily.',
      safety: 'Stop before the lower back sags. ' + PAIN_NOTICE
    }),
    exercise('plank', 'Plank', 'anti-extension', 2, { sets: 3, seconds: 30 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Place hands under shoulders and step into a high plank.',
      execution: 'Push the floor away, squeeze glutes lightly, and breathe.',
      safety: 'Use forearms if wrists dislike the floor. ' + PAIN_NOTICE
    }),
    exercise('hollow-hold', 'Hollow hold', 'anti-extension', 3, { sets: 3, seconds: 20 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['lower-back', 'hip'],
      setup: 'Lie on your back and press the lower back toward the floor.',
      execution: 'Lift shoulders and legs only as far as you can keep the back connected.',
      safety: 'Bend knees if the lower back lifts. ' + PAIN_NOTICE
    }),
    exercise('dead-bug', 'Dead bug', 'anti-extension', 1, { sets: 3, repsMin: 6, repsMax: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['hip'],
      setup: 'Lie on your back with arms up and knees bent.',
      execution: 'Slowly reach opposite arm and leg away, then return without arching.',
      safety: 'Keep the range small enough to control the lower back. ' + PAIN_NOTICE
    }),
    exercise('side-plank', 'Side plank', 'lateral-core', 2, { sets: 3, seconds: 15 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['shoulder', 'hip'],
      setup: 'Lie on one side with elbow under shoulder.',
      execution: 'Lift hips and hold a straight line while breathing.',
      safety: 'Use bent knees if the full shape is too much. ' + PAIN_NOTICE
    }),
    exercise('reverse-crunch', 'Reverse crunch', 'compression', 1, { sets: 3, repsMin: 8, repsMax: 12 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with knees bent.',
      execution: 'Curl hips slightly off the floor using abs, then lower slowly.',
      safety: 'Avoid swinging the legs. ' + PAIN_NOTICE
    }),
    exercise('seated-compression-lift', 'Seated compression lift', 'compression', 2, { sets: 4, repsMin: 5, repsMax: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'hip-flexors'],
      loadedAreas: ['hip'],
      setup: 'Sit tall with legs forward and hands beside thighs.',
      execution: 'Press hands down and lift one or both heels briefly without leaning back.',
      safety: 'Bend knees if hip flexors cramp. ' + PAIN_NOTICE
    }),

    exercise('bent-knee-support-hold', 'Bent-knee support hold', 'lsit', 3, { sets: 5, seconds: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Sit between hands or sturdy handles with knees bent.',
      execution: 'Press down, lift hips as able, and keep shoulders away from ears.',
      safety: 'Use handles or blocks if wrists dislike the floor. ' + PAIN_NOTICE
    }),
    exercise('foot-assisted-support-hold', 'Foot-assisted support hold', 'lsit', 4, { sets: 5, seconds: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Set hands beside hips and keep feet lightly on the floor.',
      execution: 'Press tall through arms and use feet only as much as needed.',
      safety: 'Keep shoulders down and wrists comfortable. ' + PAIN_NOTICE
    }),
    exercise('tuck-support-hold', 'Tuck support hold', 'lsit', 5, { sets: 5, seconds: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Support yourself on hands, blocks, or handles with knees tucked.',
      execution: 'Lift feet if possible and keep knees close to chest.',
      safety: 'Short clean holds beat longer collapsed holds. ' + PAIN_NOTICE
    }),
    exercise('one-leg-extended-tuck-hold', 'One-leg-extended tuck hold', 'lsit', 6, { sets: 5, seconds: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Start in a tuck support.',
      execution: 'Extend one leg slightly while keeping the other tucked, then switch.',
      safety: 'Only extend as far as hips stay lifted. ' + PAIN_NOTICE
    }),
    exercise('alternating-one-leg-lsit', 'Alternating one-leg L-sit', 'lsit', 7, { sets: 5, seconds: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Support yourself tall with one leg ready to extend.',
      execution: 'Alternate which leg is straight while keeping support strong.',
      safety: 'Return to tuck support if hips drop. ' + PAIN_NOTICE
    }),
    exercise('full-tuck-lsit', 'Full tuck L-sit', 'lsit', 8, { sets: 5, seconds: 12 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Use hands, blocks, handles, or parallel bars.',
      execution: 'Hold knees tucked with hips lifted and shoulders pressed down.',
      safety: 'Use short holds and rest before form collapses. ' + PAIN_NOTICE
    }),
    exercise('full-lsit-attempts', 'Full L-sit attempts', 'lsit', 9, { sets: 5, attempts: 1 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Start from a strong support with legs ready to extend.',
      execution: 'Attempt a full L shape briefly, then reset.',
      safety: 'Do not force cramped or painful holds. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('full-lsit-hold', 'Full L-sit hold', 'lsit', 10, { sets: 5, seconds: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Support tall on hands, blocks, handles, or bars.',
      execution: 'Extend both legs, press shoulders down, and hold the L shape.',
      safety: 'End the hold before hips drop. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('longer-lsit-hold', 'Longer L-sit hold', 'lsit', 11, { sets: 5, seconds: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder', 'hip'],
      setup: 'Set up like a full L-sit hold.',
      execution: 'Hold a clean L shape for slightly longer time.',
      safety: 'Keep shoulders down and stop before shaking changes shape. ' + PAIN_NOTICE,
      highSkill: true
    }),

    exercise('wrist-preparation', 'Wrist preparation', 'handstand', 1, { sets: 2, repsMin: 6, repsMax: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['wrist'],
      loadedAreas: ['wrist'],
      type: 'preparation',
      setup: 'Use hands-and-knees or standing wrist circles.',
      execution: 'Move wrists through gentle circles and light rocks.',
      safety: 'Keep this easy; it is preparation, not a stretch test. ' + PAIN_NOTICE
    }),
    exercise('elevated-plank-shoulder-shift', 'Elevated plank shoulder shift', 'handstand', 2, { sets: 3, repsMin: 6, repsMax: 8 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['shoulder'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Place hands on a stable elevated surface in a plank.',
      execution: 'Shift shoulders gently forward and back while keeping elbows straight.',
      safety: 'Use a higher surface if wrists or shoulders feel overloaded. ' + PAIN_NOTICE
    }),
    exercise('pike-hold', 'Pike hold', 'handstand', 3, { sets: 3, seconds: 20 }, {
      equipment: ['floor'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Start with hands and feet on the floor, hips high.',
      execution: 'Push the floor away and place ears between arms without collapsing.',
      safety: 'Keep weight comfortable on wrists. ' + PAIN_NOTICE
    }),
    exercise('pike-shoulder-taps', 'Pike shoulder taps', 'handstand', 4, { sets: 3, repsMin: 4, repsMax: 6, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Set a pike position with feet on floor.',
      execution: 'Shift weight and tap one shoulder lightly at a time.',
      safety: 'Keep taps slow and skip if wrists feel sharp. ' + PAIN_NOTICE
    }),
    exercise('wall-walk-preparation', 'Wall walk preparation', 'handstand', 5, { sets: 3, reps: 2 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Start in a plank with feet near a wall.',
      execution: 'Walk feet a small distance up the wall, then come down one step at a time.',
      safety: 'Stay far enough from the wall to come down calmly. ' + PAIN_NOTICE
    }),
    exercise('chest-to-wall-handstand-hold', 'Chest-to-wall handstand hold', 'handstand', 6, { sets: 3, seconds: 15 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Walk feet up the wall so your chest faces the wall.',
      execution: 'Push tall through shoulders, tuck ribs, and hold a calm line.',
      safety: 'Come down before fatigue makes you arch or panic. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('chest-to-wall-alignment-hold', 'Chest-to-wall alignment hold', 'handstand', 7, { sets: 3, seconds: 20 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Face the wall in a chest-to-wall handstand.',
      execution: 'Focus on ribs tucked, legs together, and shoulders pushing tall.',
      safety: 'Keep enough energy to walk down safely. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('wall-weight-shifts', 'Wall weight shifts', 'handstand', 8, { sets: 3, repsMin: 4, repsMax: 6, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Use a chest-to-wall handstand.',
      execution: 'Shift a small amount of weight from one hand to the other.',
      safety: 'Shifts should be tiny and controlled. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('heel-pulls', 'Heel pulls', 'handstand', 9, { sets: 5, attempts: 2 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Use a chest-to-wall handstand with toes lightly touching the wall.',
      execution: 'Pull one or both heels away briefly, then return to the wall with control.',
      safety: 'Only practice after stable wall holds. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('controlled-wall-exit', 'Controlled wall exit', 'handstand', 10, { sets: 5, attempts: 2 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Start near a wall with space to one side.',
      execution: 'Practice turning one hand and stepping down safely from wall support.',
      safety: 'Learn the exit before frequent free-balance attempts. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('back-to-wall-kick-up-practice', 'Back-to-wall kick-up practice', 'handstand', 11, { minutes: 4 }, {
      equipment: ['wall'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Place hands on the floor with your back facing the wall.',
      execution: 'Kick gently so the wall catches you softly, then come down with control.',
      safety: 'Do not crash into the wall; keep attempts fresh. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('freestanding-kick-up-practice', 'Freestanding kick-up practice', 'handstand', 12, { minutes: 4 }, {
      equipment: ['floor'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Use open floor space after practicing safe exits.',
      execution: 'Kick lightly, aim for control, and step down before overbalancing.',
      safety: 'Only practice when wall exits are confident. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('freestanding-balance-attempts', 'Freestanding balance attempts', 'handstand', 13, { sets: 5, attempts: 2 }, {
      equipment: ['floor'],
      primaryAreas: ['shoulder', 'core'],
      loadedAreas: ['wrist', 'shoulder'],
      setup: 'Use open space and a practiced exit.',
      execution: 'Make short balance attempts and stop while technique is calm.',
      safety: 'Keep attempts low volume and never train through wrist pain. ' + PAIN_NOTICE,
      highSkill: true
    }),

    exercise('hollow-body-strength', 'Hollow-body strength', 'muscle-up', 1, { sets: 3, seconds: 20 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['lower-back', 'hip'],
      phase: 'foundation',
      setup: 'Lie on your back in a hollow-hold setup.',
      execution: 'Hold the cleanest hollow shape you can control.',
      safety: 'Bend knees if the lower back lifts. ' + PAIN_NOTICE
    }),
    exercise('straight-bar-support-development', 'Straight-bar support development', 'muscle-up', 4, { sets: 4, seconds: 10 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'foundation',
      setup: 'Use a low straight bar or pull-up bar setup where you can safely reach support.',
      execution: 'Hold the top support tall with shoulders down.',
      safety: 'Use foot assistance and avoid forcing wrists. ' + PAIN_NOTICE
    }),
    exercise('explosive-pull-up', 'Explosive pull-up', 'muscle-up', 10, { sets: 3, repsMin: 2, repsMax: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      phase: 'power',
      setup: 'Start from a still active hang.',
      execution: 'Pull fast and high while staying controlled.',
      safety: 'Rest fully and stop if reps become jerky. ' + PAIN_NOTICE,
      explosive: true,
      highSkill: true
    }),
    exercise('straight-bar-dip-preparation', 'Straight-bar dip preparation', 'muscle-up', 10, { sets: 3, repsMin: 3, repsMax: 5 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'power',
      setup: 'Use a low straight bar or a bar you can mount safely.',
      execution: 'Practice a small controlled press from support.',
      safety: 'Keep shoulders comfortable and use foot assistance. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('low-bar-transition-drill', 'Low-bar transition drill', 'muscle-up', 11, { sets: 4, repsMin: 3, repsMax: 5 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Use a low bar with feet on the floor.',
      execution: 'Move slowly from high pull position around the bar to support.',
      safety: 'Keep it controlled and do not force shoulder rotation. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('feet-assisted-transition', 'Feet-assisted transition', 'muscle-up', 12, { sets: 4, repsMin: 2, repsMax: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Use a low bar and keep feet available for assistance.',
      execution: 'Pull, transition around the bar, and press with as much foot help as needed.',
      safety: 'Use slow reps and avoid grinding. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('band-assisted-transition', 'Band-assisted transition', 'muscle-up', 13, { sets: 4, repsMin: 2, repsMax: 4 }, {
      equipment: ['pullupBar', 'bands'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Set a resistance band securely on the bar.',
      execution: 'Use band assistance to practice a smooth pull-to-support transition.',
      safety: 'Check the band and keep your face away from the band path. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('jumping-muscle-up-transition', 'Jumping muscle-up transition', 'muscle-up', 14, { sets: 4, repsMin: 2, repsMax: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Use a bar height where a small jump can assist the transition.',
      execution: 'Jump lightly, guide the transition, and control the support position.',
      safety: 'Keep jumps low and stop if timing becomes wild. ' + PAIN_NOTICE,
      highSkill: true,
      explosive: true
    }),
    exercise('slow-negative-muscle-up', 'Slow negative muscle-up', 'muscle-up', 15, { sets: 3, repsMin: 1, repsMax: 2 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Start in top support with a safe way to get down.',
      execution: 'Lower slowly through the transition and pull-up path.',
      safety: 'Only use this when support and high pulls are controlled. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('assisted-muscle-up', 'Assisted muscle-up', 'muscle-up', 16, { sets: 5, attempts: 1 }, {
      equipment: ['pullupBar', 'bands'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'full',
      setup: 'Use a secure band or foot assistance on a stable bar.',
      execution: 'Combine pull, transition, and press with controlled assistance.',
      safety: 'Keep attempts fresh and stop before form becomes forced. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('full-muscle-up-attempt', 'Full muscle-up attempt', 'muscle-up', 17, { sets: 5, attempts: 1 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'full',
      setup: 'Start fresh on a pull-up bar with space around you.',
      execution: 'Pull high, transition smoothly, and stop after clean attempts.',
      safety: 'Do not grind tired reps or force the turnover. ' + PAIN_NOTICE,
      highSkill: true,
      explosive: true
    }),
    exercise('full-muscle-up', 'Full muscle-up', 'muscle-up', 18, { sets: 3, reps: 1 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'full',
      setup: 'Use a stable pull-up bar and begin from a still hang.',
      execution: 'Pull high, transition over the bar, press to support, and lower safely.',
      safety: 'Keep reps low quality-focused. ' + PAIN_NOTICE,
      highSkill: true,
      explosive: true
    }),
    exercise('controlled-muscle-up-repetitions', 'Controlled muscle-up repetitions', 'muscle-up', 19, { sets: 3, repsMin: 2, repsMax: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'full',
      setup: 'Start from a still hang on a stable pull-up bar.',
      execution: 'Perform controlled reps with full reset between each one.',
      safety: 'Stop before speed or shoulder control changes. ' + PAIN_NOTICE,
      highSkill: true,
      explosive: true
    }),

    exercise('crow-weight-shift', 'Crow weight shift', 'crow', 1, { sets: 5, seconds: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands on the floor with fingers spread.',
      execution: 'Lean forward slowly with toes light and return.',
      safety: 'Use a cushion in front and keep the range small. ' + PAIN_NOTICE
    }),
    exercise('crow-one-foot-lift', 'Crow one-foot lift', 'crow', 2, { sets: 5, attempts: 1, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set up like crow with knees near upper arms.',
      execution: 'Lean forward, lift one foot briefly, then switch sides.',
      safety: 'Stay low and use a soft landing area. ' + PAIN_NOTICE
    }),
    exercise('crow-hold', 'Crow hold', 'crow', 3, { sets: 5, seconds: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['core', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place knees high on upper arms and look slightly forward.',
      execution: 'Grip the floor, lift both feet briefly, and breathe.',
      safety: 'Stop before wrists feel sharp. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('jump-rope', 'Jump rope', 'rope', 1, { sets: 3, seconds: 45 }, {
      equipment: ['jumpRope'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle', 'knee'],
      setup: 'Hold rope handles lightly with elbows near your sides.',
      execution: 'Use small relaxed jumps and turn the rope from wrists.',
      safety: 'Keep jumps low and skip if ankles or knees are irritated. ' + PAIN_NOTICE,
      explosive: true
    })
  ];

  const byId = Object.fromEntries(exerciseCatalog.map(item => [item.id, item]));

  function ids(values) {
    return values.map(id => {
      if (!byId[id]) throw new Error(`Unknown exercise id: ${id}`);
      return byId[id];
    });
  }

  const movementTracks = {
    horizontalPush: ids(['wall-push-up', 'high-incline-push-up', 'medium-incline-push-up', 'low-incline-push-up', 'eccentric-push-up', 'full-push-up-singles', 'full-push-up', 'tempo-push-up', 'pause-push-up', 'close-grip-push-up', 'decline-push-up']),
    verticalPush: ids(['wrist-preparation', 'elevated-plank-shoulder-shift', 'pike-hold', 'pike-shoulder-taps', 'wall-walk-preparation', 'chest-to-wall-handstand-hold']),
    dipStrength: ids(['close-grip-wall-push-up', 'close-grip-incline-push-up', 'close-grip-push-up-dip-prep', 'top-support-hold', 'scapular-support-movement', 'feet-assisted-dip', 'negative-dip', 'partial-dip', 'full-dip-singles', 'full-dip', 'tempo-dip']),
    horizontalPull: ids(['standing-towel-row-isometric', 'seated-towel-row-isometric', 'high-angle-table-row', 'bent-knee-inverted-row', 'straight-leg-inverted-row', 'feet-elevated-inverted-row']),
    verticalPull: ids(['active-hang-preparation', 'scapular-pull-up', 'assisted-pull-up', 'flexed-arm-hang', 'negative-pull-up', 'partial-pull-up', 'strict-pull-up-singles', 'strict-pull-up', 'chest-to-bar-pull-up', 'high-pull-up']),
    scapularPull: ids(['standing-towel-row-isometric', 'seated-towel-row-isometric', 'scapular-pull-up']),
    squat: ids(['supported-chair-squat', 'chair-squat', 'bodyweight-squat', 'tempo-squat', 'pause-squat', 'narrow-squat']),
    unilateral: ids(['assisted-split-squat', 'split-squat', 'bulgarian-split-squat', 'assisted-shrimp-squat', 'shrimp-squat']),
    posteriorChain: ids(['glute-bridge', 'paused-glute-bridge', 'single-leg-assisted-glute-bridge', 'single-leg-glute-bridge', 'hip-hinge-drill', 'bodyweight-good-morning', 'single-leg-romanian-deadlift']),
    calves: ids(['two-leg-calf-raise', 'paused-calf-raise', 'single-leg-assisted-calf-raise', 'single-leg-calf-raise', 'elevated-single-leg-calf-raise']),
    antiExtension: ids(['dead-bug', 'forearm-plank', 'plank', 'hollow-hold']),
    compression: ids(['reverse-crunch', 'seated-compression-lift', 'bent-knee-support-hold', 'tuck-support-hold']),
    lateralCore: ids(['side-plank']),
    lsit: ids(['seated-compression-lift', 'bent-knee-support-hold', 'foot-assisted-support-hold', 'tuck-support-hold', 'one-leg-extended-tuck-hold', 'alternating-one-leg-lsit', 'full-tuck-lsit', 'full-lsit-attempts', 'full-lsit-hold', 'longer-lsit-hold']),
    handstand: ids(['wrist-preparation', 'elevated-plank-shoulder-shift', 'pike-hold', 'pike-shoulder-taps', 'wall-walk-preparation', 'chest-to-wall-handstand-hold', 'chest-to-wall-alignment-hold', 'wall-weight-shifts', 'heel-pulls', 'controlled-wall-exit', 'back-to-wall-kick-up-practice', 'freestanding-kick-up-practice', 'freestanding-balance-attempts']),
    muscleupFoundation: ids(['hollow-body-strength', 'scapular-pull-up', 'straight-bar-support-development', 'negative-pull-up', 'strict-pull-up-singles']),
    muscleupPower: ids(['chest-to-bar-pull-up', 'high-pull-up', 'explosive-pull-up', 'straight-bar-dip-preparation']),
    muscleupTransition: ids(['low-bar-transition-drill', 'feet-assisted-transition', 'band-assisted-transition', 'jumping-muscle-up-transition', 'slow-negative-muscle-up']),
    muscleupFull: ids(['assisted-muscle-up', 'full-muscle-up-attempt', 'full-muscle-up', 'controlled-muscle-up-repetitions']),
    crow: ids(['crow-weight-shift', 'crow-one-foot-lift', 'crow-hold']),
    rope: ids(['jump-rope'])
  };

  const baseTracks = {
    ...movementTracks,
    pushup: movementTracks.horizontalPush,
    pullup: movementTracks.verticalPull,
    dip: movementTracks.dipStrength,
    legs: movementTracks.squat,
    core: movementTracks.antiExtension,
    muscleup: movementTracks.muscleupFoundation
  };

  const energyOptions = {
    great: {
      label: 'Great',
      mode: 'great',
      title: 'Great',
      description: 'Full session · 4 exercises · full sets and reps.',
      exerciseCount: 4,
      setMultiplier: 1,
      repMultiplier: 1,
      levelShift: 0,
      icon: 'Assets/Energy/great-icon.png'
    },
    normal: {
      label: 'Normal',
      mode: 'normal',
      title: 'Normal',
      description: 'Standard session · 4 exercises · slightly reduced sets and reps.',
      exerciseCount: 4,
      setMultiplier: 0.8,
      repMultiplier: 0.85,
      levelShift: 0,
      icon: 'Assets/Energy/normal-icon.png'
    },
    tired: {
      label: 'Tired',
      mode: 'tired',
      title: 'Tired',
      description: 'Shorter session · 3 exercises · reduced volume.',
      exerciseCount: 3,
      setMultiplier: 0.8,
      repMultiplier: 0.85,
      levelShift: 0,
      icon: 'Assets/Energy/normal-icon.png'
    },
    exhausted: {
      label: 'Exhausted',
      mode: 'exhausted',
      title: 'Exhausted',
      description: 'Minimum session · 3 easier exercises · low sets and reps.',
      exerciseCount: 3,
      setMultiplier: 0.55,
      repMultiplier: 0.65,
      levelShift: -1,
      icon: 'Assets/Energy/exhaustive-icon.png'
    }
  };

  const workoutAddOns = {
    warmups: [
      {
        id: 'warmup-general-a',
        trackKey: 'warmup',
        name: 'Warm-up',
        prescription: '2 min · 30s each',
        setCount: 4,
        isAddOn: true,
        addOnType: 'warmup',
        setLabels: ['March in place', 'Arm circles', 'Hip circles', 'Bodyweight squats']
      },
      {
        id: 'warmup-general-b',
        trackKey: 'warmup',
        name: 'Warm-up',
        prescription: '2 min · 30s each',
        setCount: 4,
        isAddOn: true,
        addOnType: 'warmup',
        setLabels: ['Step touch', 'Shoulder rolls', 'Good mornings', 'Ankle bounces']
      }
    ],
    stretches: [
      {
        id: 'stretch-general-a',
        trackKey: 'stretch',
        name: 'Stretch',
        prescription: '2 min · 30s each',
        setCount: 4,
        isAddOn: true,
        addOnType: 'stretch',
        setLabels: ['Hamstring stretch', 'Quad stretch', 'Chest opener', "Child's pose"]
      },
      {
        id: 'stretch-general-b',
        trackKey: 'stretch',
        name: 'Stretch',
        prescription: '2 min · 30s each',
        setCount: 4,
        isAddOn: true,
        addOnType: 'stretch',
        setLabels: ['Calf stretch', 'Hip flexor stretch', 'Shoulder stretch', 'Forward fold']
      }
    ]
  };

  const addOnHelp = {
    'Warm-up': {
      purpose: 'Raises temperature and prepares joints before training.',
      cues: ['Do each listed movement for about 30 seconds.', 'Move lightly and breathe steadily.', 'Treat it as preparation, not a test.'],
      safety: 'Keep it easy and pain-free.'
    },
    'Stretch': {
      purpose: 'Helps you cool down and leave the session calmly.',
      cues: ['Do each listed stretch for about 30 seconds.', 'Ease into each position slowly and breathe.', 'Do not force range.'],
      safety: 'Stretch should feel gentle, not sharp.'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function createDefaultLevels() {
    const levels = {};
    Object.keys(baseTracks).forEach(key => {
      levels[key] = {
        level: 0,
        points: 0,
        positiveExposures: 0,
        difficultExposures: 0,
        levelExposures: 0,
        plateauCount: 0
      };
    });
    return levels;
  }

  function migrateLevels(levels = {}) {
    const migrated = { ...levels };
    Object.entries(legacyTrackMap).forEach(([oldKey, newKeys]) => {
      if (!levels[oldKey]) return;
      newKeys.forEach(key => {
        if (!migrated[key]) migrated[key] = { ...levels[oldKey] };
      });
    });
    return migrated;
  }

  function profileEquipment(profile = null) {
    const equipment = Array.isArray(profile?.equipment) ? profile.equipment : [];
    return new Set(equipment.includes('none') && equipment.length > 1 ? equipment.filter(item => item !== 'none') : equipment);
  }

  function hasEquipment(exercise, equipmentSet) {
    return (exercise.equipment || []).every(item => HOUSEHOLD_EQUIPMENT.has(item) || equipmentSet.has(item));
  }

  function availableTrack(track, equipmentSet) {
    return track.filter(item => hasEquipment(item, equipmentSet));
  }

  function getMuscleUpGate(profile = null, state = {}) {
    const levels = state?.levels || {};
    const equipment = profileEquipment(profile);
    const verticalLevel = levels.verticalPull?.level ?? levels.pullup?.level ?? 0;
    const dipLevel = levels.dipStrength?.level ?? levels.dip?.level ?? 0;
    const powerReady = verticalLevel >= 7 && dipLevel >= 3;
    const transitionReady = verticalLevel >= 8 && dipLevel >= 5;
    const fullReady = verticalLevel >= 9 && dipLevel >= 8;

    if (!equipment.has('pullupBar')) {
      return { trackKey: 'horizontalPull', label: 'Building your pull-up strength', phase: 'foundation' };
    }
    if (!powerReady) {
      return { trackKey: 'muscleupFoundation', label: 'Building your pull-up strength', phase: 'foundation' };
    }
    if (!transitionReady) {
      return { trackKey: 'muscleupPower', label: 'Building your transition strength', phase: 'power' };
    }
    if (!fullReady) {
      return { trackKey: 'muscleupTransition', label: 'Building your transition strength', phase: 'transition' };
    }
    return { trackKey: 'muscleupFull', label: 'Practicing the full skill', phase: 'full' };
  }

  function getTracks(profile = null, state = {}) {
    const equipmentSet = profileEquipment(profile);
    const tracks = {};
    Object.entries(movementTracks).forEach(([key, track]) => {
      tracks[key] = availableTrack(track, equipmentSet);
    });

    if (!equipmentSet.has('pullupBar')) {
      tracks.verticalPull = [];
      tracks.muscleupFoundation = tracks.horizontalPull;
      tracks.muscleupPower = [];
      tracks.muscleupTransition = [];
      tracks.muscleupFull = [];
    }

    if (!equipmentSet.has('dipBars')) {
      tracks.dipStrength = tracks.dipStrength.filter(item => !item.equipment.includes('dipBars'));
    }

    if (!equipmentSet.has('jumpRope')) tracks.rope = [];

    const muscleGate = getMuscleUpGate(profile, state);
    tracks.pushup = tracks.horizontalPush;
    tracks.pullup = tracks.verticalPull.length ? tracks.verticalPull : tracks.horizontalPull;
    tracks.dip = tracks.dipStrength;
    tracks.legs = tracks.squat;
    tracks.core = tracks.antiExtension;
    tracks.muscleup = tracks[muscleGate.trackKey] || [];

    return tracks;
  }

  function getGoalTrackKey(goal, profile = null, state = {}) {
    if (goal === 'handstand') return 'handstand';
    if (goal === 'lsit') return 'lsit';
    if (goal === 'muscleup') return getMuscleUpGate(profile, state).trackKey;
    if (goal === 'general') return 'crow';
    return 'verticalPull';
  }

  function getRotation(profile = null, state = {}) {
    const goal = profile?.goal || 'pullup';
    const muscleGate = getMuscleUpGate(profile, state);
    const skillTrack = getGoalTrackKey(goal, profile, state);
    return [
      { name: 'Push', tracks: ['horizontalPush', 'dipStrength', 'verticalPush', 'antiExtension'] },
      { name: 'Pull', tracks: ['horizontalPull', 'verticalPull', 'scapularPull', 'antiExtension'] },
      { name: 'Legs + Core', tracks: ['squat', 'posteriorChain', 'unilateral', 'compression', 'calves'] },
      {
        name: 'Skills',
        focusLabel: goal === 'muscleup' ? muscleGate.label : '',
        tracks: unique([skillTrack, goal === 'lsit' ? 'compression' : goal === 'handstand' ? 'verticalPush' : 'horizontalPull', 'lsit', 'antiExtension'])
      }
    ];
  }

  function getEnergyConfig(mode = 'normal') {
    return Object.values(energyOptions).find(option => option.mode === mode) || energyOptions.normal;
  }

  function isTrackAvailable(trackKey, tracks) {
    return Array.isArray(tracks?.[trackKey]) && tracks[trackKey].length > 0;
  }

  function getSetCount(prescription = '') {
    const setMatch = prescription.match(/(\d+)\s*×/);
    if (setMatch) return Math.max(1, Number(setMatch[1]));
    const attemptMatch = prescription.match(/(\d+)\s+attempts/);
    if (attemptMatch) return Math.max(1, Number(attemptMatch[1]));
    return 1;
  }

  function adaptPrescription(prescription, config = energyOptions.great, recovery = null, plateauCount = 0) {
    const setMultiplier = recovery?.mode === 'reduce' ? Math.min(config.setMultiplier ?? 1, 0.75) : config.setMultiplier ?? 1;
    const repMultiplier = recovery?.mode === 'reduce' ? Math.min(config.repMultiplier ?? 1, 0.75) : config.repMultiplier ?? 1;

    let adapted = prescription.replace(/(\d+)\s*×\s*(\d+)-(\d+)(s?)(\/side)?/g, (_, sets, min, max, seconds, side = '') => {
      const nextSets = Math.max(1, Math.round(Number(sets) * setMultiplier));
      const nextMin = Math.max(1, Math.round(Number(min) * repMultiplier));
      const nextMax = Math.max(nextMin, Math.round(Number(max) * repMultiplier));
      return `${nextSets} × ${nextMin}-${nextMax}${seconds || ''}${side || ''}`;
    });

    adapted = adapted.replace(/(\d+)\s*×\s*(\d+)(s?)(\/side)?/g, (_, sets, reps, seconds, side = '') => {
      const nextSets = Math.max(1, Math.round(Number(sets) * setMultiplier));
      const nextReps = Math.max(1, Math.round(Number(reps) * repMultiplier));
      return `${nextSets} × ${nextReps}${seconds || ''}${side || ''}`;
    });

    adapted = adapted.replace(/(\d+)\s+attempts(\/side)?/g, (_, attempts, side = '') => {
      const nextAttempts = Math.max(1, Math.round(Number(attempts) * repMultiplier));
      return `${nextAttempts} attempts${side || ''}`;
    });

    adapted = adapted.replace(/(\d+)\s+min/g, (_, minutes) => {
      const nextMinutes = Math.max(1, Math.round(Number(minutes) * repMultiplier));
      return `${nextMinutes} min`;
    });

    if (plateauCount > 0) return `${adapted} · quality tempo`;
    return adapted;
  }

  function normalizeExercise(rawExercise) {
    if (!rawExercise || typeof rawExercise !== 'object') return null;
    if (!rawExercise.name || !rawExercise.prescription) return null;
    const catalogMatch = rawExercise.id ? byId[rawExercise.id] : exerciseCatalog.find(item => item.name === rawExercise.name);
    const normalized = {
      ...(catalogMatch || {}),
      ...rawExercise
    };
    normalized.id = normalized.id || `legacy-${normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    normalized.trackKey = normalized.trackKey || `exercise-${normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    normalized.progressionTrackKey = normalized.progressionTrackKey || normalized.trackKey;
    normalized.setCount = normalized.setCount || getSetCount(normalized.prescription);
    return normalized;
  }

  function sanitizeWorkout(workout) {
    if (!workout || typeof workout !== 'object') return null;
    if (!Array.isArray(workout.exercises)) return null;

    const exercises = workout.exercises.map(normalizeExercise).filter(Boolean);
    if (!exercises.length) return null;

    return {
      ...workout,
      ratings: workout.ratings || {},
      sets: workout.sets || {},
      exercises
    };
  }

  function getActiveRecovery(state = {}) {
    const recovery = state?.recovery;
    if (!recovery?.area) return null;
    if (recovery.until && !Number.isNaN(new Date(recovery.until).getTime()) && new Date(recovery.until).getTime() < Date.now()) return null;
    return recovery;
  }

  function recoveryAreaType(recovery) {
    const area = `${recovery?.area || ''}`.toLowerCase();
    if (area.includes('shoulder')) return 'shoulder';
    if (area.includes('elbow')) return 'elbow';
    if (area.includes('wrist')) return 'wrist';
    if (area.includes('back')) return 'lower-back';
    if (area.includes('hip')) return 'hip';
    if (area.includes('knee')) return 'knee';
    if (area.includes('ankle')) return 'ankle';
    if (area.includes('head') || area.includes('neck')) return 'other';
    return 'other';
  }

  const recoveryRules = {
    shoulder: { restAreas: ['shoulder'], reduceAreas: ['shoulder'], fallbackTracks: ['squat', 'posteriorChain', 'calves', 'compression'] },
    elbow: { restAreas: ['elbow'], reduceAreas: ['elbow'], fallbackTracks: ['squat', 'posteriorChain', 'calves', 'antiExtension'] },
    wrist: { restAreas: ['wrist'], reduceAreas: ['wrist'], fallbackTracks: ['squat', 'posteriorChain', 'calves', 'forearmCore', 'antiExtension'] },
    'lower-back': { restAreas: ['lower-back'], reduceAreas: ['lower-back'], fallbackTracks: ['horizontalPush', 'calves', 'compression'] },
    hip: { restAreas: ['hip'], reduceAreas: ['hip'], fallbackTracks: ['horizontalPush', 'horizontalPull', 'calves'] },
    knee: { restAreas: ['knee'], reduceAreas: ['knee'], fallbackTracks: ['horizontalPush', 'horizontalPull', 'antiExtension', 'compression'] },
    ankle: { restAreas: ['ankle'], reduceAreas: ['ankle'], fallbackTracks: ['horizontalPush', 'horizontalPull', 'antiExtension', 'posteriorChain'] },
    other: { restAreas: [], reduceAreas: [], fallbackTracks: ['antiExtension', 'horizontalPush', 'posteriorChain'] }
  };

  function exerciseLoadsArea(exercise, areas) {
    return areas.some(area => (exercise.loadedAreas || []).includes(area) || (exercise.contraindicationTags || []).includes(`${area}-load`));
  }

  function isExerciseAllowedForRecovery(exercise, recovery, mode = recovery?.mode || 'reduce') {
    if (!exercise || !recovery) return true;
    const rule = recoveryRules[recoveryAreaType(recovery)] || recoveryRules.other;
    if (mode === 'rest' && exerciseLoadsArea(exercise, rule.restAreas)) return false;
    if (mode === 'reduce') {
      if (exercise.explosive || exercise.highSkill) return false;
      if (exerciseLoadsArea(exercise, rule.reduceAreas) && exercise.difficulty > 2) return false;
    }
    return true;
  }

  function filteredTrackForRecovery(track, recovery) {
    if (!recovery) return track;
    return track.filter(exercise => isExerciseAllowedForRecovery(exercise, recovery));
  }

  function chooseLevel(trackKey, track, config, state = {}, recovery = null) {
    const trackState = state?.levels?.[trackKey] || { level: 0, points: 0 };
    const levelShift = recovery?.mode === 'reduce' ? Math.min(config.levelShift || 0, -2) : config.levelShift || 0;
    const baseLevel = Math.min(Math.max(trackState.level || 0, 0), track.length - 1);
    return Math.max(0, Math.min(baseLevel + levelShift, track.length - 1));
  }

  function levelSearchOrder(startLevel, length) {
    const order = [];
    for (let offset = 0; offset < length; offset += 1) {
      const higher = startLevel + offset;
      const lower = startLevel - offset;
      if (higher < length) order.push(higher);
      if (offset > 0 && lower >= 0) order.push(lower);
    }
    return order;
  }

  function getExercise(trackKey, config, state, profile = null, options = {}) {
    const recovery = options.recovery || getActiveRecovery(state);
    const usedIds = options.usedIds || new Set();
    const tracks = getTracks(profile, state);
    const safeTrackKey = isTrackAvailable(trackKey, tracks) ? trackKey : 'antiExtension';
    const originalTrack = tracks[safeTrackKey] || tracks.antiExtension || baseTracks.antiExtension;
    const track = filteredTrackForRecovery(originalTrack, recovery);
    if (!track.length) return null;
    const adjustedLevel = chooseLevel(safeTrackKey, track, config, state, recovery);
    const selectedLevel = levelSearchOrder(adjustedLevel, track.length)
      .find(level => !usedIds.has(track[level].id));
    if (selectedLevel === undefined) return null;
    const baseExercise = track[selectedLevel];
    const trackState = state?.levels?.[safeTrackKey] || {};
    const plateauCount = Math.max(0, Math.floor(trackState.plateauCount || 0));
    const prescription = adaptPrescription(baseExercise.prescription, config, recovery, plateauCount);

    return normalizeExercise({
      ...baseExercise,
      trackKey: safeTrackKey,
      progressionTrackKey: safeTrackKey,
      prescription,
      basePrescription: baseExercise.prescription,
      level: selectedLevel + 1,
      originalLevel: Math.min(Math.max(trackState.level || 0, 0), originalTrack.length - 1) + 1,
      setCount: getSetCount(prescription),
      plateau: plateauCount > 0
    });
  }

  function fillTracksForRecovery(trackKeys, config, profile, state, recovery) {
    if (!recovery) return trackKeys;
    const rule = recoveryRules[recoveryAreaType(recovery)] || recoveryRules.other;
    const tracks = getTracks(profile, state);
    const next = [...trackKeys];
    for (const fallback of rule.fallbackTracks) {
      if (next.length >= config.exerciseCount) break;
      if (!isTrackAvailable(fallback, tracks) || next.includes(fallback)) continue;
      if (filteredTrackForRecovery(tracks[fallback], recovery).length) next.push(fallback);
    }
    return next;
  }

  function buildWorkoutTracks(workout, desiredCount, profile = null, state = {}) {
    const tracks = getTracks(profile, state);
    const recovery = getActiveRecovery(state);
    const fillByWorkout = {
      Push: ['horizontalPush', 'dipStrength', 'verticalPush', 'antiExtension', 'squat'],
      Pull: ['horizontalPull', 'verticalPull', 'scapularPull', 'antiExtension', 'posteriorChain'],
      'Legs + Core': ['squat', 'posteriorChain', 'unilateral', 'compression', 'calves', 'antiExtension'],
      Skills: ['handstand', 'lsit', 'verticalPull', 'horizontalPull', 'antiExtension', 'posteriorChain']
    };
    const selected = [];
    [...workout.tracks, ...(fillByWorkout[workout.name] || [])].forEach(trackKey => {
      if (selected.length >= desiredCount) return;
      if (selected.includes(trackKey) || !isTrackAvailable(trackKey, tracks)) return;
      const track = filteredTrackForRecovery(tracks[trackKey], recovery);
      if (!track.length) return;
      selected.push(trackKey);
    });
    return fillTracksForRecovery(selected, { exerciseCount: desiredCount }, profile, state, recovery).slice(0, desiredCount);
  }

  function getTodayWorkout({ mode = 'normal', state = {}, profile = null } = {}) {
    const rotation = getRotation(profile, state);
    const workout = rotation[(state.rotationIndex || 0) % rotation.length];
    const config = getEnergyConfig(mode);
    const recovery = getActiveRecovery(state);
    const preferredTracks = buildWorkoutTracks(workout, config.exerciseCount, profile, state);
    const availableTracks = getTracks(profile, state);
    const tracks = [...preferredTracks];
    Object.keys(availableTracks).forEach(trackKey => {
      if (tracks.length >= config.exerciseCount * 2) return;
      if (tracks.includes(trackKey) || !isTrackAvailable(trackKey, availableTracks)) return;
      if (!filteredTrackForRecovery(availableTracks[trackKey], recovery).length) return;
      tracks.push(trackKey);
    });
    const usedIds = new Set();
    const exercises = [];

    tracks.forEach(trackKey => {
      if (exercises.length >= config.exerciseCount) return;
      const item = getExercise(trackKey, config, state, profile, { recovery, usedIds });
      if (!item) return;
      exercises.push(item);
      usedIds.add(item.id);
    });

    return {
      mode: config.mode,
      workoutName: workout.name,
      focusLabel: workout.focusLabel || '',
      energyTitle: config.title,
      energyDescription: config.description,
      exercises
    };
  }

  function getExtraSessionMinutes(addOns = {}) {
    return (addOns.warmup ? 2 : 0) + (addOns.stretch ? 2 : 0);
  }

  function applyWorkoutAddOns(workout, addOns = {}) {
    const variantIndex = Math.floor(Date.now() / 86400000) % 2;
    const exercises = [...(workout.exercises || [])];
    if (addOns.warmup) exercises.unshift(clone(workoutAddOns.warmups[variantIndex]));
    if (addOns.stretch) exercises.push(clone(workoutAddOns.stretches[variantIndex]));
    return {
      ...workout,
      includeWarmup: Boolean(addOns.warmup),
      includeStretch: Boolean(addOns.stretch),
      extraMinutes: getExtraSessionMinutes(addOns),
      exercises
    };
  }

  function sessionTotalLabel(workout) {
    const extra = workout?.extraMinutes || 0;
    if (!extra) return 'Workout only';
    return `+ ${extra} min add-ons`;
  }

  function modeLabel(mode) {
    if (mode === 'great') return 'Great · 4 exercises · Full volume';
    if (mode === 'normal') return 'Normal · 4 exercises · Reduced volume';
    if (mode === 'tired' || mode === 'reduced') return 'Tired · 3 exercises · Reduced volume';
    if (mode === 'exhausted' || mode === 'minimum') return 'Exhausted · 3 easier exercises · Minimum volume';
    return 'Workout';
  }

  function getExerciseHelp(nameOrId = '') {
    const item = byId[nameOrId] || exerciseCatalog.find(exercise => exercise.name === nameOrId);
    if (!item) return addOnHelp[nameOrId] || null;
    return {
      purpose: item.instructions.purpose,
      cues: [item.instructions.setup, item.instructions.execution],
      safety: item.instructions.safety
    };
  }

  function ratingRulesForTrack(trackKey) {
    const isBasic = BASIC_STRENGTH_TRACKS.has(trackKey);
    return {
      progressPoints: isBasic ? 5 : 7,
      positiveExposures: isBasic ? 2 : 3,
      regressionDifficulty: 3,
      plateauExposures: isBasic ? 5 : 6
    };
  }

  function applyRating(levels, trackKey, rating, profile = null) {
    const trackState = levels?.[trackKey];
    const delta = { easy: 2, good: 1, hard: 0, failed: -2 }[rating];
    if (!trackState || delta === undefined) return;

    const track = getTracks(profile, { levels })[trackKey] || baseTracks[trackKey] || [];
    const maxLevel = Math.max(0, track.length - 1);
    const rules = ratingRulesForTrack(trackKey);
    trackState.points = Math.max(-6, Math.min((trackState.points || 0) + delta, 10));
    trackState.levelExposures = (trackState.levelExposures || 0) + 1;
    trackState.positiveExposures = (trackState.positiveExposures || 0) + (rating === 'easy' ? 1 : rating === 'good' ? 0.5 : 0);
    trackState.difficultExposures = rating === 'failed'
      ? (trackState.difficultExposures || 0) + 2
      : rating === 'hard'
        ? (trackState.difficultExposures || 0) + 1
        : Math.max(0, (trackState.difficultExposures || 0) - 1);

    if (trackState.points >= rules.progressPoints && trackState.positiveExposures >= rules.positiveExposures) {
      trackState.level = Math.min((trackState.level || 0) + 1, maxLevel);
      trackState.points = 0;
      trackState.positiveExposures = 0;
      trackState.difficultExposures = 0;
      trackState.levelExposures = 0;
      trackState.plateauCount = 0;
      return;
    }

    if (trackState.difficultExposures >= rules.regressionDifficulty && trackState.points <= -2) {
      trackState.level = Math.max((trackState.level || 0) - 1, 0);
      trackState.points = 0;
      trackState.positiveExposures = 0;
      trackState.difficultExposures = 0;
      trackState.levelExposures = 0;
      trackState.plateauCount = 0;
      return;
    }

    if ((trackState.levelExposures || 0) >= rules.plateauExposures && trackState.points > 0 && (trackState.level || 0) < maxLevel) {
      trackState.plateauCount = Math.min((trackState.plateauCount || 0) + 1, 3);
      trackState.levelExposures = 0;
    }
  }

  function validateWorkoutSystem() {
    const errors = [];
    const ids = new Set();
    exerciseCatalog.forEach(item => {
      if (ids.has(item.id)) errors.push(`Duplicate exercise id: ${item.id}`);
      ids.add(item.id);
      if (!item.prescription) errors.push(`Missing prescription: ${item.id}`);
      if (!item.instructions?.setup || !item.instructions?.execution || !item.instructions?.safety) errors.push(`Missing instructions: ${item.id}`);
      if (/recommended/i.test(item.name) || /recommended/i.test(item.prescription)) errors.push(`Informational exercise: ${item.id}`);
    });
    Object.entries(movementTracks).forEach(([key, track]) => {
      let previousDifficulty = 0;
      track.forEach(item => {
        if (item.difficulty < previousDifficulty) errors.push(`Difficulty drops in ${key}: ${item.id}`);
        previousDifficulty = Math.max(previousDifficulty, item.difficulty);
      });
    });
    return errors;
  }

  window.SomthingreatWorkouts = {
    baseTracks,
    movementTracks,
    exerciseCatalog,
    recoveryRules,
    energyOptions,
    workoutAddOns,
    createDefaultLevels,
    migrateLevels,
    getTracks,
    getRotation,
    getGoalTrackKey,
    getMuscleUpGate,
    getTodayWorkout,
    getExtraSessionMinutes,
    applyWorkoutAddOns,
    sessionTotalLabel,
    sanitizeWorkout,
    getExerciseHelp,
    modeLabel,
    applyRating,
    validateWorkoutSystem,
    isExerciseAllowedForRecovery
  };
})();
