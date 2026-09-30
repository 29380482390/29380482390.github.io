(() => {
  'use strict';
  const system = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new EventTarget();
  let reduced = false;
  function update() {
    const mode = window.STARTPAGE_PREFERENCES.current.animation;
    const next = mode === 'reduced' || (mode === 'system' && system.matches);
    document.documentElement.dataset.motion = next ? 'reduced' : 'smooth';
    if (next === reduced) return;
    reduced = next;
    events.dispatchEvent(new Event('change'));
  }
  window.STARTPAGE_MOTION = Object.freeze({
    get matches() { return reduced; },
    addEventListener: (...args) => events.addEventListener(...args)
  });
  system.addEventListener('change', update);
  window.addEventListener('preferenceschange', update);
  update();
})();
