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
  const editorMotion = new Map();
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
  let bookmarkPointerDrag;
  let bookmarkDragFrame;

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
    byId('background-photo-controls').hidden = mode === 'color' || mode === 'transparent';
    byId('background-random-controls').hidden = mode !== 'random';
    byId('background-url').disabled = mode !== 'image';
    byId('background-color').disabled = mode !== 'color';
    byId('background-blur-value').value = `${byId('background-blur').value} px`;
    byId('background-darkness-value').value = `${byId('background-darkness').value}%`;
  }

  function applyBackground(background) {
    const transparent = background.mode === 'transparent';
    wallpaper.classList.toggle('is-transparent', transparent);
    document.documentElement.classList.toggle('transparent-background', transparent);
    document.body.classList.toggle('transparent-background', transparent);
    wallpaper.style.setProperty('--wallpaper-color', transparent ? 'rgba(0, 0, 0, 0)' : background.color);
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
  document.addEventListener('dragstart', event => {
    if (!event.target.closest('.drag-handle')) event.preventDefault();
  });
  window.addEventListener('focus', focusSearch);
  window.addEventListener('pageshow', event => {
    // The initial render is already animated; rendering it again would cancel that entrance.
    if (event.persisted) renderBookmarks();
    focusSearch();
  });

  function editorRow(bookmark) {
    const row = document.createElement('div');
    row.className = 'editor-row';
    const drag = document.createElement('button');
    drag.type = 'button';
    drag.className = 'drag-handle';
    drag.setAttribute('aria-label', `reorder ${bookmark.name || 'bookmark'}; use up or down arrow keys`);
    drag.title = 'drag to reorder';
    drag.append(icon('M5 7h14M5 12h14M5 17h14'));
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
      const rows = editorRows();
      const next = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
      row.remove();
      settingsDirty = true;
      autosave();
      if (next) next.querySelector('input').focus();
      else byId('add-bookmark').focus();
    });
    row.append(drag, key, fields, remove);
    drag.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = row.getBoundingClientRect();
      bookmarkPointerDrag = { row, handle: drag, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, origin: editorRows(), moved: false };
      drag.setPointerCapture(event.pointerId);
    });
    drag.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const before = captureEditorRects();
      const columns = splitEditorColumns(editorItems());
      const column = columns.findIndex(items => items.includes(row));
      const items = columns[column];
      const index = items.indexOf(row);
      const nextIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (nextIndex < 0 || nextIndex >= items.length) return;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      renderEditorColumns(columns);
      animateEditorMovement(before);
      settingsDirty = true;
      autosave();
      drag.focus();
      event.preventDefault();
    });
    return row;
  }

  function editorRows() {
    return Array.from(editor.children).filter(child => child.classList.contains('editor-row'));
  }

  function editorItems() {
    return Array.from(editor.children).filter(child => child.classList.contains('editor-row') || child.classList.contains('drag-placeholder'));
  }

  function splitEditorColumns(items) {
    if (getComputedStyle(editor).gridTemplateColumns.split(' ').filter(Boolean).length < 2) return [items, []];
    return [items.filter((_, index) => index % 2 === 0), items.filter((_, index) => index % 2 === 1)];
  }

  function renderEditorColumns(columns) {
    const ordered = [];
    for (let index = 0; index < Math.max(columns[0].length, columns[1].length); index += 1) {
      if (columns[0][index]) ordered.push(columns[0][index]);
      if (columns[1][index]) ordered.push(columns[1][index]);
    }
    editor.replaceChildren(...ordered);
  }

  function captureEditorRects() {
    const items = editorItems();
    const rects = new Map(items.map(item => [item, item.getBoundingClientRect()]));
    for (const [item, motion] of editorMotion) motion.cancel();
    editorMotion.clear();
    return rects;
  }

  function animateEditorMovement(before) {
    for (const item of editorItems()) {
      const prior = before.get(item);
      if (!prior) continue;
      const next = item.getBoundingClientRect();
      const x = prior.left - next.left;
      const y = prior.top - next.top;
      if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;
      const motion = item.animate([
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' }
      ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      editorMotion.set(item, motion);
      motion.finished.then(() => { if (editorMotion.get(item) === motion) editorMotion.delete(item); }).catch(() => {});
    }
  }

  function beginBookmarkDrag(drag) {
    const rect = drag.row.getBoundingClientRect();
    captureEditorRects();
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${rect.height}px`;
    const preview = drag.row.cloneNode(true);
    preview.classList.add('bookmark-drag-preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;
    preview.querySelectorAll('button, input').forEach(control => { control.tabIndex = -1; });
    Object.assign(preview.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    drag.row.replaceWith(placeholder);
    document.body.append(preview);
    drag.placeholder = placeholder;
    drag.preview = preview;
  }

  function repositionBookmarkPlaceholder(drag, point) {
    if (!drag.placeholder?.isConnected) return;
    const before = captureEditorRects();
    const columns = splitEditorColumns(editorItems());
    const editorRect = editor.getBoundingClientRect();
    const destination = columns[1].length && point.x >= editorRect.left + editorRect.width / 2 ? 1 : 0;
    const destinationItems = columns[destination].filter(item => item !== drag.placeholder);
    const insertionIndex = destinationItems.findIndex(item => {
      const rect = before.get(item) || item.getBoundingClientRect();
      return point.y < rect.top + rect.height / 2;
    });
    columns[0] = columns[0].filter(item => item !== drag.placeholder);
    columns[1] = columns[1].filter(item => item !== drag.placeholder);
    const targetColumn = columns[destination];
    targetColumn.splice(insertionIndex < 0 ? targetColumn.length : insertionIndex, 0, drag.placeholder);
    renderEditorColumns(columns);
    const closest = destinationItems.reduce((nearest, item) => {
      const rect = before.get(item) || item.getBoundingClientRect();
      const distance = Math.abs(point.y - (rect.top + rect.height / 2));
      return !nearest || distance < nearest.distance ? { item, distance } : nearest;
    }, null)?.item;
    for (const row of editorRows()) row.classList.toggle('drag-over', row === closest);
    animateEditorMovement(before);
  }

  function updateBookmarkDrag(drag, event) {
    const point = { x: event.clientX, y: event.clientY };
    drag.latest = point;
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < 6) return;
    event.preventDefault();
    if (!drag.moved) {
      drag.moved = true;
      beginBookmarkDrag(drag);
    }
    drag.preview.style.left = `${point.x - drag.offsetX}px`;
    drag.preview.style.top = `${point.y - drag.offsetY}px`;
    if (!bookmarkDragFrame) {
      bookmarkDragFrame = requestAnimationFrame(() => {
        bookmarkDragFrame = 0;
        if (bookmarkPointerDrag === drag && drag.latest) repositionBookmarkPlaceholder(drag, drag.latest);
      });
    }
  }

  document.addEventListener('pointermove', event => {
    const drag = bookmarkPointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    updateBookmarkDrag(drag, event);
  });

  function finishBookmarkPointerDrag(event) {
    const drag = bookmarkPointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (bookmarkDragFrame) {
      cancelAnimationFrame(bookmarkDragFrame);
      bookmarkDragFrame = 0;
    }
    if (drag.moved && drag.latest && event.type !== 'pointercancel') repositionBookmarkPlaceholder(drag, drag.latest);
    if (drag.placeholder?.isConnected) {
      if (event.type === 'pointercancel') {
        for (const row of drag.origin) editor.append(row);
        drag.placeholder.remove();
      } else drag.placeholder.replaceWith(drag.row);
    }
    for (const row of editorRows()) row.classList.remove('drag-over');
    drag.preview?.remove();
    bookmarkPointerDrag = null;
    const rows = editorRows();
    if (drag.moved && event.type !== 'pointercancel' && drag.origin.some((row, index) => rows[index] !== row)) {
      settingsDirty = true;
      autosave();
      drag.handle.focus();
    }
  }
  document.addEventListener('pointerup', finishBookmarkPointerDrag);
  document.addEventListener('pointercancel', finishBookmarkPointerDrag);

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
    if (editorRows().length >= 64) {
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
    const rows = Array.from(editor.children)
      .filter(row => row.classList.contains('editor-row') || row.classList.contains('drag-placeholder'))
      .map(row => row.classList.contains('drag-placeholder') ? bookmarkPointerDrag?.row : row)
      .filter(Boolean);
    return { engine: byId('engine').value, customSearchUrl: byId('custom-search-url').value, background: collectBackground(), bookmarks: rows.map(row => ({
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
