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

  const scoreSchema = {
    difficulty: '1-10 overall physical and technical difficulty',
    fatigue: '1-10 systemic fatigue from one normal working set',
    skill: '1-10 coordination, timing, and precision demand',
    stability: '1-10 balance and joint-control demand',
    stimulus: ['strength', 'skill', 'mobility', 'stability', 'power', 'conditioning', 'recovery'],
    jointStress: ['wrist', 'elbow', 'shoulder', 'lowerBack', 'hip', 'knee', 'ankle']
  };

  // Scoring is intentionally simple and deterministic. The values are not
  // medical or scientific claims; they give the generator a consistent way to
  // compare exercises without parsing names.
  const scoringGuidelines = {
    difficulty: 'Blend of physical difficulty, technical execution, and strength required.',
    fatigue: 'Estimated systemic cost of one working set: dead bug 2, glute bridge 3, push-up 5, pull-up 8, muscle-up 10.',
    skill: 'Coordination and precision: squat 1, push-up 2, Bulgarian split squat 4, pull-up 5, L-sit 8, handstand 10.',
    stability: 'Balance and joint control: wall push-up 1, push-up 3, split squat 5, shrimp squat 8, handstand 10.',
    stimulus: 'Exactly one primary training stimulus used by budget and balance decisions.',
    jointStress: '0 means negligible; higher values mean the reduce/rest recovery filters should prefer easier alternatives.'
  };

  const stimuli = new Set(scoreSchema.stimulus);
  const jointKeys = scoreSchema.jointStress;
  const fatigueBudgets = {
    great: { min: 26, max: 30, tolerance: 2, skillLimit: 18 },
    normal: { min: 18, max: 24, tolerance: 2, skillLimit: 14 },
    tired: { min: 12, max: 16, tolerance: 2, skillLimit: 10 },
    exhausted: { min: 8, max: 10, tolerance: 2, skillLimit: 6 }
  };

  function clampScore(value, fallback = 1) {
    const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
    return Math.max(1, Math.min(number, 10));
  }

  function clampStress(value) {
    const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
    return Math.max(0, Math.min(number, 10));
  }

  function defaultStimulus(movementFamily, options = {}) {
    if (options.stimulus && stimuli.has(options.stimulus)) return options.stimulus;
    if (options.explosive) return 'power';
    if (options.type === 'preparation' || movementFamily === 'handstand' || movementFamily === 'lsit' || movementFamily === 'crow') return 'skill';
    if (movementFamily === 'scapular-pull' || movementFamily === 'anti-extension' || movementFamily === 'lateral-core') return 'stability';
    if (movementFamily === 'rope') return 'conditioning';
    return 'strength';
  }

  function estimateFatigue(difficulty, movementFamily, options = {}) {
    let fatigue = Math.ceil(difficulty * 0.75);
    if (['vertical-pull', 'unilateral', 'muscle-up', 'dip-strength'].includes(movementFamily)) fatigue += 1;
    if (['calves', 'anti-extension', 'compression', 'lateral-core', 'handstand', 'crow'].includes(movementFamily)) fatigue -= 1;
    if (options.explosive) fatigue += 1;
    if (options.type === 'preparation') fatigue -= 2;
    return clampScore(options.fatigue, fatigue);
  }

  function estimateSkill(difficulty, movementFamily, options = {}) {
    let skill = Math.ceil(difficulty * 0.45);
    if (movementFamily === 'handstand') skill = Math.max(skill, difficulty + 1);
    if (movementFamily === 'lsit') skill = Math.max(skill, Math.ceil(difficulty * 0.85));
    if (movementFamily === 'muscle-up') skill = Math.max(skill, 8);
    if (movementFamily === 'crow') skill = Math.max(skill, difficulty + 2);
    if (['unilateral', 'vertical-pull'].includes(movementFamily)) skill += 1;
    if (options.highSkill) skill += 2;
    return clampScore(options.skill, skill);
  }

  function estimateStability(difficulty, movementFamily, options = {}) {
    let stability = Math.ceil(difficulty * 0.45);
    if (movementFamily === 'handstand') stability = Math.max(stability, difficulty + 1);
    if (movementFamily === 'crow') stability = Math.max(stability, difficulty + 2);
    if (movementFamily === 'unilateral') stability += 2;
    if (movementFamily === 'lsit') stability += 1;
    if (options.unilateral) stability += 1;
    return clampScore(options.stability, stability);
  }

  function defaultJointStress(loadedAreas, difficulty, options = {}) {
    const stress = {};
    jointKeys.forEach(key => stress[key] = 0);
    const areaToJoint = {
      wrist: 'wrist',
      elbow: 'elbow',
      shoulder: 'shoulder',
      'lower-back': 'lowerBack',
      lowerBack: 'lowerBack',
      hip: 'hip',
      knee: 'knee',
      ankle: 'ankle'
    };
    loadedAreas.forEach(area => {
      const key = areaToJoint[area];
      if (!key) return;
      stress[key] = Math.max(stress[key], clampStress(Math.ceil(difficulty * 0.8)));
    });
    if (options.explosive) {
      ['knee', 'ankle', 'shoulder'].forEach(key => {
        if (stress[key]) stress[key] = clampStress(stress[key] + 1);
      });
    }
    if (options.jointStress) {
      jointKeys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(options.jointStress, key)) {
          stress[key] = clampStress(options.jointStress[key]);
        }
      });
    }
    return stress;
  }

  function withScoreDefaults(item) {
    const movementFamily = item.movementFamily || 'legacy';
    const difficulty = clampScore(item.difficulty, 1);
    const loadedAreas = item.loadedAreas || [];
    const options = {
      fatigue: item.fatigue,
      skill: item.skill,
      stability: item.stability,
      stimulus: item.stimulus,
      jointStress: item.jointStress,
      highSkill: item.highSkill,
      explosive: item.explosive,
      unilateral: item.unilateral,
      type: item.type
    };
    return {
      ...item,
      movementFamily,
      difficulty,
      fatigue: estimateFatigue(difficulty, movementFamily, options),
      skill: estimateSkill(difficulty, movementFamily, options),
      stability: estimateStability(difficulty, movementFamily, options),
      stimulus: defaultStimulus(movementFamily, options),
      jointStress: defaultJointStress(loadedAreas, difficulty, options)
    };
  }

  function prescriptionToString(prescription) {
    if (!prescription || typeof prescription !== 'object') return '';
    const sets = prescription.sets || 1;
    if (prescription.seconds) return `${sets} × ${prescription.seconds}s`;
    if (prescription.minutes) return `${prescription.minutes} min`;
    if (prescription.attempts) return `${sets} × ${prescription.attempts} attempt${prescription.attempts === 1 ? '' : 's'}${prescription.perSide ? '/side' : ''}`;
    if (prescription.reps) return `${sets} × ${prescription.reps}${prescription.perSide ? '/side' : ''}`;
    return '';
  }

  function positiveInteger(value, fallback = null) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  }

  // Display strings are an output. This parser exists only to migrate workouts
  // saved by releases that did not persist structured prescription data.
  function legacyPrescriptionData(label = '', fallbackSets = null) {
    const text = String(label).trim();
    const sets = positiveInteger(fallbackSets, positiveInteger(text.match(/^(\d+)\s*[×x]/)?.[1], 1));
    const seconds = positiveInteger(text.match(/[×x]\s*(\d+)\s*s\b/i)?.[1]);
    if (seconds) return { sets, seconds };
    const minutes = positiveInteger(text.match(/^(\d+)\s*min\b/i)?.[1]);
    if (minutes) return { sets: 1, minutes };
    const attempts = positiveInteger(text.match(/[×x]\s*(\d+)\s*attempt/i)?.[1] || text.match(/^(\d+)\s*attempt/i)?.[1]);
    if (attempts) return { sets, attempts, perSide: /\/side/i.test(text) };
    const legacyRange = text.match(/[×x]\s*(\d+)\s*[-–]\s*(\d+)(\/side)?/i);
    if (legacyRange) {
      return {
        sets,
        reps: Math.round((positiveInteger(legacyRange[1]) + positiveInteger(legacyRange[2])) / 2),
        perSide: Boolean(legacyRange[3])
      };
    }
    const reps = positiveInteger(text.match(/[×x]\s*(\d+)(\/side)?/i)?.[1]);
    if (reps) return { sets, reps, perSide: /\/side/i.test(text) };
    return null;
  }

  function normalizePrescriptionData(value, legacyLabel = '', fallbackSets = null) {
    const hasStructuredSource = Boolean(value && typeof value === 'object');
    const source = hasStructuredSource ? value : legacyPrescriptionData(legacyLabel, fallbackSets);
    if (!source) return null;
    const sets = positiveInteger(source.sets, source.minutes ? 1 : positiveInteger(fallbackSets, 1));
    const normalized = { sets, perSide: Boolean(source.perSide) };
    if (positiveInteger(source.seconds)) normalized.seconds = positiveInteger(source.seconds);
    else if (positiveInteger(source.minutes)) normalized.minutes = positiveInteger(source.minutes);
    else if (positiveInteger(source.attempts)) normalized.attempts = positiveInteger(source.attempts);
    else if (positiveInteger(source.reps)) normalized.reps = positiveInteger(source.reps);
    else if (hasStructuredSource && legacyLabel) return normalizePrescriptionData(null, legacyLabel, fallbackSets);
    else return null;
    return normalized;
  }

  function prescriptionFields(data) {
    const prescriptionData = normalizePrescriptionData(data);
    if (!prescriptionData) return null;
    const prescriptionType = prescriptionData.seconds || prescriptionData.minutes
      ? 'time'
      : prescriptionData.attempts
        ? 'attempts'
        : 'reps';
    return {
      prescriptionData,
      prescriptionType,
      setCount: prescriptionData.sets,
      repsPerSet: prescriptionData.reps || null,
      attemptsPerSet: prescriptionData.attempts || null,
      secondsPerSet: prescriptionData.seconds || (prescriptionData.minutes ? prescriptionData.minutes * 60 : null),
      perSide: Boolean(prescriptionData.perSide),
      prescription: prescriptionToString(prescriptionData)
    };
  }

  const successCriteriaById = Object.freeze({
    'wall-push-up': ["Lower chest toward the wall, keep ribs tucked, then press the wall away."],
    'high-incline-push-up': ["Hold a straight line from head to heels, lower under control, and press back up."],
    'medium-incline-push-up': ["Your chest reaches the same controlled depth on each repetition, your body stays in a straight line from head to heels, and you return to straight arms without the hips sagging."],
    'low-incline-push-up': ["Lower slowly with a straight body line and press up without letting hips drop."],
    'eccentric-push-up': ["Lower for three to five seconds, set knees down, then reset to the top."],
    'full-push-up-singles': ["Complete one clean rep, rest, and repeat for quality."],
    'full-push-up': ["Lower under control and press the floor away as one piece."],
    'tempo-push-up': ["Lower for three seconds, press smoothly, and keep the body quiet."],
    'pause-push-up': ["Pause briefly near the bottom, stay tight, then press back up."],
    'close-grip-push-up': ["Keep elbows near the body, lower with control, and press up strongly."],
    'decline-push-up': ["Keep a straight line, lower calmly, and press up without piking hips."],
    'close-grip-wall-push-up': ["Lower with elbows close to your sides and press back to straight arms."],
    'close-grip-incline-push-up': ["Keep elbows close, lower under control, and press up tall."],
    'close-grip-push-up-dip-prep': ["Keep elbows close to your sides and press the floor away strongly."],
    'top-support-hold': ["Push tall through the bars, keep shoulders down, and hold a quiet position.","The required position or movement continues until the timer reaches zero."],
    'scapular-support-movement': ["Keep elbows straight, let shoulders rise slightly, then press tall again."],
    'feet-assisted-dip': ["Lower a small controlled range, use legs only as much as needed, then press up."],
    'negative-dip': ["Lower slowly, then use feet or a step to return to the top."],
    'partial-dip': ["Use a controlled partial range and press back to straight arms."],
    'full-dip-singles': ["Perform one clean dip, rest, and repeat for quality."],
    'full-dip': ["Lower under control, keep shoulders down, and press back to the top."],
    'tempo-dip': ["Lower for three seconds and press up smoothly without bouncing."],
    'standing-towel-row-isometric': ["Lean back slightly and pull the towel as if rowing while the body stays still.","The required position or movement continues until the timer reaches zero."],
    'seated-towel-row-isometric': ["Pull elbows back and hold shoulder blades gently together.","The required position or movement continues until the timer reaches zero."],
    'high-angle-table-row': ["Keep knees bent, pull chest toward the edge, and lower slowly."],
    'bent-knee-inverted-row': ["Pull chest up, keep body from shoulders to knees straight, and lower with control."],
    'straight-leg-inverted-row': ["Keep the body long, pull chest toward the anchor, and lower slowly."],
    'feet-elevated-inverted-row': ["Pull with a quiet body and pause briefly near the top."],
    'active-hang-preparation': ["Gently pull shoulders down away from ears and hold a quiet active hang.","The required position or movement continues until the timer reaches zero."],
    'scapular-pull-up': ["Without bending elbows, pull shoulders down, rise slightly, then relax with control."],
    'assisted-pull-up': ["Pull chest toward the bar and use only enough help to move smoothly."],
    'flexed-arm-hang': ["Hold chin near the bar with shoulders active, then step down safely.","The required position or movement continues until the timer reaches zero."],
    'negative-pull-up': ["Lower as slowly as you can while keeping shoulders active."],
    'partial-pull-up': ["Pull through the range you control, pause briefly, and lower calmly."],
    'strict-pull-up-singles': ["Perform one strict pull-up, rest fully, and repeat."],
    'strict-pull-up': ["Pull chin over the bar, keep body quiet, and lower with control."],
    'chest-to-bar-pull-up': ["Pull higher than a normal pull-up, aiming chest toward the bar."],
    'high-pull-up': ["Pull explosively but under control, trying to bring the bar lower on the chest."],
    'supported-chair-squat': ["Sit back to touch the chair, then stand by pressing through the feet."],
    'chair-squat': ["Tap the chair with control and stand without rocking."],
    'bodyweight-squat': ["Sit hips down and back, keep knees tracking with toes, and stand tall."],
    'tempo-squat': ["Lower for three seconds, stand smoothly, and keep balance centered."],
    'pause-squat': ["Pause briefly at a comfortable bottom position, then stand with control."],
    'narrow-squat': ["Squat with control while knees continue to track with toes."],
    'assisted-split-squat': ["Lower straight down in a comfortable range and stand through the front foot.","The prescribed work is completed separately on each side."],
    'split-squat': ["Lower vertically, keep front foot planted, and drive up with control.","The prescribed work is completed separately on each side."],
    'bulgarian-split-squat': ["Lower in control and stand through the front leg.","The prescribed work is completed separately on each side."],
    'assisted-shrimp-squat': ["Bend the standing knee, lightly use the support, and return with control.","The prescribed work is completed separately on each side."],
    'shrimp-squat': ["Lower in a small controlled range and stand without bouncing.","The prescribed work is completed separately on each side."],
    'glute-bridge': ["Press through heels, lift hips by squeezing glutes, then lower slowly."],
    'paused-glute-bridge': ["Pause for two seconds at the top before lowering."],
    'single-leg-assisted-glute-bridge': ["Lift hips evenly, pause briefly, and lower with control.","The prescribed work is completed separately on each side."],
    'single-leg-glute-bridge': ["Drive through the planted foot and lift hips without twisting.","The prescribed work is completed separately on each side."],
    'hip-hinge-drill': ["Push hips back, keep spine neutral, then stand by squeezing glutes."],
    'bodyweight-good-morning': ["Hinge hips back, keep a long spine, and return to tall."],
    'single-leg-romanian-deadlift': ["Hinge forward as the back leg reaches behind, then stand tall with control.","The prescribed work is completed separately on each side."],
    'two-leg-calf-raise': ["Rise onto the balls of both feet and lower slowly."],
    'paused-calf-raise': ["Rise up, pause briefly at the top, and lower under control."],
    'single-leg-assisted-calf-raise': ["Rise on one foot, use the wall only for balance, and lower slowly.","The prescribed work is completed separately on each side."],
    'single-leg-calf-raise': ["Rise tall on the ball of the foot and lower slowly.","The prescribed work is completed separately on each side."],
    'elevated-single-leg-calf-raise': ["Lower heel slightly below the step, rise tall, and control the range.","The prescribed work is completed separately on each side."],
    'forearm-plank': ["Make a straight line from head to heels and breathe steadily.","The required position or movement continues until the timer reaches zero."],
    'plank': ["Push the floor away, squeeze glutes lightly, and breathe.","The required position or movement continues until the timer reaches zero."],
    'hollow-hold': ["Lift shoulders and legs only as far as you can keep the back connected.","The required position or movement continues until the timer reaches zero."],
    'dead-bug': ["Slowly reach opposite arm and leg away, then return without arching.","The prescribed work is completed separately on each side."],
    'side-plank': ["Lift hips and hold a straight line while breathing.","The required position or movement continues until the timer reaches zero."],
    'reverse-crunch': ["Curl hips slightly off the floor using abs, then lower slowly."],
    'seated-compression-lift': ["Press hands down and lift one or both heels briefly without leaning back."],
    'bent-knee-support-hold': ["Press down, lift hips as able, and keep shoulders away from ears.","The required position or movement continues until the timer reaches zero."],
    'foot-assisted-support-hold': ["Press tall through arms and use feet only as much as needed.","The required position or movement continues until the timer reaches zero."],
    'tuck-support-hold': ["Lift feet if possible and keep knees close to chest.","The required position or movement continues until the timer reaches zero."],
    'one-leg-extended-tuck-hold': ["Extend one leg slightly while keeping the other tucked, then switch.","The required position or movement continues until the timer reaches zero."],
    'alternating-one-leg-lsit': ["Alternate which leg is straight while keeping support strong.","The required position or movement continues until the timer reaches zero."],
    'full-tuck-lsit': ["Hold knees tucked with hips lifted and shoulders pressed down.","The required position or movement continues until the timer reaches zero."],
    'full-lsit-attempts': ["Attempt a full L shape briefly, then reset.","The attempt ends with a controlled reset or the stated safe exit."],
    'full-lsit-hold': ["Extend both legs, press shoulders down, and hold the L shape.","The required position or movement continues until the timer reaches zero."],
    'longer-lsit-hold': ["Hold a clean L shape for slightly longer time.","The required position or movement continues until the timer reaches zero."],
    'wrist-preparation': ["Slowly shift your shoulders forward until you feel mild pressure through the palms, then shift back to the starting position. That is one repetition."],
    'elevated-plank-shoulder-shift': ["Shift shoulders gently forward and back while keeping elbows straight."],
    'pike-hold': ["Push the floor away and place ears between arms without collapsing.","The required position or movement continues until the timer reaches zero."],
    'pike-shoulder-taps': ["Shift weight and tap one shoulder lightly at a time.","The prescribed work is completed separately on each side."],
    'wall-walk-preparation': ["Walk feet a small distance up the wall, then come down one step at a time."],
    'chest-to-wall-handstand-hold': ["Push tall through shoulders, tuck ribs, and hold a calm line.","The required position or movement continues until the timer reaches zero."],
    'chest-to-wall-alignment-hold': ["Focus on ribs tucked, legs together, and shoulders pushing tall.","The required position or movement continues until the timer reaches zero."],
    'wall-weight-shifts': ["Shift a small amount of weight from one hand to the other.","The prescribed work is completed separately on each side."],
    'heel-pulls': ["Pull one or both heels away briefly, then return to the wall with control.","The attempt ends with a controlled reset or the stated safe exit."],
    'controlled-wall-exit': ["Practice turning one hand and stepping down safely from wall support.","The attempt ends with a controlled reset or the stated safe exit."],
    'back-to-wall-kick-up-practice': ["Kick gently so the wall catches you softly, then come down with control.","The required position or movement continues until the timer reaches zero."],
    'freestanding-kick-up-practice': ["Kick lightly, aim for control, and step down before overbalancing.","The required position or movement continues until the timer reaches zero."],
    'freestanding-balance-attempts': ["Make short balance attempts and stop while technique is calm.","The attempt ends with a controlled reset or the stated safe exit."],
    'hollow-body-strength': ["Hold the cleanest hollow shape you can control.","The required position or movement continues until the timer reaches zero."],
    'straight-bar-support-development': ["Hold the top support tall with shoulders down.","The required position or movement continues until the timer reaches zero."],
    'explosive-pull-up': ["Pull fast and high while staying controlled."],
    'straight-bar-dip-preparation': ["Practice a small controlled press from support."],
    'low-bar-transition-drill': ["Move slowly from high pull position around the bar to support."],
    'feet-assisted-transition': ["Pull, transition around the bar, and press with as much foot help as needed."],
    'band-assisted-transition': ["Use band assistance to practice a smooth pull-to-support transition."],
    'jumping-muscle-up-transition': ["Jump lightly, guide the transition, and control the support position."],
    'slow-negative-muscle-up': ["Lower slowly through the transition and pull-up path."],
    'assisted-muscle-up': ["Combine pull, transition, and press with controlled assistance.","The attempt ends with a controlled reset or the stated safe exit."],
    'full-muscle-up-attempt': ["Pull high, transition smoothly, and stop after clean attempts.","The attempt ends with a controlled reset or the stated safe exit."],
    'full-muscle-up': ["The repetition starts below the bar from a controlled still hang.","The body moves above the bar without jumping, band assistance, or foot assistance, and reaches stable straight-arm support.","The transition and approved descent or ending remain controlled."],
    'controlled-muscle-up-repetitions': ["Perform controlled reps with full reset between each one."],
    'crow-weight-shift': ["Lean forward slowly with toes light and return.","The required position or movement continues until the timer reaches zero."],
    'crow-one-foot-lift': ["Lean forward, lift one foot briefly, then switch sides.","The attempt ends with a controlled reset or the stated safe exit.","The prescribed work is completed separately on each side."],
    'crow-hold': ["Grip the floor, lift both feet briefly, and breathe.","The required position or movement continues until the timer reaches zero."],
    'jump-rope': ["Use small relaxed jumps and turn the rope from wrists.","The required position or movement continues until the timer reaches zero."],
    'assisted-single-leg-sit-to-stand': ["Each side completes the sit and stand with the working heel planted, the knee tracking over the toes, and only light assistance."],
    'elevated-pistol-squat': ["Each side reaches the elevated target under control and returns to standing without the free foot touching down."],
    'counterbalance-pistol-squat': ["Each side reaches a controlled single-leg squat depth with the heel planted and stands without a bounce or free-foot support."],
    'assisted-pistol-squat': ["Each side reaches full controlled depth and stands with only light hand assistance, a planted heel, and steady knee tracking."],
    'pistol-squat-negative': ["Each side lowers to full depth for at least three controlled seconds, keeps the heel planted, and finishes on the target without falling."],
    'full-pistol-squat': ["Each side completes one controlled full-depth repetition with the working heel planted, the other leg off the floor, controlled knee tracking, and a return to standing without assistance, an uncontrolled fall, or a bounce."],
    'elevated-pike-hold': ["The hips remain stacked toward the shoulders, elbows stay straight, shoulders stay active, and the position is maintained until the timer reaches zero."],
    'pike-push-up': ["Each repetition reaches a consistent controlled head depth between the hands and returns to straight elbows without the shoulders collapsing."],
    'feet-elevated-pike-push-up': ["Each repetition reaches the defined safe target with hips high and returns to straight arms without losing shoulder control."],
    'wall-handstand-push-up-negative': ["Each descent reaches the padded target under control for at least three seconds, with active shoulders and no collapse onto the head or neck."],
    'partial-wall-handstand-push-up': ["Each repetition touches the same raised safe target under control and returns to full elbow extension without kicking or collapsing."],
    'full-wall-handstand-push-up': ["From a stable wall-supported handstand, each repetition descends under control until the head reaches the defined safe target, then presses to full elbow extension with active shoulders, no uncontrolled collapse, and no leg kick."],
  });

  const instructionGuidance = {
    'horizontal-push': { focus: ['Keep a straight body line.', 'Press evenly through both hands.'], mistakes: ['Letting the hips sag.', 'Shrugging the shoulders.'] },
    'vertical-push': { focus: ['Keep ribs controlled.', 'Push tall through the shoulders.'], mistakes: ['Arching the lower back.', 'Rushing the weight shift.'] },
    'dip-strength': { focus: ['Keep shoulders down.', 'Use a comfortable depth.'], mistakes: ['Dropping too deep.', 'Letting shoulders collapse forward.'] },
    'horizontal-pull': { focus: ['Lead with the elbows.', 'Lower with control.'], mistakes: ['Using an unstable anchor.', 'Shrugging toward the ears.'] },
    'vertical-pull': { focus: ['Start with active shoulders.', 'Lower without dropping.'], mistakes: ['Swinging for momentum.', 'Losing shoulder control at the bottom.'] },
    'scapular-pull': { focus: ['Keep elbows straight.', 'Move only the shoulder blades.'], mistakes: ['Bending the elbows.', 'Swinging the body.'] },
    squat: { focus: ['Keep the whole foot planted.', 'Track knees with toes.'], mistakes: ['Heels lifting.', 'Knees collapsing inward.'] },
    unilateral: { focus: ['Control the working knee.', 'Use support before balance changes form.'], mistakes: ['Pushing mostly from the back leg.', 'Twisting the pelvis.'] },
    'posterior-chain': { focus: ['Brace before moving.', 'Finish with the glutes.'], mistakes: ['Arching the lower back.', 'Rushing the lowering phase.'] },
    calves: { focus: ['Rise through the big-toe side.', 'Lower without bouncing.'], mistakes: ['Rolling onto the outer foot.', 'Using momentum.'] },
    'anti-extension': { focus: ['Keep ribs toward the pelvis.', 'Breathe without losing tension.'], mistakes: ['Arching the lower back.', 'Holding the breath.'] },
    compression: { focus: ['Stay tall through the spine.', 'Lift without swinging.'], mistakes: ['Leaning far backward.', 'Using momentum.'] },
    'lateral-core': { focus: ['Keep shoulder stacked.', 'Keep hips lifted.'], mistakes: ['Rotating the chest downward.', 'Letting hips sag.'] },
    lsit: { focus: ['Press strongly through the hands.', 'Choose a clean short hold.'], mistakes: ['Shrugging the shoulders.', 'Holding after the hips drop.'] },
    handstand: { focus: ['Push tall through the shoulders.', 'Keep ribs controlled.'], mistakes: ['Kicking or shifting too hard.', 'Continuing without a safe exit.'] },
    crow: { focus: ['Spread the fingers.', 'Look slightly forward.'], mistakes: ['Jumping both feet up.', 'Looking straight down.'] },
    'muscle-up': { focus: ['Keep the pull close.', 'Control the transition.'], mistakes: ['Grinding tired attempts.', 'Forcing the turnover with the shoulders.'] },
    rope: { focus: ['Keep jumps low.', 'Turn the rope from the wrists.'], mistakes: ['Jumping too high.', 'Swinging the whole arms.'] }
  };

  function normalizeInstructionText(value = '') {
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
  }

  function distinctSuccessCriteria(movement = [], successCriteria = []) {
    const movementText = normalizeInstructionText((Array.isArray(movement) ? movement : [movement]).filter(Boolean).join(' '));
    return (Array.isArray(successCriteria) ? successCriteria : [successCriteria]).filter(Boolean).filter(value => normalizeInstructionText(value) !== movementText);
  }

  function generatedSuccessCriteria(name, prescription, options = {}) {
    if (prescription?.seconds || prescription?.minutes) {
      return [`The defined position remains controlled and the listed focus points are maintained until the timer reaches zero${prescription?.perSide ? ' on each prescribed side' : ''}.`];
    }
    if (prescription?.attempts) {
      return [`Each ${name.toLowerCase()} attempt reaches its defined controlled endpoint and finishes with the stated safe reset or exit${prescription?.perSide || options.unilateral ? ' on each side' : ''}.`];
    }
    if (prescription?.perSide || options.unilateral) {
      return ['Every prescribed repetition is completed separately on each side through a consistent controlled range, with the working joint alignment maintained.'];
    }
    return ['Every prescribed repetition uses a consistent controlled range and returns to the defined finish position without losing the listed focus points.'];
  }

  function structuredInstructions(name, movementFamily, instructions, options = {}) {
    const guidance = instructionGuidance[movementFamily] || { focus: ['Move slowly and stay in control.'], mistakes: ['Rushing the movement.'] };
    const movement = Array.isArray(options.movement) && options.movement.length ? options.movement.slice(0, 6) : [instructions.execution];
    const authoredSuccess = successCriteriaById[options.exerciseId] || [];
    const successCriteria = distinctSuccessCriteria(movement, authoredSuccess);
    const removedDuplicate = successCriteria.length !== authoredSuccess.length;
    return {
      purpose: instructions.purpose,
      startingPosition: instructions.setup,
      movement,
      successCriteria: removedDuplicate || !successCriteria.length ? generatedSuccessCriteria(name, options.prescription, options) : successCriteria,
      focus: (options.focus || guidance.focus).slice(0, 3),
      commonMistakes: (options.commonMistakes || guidance.mistakes).slice(0, 3),
      safety: instructions.safety,
      visualRequired: options.visualRequired !== false,
      visualGuidance: options.visualGuidance || `Show the starting position and controlled movement for ${name}.`,
      // Kept while the existing help panel migrates to the structured fields.
      setup: instructions.setup,
      execution: instructions.execution
    };
  }

  function exercise(id, name, movementFamily, difficulty, prescription, options = {}) {
    if (!Array.isArray(successCriteriaById[id]) || !successCriteriaById[id].length) {
      throw new Error(`Missing authored success criteria: ${id}`);
    }
    const primaryAreas = options.primaryAreas || [];
    const loadedAreas = options.loadedAreas || primaryAreas;
    const setup = options.setup || `Set up for ${name.toLowerCase()} with a stable position.`;
    const execution = options.execution || 'Move with control and stop the set before your form breaks.';
    const safety = options.safety || PAIN_NOTICE;
    const safeDifficulty = clampScore(difficulty);
    const stimulus = defaultStimulus(movementFamily, options);
    return {
      id,
      name,
      movementFamily,
      difficulty: safeDifficulty,
      fatigue: estimateFatigue(safeDifficulty, movementFamily, options),
      skill: estimateSkill(safeDifficulty, movementFamily, options),
      stability: estimateStability(safeDifficulty, movementFamily, options),
      stimulus,
      jointStress: defaultJointStress(loadedAreas, safeDifficulty, options),
      equipment: options.equipment || [],
      primaryAreas,
      loadedAreas,
      contraindicationTags: options.contraindicationTags || loadedAreas.map(area => `${area}-load`),
      type: options.type || 'strength',
      ...prescriptionFields(prescription),
      instructions: structuredInstructions(name, movementFamily, {
        purpose: options.purpose || `${name} builds ${movementFamily.replace(/-/g, ' ')} capacity.`,
        setup,
        execution,
        safety
      }, { ...options, exerciseId: id, prescription }),
      progressionNote: options.progressionNote || '',
      phase: options.phase || null,
      highSkill: Boolean(options.highSkill),
      explosive: Boolean(options.explosive),
      unilateral: Boolean(options.unilateral || prescription?.perSide)
    };
  }

  const exerciseCatalog = [
    exercise('wall-push-up', 'Wall push-up', 'horizontal-push', 1, { sets: 3, reps: 10 }, {
      equipment: ['wall'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      purpose: 'Practices the full-body push-up line with very low load.',
      setup: 'Place hands on a wall at chest height and step back until your body is straight.',
      execution: 'Lower chest toward the wall, keep ribs tucked, then press the wall away.',
      safety: 'Keep wrists comfortable and step closer to the wall if your shoulders shrug. ' + PAIN_NOTICE
    }),
    exercise('high-incline-push-up', 'High incline push-up', 'horizontal-push', 2, { sets: 3, reps: 8 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use a counter, high table, or other surface that cannot slide.',
      execution: 'Hold a straight line from head to heels, lower under control, and press back up.',
      safety: 'The surface must be stable. Use a higher surface if your hips sag. ' + PAIN_NOTICE
    }),
    exercise('medium-incline-push-up', 'Medium incline push-up', 'horizontal-push', 3, { sets: 3, reps: 8 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands on a stable bench, sofa edge, or step around mid-thigh height.',
      execution: 'Bend your elbows and lower your chest toward the surface. Keep your body moving as one unit, then press through both hands until your arms are straight.',
      safety: 'Choose a surface that cannot tip. Return to a higher incline if reps get messy. ' + PAIN_NOTICE
    }),
    exercise('low-incline-push-up', 'Low incline push-up', 'horizontal-push', 4, { sets: 3, reps: 7 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set hands on a low stable step or platform.',
      execution: 'Lower slowly with a straight body line and press up without letting hips drop.',
      safety: 'Use a higher incline when the low surface changes your body line. ' + PAIN_NOTICE
    }),
    exercise('eccentric-push-up', 'Eccentric push-up', 'horizontal-push', 5, { sets: 3, reps: 4 }, {
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
    exercise('full-push-up', 'Full push-up', 'horizontal-push', 7, { sets: 3, reps: 7 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a high plank with a straight line from head to heels.',
      execution: 'Lower under control and press the floor away as one piece.',
      safety: 'End the set when your body line breaks. ' + PAIN_NOTICE
    }),
    exercise('tempo-push-up', 'Tempo push-up', 'horizontal-push', 8, { sets: 3, reps: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Set up like a full push-up.',
      execution: 'Lower for three seconds, press smoothly, and keep the body quiet.',
      safety: 'Keep reps crisp; slow tempo should not turn into collapsing. ' + PAIN_NOTICE
    }),
    exercise('pause-push-up', 'Pause push-up', 'horizontal-push', 9, { sets: 3, reps: 4 }, {
      equipment: ['floor'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in a full push-up position.',
      execution: 'Pause briefly near the bottom, stay tight, then press back up.',
      safety: 'Use a smaller range if the pause causes shoulder discomfort. ' + PAIN_NOTICE
    }),
    exercise('close-grip-push-up', 'Close-grip push-up', 'horizontal-push', 10, { sets: 3, reps: 5 }, {
      equipment: ['floor'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands slightly closer than a normal push-up.',
      execution: 'Keep elbows near the body, lower with control, and press up strongly.',
      safety: 'Move hands wider if wrists or elbows feel crowded. ' + PAIN_NOTICE
    }),
    exercise('decline-push-up', 'Decline push-up', 'horizontal-push', 11, { sets: 3, reps: 5 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['chest', 'triceps', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place feet on a low stable surface and hands on the floor.',
      execution: 'Keep a straight line, lower calmly, and press up without piking hips.',
      safety: 'Use a low surface that cannot slide. Skip if shoulder pressure feels sharp. ' + PAIN_NOTICE
    }),

    exercise('close-grip-wall-push-up', 'Close-grip wall push-up', 'dip-strength', 1, { sets: 3, reps: 10 }, {
      equipment: ['wall'],
      primaryAreas: ['triceps', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Place hands close together on a wall.',
      execution: 'Lower with elbows close to your sides and press back to straight arms.',
      safety: 'Keep shoulders down and step closer if elbows feel irritated. ' + PAIN_NOTICE
    }),
    exercise('close-grip-incline-push-up', 'Close-grip incline push-up', 'dip-strength', 2, { sets: 3, reps: 8 }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['triceps', 'chest'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use a stable high surface with hands slightly narrower than shoulders.',
      execution: 'Keep elbows close, lower under control, and press up tall.',
      safety: 'Use a higher surface if elbows flare or shoulders pinch. ' + PAIN_NOTICE
    }),
    exercise('close-grip-push-up-dip-prep', 'Close-grip push-up for dip preparation', 'dip-strength', 3, { sets: 3, reps: 5 }, {
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
    exercise('scapular-support-movement', 'Scapular support movement', 'dip-strength', 5, { sets: 3, reps: 7 }, {
      equipment: ['dipBars'],
      primaryAreas: ['shoulder', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start in the top support on dip bars.',
      execution: 'Keep elbows straight, let shoulders rise slightly, then press tall again.',
      safety: 'Move only through a comfortable shoulder range. ' + PAIN_NOTICE
    }),
    exercise('feet-assisted-dip', 'Feet-assisted dip', 'dip-strength', 6, { sets: 3, reps: 5 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use dip bars with feet lightly on the floor or a support.',
      execution: 'Lower a small controlled range, use legs only as much as needed, then press up.',
      safety: 'Avoid deep shoulder positions and keep support stable. ' + PAIN_NOTICE
    }),
    exercise('negative-dip', 'Negative dip', 'dip-strength', 7, { sets: 3, reps: 3 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Start at the top of stable dip bars.',
      execution: 'Lower slowly, then use feet or a step to return to the top.',
      safety: 'Do not chase depth if shoulders feel pinched. ' + PAIN_NOTICE
    }),
    exercise('partial-dip', 'Partial dip', 'dip-strength', 8, { sets: 3, reps: 4 }, {
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
    exercise('full-dip', 'Full dip', 'dip-strength', 10, { sets: 3, reps: 4 }, {
      equipment: ['dipBars'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      setup: 'Use stable dip bars and begin from a tall support.',
      execution: 'Lower under control, keep shoulders down, and press back to the top.',
      safety: 'Use only a comfortable depth. ' + PAIN_NOTICE
    }),
    exercise('tempo-dip', 'Tempo dip', 'dip-strength', 11, { sets: 3, reps: 3 }, {
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
    exercise('high-angle-table-row', 'High-angle table row', 'horizontal-pull', 3, { sets: 3, reps: 7 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use only a heavy stable table or rail that cannot tip or slide.',
      execution: 'Keep knees bent, pull chest toward the edge, and lower slowly.',
      safety: 'Skip this if the structure is not unquestionably stable. ' + PAIN_NOTICE
    }),
    exercise('bent-knee-inverted-row', 'Bent-knee inverted row', 'horizontal-pull', 4, { sets: 3, reps: 7 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Lie under a stable table or low bar with knees bent.',
      execution: 'Pull chest up, keep body from shoulders to knees straight, and lower with control.',
      safety: 'Do not use furniture that rocks, slides, or feels light. ' + PAIN_NOTICE
    }),
    exercise('straight-leg-inverted-row', 'Straight-leg inverted row', 'horizontal-pull', 5, { sets: 3, reps: 7 }, {
      equipment: ['stable-table'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a stable low bar or heavy table and straighten the legs.',
      execution: 'Keep the body long, pull chest toward the anchor, and lower slowly.',
      safety: 'Use bent knees if the straight-leg version changes your shoulder position. ' + PAIN_NOTICE
    }),
    exercise('feet-elevated-inverted-row', 'Feet-elevated inverted row', 'horizontal-pull', 6, { sets: 3, reps: 5 }, {
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
    exercise('scapular-pull-up', 'Scapular pull-up', 'vertical-pull', 2, { sets: 3, reps: 7 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Hang from the bar with straight arms.',
      execution: 'Without bending elbows, pull shoulders down, rise slightly, then relax with control.',
      safety: 'Avoid swinging or bending elbows. ' + PAIN_NOTICE
    }),
    exercise('assisted-pull-up', 'Assisted pull-up', 'vertical-pull', 3, { sets: 3, reps: 4 }, {
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
    exercise('negative-pull-up', 'Negative pull-up', 'vertical-pull', 5, { sets: 3, reps: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Use a step to begin at the top of a pull-up.',
      execution: 'Lower as slowly as you can while keeping shoulders active.',
      safety: 'Step down before the lowering turns into a drop. ' + PAIN_NOTICE
    }),
    exercise('partial-pull-up', 'Partial pull-up', 'vertical-pull', 6, { sets: 3, reps: 4 }, {
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
    exercise('strict-pull-up', 'Strict pull-up', 'vertical-pull', 8, { sets: 3, reps: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from a still hang with shoulders active.',
      execution: 'Pull chin over the bar, keep body quiet, and lower with control.',
      safety: 'Stop before reps become swinging attempts. ' + PAIN_NOTICE
    }),
    exercise('chest-to-bar-pull-up', 'Chest-to-bar pull-up', 'vertical-pull', 9, { sets: 3, reps: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start from a still hang on a pull-up bar.',
      execution: 'Pull higher than a normal pull-up, aiming chest toward the bar.',
      safety: 'Only use this when strict pull-ups are controlled. ' + PAIN_NOTICE
    }),
    exercise('high-pull-up', 'High pull-up', 'vertical-pull', 10, { sets: 3, reps: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'biceps'],
      loadedAreas: ['elbow', 'shoulder'],
      setup: 'Start fresh from a pull-up bar with a quiet body.',
      execution: 'Pull explosively but under control, trying to bring the bar lower on the chest.',
      safety: 'Rest fully and skip if reps become jerky. ' + PAIN_NOTICE,
      explosive: true
    }),

    exercise('supported-chair-squat', 'Supported chair squat', 'squat', 1, { sets: 3, reps: 9 }, {
      equipment: ['chair'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand in front of a chair and lightly hold support if needed.',
      execution: 'Sit back to touch the chair, then stand by pressing through the feet.',
      safety: 'Use a higher chair or smaller range if knees feel irritated. ' + PAIN_NOTICE
    }),
    exercise('chair-squat', 'Chair squat', 'squat', 2, { sets: 3, reps: 10 }, {
      equipment: ['chair'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand just in front of a stable chair.',
      execution: 'Tap the chair with control and stand without rocking.',
      safety: 'Keep knees tracking with toes. ' + PAIN_NOTICE
    }),
    exercise('bodyweight-squat', 'Bodyweight squat', 'squat', 3, { sets: 3, reps: 13 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand with feet about shoulder-width.',
      execution: 'Sit hips down and back, keep knees tracking with toes, and stand tall.',
      safety: 'Use a smaller range if knees or hips feel irritated. ' + PAIN_NOTICE
    }),
    exercise('tempo-squat', 'Tempo squat', 'squat', 4, { sets: 3, reps: 8 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Set up like a bodyweight squat.',
      execution: 'Lower for three seconds, stand smoothly, and keep balance centered.',
      safety: 'Slow tempo should feel controlled, not painful. ' + PAIN_NOTICE
    }),
    exercise('pause-squat', 'Pause squat', 'squat', 5, { sets: 3, reps: 7 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Set feet in your normal squat stance.',
      execution: 'Pause briefly at a comfortable bottom position, then stand with control.',
      safety: 'Pause only at a depth you own. ' + PAIN_NOTICE
    }),
    exercise('narrow-squat', 'Narrow squat', 'squat', 6, { sets: 3, reps: 7 }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Bring feet a little closer than your normal squat.',
      execution: 'Squat with control while knees continue to track with toes.',
      safety: 'Return to regular stance if knees feel crowded. ' + PAIN_NOTICE
    }),
    exercise('assisted-split-squat', 'Assisted split squat', 'unilateral', 7, { sets: 3, reps: 7, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Take a split stance and hold a wall or chair for balance.',
      execution: 'Lower straight down in a comfortable range and stand through the front foot.',
      safety: 'Use support and a shorter range if knees feel irritated. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('split-squat', 'Split squat', 'unilateral', 8, { sets: 3, reps: 7, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand in a long split stance.',
      execution: 'Lower vertically, keep front foot planted, and drive up with control.',
      safety: 'Use support if balance limits the set. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('bulgarian-split-squat', 'Bulgarian split squat', 'unilateral', 9, { sets: 3, reps: 5, perSide: true }, {
      equipment: ['stable-elevated-surface'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Place the rear foot on a low stable surface.',
      execution: 'Lower in control and stand through the front leg.',
      safety: 'Use a low surface and hold support if balance is shaky. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('assisted-shrimp-squat', 'Assisted shrimp squat', 'unilateral', 10, { sets: 3, reps: 3, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand on one leg near a wall or support.',
      execution: 'Bend the standing knee, lightly use the support, and return with control.',
      safety: 'Keep the range small and controlled. ' + PAIN_NOTICE,
      unilateral: true,
      highSkill: true
    }),
    exercise('shrimp-squat', 'Shrimp squat', 'unilateral', 11, { sets: 3, reps: 2, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['quads', 'glutes'],
      loadedAreas: ['knee', 'hip', 'ankle'],
      setup: 'Stand tall on one leg with the other knee bent behind you.',
      execution: 'Lower in a small controlled range and stand without bouncing.',
      safety: 'Use the assisted version if control or knee comfort is not clear. ' + PAIN_NOTICE,
      unilateral: true,
      highSkill: true
    }),

    exercise('assisted-single-leg-sit-to-stand', 'Assisted single-leg sit-to-stand', 'unilateral', 4, { sets: 3, reps: 6, perSide: true }, {
      equipment: ['chair'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true,
      purpose: 'Builds the single-leg control and strength needed to begin a pistol squat progression.',
      setup: 'Sit near the front of a stable chair with one foot planted and fingertips on a stable support.',
      execution: 'Lean slightly forward, stand through the planted foot with only light hand help, then lower back to the chair under control.',
      focus: ['Keep the working heel planted.', 'Track the working knee over the toes.', 'Use the hands only as much as needed.'],
      commonMistakes: ['Pushing strongly with the hands.', 'Dropping onto the chair.', 'Letting the free foot take weight.'],
      safety: 'Use a higher chair and more support if the knee, hip, or ankle cannot stay comfortable. ' + PAIN_NOTICE
    }),
    exercise('elevated-pistol-squat', 'Elevated pistol squat', 'unilateral', 5, { sets: 3, reps: 5, perSide: true }, {
      equipment: ['stable-elevated-surface'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true,
      purpose: 'Develops pistol squat balance and range from a raised surface that gives the free leg clearance.',
      setup: 'Stand on the edge of a low, stable platform with one foot supported and the other leg hanging clear.',
      execution: 'Reach the free leg forward, lower on the working leg to a controlled depth, then press through the whole foot to stand.',
      focus: ['Keep the working heel planted.', 'Keep the free foot off the floor.', 'Control the same range on every repetition.'],
      commonMistakes: ['Dropping quickly.', 'Pushing from the free foot.', 'Letting the knee collapse inward.'],
      safety: 'Use support nearby and a platform that cannot tip or slide. Reduce depth for knee or ankle discomfort. ' + PAIN_NOTICE
    }),
    exercise('counterbalance-pistol-squat', 'Counterbalance pistol squat', 'unilateral', 6, { sets: 3, reps: 5, perSide: true }, {
      equipment: ['floor'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true,
      purpose: 'Uses the arms as a counterbalance while building deeper single-leg squat control.',
      setup: 'Stand on one leg with both arms reaching forward and the other leg extended in front.',
      execution: 'Keep the arms reaching forward as you lower into a single-leg squat, then drive through the planted foot to stand.',
      focus: ['Keep the heel down.', 'Keep the free leg clear of the floor.', 'Let the knee track with the toes.'],
      commonMistakes: ['Swinging the arms for momentum.', 'Bouncing out of the bottom.', 'Twisting the pelvis.'],
      safety: 'Work only through a depth you can reverse smoothly and keep a stable support within reach. ' + PAIN_NOTICE
    }),
    exercise('assisted-pistol-squat', 'Assisted pistol squat', 'unilateral', 7, { sets: 3, reps: 4, perSide: true }, {
      equipment: ['wall'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true, highSkill: true,
      purpose: 'Practices full pistol squat depth while a stable hand support reduces the strength and balance demand.',
      setup: 'Stand beside a fixed support, hold it lightly, and extend the free leg forward.',
      execution: 'Lower to full controlled depth on one leg, use only enough hand assistance to stay balanced, then stand through the working foot.',
      focus: ['Keep the heel planted.', 'Keep hand assistance light.', 'Maintain steady knee tracking.'],
      commonMistakes: ['Pulling heavily with the arm.', 'Letting the free foot touch down.', 'Falling into the bottom.'],
      safety: 'Use a secure support and reduce depth if ankle, knee, or hip comfort changes. ' + PAIN_NOTICE
    }),
    exercise('pistol-squat-negative', 'Pistol squat negative', 'unilateral', 8, { sets: 3, reps: 3, perSide: true }, {
      equipment: ['chair'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true, highSkill: true,
      purpose: 'Builds the eccentric strength and bottom-position control required for a full pistol squat.',
      setup: 'Stand on one leg in front of a low stable target with the free leg extended forward.',
      execution: 'Lower for at least three seconds until seated or lightly supported on the target, then use both feet to reset at the top.',
      focus: ['Keep the heel planted.', 'Make the descent last at least three seconds.', 'Keep the knee tracking over the toes.'],
      commonMistakes: ['Dropping during the final range.', 'Bouncing off the target.', 'Trying to stand on the working leg before the negative is controlled.'],
      safety: 'Use a target high enough to prevent a fall and stop if knee or ankle pain appears. ' + PAIN_NOTICE
    }),
    exercise('full-pistol-squat', 'Full pistol squat', 'unilateral', 9, { sets: 3, reps: 1, perSide: true }, {
      equipment: ['floor'], primaryAreas: ['quads', 'glutes'], loadedAreas: ['knee', 'hip', 'ankle'], stimulus: 'skill', unilateral: true, highSkill: true,
      purpose: 'Demonstrates an unassisted full-depth pistol squat with controlled balance and joint alignment.',
      setup: 'Stand tall on the tested leg with the other leg extended forward and arms available for balance.',
      execution: 'Lower under control to full depth without touching the free foot down, then press through the planted foot to stand tall without assistance.',
      focus: ['Keep the working heel planted.', 'Keep the free leg off the floor.', 'Control the knee over the toes through the full repetition.'],
      commonMistakes: ['Falling or bouncing into depth.', 'Touching the free foot down.', 'Using external support to stand.'],
      safety: 'Attempt only after controlled negatives; keep clear space and a stable support within reach for a safe abort. ' + PAIN_NOTICE
    }),

    exercise('glute-bridge', 'Glute bridge', 'posterior-chain', 1, { sets: 3, reps: 13 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with knees bent and feet flat.',
      execution: 'Press through heels, lift hips by squeezing glutes, then lower slowly.',
      safety: 'Keep the lower back quiet and use a smaller lift if needed. ' + PAIN_NOTICE
    }),
    exercise('paused-glute-bridge', 'Paused glute bridge', 'posterior-chain', 2, { sets: 3, reps: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Set up like a glute bridge.',
      execution: 'Pause for two seconds at the top before lowering.',
      safety: 'The pause should be felt in glutes, not the lower back. ' + PAIN_NOTICE
    }),
    exercise('single-leg-assisted-glute-bridge', 'Single-leg assisted glute bridge', 'posterior-chain', 3, { sets: 3, reps: 7, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with one foot doing most of the work and the other foot lightly assisting.',
      execution: 'Lift hips evenly, pause briefly, and lower with control.',
      safety: 'Keep hips level and switch to two-leg bridges if the back takes over. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('single-leg-glute-bridge', 'Single-leg glute bridge', 'posterior-chain', 4, { sets: 3, reps: 7, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with one foot planted and the other leg lifted.',
      execution: 'Drive through the planted foot and lift hips without twisting.',
      safety: 'Keep the range small if hips shift. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('hip-hinge-drill', 'Hip hinge drill', 'posterior-chain', 5, { sets: 3, reps: 9 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Stand tall with soft knees and hands on hips.',
      execution: 'Push hips back, keep spine neutral, then stand by squeezing glutes.',
      safety: 'Move in a range where the back stays calm. ' + PAIN_NOTICE
    }),
    exercise('bodyweight-good-morning', 'Bodyweight good morning', 'posterior-chain', 6, { sets: 3, reps: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Stand tall with hands across chest or behind head.',
      execution: 'Hinge hips back, keep a long spine, and return to tall.',
      safety: 'Do not round or force range. ' + PAIN_NOTICE
    }),
    exercise('single-leg-romanian-deadlift', 'Single-leg Romanian deadlift', 'posterior-chain', 7, { sets: 3, reps: 7, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['glutes', 'hamstrings'],
      loadedAreas: ['hip', 'lower-back', 'ankle'],
      setup: 'Stand on one leg near a wall for optional balance support.',
      execution: 'Hinge forward as the back leg reaches behind, then stand tall with control.',
      safety: 'Use support and a small range if balance affects form. ' + PAIN_NOTICE,
      unilateral: true
    }),

    exercise('two-leg-calf-raise', 'Two-leg calf raise', 'calves', 1, { sets: 3, reps: 15 }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand tall near a wall for balance.',
      execution: 'Rise onto the balls of both feet and lower slowly.',
      safety: 'Use support if balance is unsteady. ' + PAIN_NOTICE
    }),
    exercise('paused-calf-raise', 'Paused calf raise', 'calves', 2, { sets: 3, reps: 13 }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand tall near support.',
      execution: 'Rise up, pause briefly at the top, and lower under control.',
      safety: 'Keep ankles tracking straight. ' + PAIN_NOTICE
    }),
    exercise('single-leg-assisted-calf-raise', 'Single-leg assisted calf raise', 'calves', 3, { sets: 3, reps: 10, perSide: true }, {
      equipment: ['wall'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand on one foot and hold a wall lightly.',
      execution: 'Rise on one foot, use the wall only for balance, and lower slowly.',
      safety: 'Switch to two-leg raises if the ankle wobbles. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('single-leg-calf-raise', 'Single-leg calf raise', 'calves', 4, { sets: 3, reps: 8, perSide: true }, {
      equipment: ['floor'],
      primaryAreas: ['calves'],
      loadedAreas: ['ankle'],
      setup: 'Stand on one foot near optional support.',
      execution: 'Rise tall on the ball of the foot and lower slowly.',
      safety: 'Use support without bouncing. ' + PAIN_NOTICE,
      unilateral: true
    }),
    exercise('elevated-single-leg-calf-raise', 'Elevated single-leg calf raise', 'calves', 5, { sets: 3, reps: 7, perSide: true }, {
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
    exercise('dead-bug', 'Dead bug', 'anti-extension', 1, { sets: 3, reps: 7, perSide: true }, {
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
    exercise('reverse-crunch', 'Reverse crunch', 'compression', 1, { sets: 3, reps: 10 }, {
      equipment: ['floor'],
      primaryAreas: ['core'],
      loadedAreas: ['hip', 'lower-back'],
      setup: 'Lie on your back with knees bent.',
      execution: 'Curl hips slightly off the floor using abs, then lower slowly.',
      safety: 'Avoid swinging the legs. ' + PAIN_NOTICE
    }),
    exercise('seated-compression-lift', 'Seated compression lift', 'compression', 2, { sets: 4, reps: 7 }, {
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

    exercise('wrist-preparation', 'Wrist preparation', 'handstand', 1, { sets: 2, reps: 7 }, {
      equipment: ['floor'],
      primaryAreas: ['wrist'],
      loadedAreas: ['wrist'],
      type: 'preparation',
      purpose: 'Prepares the wrists to bear weight before floor-based pushing or handstand practice.',
      setup: 'Kneel on all fours with shoulders above hands, fingers pointing forward, palms flat, and elbows straight but not locked.',
      execution: 'Slowly shift your shoulders forward until you feel mild pressure through the palms, then shift back to the starting position. That is one repetition.',
      focus: ['Keep both palms fully in contact with the floor.', 'Move only as far as the wrists remain comfortable.', 'Keep the movement slow and even.'],
      commonMistakes: ['Lifting the heel of the hand.', 'Bouncing into the forward position.', 'Turning the fingers outward to avoid the intended position.'],
      safety: 'Use a smaller forward shift if the wrists feel stiff. Stop for sharp pain, tingling, or numbness; persistent symptoms should be assessed by a healthcare professional.',
      visualRequired: true,
      visualGuidance: 'Show a side view of one quadruped wrist rock from shoulders-over-hands to a small controlled forward shift.'
    }),
    exercise('elevated-plank-shoulder-shift', 'Elevated plank shoulder shift', 'handstand', 2, { sets: 3, reps: 7 }, {
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
    exercise('pike-shoulder-taps', 'Pike shoulder taps', 'handstand', 4, { sets: 3, reps: 5, perSide: true }, {
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
    exercise('wall-weight-shifts', 'Wall weight shifts', 'handstand', 8, { sets: 3, reps: 5, perSide: true }, {
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

    exercise('elevated-pike-hold', 'Elevated pike hold', 'handstand', 4, { sets: 3, seconds: 20 }, {
      equipment: ['stable-elevated-surface'], primaryAreas: ['shoulder', 'core'], loadedAreas: ['wrist', 'elbow', 'shoulder'], stimulus: 'skill', highSkill: true,
      purpose: 'Builds overhead support strength with more body weight over the hands than a floor pike hold.',
      setup: 'Place feet on a stable low surface and hands on the floor, then lift hips over the shoulders as far as controlled.',
      execution: 'Press the floor away with straight elbows and hold the elevated pike position with active shoulders.',
      focus: ['Keep elbows straight.', 'Push tall through the shoulders.', 'Keep the head neutral between the arms.'],
      commonMistakes: ['Letting the shoulders collapse.', 'Moving the feet on an unstable surface.', 'Holding the breath.'],
      safety: 'Use a surface that cannot slide. Come down before wrist, elbow, or shoulder control fades. ' + PAIN_NOTICE
    }),
    exercise('pike-push-up', 'Pike push-up', 'handstand', 5, { sets: 3, reps: 7 }, {
      equipment: ['floor'], primaryAreas: ['shoulder', 'triceps'], loadedAreas: ['wrist', 'elbow', 'shoulder', 'neck'], stimulus: 'strength', highSkill: true,
      purpose: 'Develops inverted pressing strength while both feet remain on the floor.',
      setup: 'Start in a pike with hips high, hands shoulder-width, and head positioned to travel between the hands.',
      execution: 'Bend the elbows and lower the top of the head toward a safe point between the hands, then press back to straight arms.',
      focus: ['Keep hips high.', 'Keep shoulders active.', 'Use the same controlled depth each repetition.'],
      commonMistakes: ['Turning the movement into a horizontal push-up.', 'Flaring elbows abruptly.', 'Resting body weight on the head.'],
      safety: 'The head is a depth reference, not a support. Reduce range for wrist, elbow, shoulder, or neck discomfort. ' + PAIN_NOTICE
    }),
    exercise('feet-elevated-pike-push-up', 'Feet-elevated pike push-up', 'handstand', 6, { sets: 3, reps: 5 }, {
      equipment: ['stable-elevated-surface'], primaryAreas: ['shoulder', 'triceps'], loadedAreas: ['wrist', 'elbow', 'shoulder', 'neck'], stimulus: 'strength', highSkill: true,
      purpose: 'Increases the vertical pressing load before wall-supported handstand push-up work.',
      setup: 'Place feet on a stable surface, hands on the floor, and raise hips so the torso is close to vertical.',
      execution: 'Lower the head toward a defined padded target between the hands, then press through both hands to straight arms.',
      focus: ['Keep hips over the shoulders.', 'Control the descent.', 'Finish with active shoulders.'],
      commonMistakes: ['Using an unstable foot support.', 'Collapsing onto the target.', 'Letting the hips drift backward.'],
      safety: 'Use a low stable surface and a soft target that limits range without bearing uncontrolled head load. ' + PAIN_NOTICE
    }),
    exercise('wall-handstand-push-up-negative', 'Wall handstand push-up negative', 'handstand', 7, { sets: 3, reps: 3 }, {
      equipment: ['wall'], primaryAreas: ['shoulder', 'triceps'], loadedAreas: ['wrist', 'elbow', 'shoulder', 'neck'], stimulus: 'strength', highSkill: true,
      purpose: 'Builds controlled eccentric strength through the wall handstand push-up range.',
      setup: 'Enter a stable wall-supported handstand above a padded head target, with hands set at a repeatable width.',
      execution: 'Bend the elbows and lower for at least three seconds until the head lightly reaches the target, then exit safely and reset without pressing up.',
      focus: ['Keep shoulders active throughout.', 'Make each descent last at least three seconds.', 'Keep pressure balanced through both hands.'],
      commonMistakes: ['Dropping onto the target.', 'Relaxing the shoulders at the bottom.', 'Trying another repetition without a safe reset.'],
      safety: 'Use a padded target and a practiced wall exit. Never load the head or neck, and stop before elbow or shoulder control fades. ' + PAIN_NOTICE
    }),
    exercise('partial-wall-handstand-push-up', 'Partial-range wall handstand push-up', 'handstand', 8, { sets: 3, reps: 4 }, {
      equipment: ['wall'], primaryAreas: ['shoulder', 'triceps'], loadedAreas: ['wrist', 'elbow', 'shoulder', 'neck'], stimulus: 'strength', highSkill: true,
      purpose: 'Develops the concentric wall handstand press through a deliberately limited, repeatable range.',
      setup: 'Enter a stable wall-supported handstand above a raised padded target that limits the descent.',
      execution: 'Lower until the head lightly touches the raised target, then press through both hands to full elbow extension.',
      focus: ['Use the same target height each set.', 'Keep shoulders active.', 'Finish every repetition with straight elbows.'],
      commonMistakes: ['Kicking with the legs to finish.', 'Changing target height during the set.', 'Resting on the head.'],
      safety: 'Use a firm padded target that cannot slip and a practiced exit. Stop for wrist, elbow, shoulder, or neck symptoms. ' + PAIN_NOTICE
    }),
    exercise('full-wall-handstand-push-up', 'Full-range wall handstand push-up', 'handstand', 9, { sets: 3, reps: 2 }, {
      equipment: ['wall'], primaryAreas: ['shoulder', 'triceps'], loadedAreas: ['wrist', 'elbow', 'shoulder', 'neck'], stimulus: 'skill', highSkill: true,
      purpose: 'Demonstrates a complete controlled wall-supported handstand push-up without assistance from the legs.',
      setup: 'Enter a stable wall-supported handstand with hands at a repeatable width and a thin padded target defining full safe depth.',
      execution: 'Lower under control until the head lightly reaches the defined target, then press through both hands to full elbow extension while the legs remain quiet.',
      focus: ['Maintain active shoulders.', 'Keep the descent controlled.', 'Press evenly without a leg kick.'],
      commonMistakes: ['Collapsing onto the head.', 'Kicking off the wall to finish.', 'Stopping before full elbow extension.'],
      safety: 'Use a practiced wall entry and exit, never bear uncontrolled weight through the head or neck, and stop for wrist, elbow, shoulder, or neck pain. ' + PAIN_NOTICE
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
    exercise('explosive-pull-up', 'Explosive pull-up', 'muscle-up', 10, { sets: 3, reps: 3 }, {
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
    exercise('straight-bar-dip-preparation', 'Straight-bar dip preparation', 'muscle-up', 10, { sets: 3, reps: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['triceps', 'chest', 'shoulder'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'power',
      setup: 'Use a low straight bar or a bar you can mount safely.',
      execution: 'Practice a small controlled press from support.',
      safety: 'Keep shoulders comfortable and use foot assistance. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('low-bar-transition-drill', 'Low-bar transition drill', 'muscle-up', 11, { sets: 4, reps: 4 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Use a low bar with feet on the floor.',
      execution: 'Move slowly from high pull position around the bar to support.',
      safety: 'Keep it controlled and do not force shoulder rotation. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('feet-assisted-transition', 'Feet-assisted transition', 'muscle-up', 12, { sets: 4, reps: 3 }, {
      equipment: ['pullupBar'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Use a low bar and keep feet available for assistance.',
      execution: 'Pull, transition around the bar, and press with as much foot help as needed.',
      safety: 'Use slow reps and avoid grinding. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('band-assisted-transition', 'Band-assisted transition', 'muscle-up', 13, { sets: 4, reps: 3 }, {
      equipment: ['pullupBar', 'bands'],
      primaryAreas: ['upper-back', 'triceps'],
      loadedAreas: ['wrist', 'elbow', 'shoulder'],
      phase: 'transition',
      setup: 'Set a resistance band securely on the bar.',
      execution: 'Use band assistance to practice a smooth pull-to-support transition.',
      safety: 'Check the band and keep your face away from the band path. ' + PAIN_NOTICE,
      highSkill: true
    }),
    exercise('jumping-muscle-up-transition', 'Jumping muscle-up transition', 'muscle-up', 14, { sets: 4, reps: 3 }, {
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
    exercise('slow-negative-muscle-up', 'Slow negative muscle-up', 'muscle-up', 15, { sets: 3, reps: 2 }, {
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
      purpose: 'The final target skill combining a high pull, transition over the bar, and press to straight-arm support.',
      setup: 'Use a suitable stable pull-up bar with clear overhead and surrounding space. Take a secure overhand grip, begin in a still controlled hang below the bar, and hold the body quiet.',
      movement: ['1. Begin from a controlled still hang below the bar.', '2. Pull the chest high toward or above the bar.', '3. Keep the bar close while bringing the torso over it.', '4. Move continuously from the pull into support without resting on the bar.', '5. Press to a stable straight-arm support.', '6. Finish with the approved controlled descent or ending method.'],
      execution: 'Begin from a still hang, pull the chest high, keep the bar close as the torso moves over it, press to stable straight-arm support, then use the approved controlled descent or ending.',
      focus: ['Pull high and keep the bar close.', 'Move continuously from pull to support.', 'Finish in stable straight-arm support.'],
      commonMistakes: ['Trying to force the transition without enough pull height.', 'Losing grip or striking the bar during the turnover.', 'Repeating an uncontrolled failed attempt.'],
      safety: 'Use only a stable bar with clear surrounding space. Stop if pull height or transition control is insufficient, grip is lost, the body impacts the bar, stable support cannot be reached, or the approved descent is unavailable. Do not force the transition or repeat uncontrolled attempts. ' + PAIN_NOTICE,
      visualRequired: true,
      visualGuidance: 'Show a side view including the high pull, bar path close to the body, torso transition, final straight-arm support, and approved safe descent or ending.',
      highSkill: true,
      explosive: true
    }),
    exercise('controlled-muscle-up-repetitions', 'Controlled muscle-up repetitions', 'muscle-up', 19, { sets: 3, reps: 3 }, {
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
  // These movements remain documented for migration/history lookup, but are
  // intentionally excluded from generation because their household anchors
  // cannot be verified by the app.
  const disabledExerciseIds = new Set([
    'standing-towel-row-isometric',
    'seated-towel-row-isometric',
    'high-angle-table-row',
    'bent-knee-inverted-row',
    'straight-leg-inverted-row',
    'feet-elevated-inverted-row'
  ]);

  function ids(values) {
    return values.filter(id => !disabledExerciseIds.has(id)).map(id => {
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
    pistolSquat: ids(['assisted-single-leg-sit-to-stand', 'elevated-pistol-squat', 'counterbalance-pistol-squat', 'assisted-pistol-squat', 'pistol-squat-negative', 'full-pistol-squat']),
    posteriorChain: ids(['glute-bridge', 'paused-glute-bridge', 'single-leg-assisted-glute-bridge', 'single-leg-glute-bridge', 'hip-hinge-drill', 'bodyweight-good-morning', 'single-leg-romanian-deadlift']),
    calves: ids(['two-leg-calf-raise', 'paused-calf-raise', 'single-leg-assisted-calf-raise', 'single-leg-calf-raise', 'elevated-single-leg-calf-raise']),
    antiExtension: ids(['dead-bug', 'forearm-plank', 'plank', 'hollow-hold']),
    compression: ids(['reverse-crunch', 'seated-compression-lift', 'bent-knee-support-hold', 'tuck-support-hold']),
    lateralCore: ids(['side-plank']),
    lsit: ids(['seated-compression-lift', 'bent-knee-support-hold', 'foot-assisted-support-hold', 'tuck-support-hold', 'one-leg-extended-tuck-hold', 'alternating-one-leg-lsit', 'full-tuck-lsit', 'full-lsit-attempts', 'full-lsit-hold', 'longer-lsit-hold']),
    handstand: ids(['wrist-preparation', 'elevated-plank-shoulder-shift', 'pike-hold', 'pike-shoulder-taps', 'wall-walk-preparation', 'chest-to-wall-handstand-hold', 'chest-to-wall-alignment-hold', 'wall-weight-shifts', 'heel-pulls', 'controlled-wall-exit', 'back-to-wall-kick-up-practice', 'freestanding-kick-up-practice', 'freestanding-balance-attempts']),
    handstandPushup: ids(['pike-hold', 'elevated-pike-hold', 'pike-push-up', 'feet-elevated-pike-push-up', 'wall-handstand-push-up-negative', 'partial-wall-handstand-push-up', 'full-wall-handstand-push-up']),
    muscleupFoundation: ids(['hollow-body-strength', 'scapular-pull-up', 'straight-bar-support-development', 'negative-pull-up', 'strict-pull-up-singles']),
    muscleupPower: ids(['chest-to-bar-pull-up', 'high-pull-up', 'explosive-pull-up', 'straight-bar-dip-preparation']),
    muscleupTransition: ids(['low-bar-transition-drill', 'feet-assisted-transition', 'band-assisted-transition', 'jumping-muscle-up-transition', 'slow-negative-muscle-up']),
    muscleupFull: ids(['assisted-muscle-up', 'full-muscle-up-attempt', 'full-muscle-up']),
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

  const advancedSkillEligibility = Object.freeze({
    'full-muscle-up': Object.freeze({
      status: 'configured',
      requiredGoal: 'muscleup',
      requiredEquipment: ['pullupBar'],
      requirements: [
        { trackKey: 'verticalPull', label: 'Pulling readiness', minLevel: 9 },
        { trackKey: 'dipStrength', label: 'Above-bar pressing readiness', minLevel: 8 },
        { trackKey: 'muscleupTransition', label: 'Transition readiness', minLevel: 4, minSuccessfulExposures: 3 },
        { trackKey: 'muscleupPower', label: 'High-pull power readiness', minLevel: 3, minSuccessfulExposures: 3 },
        { trackKey: 'muscleupTransition', exerciseId: 'slow-negative-muscle-up', label: 'Controlled slow-negative evidence', minFullCompletions: 2 }
      ],
      instructionApproved: true,
      safetyPrerequisiteId: null
    })
  });

  function fullCompletionCount(state, requirement) {
    return (state?.history || []).reduce((count, session) => count + (session.exercises || []).filter(result =>
      result?.completionStatus === 'completed' &&
      (!requirement.trackKey || result.progressionTrackKey === requirement.trackKey) &&
      (!requirement.exerciseId || result.exerciseId === requirement.exerciseId)
    ).length, 0);
  }

  function evaluateAdvancedSkillEligibility(exerciseId, { profile = null, state = {}, recovery = null, config = advancedSkillEligibility[exerciseId] } = {}) {
    const checks = [];
    if (!config || !Array.isArray(config.requirements) || !config.requirements.length) {
      return { eligible: false, state: 'development', checks, explanation: 'Readiness requirements are still being finalized.' };
    }
    const development = config.status !== 'configured';
    checks.push({ key: 'goal', label: 'Muscle-up is your active goal', met: !config.requiredGoal || profile?.goal === config.requiredGoal });
    const equipment = profileEquipment(profile);
    (config.requiredEquipment || []).forEach(item => checks.push({ key: `equipment:${item}`, label: 'Required bar equipment is available', met: equipment.has(item) }));
    config.requirements.forEach((requirement, index) => {
      const track = state?.levels?.[requirement.trackKey] || {};
      if (requirement.pending) checks.push({ key: `pending:${index}`, label: `${requirement.label} threshold is being finalized`, met: false });
      if (Number.isFinite(requirement.minLevel)) checks.push({ key: `level:${index}`, label: requirement.label || 'Required progression level reached', met: Number(track.level || 0) >= requirement.minLevel });
      if (Number.isFinite(requirement.minSuccessfulExposures)) checks.push({ key: `exposure:${index}`, label: `${requirement.label || 'Required capability'} successful exposures`, met: Number(track.positiveExposures || 0) >= requirement.minSuccessfulExposures });
      if (Number.isFinite(requirement.minFullCompletions)) checks.push({ key: `completion:${index}`, label: `${requirement.label || 'Required capability'} full completions`, met: fullCompletionCount(state, requirement) >= requirement.minFullCompletions });
    });
    checks.push({ key: 'instruction', label: 'Instructions are release-ready', met: config.instructionApproved === true });
    if (config.safetyPrerequisiteId) checks.push({ key: 'safety', label: 'Safe exit prerequisite completed', met: fullCompletionCount(state, { exerciseId: config.safetyPrerequisiteId }) > 0 });
    const activeRecovery = recovery || getActiveRecovery(state);
    checks.push({ key: 'recovery', label: 'No active recovery restriction conflicts', met: !activeRecovery || isExerciseAllowedForRecovery(byId[exerciseId], activeRecovery) });
    const eligible = !development && checks.length > 0 && checks.every(check => check.met);
    return { eligible, state: development ? 'development' : eligible ? 'ready' : 'locked', checks, explanation: development ? 'Readiness requirements are still being finalized.' : eligible ? 'Ready for workouts.' : 'Complete the remaining readiness steps.' };
  }

  function isExerciseEligibleForGeneration(exercise, profile = null, state = {}, recovery = null, config) {
    if (!exercise || !advancedSkillEligibility[exercise.id]) return true;
    return evaluateAdvancedSkillEligibility(exercise.id, { profile, state, recovery, config }).eligible;
  }

  const energyOptions = {
    great: {
      label: 'Great',
      mode: 'great',
      title: 'Great',
      description: 'Full session · 4 exercises · full sets and reps.',
      exerciseCount: 4,
      fatigueBudget: fatigueBudgets.great,
      skillLimit: fatigueBudgets.great.skillLimit,
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
      fatigueBudget: fatigueBudgets.normal,
      skillLimit: fatigueBudgets.normal.skillLimit,
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
      fatigueBudget: fatigueBudgets.tired,
      skillLimit: fatigueBudgets.tired.skillLimit,
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
      fatigueBudget: fatigueBudgets.exhausted,
      skillLimit: fatigueBudgets.exhausted.skillLimit,
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
        prescriptionData: { sets: 4, seconds: 30 },
        prescription: '4 × 30s',
        setCount: 4,
        isAddOn: true,
        addOnType: 'warmup',
        setLabels: ['March in place', 'Arm circles', 'Hip circles', 'Bodyweight squats']
      },
      {
        id: 'warmup-general-b',
        trackKey: 'warmup',
        name: 'Warm-up',
        prescriptionData: { sets: 4, seconds: 30 },
        prescription: '4 × 30s',
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
        prescriptionData: { sets: 4, seconds: 30 },
        prescription: '4 × 30s',
        setCount: 4,
        isAddOn: true,
        addOnType: 'stretch',
        setLabels: ['Hamstring stretch', 'Quad stretch', 'Chest opener', "Child's pose"]
      },
      {
        id: 'stretch-general-b',
        trackKey: 'stretch',
        name: 'Stretch',
        prescriptionData: { sets: 4, seconds: 30 },
        prescription: '4 × 30s',
        setCount: 4,
        isAddOn: true,
        addOnType: 'stretch',
        setLabels: ['Calf stretch', 'Hip flexor stretch', 'Shoulder stretch', 'Forward fold']
      }
    ]
  };

  const addOnMovementHelp = {
    'March in place': {
      instructions: {
        purpose: 'Gently raises your heart rate and gets the whole body moving.',
        setup: 'Stand tall with room around you and arms relaxed by your sides.',
        execution: 'March in place at an easy pace, lifting knees only as high as feels controlled.',
        safety: 'Keep steps quiet and steady. Slow down if balance feels off.'
      }
    },
    'Arm circles': {
      instructions: {
        purpose: 'Prepares the shoulders for pushing, pulling, and overhead work.',
        setup: 'Stand tall and reach both arms out to the sides.',
        execution: 'Make small smooth circles, then switch direction halfway through.',
        safety: 'Keep the circles comfortable and avoid forcing a big range.'
      }
    },
    'Hip circles': {
      instructions: {
        purpose: 'Wakes up the hips before squats, hinges, and single-leg work.',
        setup: 'Stand with feet about hip-width and hands on your hips.',
        execution: 'Circle the hips slowly in one direction, then switch direction.',
        safety: 'Move gently and keep your feet planted.'
      }
    },
    'Bodyweight squats': {
      instructions: {
        purpose: 'Warms up the legs and practices your squat pattern.',
        setup: 'Stand with feet about shoulder-width and toes slightly turned out.',
        execution: 'Sit down and back, then stand tall with control.',
        safety: 'Use a smaller range if your knees or hips feel uncomfortable.'
      }
    },
    'Step touch': {
      instructions: {
        purpose: 'Adds light movement while warming up hips, ankles, and coordination.',
        setup: 'Stand tall with space to step side to side.',
        execution: 'Step one foot to the side, tap the other foot in, then repeat the other way.',
        safety: 'Keep the pace easy and avoid rushing the taps.'
      }
    },
    'Shoulder rolls': {
      instructions: {
        purpose: 'Helps the shoulders and upper back loosen before training.',
        setup: 'Stand or sit tall with arms relaxed.',
        execution: 'Roll shoulders up, back, and down slowly, then reverse direction.',
        safety: 'Keep the neck relaxed and make the motion smooth.'
      }
    },
    'Good mornings': {
      instructions: {
        purpose: 'Prepares the hinge pattern for glutes, hamstrings, and back control.',
        setup: 'Stand tall with soft knees and hands on hips or across your chest.',
        execution: 'Push hips back with a long spine, then squeeze glutes to stand tall.',
        safety: 'Keep the range easy and stop before your back rounds.'
      }
    },
    'Ankle bounces': {
      instructions: {
        purpose: 'Warms up the calves and ankles for lower-body work.',
        setup: 'Stand tall with feet under hips and knees soft.',
        execution: 'Lightly bounce through the ankles, keeping the movement small.',
        safety: 'Stay gentle and keep both feet landing softly.'
      }
    },
    'Hamstring stretch': {
      instructions: {
        purpose: 'Gently relaxes the back of the thigh after training.',
        setup: 'Place one heel forward with the knee soft and toes up.',
        execution: 'Hinge from the hips until you feel an easy stretch, then breathe.',
        safety: 'Do not pull or bounce. Keep the stretch mild.'
      }
    },
    'Quad stretch': {
      instructions: {
        purpose: 'Gently stretches the front of the thigh after leg work.',
        setup: 'Stand tall near support and hold one ankle behind you.',
        execution: 'Keep knees close and gently bring the heel toward the glute.',
        safety: 'Use support for balance and avoid pulling hard.'
      }
    },
    'Chest opener': {
      instructions: {
        purpose: 'Opens the chest and front of the shoulders after upper-body work.',
        setup: 'Stand tall and clasp hands behind your back, or hold a towel if needed.',
        execution: 'Reach hands slightly back and down while breathing calmly.',
        safety: 'Keep shoulders relaxed and avoid pinching.'
      }
    },
    "Child's pose": {
      instructions: {
        purpose: 'Creates a calm reset for the back, hips, and shoulders.',
        setup: 'Start on hands and knees, then sit hips back toward heels.',
        execution: 'Reach arms forward and breathe slowly in a comfortable position.',
        safety: 'Use a smaller range if knees, hips, or shoulders feel uncomfortable.'
      }
    },
    'Calf stretch': {
      instructions: {
        purpose: 'Gently stretches the calves after lower-body or jumping work.',
        setup: 'Step one foot back and press the back heel toward the floor.',
        execution: 'Keep the back leg long and lean forward slightly.',
        safety: 'Keep pressure gentle and avoid forcing the heel down.'
      }
    },
    'Hip flexor stretch': {
      instructions: {
        purpose: 'Gently opens the front of the hip after squats and core work.',
        setup: 'Take a split stance or kneeling lunge with the front foot planted.',
        execution: 'Tuck ribs slightly and shift forward until the front of the hip eases open.',
        safety: 'Keep the range small and avoid arching the lower back.'
      }
    },
    'Shoulder stretch': {
      instructions: {
        purpose: 'Gently relaxes the shoulders after pushing, pulling, or handstand work.',
        setup: 'Bring one arm across your chest and hold it lightly with the other arm.',
        execution: 'Draw the arm in until you feel an easy shoulder stretch.',
        safety: 'Keep the shoulder down and do not yank the arm.'
      }
    },
    'Forward fold': {
      instructions: {
        purpose: 'Helps the back of the body settle at the end of the session.',
        setup: 'Stand with feet comfortable and knees softly bent.',
        execution: 'Fold forward from the hips and let your head and arms relax.',
        safety: 'Keep knees bent and rise slowly when finished.'
      }
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
        tracks: unique([skillTrack, 'pistolSquat', 'handstandPushup', 'lsit', goal === 'lsit' ? 'compression' : goal === 'handstand' ? 'verticalPush' : 'horizontalPull', 'antiExtension'])
      }
    ];
  }

  function getEnergyConfig(mode = 'normal') {
    return Object.values(energyOptions).find(option => option.mode === mode) || energyOptions.normal;
  }

  function isTrackAvailable(trackKey, tracks) {
    return Array.isArray(tracks?.[trackKey]) && tracks[trackKey].length > 0;
  }

  function adaptPrescriptionData(prescriptionData, config = energyOptions.great, recovery = null) {
    const source = normalizePrescriptionData(prescriptionData);
    if (!source) return null;
    const setMultiplier = recovery?.mode === 'reduce' ? Math.min(config.setMultiplier ?? 1, 0.75) : config.setMultiplier ?? 1;
    const repMultiplier = recovery?.mode === 'reduce' ? Math.min(config.repMultiplier ?? 1, 0.75) : config.repMultiplier ?? 1;
    const adapted = { ...source, sets: Math.max(1, Math.round(source.sets * setMultiplier)) };
    ['seconds', 'minutes', 'attempts', 'reps'].forEach(field => {
      if (source[field]) adapted[field] = Math.max(1, Math.round(source[field] * repMultiplier));
    });
    return adapted;
  }

  function normalizeExercise(rawExercise) {
    if (!rawExercise || typeof rawExercise !== 'object') return null;
    if (!rawExercise.name) return null;
    const catalogMatch = rawExercise.id ? byId[rawExercise.id] : exerciseCatalog.find(item => item.name === rawExercise.name);
    const normalized = {
      ...(catalogMatch || {}),
      ...rawExercise
    };
    Object.assign(normalized, withScoreDefaults(normalized));
    normalized.id = normalized.id || `legacy-${normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    normalized.trackKey = normalized.trackKey || `exercise-${normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    normalized.progressionTrackKey = normalized.progressionTrackKey || normalized.trackKey;
    const fields = prescriptionFields(normalized.prescriptionData || legacyPrescriptionData(normalized.prescription, normalized.setCount));
    if (!fields) return null;
    Object.assign(normalized, fields);
    normalized.basePrescriptionData = normalizePrescriptionData(normalized.basePrescriptionData || normalized.prescriptionData);
    normalized.basePrescription = prescriptionToString(normalized.basePrescriptionData);
    normalized.restSeconds = positiveInteger(normalized.restSeconds, 60);
    normalized.workoutExerciseId = normalized.workoutExerciseId || normalized.sessionKey || `${normalized.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return normalized;
  }

  function replaceWorkoutExercise(current, replacement) {
    const next = normalizeExercise({
      ...replacement,
      trackKey: current.trackKey || replacement.trackKey,
      progressionTrackKey: current.progressionTrackKey || current.trackKey || replacement.progressionTrackKey || replacement.trackKey,
      workoutExerciseId: current.workoutExerciseId,
      swappedFromExerciseId: current.swappedFromExerciseId || current.id,
      swappedFromExerciseName: current.swappedFromExerciseName || current.name,
      previewSwapIds: [...(current.previewSwapIds || []), current.id].filter(Boolean)
    });
    return next;
  }

  function createSwapReplacement(current, replacement, mode = 'normal', recovery = null, context = {}) {
    const progressionTrackKey = current?.progressionTrackKey || current?.trackKey;
    const progressionTrack = baseTracks[progressionTrackKey] || movementTracks[progressionTrackKey] || [];
    if (!progressionTrack.some(item => item.id === replacement?.id)) {
      throw new Error(`Invalid cross-progression swap: ${current?.id || 'unknown'} -> ${replacement?.id || 'unknown'} (${progressionTrackKey || 'no-track'})`);
    }
    if (!isExerciseEligibleForGeneration(replacement, context.profile, context.state || {}, recovery, context.eligibilityConfig)) {
      throw new Error(`Exercise is not eligible for generation: ${replacement?.id || 'unknown'}`);
    }
    const adaptedPrescriptionData = adaptPrescriptionData(replacement.prescriptionData, getEnergyConfig(mode), recovery);
    return replaceWorkoutExercise(current, {
      ...replacement,
      prescriptionData: adaptedPrescriptionData,
      basePrescriptionData: replacement.prescriptionData,
      basePrescription: replacement.prescription,
      source: 'user-swap'
    });
  }

  function executableRounds(exercise) {
    const normalized = normalizeExercise(exercise);
    if (!normalized) return [];
    return Array.from({ length: normalized.setCount }, (_, index) => ({
      index,
      seconds: normalized.secondsPerSet,
      reps: normalized.repsPerSet,
      attempts: normalized.attemptsPerSet,
      perSide: normalized.perSide
    }));
  }

  function exerciseResult(exercise, completedSetFlags = [], rating = null) {
    const normalized = normalizeExercise(exercise);
    if (!normalized) return null;
    const completedSetIndexes = Array.from({ length: normalized.setCount }, (_, index) => completedSetFlags[index] ? index : null)
      .filter(index => index !== null);
    const safeRating = ['easy', 'good', 'hard', 'failed'].includes(rating) ? rating : null;
    const completionStatus = safeRating === 'failed'
      ? 'failed'
      : completedSetIndexes.length === normalized.setCount
        ? 'completed'
        : completedSetIndexes.length
          ? 'partial'
          : 'skipped';
    return {
      workoutExerciseId: normalized.workoutExerciseId,
      exerciseId: normalized.id,
      name: normalized.name,
      prescription: normalized.prescription,
      prescriptionData: normalized.prescriptionData,
      targetSets: normalized.setCount,
      completedSets: completedSetIndexes.length,
      completedSetIndexes,
      completionStatus,
      rating: safeRating,
      trackKey: normalized.trackKey,
      progressionTrackKey: normalized.progressionTrackKey || null,
      progressionLevel: normalized.level || null,
      swappedFromExerciseId: normalized.swappedFromExerciseId || null,
      swappedFromExerciseName: normalized.swappedFromExerciseName || null,
      isAddOn: Boolean(normalized.isAddOn)
    };
  }

  function applyExerciseResultToProgression(levels, result, profile = null) {
    if (!result || !result.progressionTrackKey || !levels?.[result.progressionTrackKey]) {
      return { applied: false, reason: 'missing-progression-track' };
    }
    if (!result.rating || result.completedSets < 1) {
      return { applied: false, reason: 'no-completed-sets-or-rating' };
    }
    const isFullyCompleted = result.completedSets === result.targetSets;
    if (!isFullyCompleted && ['easy', 'good'].includes(result.rating)) {
      return { applied: false, reason: 'positive-rating-requires-full-completion' };
    }
    applyRating(levels, result.progressionTrackKey, result.rating, profile);
    return {
      applied: true,
      reason: isFullyCompleted ? 'full-completion' : 'partial-difficulty-signal'
    };
  }

  function shouldRecordWorkoutResults(results) {
    return Array.isArray(results) && results.some(result => !result?.isAddOn && Number(result?.completedSets) > 0);
  }

  function createCountdownTimer({ seconds, prepSeconds = 0, trackKey = null, setIndex = null, completeOnFinish = false }, now = Date.now()) {
    const activeSeconds = positiveInteger(seconds);
    if (!activeSeconds) return null;
    const safePrepSeconds = Math.max(0, Math.round(Number(prepSeconds) || 0));
    const prepEndsAt = now + safePrepSeconds * 1000;
    return {
      trackKey,
      setIndex: Number.isInteger(Number(setIndex)) ? Number(setIndex) : null,
      completeOnFinish: Boolean(completeOnFinish),
      prepEndsAt,
      endsAt: prepEndsAt + activeSeconds * 1000,
      seconds: activeSeconds,
      prepSeconds: safePrepSeconds
    };
  }

  function countdownTimerSnapshot(timer, now = Date.now()) {
    if (!timer?.endsAt) return null;
    const prepRemaining = Math.max(0, Math.ceil((Number(timer.prepEndsAt || now) - now) / 1000));
    const remainingSeconds = Math.max(0, Math.ceil((Number(timer.endsAt) - Math.max(now, Number(timer.prepEndsAt || now))) / 1000));
    return {
      phase: prepRemaining > 0 ? 'prep' : 'active',
      prepSeconds: prepRemaining,
      remainingSeconds,
      finished: now >= Number(timer.endsAt)
    };
  }

  function sanitizeCountdownTimer(timer) {
    if (!timer || !Number.isFinite(Number(timer.endsAt)) || !Number.isFinite(Number(timer.prepEndsAt))) return null;
    return {
      title: typeof timer.title === 'string' ? timer.title : 'Timer',
      subtitle: typeof timer.subtitle === 'string' ? timer.subtitle : '',
      trackKey: typeof timer.trackKey === 'string' ? timer.trackKey : null,
      setIndex: Number.isInteger(Number(timer.setIndex)) ? Number(timer.setIndex) : null,
      completeOnFinish: Boolean(timer.completeOnFinish),
      prepEndsAt: Number(timer.prepEndsAt),
      endsAt: Number(timer.endsAt),
      seconds: positiveInteger(timer.seconds, 1),
      prepSeconds: Math.max(0, Math.round(Number(timer.prepSeconds) || 0))
    };
  }

  function timerShouldCompleteSet(timer, now = Date.now()) {
    const snapshot = countdownTimerSnapshot(timer, now);
    return Boolean(snapshot?.finished && timer?.completeOnFinish && timer?.trackKey && Number.isInteger(Number(timer?.setIndex)));
  }

  function updateSetCompletion(flags, setIndex, setCount, done) {
    const safeSetCount = positiveInteger(setCount, 1);
    const safeIndex = Number(setIndex);
    const next = Array.from({ length: safeSetCount }, (_, index) => Boolean(flags?.[index]));
    if (Number.isInteger(safeIndex) && safeIndex >= 0 && safeIndex < safeSetCount) next[safeIndex] = Boolean(done);
    return next;
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
      activeTimer: sanitizeCountdownTimer(workout.activeTimer),
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

  const recoveryStressThresholds = {
    reduce: 5,
    rest: 2
  };

  function exerciseLoadsArea(exercise, areas) {
    return areas.some(area => (exercise.loadedAreas || []).includes(area) || (exercise.contraindicationTags || []).includes(`${area}-load`));
  }

  function jointKeyForRecovery(recovery) {
    const area = recoveryAreaType(recovery);
    return area === 'lower-back' ? 'lowerBack' : jointKeys.includes(area) ? area : null;
  }

  function exerciseJointStress(exercise, recovery) {
    const key = jointKeyForRecovery(recovery);
    if (!key) return 0;
    return clampStress(exercise?.jointStress?.[key]);
  }

  function isExerciseAllowedForRecovery(exercise, recovery, mode = recovery?.mode || 'reduce') {
    if (!exercise || !recovery) return true;
    const rule = recoveryRules[recoveryAreaType(recovery)] || recoveryRules.other;
    const stress = exerciseJointStress(exercise, recovery);
    if (mode === 'rest' && (stress > recoveryStressThresholds.rest || exerciseLoadsArea(exercise, rule.restAreas))) return false;
    if (mode === 'reduce') {
      if (exercise.explosive || exercise.highSkill) return false;
      if (stress > recoveryStressThresholds.reduce) return false;
      if (exerciseLoadsArea(exercise, rule.reduceAreas) && exercise.difficulty > 7) return false;
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
    const eligibleTrack = originalTrack.filter(exercise => isExerciseEligibleForGeneration(exercise, profile, state, recovery));
    const track = filteredTrackForRecovery(eligibleTrack, recovery);
    if (!track.length) return null;
    const adjustedLevel = chooseLevel(safeTrackKey, track, config, state, recovery);
    const currentFatigue = options.currentFatigue || 0;
    const currentSkill = options.currentSkill || 0;
    const remainingSlots = Math.max(0, options.remainingSlots || 0);
    const budget = config.fatigueBudget || fatigueBudgets.normal;
    const fatigueLimit = budget.max + (budget.tolerance || 0);
    const skillLimit = config.skillLimit || budget.skillLimit || fatigueBudgets.normal.skillLimit;
    const recoveryJoint = jointKeyForRecovery(recovery);
    const orderedLevels = levelSearchOrder(adjustedLevel, track.length).filter(level => !usedIds.has(track[level].id));
    const selectedLevel = orderedLevels.find(level => {
      const candidate = track[level];
      return currentFatigue + candidate.fatigue + remainingSlots <= fatigueLimit &&
        currentSkill + candidate.skill + remainingSlots <= skillLimit;
    }) ?? (['tired', 'exhausted'].includes(config.mode) ? undefined : orderedLevels
      .slice()
      .sort((a, b) => {
        const first = track[a];
        const second = track[b];
        const firstStress = recoveryJoint ? first.jointStress[recoveryJoint] : 0;
        const secondStress = recoveryJoint ? second.jointStress[recoveryJoint] : 0;
        return (first.fatigue + first.skill + firstStress) - (second.fatigue + second.skill + secondStress);
      })[0]);
    if (selectedLevel === undefined) return null;
    const baseExercise = track[selectedLevel];
    const trackState = state?.levels?.[safeTrackKey] || {};
    const plateauCount = Math.max(0, Math.floor(trackState.plateauCount || 0));
    const prescriptionData = adaptPrescriptionData(baseExercise.prescriptionData, config, recovery);

    return normalizeExercise({
      ...baseExercise,
      trackKey: safeTrackKey,
      progressionTrackKey: safeTrackKey,
      prescriptionData,
      basePrescription: baseExercise.prescription,
      basePrescriptionData: baseExercise.prescriptionData,
      level: selectedLevel + 1,
      originalLevel: Math.min(Math.max(trackState.level || 0, 0), originalTrack.length - 1) + 1,
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
      Skills: ['pistolSquat', 'handstandPushup', 'handstand', 'lsit', 'verticalPull', 'horizontalPull', 'antiExtension', 'posteriorChain']
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
    let totalFatigue = 0;
    let totalSkill = 0;

    tracks.forEach(trackKey => {
      if (exercises.length >= config.exerciseCount) return;
      const item = getExercise(trackKey, config, state, profile, {
        recovery,
        usedIds,
        currentFatigue: totalFatigue,
        currentSkill: totalSkill,
        remainingSlots: config.exerciseCount - exercises.length - 1
      });
      if (!item) return;
      exercises.push(item);
      usedIds.add(item.id);
      totalFatigue += item.fatigue || 0;
      totalSkill += item.skill || 0;
    });

    return {
      mode: config.mode,
      workoutName: workout.name,
      focusLabel: workout.focusLabel || '',
      energyTitle: config.title,
      energyDescription: config.description,
      fatigueBudget: config.fatigueBudget,
      skillLimit: config.skillLimit,
      totalFatigue,
      totalSkill,
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

  const progressMascotByState = Object.freeze({
    regular: 'Assets/Progress/mascot-progress-regular.svg',
    new_user: 'Assets/Progress/mascot-progress-new-user.svg',
    new_exercise_unlocked: 'Assets/Progress/mascot-progress-unlocked.svg',
    strong_pattern: 'Assets/Progress/mascot-progress-strong-pattern.svg',
    focus_achieved: 'Assets/Progress/mascot-progress-focus-achieved.svg',
    returning_user: 'Assets/Progress/mascot-progress-returning.svg'
  });

  const generalFitnessStages = Object.freeze([
    { name: 'Foundation', minimum: 0.2 },
    { name: 'Developing', minimum: 0.4 },
    { name: 'Capable', minimum: 0.6 },
    { name: 'Strong', minimum: 0.8 },
    { name: 'Well-rounded', minimum: 1 }
  ]);

  const generalFitnessCategories = Object.freeze({
    push: ['horizontalPush', 'dipStrength', 'verticalPush'],
    pull: ['verticalPull', 'horizontalPull', 'scapularPull'],
    legs: ['squat', 'unilateral', 'posteriorChain', 'calves'],
    core: ['antiExtension', 'compression', 'lateralCore']
  });

  function normalizedTrackCapability(trackKey, levels = {}) {
    const track = movementTracks[trackKey] || [];
    const maximum = Math.max(0, track.length - 1);
    if (!maximum) return 0;
    return Math.max(0, Math.min(Number(levels?.[trackKey]?.level || 0) / maximum, 1));
  }

  function getGeneralFitnessProgress(levels = {}) {
    const categories = Object.fromEntries(Object.entries(generalFitnessCategories).map(([category, trackKeys]) => [
      category,
      Math.max(0, ...trackKeys.map(trackKey => normalizedTrackCapability(trackKey, levels)))
    ]));
    const completedStages = generalFitnessStages.filter(stage => Object.values(categories).every(value => value >= stage.minimum)).length;
    return {
      stages: generalFitnessStages,
      categories,
      completedStages,
      achieved: completedStages === generalFitnessStages.length,
      nextStage: generalFitnessStages[completedStages] || null
    };
  }

  function completionLabel(count, rating) {
    const safeCount = Math.max(0, Math.ceil(Number(count) || 0));
    return `${safeCount} ${rating} completion${safeCount === 1 ? '' : 's'}`;
  }

  function remainingProgressRequirement(trackKey, trackState = {}) {
    const rules = ratingRulesForTrack(trackKey);
    const pointDeficit = Math.max(0, rules.progressPoints - Number(trackState.points || 0));
    const exposureDeficit = Math.max(0, rules.positiveExposures - Number(trackState.positiveExposures || 0));
    const easyCount = Math.max(Math.ceil(pointDeficit / 2), Math.ceil(exposureDeficit));
    const goodCount = Math.max(Math.ceil(pointDeficit), Math.ceil(exposureDeficit / 0.5));
    if (!easyCount && !goodCount) return null;
    if (easyCount && goodCount) return `${completionLabel(easyCount, 'Easy')} or ${completionLabel(goodCount, 'Good')}`;
    return easyCount ? completionLabel(easyCount, 'Easy') : completionLabel(goodCount, 'Good');
  }

  function isTrackMastered(trackKey, trackState = {}, track = []) {
    if (!Array.isArray(track) || !track.length || Number(trackState.level || 0) < track.length - 1) return false;
    const rules = ratingRulesForTrack(trackKey);
    return Number(trackState.points || 0) >= rules.progressPoints && Number(trackState.positiveExposures || 0) >= rules.positiveExposures;
  }

  function getProgressCardState(progressData = {}) {
    if (progressData.focusAchieved) return 'focus_achieved';
    if (progressData.recentUnlockedExercise) return 'new_exercise_unlocked';
    if (progressData.strongPattern) return 'strong_pattern';
    if (progressData.isReturningUser) return 'returning_user';
    if (Number(progressData.completedWorkoutCount || 0) === 0) return 'new_user';
    return 'regular';
  }

  function getProgressCardContent(cardState, progressData = {}) {
    const rows = [];
    let headline = "You're on track!";
    const push = (label, value) => {
      if (label && value && rows.length < 2) rows.push({ label, value });
    };
    const comingNext = progressData.nextExerciseName
      ? `${progressData.nextExerciseName}${progressData.remainingRequirement ? ` · ${progressData.remainingRequirement} away` : ''}`
      : null;

    if (cardState === 'new_user') {
      headline = "Let's get started!";
      push('Your focus', progressData.currentFocusName);
      push('First step', "Complete today's workout");
    } else if (cardState === 'new_exercise_unlocked') {
      headline = 'Nice work!';
      push('New exercise unlocked', progressData.recentUnlockedExercise);
      push('Coming next', comingNext);
    } else if (cardState === 'strong_pattern') {
      headline = "You're building momentum!";
      push('Consistency', progressData.strongPattern);
      push('Coming next', comingNext);
    } else if (cardState === 'focus_achieved') {
      headline = 'You did it!';
      push('Focus achieved', progressData.achievedFocusName);
      push(progressData.recommendedFocusName ? 'Recommended next focus' : "What's next", progressData.recommendedFocusName || 'Choose a new focus');
    } else if (cardState === 'returning_user') {
      headline = 'Welcome back!';
      push('Your focus', progressData.currentFocusName);
      push('Next step', 'Continue with your next workout');
    } else {
      push(progressData.recentProgressSummary ? 'Recent progress' : 'Current level', progressData.recentProgressSummary || progressData.currentLevelName);
      if (comingNext) push('Coming next', comingNext);
      else push('Next step', progressData.planContinuationMessage || 'Continue with your next workout');
    }
    return { state: cardState, mascot: progressMascotByState[cardState] || progressMascotByState.regular, headline, rows };
  }

  function normaliseHelpName(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function helpFromInstructions(item) {
    if (!item?.instructions) return null;
    const movement = item.instructions.movement || [item.instructions.execution].filter(Boolean);
    const authoredSuccess = item.instructions.successCriteria || [];
    const successCriteria = distinctSuccessCriteria(movement, authoredSuccess);
    return {
      purpose: item.instructions.purpose,
      startingPosition: item.instructions.startingPosition || item.instructions.setup,
      movement,
      successCriteria: successCriteria.length || authoredSuccess.length ? successCriteria : ['Complete the movement for the prescribed time or repetitions with a steady range and a controlled finish.'],
      focus: item.instructions.focus || ['Move slowly through a comfortable, repeatable range.'],
      commonMistakes: item.instructions.commonMistakes || ['Rushing or forcing the movement beyond a comfortable range.'],
      safety: item.instructions.safety,
      cues: [item.instructions.setup, item.instructions.execution]
    };
  }

  function findAddOnMovementHelp(nameOrId = '') {
    const normalised = normaliseHelpName(nameOrId);
    const key = Object.keys(addOnMovementHelp).find(item => normaliseHelpName(item) === normalised);
    return key ? addOnMovementHelp[key] : null;
  }

  function getExerciseHelp(nameOrId = '') {
    const item = byId[nameOrId] || exerciseCatalog.find(exercise => exercise.name === nameOrId);
    return helpFromInstructions(item) || helpFromInstructions(findAddOnMovementHelp(nameOrId));
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

    if (trackState.points >= rules.progressPoints && trackState.positiveExposures >= rules.positiveExposures && (trackState.level || 0) < maxLevel) {
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

  function validateEligibilityConfig(configs = advancedSkillEligibility) {
    const errors = [];
    Object.entries(configs || {}).forEach(([exerciseId, config]) => {
      if (config.status !== 'configured') errors.push(`Eligibility is not configured: ${exerciseId}`);
      (config.requirements || []).forEach(requirement => {
        if (requirement.pending) errors.push(`Pending eligibility requirement: ${exerciseId}`);
        if (Number.isFinite(requirement.minLevel)) {
          const track = movementTracks[requirement.trackKey];
          if (!Array.isArray(track)) errors.push(`Unknown eligibility track ${requirement.trackKey}: ${exerciseId}`);
          else if (requirement.minLevel > track.length - 1) errors.push(`Eligibility level ${requirement.minLevel} exceeds ${requirement.trackKey} maximum ${track.length - 1}: ${exerciseId}`);
        }
      });
    });
    return errors;
  }

  function validateWorkoutSystem() {
    const errors = [];
    const ids = new Set();
    exerciseCatalog.forEach(item => {
      if (ids.has(item.id)) errors.push(`Duplicate exercise id: ${item.id}`);
      ids.add(item.id);
      if (!item.prescription) errors.push(`Missing prescription: ${item.id}`);
      const fields = prescriptionFields(item.prescriptionData);
      if (!fields) errors.push(`Invalid structured prescription: ${item.id}`);
      if (fields && fields.prescription !== item.prescription) errors.push(`Prescription label mismatch: ${item.id}`);
      if (fields && fields.setCount !== item.setCount) errors.push(`Set count mismatch: ${item.id}`);
      if (item.prescriptionType === 'time' && !item.secondsPerSet) errors.push(`Timed exercise missing seconds: ${item.id}`);
      if (item.prescriptionType === 'reps' && !item.repsPerSet) errors.push(`Rep exercise missing target: ${item.id}`);
      const instruction = item.instructions;
      if (!instruction?.purpose || !instruction?.startingPosition || !Array.isArray(instruction?.movement) || !instruction.movement.length ||
          !Array.isArray(instruction?.focus) || !instruction.focus.length || !Array.isArray(instruction?.commonMistakes) || !instruction.commonMistakes.length ||
          !instruction?.safety || !Array.isArray(instruction?.successCriteria) || !instruction.successCriteria.length ||
          instruction.visualRequired !== true || !instruction.visualGuidance) errors.push(`Missing structured instructions: ${item.id}`);
      const normalizedMovement = normalizeInstructionText((instruction?.movement || []).join(' '));
      const normalizedSuccess = (instruction?.successCriteria || []).map(normalizeInstructionText).filter(Boolean);
      if (!normalizedMovement) errors.push(`Missing movement instructions: ${item.id}`);
      if (!normalizedSuccess.length) errors.push(`Missing success criteria: ${item.id}`);
      if (normalizedSuccess.length && normalizedSuccess.every(value => value === normalizedMovement)) errors.push(`Movement duplicates every success criterion: ${item.id}`);
      const instructionText = JSON.stringify(instruction || {});
      if (/\b(?:placeholder|provisional|to be confirmed|being finalized|tbd)\b/i.test(instructionText)) errors.push(`Placeholder or provisional instructions: ${item.id}`);
      if (/recommended/i.test(item.name) || /recommended/i.test(item.prescription)) errors.push(`Informational exercise: ${item.id}`);
      ['difficulty', 'fatigue', 'skill', 'stability'].forEach(field => {
        if (!Number.isInteger(item[field]) || item[field] < 1 || item[field] > 10) {
          errors.push(`Invalid ${field}: ${item.id}`);
        }
      });
      if (!stimuli.has(item.stimulus)) errors.push(`Invalid stimulus: ${item.id}`);
      jointKeys.forEach(key => {
        if (!Number.isInteger(item.jointStress?.[key]) || item.jointStress[key] < 0 || item.jointStress[key] > 10) {
          errors.push(`Invalid joint stress ${key}: ${item.id}`);
        }
      });
    });
    Object.entries(movementTracks).forEach(([key, track]) => {
      let previousDifficulty = 0;
      track.forEach(item => {
        if (item.difficulty < previousDifficulty) errors.push(`Difficulty drops in ${key}: ${item.id}`);
        previousDifficulty = Math.max(previousDifficulty, item.difficulty);
      });
    });
    errors.push(...validateEligibilityConfig());
    Object.entries(addOnMovementHelp).forEach(([name, item]) => {
      const help = helpFromInstructions(item);
      if (!help?.purpose || !help?.startingPosition || !help?.movement?.length || !help?.successCriteria?.length || !help?.focus?.length || !help?.commonMistakes?.length || !help?.safety) errors.push(`Missing add-on instructions: ${name}`);
      if (help?.successCriteria?.length && help.successCriteria.every(value => normalizeInstructionText(value) === normalizeInstructionText(help.movement.join(' ')))) errors.push(`Movement duplicates every success criterion: add-on ${name}`);
    });
    return errors;
  }

  window.SomthingreatWorkouts = {
    baseTracks,
    movementTracks,
    exerciseCatalog,
    disabledExerciseIds,
    scoreSchema,
    scoringGuidelines,
    fatigueBudgets,
    recoveryRules,
    energyOptions,
    workoutAddOns,
    createDefaultLevels,
    migrateLevels,
    getTracks,
    getRotation,
    getGoalTrackKey,
    getMuscleUpGate,
    advancedSkillEligibility,
    evaluateAdvancedSkillEligibility,
    isExerciseEligibleForGeneration,
    getTodayWorkout,
    getExtraSessionMinutes,
    applyWorkoutAddOns,
    sessionTotalLabel,
    sanitizeWorkout,
    normalizeExercise,
    normalizePrescriptionData,
    prescriptionToString,
    replaceWorkoutExercise,
    createSwapReplacement,
    executableRounds,
    exerciseResult,
    applyExerciseResultToProgression,
    shouldRecordWorkoutResults,
    createCountdownTimer,
    countdownTimerSnapshot,
    sanitizeCountdownTimer,
    timerShouldCompleteSet,
    updateSetCompletion,
    getExerciseHelp,
    normalizeInstructionText,
    distinctSuccessCriteria,
    validateEligibilityConfig,
    modeLabel,
    progressMascotByState,
    generalFitnessStages,
    getGeneralFitnessProgress,
    remainingProgressRequirement,
    isTrackMastered,
    getProgressCardState,
    getProgressCardContent,
    applyRating,
    validateWorkoutSystem,
    isExerciseAllowedForRecovery
  };
})();
