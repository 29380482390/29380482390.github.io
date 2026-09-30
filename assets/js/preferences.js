(() => {
  'use strict';
  const KEY = 'startpage-preferences-v1';
  const { defaultPreferences, validatePreferences } = window.STARTPAGE_CORE;
  const defaults = defaultPreferences(window.STARTPAGE_CONFIG.cards);
  const copy = value => JSON.parse(JSON.stringify(value));
  let current = copy(defaults);
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) current = validatePreferences(JSON.parse(saved));
  } catch { /* Invalid or unavailable storage falls back to the original bookmarks. */ }

  window.STARTPAGE_PREFERENCES = Object.freeze({
    get current() { return copy(current); },
    get defaults() { return copy(defaults); },
    save(draft) {
      const next = validatePreferences(draft);
      let persisted = true;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { persisted = false; }
      current = next;
      window.dispatchEvent(new CustomEvent('preferenceschange', { detail: copy(current) }));
      return persisted;
    }
  });
})();
