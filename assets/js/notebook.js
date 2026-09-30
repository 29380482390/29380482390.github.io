(() => {
  'use strict';
  const { PAGE_LIMIT, emptyNotebook, normalizeNotebook, isTaskHidden, nextTaskExpiry, deleteCompleted, undoDeleteCompleted } = window.STARTPAGE_NOTEBOOK_CORE;
  const KEY = 'startpage-notebook-v2';
  const LEGACY_KEY = 'startpage-notebook-v1';
  const $ = selector => document.querySelector(selector);
  const reducedMotion = window.STARTPAGE_MOTION;
  let data = emptyNotebook();
  let storageFailed = false;
  let migrated = false;
  try {
    const saved = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      data = normalizeNotebook(parsed);
      migrated = parsed?.version === 1;
    }
  } catch { storageFailed = true; }
  let saveTimer;
  let expiryTimer;
  let showCompleted = false;
  let showTrash = false;
  let editingFolder = null;
  let folderComposerOpen = false;
  const rowMotions = new Map();
  const menu = $('#notebook-menu');
  let menuAnchor = null;
  let menuMotion = null;
  let menuClosing = false;
  const activePage = () => data.pages.find(note => note.id === data.selectedPageId);
  const id = () => crypto.randomUUID();

  function status(message, error = false) {
    $('#note-status').textContent = error ? message : '';
    $('#note-status').hidden = !error;
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      storageFailed = false;
      status('');
      return true;
    } catch {
      storageFailed = true;
      status('not saved - browser storage is unavailable or full', true);
      return false;
    }
  }
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }
  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }
  function tool(label, symbol, action, className = 'notebook-tool') {
    const button = make('button', className);
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(symbol));
    button.addEventListener('click', action);
    return button;
  }
  function newPage(type, folderId = activePage()?.folderId || data.folders[0].id) {
    closeMenu();
    if (data.pages.length >= PAGE_LIMIT) { status('this notebook can hold up to 256 pages', true); return; }
    const page = { id: id(), folderId, title: '', type, body: '', tasks: [], deletedTasks: [], trashed: false };
    data.pages.push(page);
    data.selectedPageId = page.id;
    data.folders.find(folder => folder.id === folderId).collapsed = false;
    showTrash = false;
    showCompleted = false;
    render();
    persist();
    animatePane();
    $('#note-title-input').focus();
  }
  function selectPage(note) {
    closeMenu();
    if (saveTimer) persist();
    data.selectedPageId = note.id;
    showCompleted = false;
    render();
    persist();
    animatePane();
  }
  function animatePane() {
    if (reducedMotion.matches) return;
    const pane = $('#note-editor');
    pane.getAnimations().forEach(animation => animation.cancel());
    pane.animate([{ opacity: .4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function pageEntry(page) {
    const button = make('button', 'note-entry');
    button.append(icon(page.type === 'tasks' ? 'task' : 'page'), make('span', '', page.title.trim() || 'untitled'));
    return button;
  }
  function focusPageContent() {
    const page = activePage();
    const target = !page ? '#empty-notes-page' : page.trashed ? '#note-title-input' : page.type === 'tasks' ? '#task-input' : '#note-body';
    $(target).focus({ preventScroll: true });
  }
  function animateMenu(frames, duration, complete) {
    menuMotion?.cancel();
    menuMotion = null;
    if (reducedMotion.matches) { complete(); return; }
    const motion = menu.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    menuMotion = motion;
    motion.finished.then(() => {
      if (menuMotion !== motion) return;
      menuMotion = null;
      complete();
      motion.cancel();
    }).catch(() => { /* Reopening interrupts the exit animation. */ });
  }
  function closeMenu(restoreFocus = false, immediate = false) {
    if (!immediate && (menu.hidden || menuClosing)) return;
    const anchor = menuAnchor;
    menuAnchor = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
    const finish = () => {
      menu.hidden = true;
      menu.inert = false;
      menuClosing = false;
      menu.dataset.state = 'closed';
    };
    if (immediate || menu.hidden) {
      menuMotion?.cancel(); menuMotion = null; finish(); return;
    }
    const style = getComputedStyle(menu);
    const from = { opacity: style.opacity, transform: style.transform };
    menuClosing = true;
    menu.inert = true;
    menu.dataset.state = 'closing';
    animateMenu([from, { opacity: 0, transform: 'translateY(-3px) scale(.98)' }], 150, finish);
  }
  function openMenu(anchor, label, items) {
    if (menuAnchor === anchor) { closeMenu(true); return; }
    closeMenu(false, true);
    menuAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', label);
    menu.replaceChildren(...items.map(item => {
      const button = make('button', 'notebook-menu-item');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked));
      button.append(icon(item.icon), make('span', '', item.label));
      if (item.checked) button.append(icon('check'));
      button.addEventListener('click', () => { closeMenu(true); item.action(); });
      return button;
    }));
    menu.hidden = false;
    menu.dataset.state = 'opening';
    const bounds = $('#window-notes').getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    menu.style.maxHeight = `${Math.min(260, bounds.height - 24)}px`;
    const left = Math.min(Math.max(10, rect.left - bounds.left), bounds.width - menu.offsetWidth - 10);
    const below = rect.bottom - bounds.top + 6;
    const top = Math.min(below, bounds.height - menu.offsetHeight - 12);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(12, top)}px`;
    animateMenu([{ opacity: 0, transform: 'translateY(-3px) scale(.98)' }, { opacity: 1, transform: 'none' }], 170, () => { menu.dataset.state = 'open'; });
    (menu.querySelector('[aria-checked="true"]') || menu.firstElementChild)?.focus({ preventScroll: true });
  }
  function openCreateMenu(anchor, folderId = activePage()?.folderId || data.folders[0].id) {
    openMenu(anchor, 'new page', [
      { label: 'notes page', icon: 'page', action: () => newPage('notes', folderId) },
      { label: 'to-do page', icon: 'task', action: () => newPage('tasks', folderId) }
    ]);
  }
  function openFolderMenu() {
    const page = activePage();
    if (!page || page.trashed) return;
    openMenu($('#note-folder-button'), 'move page to folder', data.folders.map(folder => ({
      label: folder.name, icon: 'folder', checked: folder.id === page.folderId,
      action: () => {
        page.folderId = folder.id;
        folder.collapsed = false;
        $('#folder-label').textContent = folder.name;
        renderTree(); persist();
      }
    })));
  }
  document.addEventListener('pointerdown', event => {
    if (menuAnchor && !menu.contains(event.target) && !menuAnchor.contains(event.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', event => {
    if (!menuAnchor) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeMenu(true); return;
    }
    if (event.key === 'Tab') { closeMenu(true); return; }
    const buttons = [...menu.querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); event.stopPropagation(); buttons[next].focus(); }
  }, true);
  window.addEventListener('resize', () => closeMenu(false, true));
  function renderTree() {
    const tree = $('#notes-tree');
    tree.replaceChildren();
    data.folders.forEach(folder => {
      const group = make('section', 'note-folder');
      const heading = make('div', 'note-folder-heading');
      const toggle = make('button', 'folder-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!folder.collapsed));
      toggle.append(icon('chevron'), icon('folder'), make('span', '', folder.name));
      toggle.title = folder.name;
      toggle.addEventListener('click', () => { folder.collapsed = !folder.collapsed; renderTree(); persist(); });
      const rename = tool(`rename folder ${folder.name}`, 'edit', () => openFolderComposer(folder));
      heading.append(toggle, rename);
      group.append(heading);
      const children = make('div', 'folder-notes');
      children.hidden = folder.collapsed;
      data.pages.filter(note => !note.trashed && note.folderId === folder.id).forEach(note => {
        const button = pageEntry(note);
        button.type = 'button';
        button.dataset.noteId = note.id;
        button.setAttribute('aria-current', String(note.id === data.selectedPageId));
        button.title = note.title.trim() || 'untitled';
        button.addEventListener('click', () => selectPage(note));
        children.append(button);
      });
      const add = make('button', 'folder-add', '+ new page');
      add.type = 'button';
      add.setAttribute('aria-label', `new page in ${folder.name}`);
      add.setAttribute('aria-haspopup', 'menu');
      add.setAttribute('aria-expanded', 'false');
      add.addEventListener('click', () => openCreateMenu(add, folder.id));
      children.append(add);
      group.append(children);
      tree.append(group);
    });
    const trashed = data.pages.filter(note => note.trashed);
    $('#notes-trash-toggle').textContent = `trash${trashed.length ? ` (${trashed.length})` : ''}`;
    $('#notes-trash-toggle').setAttribute('aria-expanded', String(showTrash));
    const trash = $('#notes-trash-list');
    trash.replaceChildren();
    trash.hidden = !showTrash;
    trashed.forEach(note => {
      const button = pageEntry(note);
      button.type = 'button';
      button.setAttribute('aria-current', String(note.id === data.selectedPageId));
      button.addEventListener('click', () => selectPage(note));
      trash.append(button);
    });
    if (showTrash && !trashed.length) trash.append(make('p', 'notebook-empty-small', 'trash is empty'));
  }
  function updateCompleted() {
    const count = activePage()?.tasks.filter(task => task.completedAt !== null).length || 0;
    const toggle = $('#show-completed');
    toggle.textContent = showCompleted ? 'hide completed' : `completed${count ? ` (${count})` : ''}`;
    toggle.setAttribute('aria-pressed', String(showCompleted));
    toggle.hidden = count === 0;
    $('#delete-completed').hidden = count === 0 || activePage()?.trashed;
    $('#undo-delete-tasks').hidden = !activePage()?.deletedTasks?.length || activePage()?.trashed;
  }
  function renderTasks() {
    rowMotions.forEach(motion => motion.cancel());
    rowMotions.clear();
    const list = $('#note-tasks');
    list.replaceChildren();
    const note = activePage();
    if (!note || note.type !== 'tasks') { clearTimeout(expiryTimer); return; }
    note.tasks.filter(task => showCompleted || !isTaskHidden(task)).forEach(task => {
      const row = make('div', 'task-row');
      row.dataset.taskId = task.id;
      row.classList.toggle('is-complete', task.completedAt !== null);
      const checkbox = make('input', 'task-check');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completedAt !== null;
      checkbox.disabled = note.trashed;
      checkbox.setAttribute('aria-label', `complete ${task.text || 'task'}`);
      checkbox.addEventListener('change', () => {
        rowMotions.get(task.id)?.cancel();
        rowMotions.delete(task.id);
        task.completedAt = checkbox.checked ? Date.now() : null;
        row.classList.toggle('is-complete', checkbox.checked);
        updateCompleted(); scheduleExpiry(); persist();
      });
      const text = make('input', 'task-text');
      text.type = 'text';
      text.value = task.text;
      text.maxLength = 500;
      text.readOnly = note.trashed;
      text.setAttribute('aria-label', 'task text');
      text.addEventListener('input', () => {
        task.text = text.value;
        checkbox.setAttribute('aria-label', `complete ${task.text || 'task'}`);
        queueSave();
      });
      row.append(checkbox, text);
      list.append(row);
    });
    updateCompleted();
    scheduleExpiry();
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (showCompleted || document.hidden) return;
    const note = activePage();
    if (!note) return;
    if (note.type !== 'tasks') return;
    const delay = nextTaskExpiry(note.tasks);
    if (delay !== null) expiryTimer = setTimeout(expireTasks, delay + 20);
  }
  function expireTasks() {
    if (showCompleted) return;
    const note = activePage();
    if (!note) return;
    for (const row of [...$('#note-tasks').children]) {
      const task = note.tasks.find(task => task.id === row.dataset.taskId);
      if (!task || !isTaskHidden(task) || rowMotions.has(task.id)) continue;
      const completedAt = task.completedAt;
      if (row.contains(document.activeElement)) $('#task-input').focus({ preventScroll: true });
      if (reducedMotion.matches || $('#window-notes').hidden) { row.remove(); continue; }
      const motion = row.animate([{ height: `${row.offsetHeight}px`, opacity: .6 }, { height: '0px', paddingBottom: '0px', opacity: 0 }],
        { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      rowMotions.set(task.id, motion);
      motion.finished.then(() => {
        if (task.completedAt === completedAt) row.remove();
        motion.cancel();
        rowMotions.delete(task.id);
      }).catch(() => {});
    }
    scheduleExpiry();
  }
  function render() {
    closeMenu();
    renderTree();
    const page = activePage();
    $('#note-editor').hidden = !page;
    $('#notes-empty').hidden = Boolean(page);
    $('#trash-note').hidden = !page || page.trashed;
    $('#restore-note').hidden = !page?.trashed;
    $('#new-task').hidden = !page || page.type !== 'tasks' || page.trashed;
    $('#task-input').value = '';
    if (!page) { clearTimeout(expiryTimer); return; }
    $('#note-title-input').value = page.title;
    $('#note-title-input').readOnly = page.trashed;
    $('#note-body').value = page.body;
    $('#note-body').readOnly = page.trashed;
    $('#note-body').hidden = page.type !== 'notes';
    $('#task-page').hidden = page.type !== 'tasks';
    $('#note-editor').dataset.pageType = page.type;
    $('#page-kind').textContent = page.type === 'tasks' ? 'to-dos' : 'notes';
    $('#folder-label').textContent = data.folders.find(folder => folder.id === page.folderId).name;
    $('#note-folder-button').disabled = page.trashed;
    $('#task-form').hidden = page.trashed;
    $('#note-trash-hint').hidden = !page.trashed;
    renderTasks();
  }
  function openFolderComposer(folder = null) {
    closeMenu();
    if (!folder && data.folders.length >= 32) { status('this notebook can hold up to 32 folders', true); return; }
    editingFolder = folder;
    folderComposerOpen = true;
    $('#folder-composer').hidden = false;
    $('#folder-name').value = folder?.name || '';
    $('#folder-name').placeholder = folder ? 'rename folder' : 'folder name';
    $('#folder-name').focus();
    $('#folder-name').select();
  }
  function closeFolderComposer() {
    folderComposerOpen = false;
    $('#folder-composer').hidden = true;
    $('#new-folder').focus();
  }

  $('#new-page').addEventListener('click', () => openCreateMenu($('#new-page')));
  $('#new-page').addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    openCreateMenu($('#new-page'));
  });
  $('#new-task').addEventListener('click', () => {
    $('#task-input').scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    $('#task-input').focus({ preventScroll: true });
  });
  $('#empty-notes-page').addEventListener('click', () => newPage('notes'));
  $('#empty-tasks-page').addEventListener('click', () => newPage('tasks'));
  $('#new-folder').addEventListener('click', () => openFolderComposer());
  $('#cancel-folder').addEventListener('click', closeFolderComposer);
  $('#folder-composer').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#folder-name').value.trim();
    if (!name) return;
    if (editingFolder) editingFolder.name = name;
    else data.folders.push({ id: id(), name, collapsed: false });
    closeFolderComposer();
    render(); persist();
  });
  $('#folder-composer').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); closeFolderComposer();
  });
  $('#note-title-input').addEventListener('input', event => {
    const note = activePage();
    if (!note || note.trashed) return;
    note.title = event.target.value;
    const entry = [...$('#notes-tree').querySelectorAll('.note-entry')].find(button => button.dataset.noteId === note.id);
    if (entry) { entry.querySelector('span').textContent = note.title.trim() || 'untitled'; entry.title = note.title.trim() || 'untitled'; }
    queueSave();
  });
  $('#note-body').addEventListener('input', event => {
    const note = activePage();
    if (note && !note.trashed) { note.body = event.target.value; queueSave(); }
  });
  $('#note-folder-button').addEventListener('click', openFolderMenu);
  $('#note-folder-button').addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openFolderMenu();
  });
  $('#note-title-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    focusPageContent();
  });
  $('#task-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('#task-input');
    const note = activePage();
    if (!note || note.trashed || note.type !== 'tasks' || !input.value.trim()) return;
    if (note.tasks.length >= 500) { status('this page can hold up to 500 tasks', true); return; }
    const task = { id: id(), text: input.value.trim(), completedAt: null };
    note.tasks.push(task);
    input.value = '';
    renderTasks(); persist();
    const row = [...$('#note-tasks').children].find(row => row.dataset.taskId === task.id);
    if (!reducedMotion.matches) row.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    row.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    input.focus({ preventScroll: true });
  });
  $('#show-completed').addEventListener('click', () => { showCompleted = !showCompleted; renderTasks(); });
  $('#delete-completed').addEventListener('click', () => {
    const note = activePage();
    if (!note || note.trashed) return;
    Object.assign(note, deleteCompleted(note));
    showCompleted = false;
    renderTasks(); persist();
    $('#undo-delete-tasks').focus({ preventScroll: true });
  });
  $('#undo-delete-tasks').addEventListener('click', () => {
    const note = activePage();
    if (!note || note.trashed) return;
    const restored = undoDeleteCompleted(note);
    if (!restored) { status('not enough room to restore these tasks', true); return; }
    Object.assign(note, restored);
    showCompleted = true;
    renderTasks(); persist();
    $('#show-completed').focus({ preventScroll: true });
  });
  $('#trash-note').addEventListener('click', () => {
    const note = activePage();
    if (!note) return;
    note.trashed = true;
    data.selectedPageId = data.pages.find(item => !item.trashed)?.id || null;
    render(); persist();
  });
  $('#restore-note').addEventListener('click', () => {
    const note = activePage();
    if (!note) return;
    note.trashed = false;
    data.folders.find(folder => folder.id === note.folderId).collapsed = false;
    showTrash = false;
    render(); persist();
  });
  $('#notes-trash-toggle').addEventListener('click', () => { showTrash = !showTrash; renderTree(); });
  window.addEventListener('notebook-open', () => {
    expireTasks();
    closeMenu();
    if (!folderComposerOpen) focusPageContent();
  });
  window.addEventListener('pagehide', () => { if (saveTimer) persist(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (saveTimer) persist(); clearTimeout(expiryTimer); }
    else { expireTasks(); scheduleExpiry(); }
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    $('#window-notes').getAnimations({ subtree: true }).forEach(motion => motion.finish());
  });
  render();
  if (migrated) persist();
  else status(storageFailed ? 'could not read saved pages - browser storage is unavailable' : '', storageFailed);
})();
