(() => {
  'use strict';
  const core = globalThis.STARTPAGE_CORE;
  const STORAGE_KEY = 'startpage-minimal-v1';
  const DRAFT_KEY = 'startpage-minimal-draft-v1';
  const byId = id => document.getElementById(id);
  const query = byId('query');
  const grid = byId('bookmarks');
  const dialog = byId('settings');
  const editor = byId('bookmark-editor');
  const error = byId('settings-error');
  const bookmarkMotion = new WeakMap();
  const bookmarkContent = new WeakMap();
  const leavingBookmarks = new Map();
  let preferences = core.defaults(globalThis.STARTPAGE_DEFAULTS);
  let composing = false;
  let closing = false;
  let closeTimer;
  let saveTimer;
  let renderFrame;
  let settingsDirty = false;
  let draftBase;
  let draftWritten = '';
  const wallpaper = byId('wallpaper');
  let photoSeed = crypto.randomUUID();
  let wallpaperSource = '';
  let wallpaperRequest = 0;
  let pendingPhoto;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) preferences = core.validatePreferences(JSON.parse(saved));
    else {
      const legacy = localStorage.getItem('startpage-preferences-v1');
      if (legacy) preferences = core.migrate(JSON.parse(legacy), globalThis.STARTPAGE_DEFAULTS);
    }
  } catch { /* Corrupt or unavailable storage leaves the original links usable. */ }
  let searchIndex = core.indexBookmarks(preferences.bookmarks);
  let currentSerialized = JSON.stringify(preferences);

  function collectBackground() {
    return { mode: byId('background-mode').value, url: byId('background-url').value, color: byId('background-color').value, blur: Number(byId('background-blur').value), darkness: Number(byId('background-darkness').value) };
  }

  function updateBackgroundFields() {
    const mode = byId('background-mode').value;
    byId('background-image-field').hidden = mode !== 'image';
    byId('background-color-field').hidden = mode !== 'color';
    byId('background-photo-controls').hidden = mode === 'color';
    byId('background-random-controls').hidden = mode !== 'random';
    byId('background-url').disabled = mode !== 'image';
    byId('background-color').disabled = mode !== 'color';
    byId('background-blur-value').value = `${byId('background-blur').value} px`;
    byId('background-darkness-value').value = `${byId('background-darkness').value}%`;
  }

  function applyBackground(background) {
    wallpaper.style.setProperty('--wallpaper-color', background.color);
    wallpaper.style.setProperty('--wallpaper-blur', `${background.blur}px`);
    const dim = background.darkness / 100;
    wallpaper.style.setProperty('--wallpaper-inner', String(dim));
    wallpaper.style.setProperty('--wallpaper-middle', String(Math.min(.98, dim + .22)));
    wallpaper.style.setProperty('--wallpaper-outer', String(Math.min(.98, dim + .38)));
    const source = core.backgroundUrl(background, photoSeed);
    if (source === wallpaperSource) return;
    wallpaperSource = source;
    const request = ++wallpaperRequest;
    if (pendingPhoto) {
      pendingPhoto.onload = pendingPhoto.onerror = null;
      pendingPhoto.removeAttribute('src');
      pendingPhoto = null;
    }
    byId('new-background').disabled = false;
    byId('background-status').textContent = '';
    if (!source) {
      wallpaper.classList.remove('has-photo');
      for (const image of wallpaper.querySelectorAll('img')) {
        image.classList.remove('ready');
        setTimeout(() => image.remove(), 850);
      }
      return;
    }
    const photo = new Image();
    pendingPhoto = photo;
    photo.alt = '';
    photo.draggable = false;
    photo.referrerPolicy = 'no-referrer';
    photo.decoding = 'async';
    byId('new-background').disabled = true;
    byId('background-status').textContent = 'loading photo...';
    photo.onload = async () => {
      try { await photo.decode(); } catch { /* The load event already confirms a usable image. */ }
      if (request !== wallpaperRequest) return;
      pendingPhoto = null;
      const previous = Array.from(wallpaper.querySelectorAll('img'));
      wallpaper.append(photo);
      photo.getBoundingClientRect(); // Commit transparency before the photo fades in.
      photo.classList.add('ready');
      wallpaper.classList.add('has-photo');
      for (const image of previous) {
        image.classList.remove('ready');
        setTimeout(() => image.remove(), 850);
      }
      byId('new-background').disabled = false;
      byId('background-status').textContent = '';
    };
    photo.onerror = () => {
      if (request !== wallpaperRequest) return;
      pendingPhoto = null;
      byId('new-background').disabled = false;
      byId('background-status').textContent = 'photo unavailable. choose another photo or image address.';
    };
    photo.src = source;
  }

  function previewBackground() {
    updateBackgroundFields();
    try { applyBackground(core.validateBackground(collectBackground())); }
    catch { /* Keep the current photo while an address is being edited. */ }
  }

  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('d', path);
    svg.append(line);
    return svg;
  }

  function highlightText(element, text, needle) {
    element.replaceChildren();
    if (!needle) {
      element.textContent = text;
      return;
    }
    const normalized = text.toLowerCase();
    let start = 0;
    let index;
    while ((index = normalized.indexOf(needle, start)) !== -1) {
      element.append(document.createTextNode(text.slice(start, index)));
      const match = document.createElement('mark');
      match.textContent = text.slice(index, index + needle.length);
      element.append(match);
      start = index + needle.length;
    }
    element.append(document.createTextNode(text.slice(start)));
  }

  function renderBookmarks() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    for (const [ghost, motion] of leavingBookmarks) { motion.cancel(); ghost.remove(); }
    leavingBookmarks.clear();
    const visible = core.matchIndex(searchIndex, query.value);
    const needle = query.value.trim().toLowerCase();
    const previous = new Map(Array.from(grid.children, link => [link.dataset.key, { link, rect: link.getBoundingClientRect(), opacity: getComputedStyle(link).opacity }]));
    for (const { link } of previous.values()) bookmarkMotion.get(link)?.cancel();
    document.body.classList.toggle('searching', Boolean(query.value));
    for (const [index, bookmark] of visible.entries()) {
      const link = previous.get(bookmark.key)?.link || document.createElement('a');
      link.classList.add('bookmark');
      link.dataset.key = bookmark.key;
      link.classList.toggle('bookmark-match', Boolean(needle));
      link.classList.toggle('bookmark-exact', Boolean(needle) && needle === bookmark.key);
      link.href = bookmark.url;
      link.draggable = false;
      link.setAttribute('aria-label', `${bookmark.name}, key ${bookmark.key}`);
      const signature = `${bookmark.key}\0${bookmark.name}\0${needle}`;
      if (bookmarkContent.get(link) !== signature) {
        let key = link.children[0];
        let name = link.children[1];
        if (!key) {
          key = document.createElement('span');
          key.className = 'bookmark-key';
          name = document.createElement('span');
          name.className = 'bookmark-name';
          link.append(key, name);
        }
        highlightText(key, bookmark.key, needle);
        highlightText(name, bookmark.name, needle);
        bookmarkContent.set(link, signature);
      }
      if (grid.children[index] !== link) grid.insertBefore(link, grid.children[index] || null);
    }
    const shown = new Set(visible.map(bookmark => bookmark.key));
    for (const link of Array.from(grid.children)) {
      if (shown.has(link.dataset.key)) continue;
      const before = previous.get(link.dataset.key);
      const ghost = link.cloneNode(true);
      ghost.classList.add('bookmark-exit');
      ghost.removeAttribute('href');
      ghost.removeAttribute('data-key');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      Object.assign(ghost.style, { left: `${before.rect.left}px`, top: `${before.rect.top}px`, width: `${before.rect.width}px`, height: `${before.rect.height}px` });
      document.body.append(ghost);
      const exit = ghost.animate([{ opacity: before.opacity, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.96)' }], { duration: 220, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
      leavingBookmarks.set(ghost, exit);
      exit.finished.then(() => { ghost.remove(); leavingBookmarks.delete(ghost); }).catch(() => {});
      link.remove();
    }
    // Read the final geometry in one batch before starting animations.
    const positions = Array.from(grid.children, link => ({ link, rect: link.getBoundingClientRect() }));
    for (const [index, { link, rect: after }] of positions.entries()) {
      const prior = previous.get(link.dataset.key);
      const before = prior?.rect;
      let frames;
      if (!before) frames = [{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }];
      else {
        const x = before.left - after.left;
        const y = before.top - after.top;
        if (Math.abs(x) < 1 && Math.abs(y) < 1 && Number(prior.opacity) >= .999) continue;
        frames = [{ opacity: prior.opacity, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: 'none' }];
      }
      bookmarkMotion.set(link, link.animate(frames, { duration: 560, easing: 'cubic-bezier(.22, 1.1, .36, 1)', delay: before ? 0 : Math.min(index * 22, 132), fill: 'backwards' }));
    }
    byId('search-status').textContent = query.value ? `${visible.length} matching bookmarks` : '';
  }

  function scheduleRender() {
    if (!renderFrame) renderFrame = requestAnimationFrame(renderBookmarks);
  }

  function focusSearch() {
    if (!dialog.open) query.focus({ preventScroll: true });
  }

  function clearSearch() {
    query.value = '';
    renderBookmarks();
    focusSearch();
  }

  query.addEventListener('input', scheduleRender);
  query.addEventListener('compositionstart', () => { composing = true; });
  query.addEventListener('compositionend', () => { composing = false; });
  query.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || composing)) event.preventDefault();
  });
  byId('search-form').addEventListener('submit', event => {
    event.preventDefault();
    if (composing || dialog.open) return;
    const url = core.destination(query.value, preferences);
    if (url) location.assign(url);
  });

  document.addEventListener('keydown', event => {
    if (dialog.open || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && event.target.closest('button, a')) return;
    if (event.key === 'Escape') {
      clearSearch();
      event.preventDefault();
    } else if (event.key.length === 1 && event.target !== query && !event.target.matches('input, textarea, select, [contenteditable]')) {
      focusSearch();
      query.value += event.key;
      scheduleRender();
      event.preventDefault();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('a, button, dialog, input, select, textarea')) focusSearch();
  });
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
  window.addEventListener('focus', focusSearch);
  window.addEventListener('pageshow', event => {
    // The initial render is already animated; rendering it again would cancel that entrance.
    if (event.persisted) renderBookmarks();
    focusSearch();
  });

  function editorRow(bookmark) {
    const row = document.createElement('div');
    row.className = 'editor-row';
    const key = document.createElement('input');
    key.className = 'key-input';
    key.value = bookmark.key;
    key.maxLength = 8;
    key.autocapitalize = 'off';
    key.spellcheck = false;
    key.setAttribute('aria-label', 'bookmark key');
    const fields = document.createElement('div');
    fields.className = 'editor-fields';
    const name = document.createElement('input');
    name.className = 'name-input';
    name.value = bookmark.name;
    name.maxLength = 40;
    name.placeholder = 'name';
    name.setAttribute('aria-label', 'bookmark name');
    const url = document.createElement('input');
    url.className = 'url-input';
    url.value = bookmark.url;
    url.type = 'text';
    url.inputMode = 'url';
    url.autocapitalize = 'off';
    url.spellcheck = false;
    url.maxLength = 2000;
    url.placeholder = 'https://example.com';
    url.setAttribute('aria-label', 'bookmark address');
    fields.append(name, url);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.setAttribute('aria-label', `remove ${bookmark.name || 'bookmark'}`);
    remove.append(icon('m7 7 10 10M17 7 7 17'));
    remove.addEventListener('click', () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      settingsDirty = true;
      autosave();
      if (next) next.querySelector('input').focus();
      else byId('add-bookmark').focus();
    });
    row.append(key, fields, remove);
    return row;
  }

  function openSettings() {
    if (dialog.open) return;
    clearTimeout(closeTimer);
    closing = false;
    error.textContent = '';
    let draft = preferences;
    settingsDirty = false;
    draftBase = currentSerialized;
    draftWritten = '';
    try {
      const savedDraft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (savedDraft?.base && JSON.stringify(core.validatePreferences(JSON.parse(savedDraft.base))) === currentSerialized) {
        draft = core.validateDraft(savedDraft.value);
        settingsDirty = true;
        draftWritten = JSON.stringify(savedDraft);
      }
    } catch { /* Invalid drafts cannot change active preferences. */ }
    byId('engine').value = draft.engine;
    byId('custom-search-url').value = draft.customSearchUrl || '';
    byId('background-mode').value = draft.background.mode;
    byId('background-url').value = draft.background.url;
    byId('background-color').value = draft.background.color;
    byId('background-blur').value = draft.background.blur;
    byId('background-darkness').value = draft.background.darkness;
    previewBackground();
    updateEngineField();
    editor.replaceChildren(...draft.bookmarks.map(editorRow));
    if (settingsDirty) autosave(true);
    dialog.showModal();
    dialog.getBoundingClientRect(); // Commit the initial state before starting the opening transition.
    requestAnimationFrame(() => dialog.classList.add('visible'));
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    clearTimeout(closeTimer);
    dialog.close();
    focusSearch();
  }

  function closeSettings() {
    if (!dialog.open || closing) return;
    autosave(true);
    applyBackground(preferences.background);
    closing = true;
    dialog.classList.remove('visible');
    closeTimer = setTimeout(finishClose, 460);
  }
  dialog.addEventListener('transitionend', event => {
    if (event.target === dialog && event.propertyName === 'transform') finishClose();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeSettings();
  });
  byId('open-settings').addEventListener('click', openSettings);
  byId('close-settings').addEventListener('click', closeSettings);
  function updateEngineField() {
    const active = byId('engine').value === 'custom';
    byId('custom-engine').classList.toggle('active', active);
    byId('custom-engine').setAttribute('aria-hidden', String(!active));
    byId('custom-engine').inert = !active;
    byId('custom-search-url').disabled = !active;
  }
  byId('engine').addEventListener('change', () => {
    updateEngineField();
    settingsDirty = true;
    autosave();
  });
  byId('background-mode').addEventListener('change', () => {
    previewBackground();
    settingsDirty = true;
    autosave();
  });
  byId('new-background').addEventListener('click', () => {
    photoSeed = crypto.randomUUID();
    previewBackground();
  });
  byId('add-bookmark').addEventListener('click', () => {
    if (editor.children.length >= 64) {
      error.textContent = 'use up to 64 bookmarks.';
      return;
    }
    const row = editorRow({ key: '', name: '', url: '' });
    editor.append(row);
    settingsDirty = true;
    autosave();
    row.querySelector('input').focus({ preventScroll: true });
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  function collectDraft() {
    return { engine: byId('engine').value, customSearchUrl: byId('custom-search-url').value, background: collectBackground(), bookmarks: Array.from(editor.children, row => ({
      key: row.querySelector('.key-input').value,
      name: row.querySelector('.name-input').value,
      url: row.querySelector('.url-input').value
    })) };
  }

  function autosave(showErrors = false) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!settingsDirty) return;
    const draft = collectDraft();
    let next;
    try {
      next = core.validatePreferences(draft);
    } catch (failure) {
      try {
        const serializedDraft = JSON.stringify({ base: draftBase, value: core.validateDraft(draft) });
        if (serializedDraft !== draftWritten) localStorage.setItem(DRAFT_KEY, serializedDraft);
        draftWritten = serializedDraft;
        if (showErrors || error.textContent) error.textContent = `${failure.message} unfinished changes are kept as a draft.`;
      } catch {
        error.textContent = 'browser storage is unavailable. unfinished changes cannot be saved.';
      }
      return;
    }
    const serialized = JSON.stringify(next);
    const changed = serialized !== currentSerialized;
    if (changed) {
      preferences = next;
      searchIndex = core.indexBookmarks(next.bookmarks);
      currentSerialized = serialized;
      applyBackground(next.background);
      scheduleRender();
    }
    try {
      // No writes for unchanged valid preferences; input bursts are coalesced.
      if (changed || draftWritten === 'storage-error') localStorage.setItem(STORAGE_KEY, serialized);
      if (draftWritten && draftWritten !== 'storage-error') localStorage.removeItem(DRAFT_KEY);
      draftWritten = '';
      draftBase = serialized;
      settingsDirty = false;
      error.textContent = '';
    } catch {
      draftWritten = 'storage-error';
      error.textContent = 'changes apply to this tab only. browser storage is unavailable.';
    }
  }

  byId('settings-form').addEventListener('input', event => {
    if (event.target.closest('.background-settings')) previewBackground();
    settingsDirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 300);
  });
  byId('settings-form').addEventListener('focusout', () => autosave(true));
  byId('settings-form').addEventListener('submit', event => { event.preventDefault(); autosave(true); });
  window.addEventListener('pagehide', () => { if (dialog.open) autosave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open) autosave(); });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    try {
      preferences = event.newValue ? core.validatePreferences(JSON.parse(event.newValue)) : core.defaults(globalThis.STARTPAGE_DEFAULTS);
      searchIndex = core.indexBookmarks(preferences.bookmarks);
      currentSerialized = JSON.stringify(preferences);
      applyBackground(preferences.background);
      scheduleRender();
    } catch { /* Ignore invalid changes from other tabs. */ }
  });

  renderBookmarks();
  focusSearch();
  applyBackground(preferences.background);
})();
