(function (scope) {
  const APP_VERSION = '2026.07.17.155200';

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

    const originalSanitizeWorkout = workouts.sanitizeWorkout;
    workouts.sanitizeWorkout = workout => {
      const sanitized = originalSanitizeWorkout(workout);
      if (!sanitized) return null;
      const exercises = (sanitized.exercises || []).filter(exercise => !removedExerciseIds.has(exercise?.id));
      return exercises.length ? { ...sanitized, exercises } : null;
    };
  }

  if (typeof document !== 'undefined') {
    ['preview-actions.css', 'bottom-nav-polish.css'].forEach(href => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `${href}?v=${APP_VERSION}`;
      document.head.appendChild(style);
    });

    scope.addEventListener('load', () => {
      const script = document.createElement('script');
      script.src = `preview-actions.js?v=${APP_VERSION}`;
      document.body.appendChild(script);
    }, { once: true });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION };
  }
})(typeof self !== 'undefined' ? self : globalThis);