// public/js/shared/save-state.js
// Shared dirty-state helper for DEXP save buttons.

export function createSaveState({
  getCurrentState,
  saveButton,
}) {
  let savedState = normalize(getCurrentState());

  function hasChanges() {
    return normalize(getCurrentState()) !== savedState;
  }

  function updateButton() {
    if (!saveButton) return;

    const changed = hasChanges();

    saveButton.disabled = !changed;
    saveButton.style.opacity = changed ? "1" : "0.45";
    saveButton.style.cursor = changed ? "pointer" : "not-allowed";
  }

  function markClean() {
    savedState = normalize(getCurrentState());
    updateButton();
  }

  function watch(elements = []) {
    elements.forEach((el) => {
      el?.addEventListener("input", updateButton);
      el?.addEventListener("change", updateButton);
    });

    updateButton();
  }

  return {
    hasChanges,
    updateButton,
    markClean,
    watch,
  };
}

function normalize(value) {
  return JSON.stringify(value);
}