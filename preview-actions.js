(function () {
  if (typeof renderGeneratedWorkout !== 'function' || typeof getTracks !== 'function') return;

  function prescriptionType(exercise) {
    const text = `${exercise?.prescription || ''} ${exercise?.basePrescription || ''}`.toLowerCase();
    return /\b(?:s|sec|secs|second|seconds|min|mins|minute|minutes)\b/.test(text) ? 'time' : 'reps';
  }

  function swapCandidates(exercise) {
    if (!exercise || exercise.isAddOn) return [];
    const tracks = getTracks();
    const trackKey = exercise.progressionTrackKey || exercise.trackKey;
    const sourceTrack = tracks[trackKey] || [];
    const recovery = typeof getActiveRecovery === 'function' ? getActiveRecovery() : null;
    const usedIds = new Set((state.generated?.exercises || []).map(item => item?.id).filter(Boolean));
    const allowed = sourceTrack.filter(candidate => {
      if (!candidate || candidate.id === exercise.id || usedIds.has(candidate.id)) return false;
      if (recovery && !workoutModule.isExerciseAllowedForRecovery(candidate, recovery)) return false;
      return true;
    });
    const sameType = allowed.filter(candidate => prescriptionType(candidate) === prescriptionType(exercise));
    const pool = sameType.length ? sameType : allowed;
    return pool.sort((a, b) =>
      Math.abs((a.difficulty || 1) - (exercise.difficulty || 1)) -
      Math.abs((b.difficulty || 1) - (exercise.difficulty || 1))
    );
  }

  function swapExercise(index) {
    const current = state.generated?.exercises?.[index];
    if (!current) return;
    const candidates = swapCandidates(current);
    if (!candidates.length) return;
    const previousIds = Array.isArray(current.previewSwapIds) ? current.previewSwapIds : [];
    const next = candidates.find(candidate => !previousIds.includes(candidate.id)) || candidates[0];
    state.generated.exercises[index] = {
      ...next,
      trackKey: current.trackKey || next.trackKey,
      progressionTrackKey: current.progressionTrackKey || current.trackKey || next.progressionTrackKey || next.trackKey,
      prescription: current.prescription || next.prescription,
      basePrescription: next.prescription,
      setCount: current.setCount || next.setCount || 1,
      previewSwapIds: [...previousIds, current.id].filter(Boolean)
    };
    saveState();
    renderGeneratedWorkout();
  }

  function enhancePreview() {
    const generated = state.generated;
    const preview = document.getElementById('previewList');
    if (!generated || !preview) return;
    preview.innerHTML = '';
    (generated.exercises || []).filter(Boolean).forEach((exercise, index) => {
      const name = exerciseDisplayName(exercise);
      const hasHelp = Boolean(getExerciseHelp(name));
      const canSwap = swapCandidates(exercise).length > 0;
      const row = document.createElement('div');
      row.className = 'preview-row preview-action-row';
      row.innerHTML = `
        <div class="preview-exercise-copy">
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(exercise.prescription)}</span>
        </div>
        <div class="preview-exercise-actions">
          ${canSwap ? `<button class="preview-icon-btn preview-swap-btn" type="button" data-preview-index="${index}" aria-label="Change ${escapeHTML(name)}"></button>` : ''}
          ${hasHelp ? `<button class="preview-icon-btn preview-help-btn exercise-help-btn" type="button" data-exercise-name="${escapeHTML(name)}" aria-label="How to do ${escapeHTML(name)}">?</button>` : ''}
        </div>`;
      preview.appendChild(row);
    });
  }

  const originalRenderGeneratedWorkout = renderGeneratedWorkout;
  renderGeneratedWorkout = function () {
    originalRenderGeneratedWorkout.apply(this, arguments);
    enhancePreview();
  };

  document.addEventListener('click', event => {
    const swapButton = event.target.closest('.preview-swap-btn');
    if (!swapButton) return;
    event.preventDefault();
    event.stopPropagation();
    swapExercise(Number(swapButton.dataset.previewIndex));
  }, true);

  if (!document.getElementById('generatedWorkoutCard')?.classList.contains('hidden')) enhancePreview();
})();
