(() => {
  'use strict';
  const COMPLETED_DELAY = 3 * 60 * 1000;
  const PAGE_LIMIT = 256;
  function emptyNotebook() {
    return { version: 2, folders: [{ id: 'inbox', name: 'inbox', collapsed: false }], pages: [], selectedPageId: null };
  }
  function normalizeNotebook(value, now = Date.now()) {
    const legacy = value?.version === 1;
    const sourcePages = legacy ? value.notes : value?.pages;
    if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.folders) || !Array.isArray(sourcePages)) return emptyNotebook();
    const validId = value => typeof value === 'string' && /^[a-z\d_-]{1,80}$/i.test(value);
    const text = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
    const ids = new Set();
    const folders = value.folders.filter(folder => {
      if (!folder || !validId(folder.id) || ids.has(folder.id)) return false;
      ids.add(folder.id); return true;
    }).slice(0, 32).map(folder => ({ id: folder.id, name: text(folder.name, 60).trim() || 'untitled folder', collapsed: folder.collapsed === true }));
    if (!folders.length) folders.push({ id: 'inbox', name: 'inbox', collapsed: false });
    const folderIds = new Set(folders.map(folder => folder.id));
    ids.clear();
    const source = sourcePages.filter(page => {
      if (!page || !validId(page.id) || ids.has(page.id)) return false;
      ids.add(page.id); return true;
    }).slice(0, legacy ? 128 : PAGE_LIMIT);
    const pages = [];
    for (const page of source) {
      const taskIds = new Set();
      const normalizeTasks = items => (Array.isArray(items) ? items : []).filter(task => {
        if (!task || !validId(task.id) || taskIds.has(task.id) || typeof task.text !== 'string') return false;
        taskIds.add(task.id); return true;
      }).slice(0, 500).map(task => ({ id: task.id, text: task.text.slice(0, 500),
        completedAt: Number.isFinite(task.completedAt) && task.completedAt > 0 ? Math.min(task.completedAt, now) : null }));
      const body = text(page.body, 100000);
      const tasks = normalizeTasks(page.tasks);
      const deletedTasks = normalizeTasks(page.deletedTasks);
      const common = { id: page.id, folderId: folderIds.has(page.folderId) ? page.folderId : folders[0].id,
        title: text(page.title, 120), trashed: page.trashed === true };
      const hasTasks = tasks.length > 0 || deletedTasks.length > 0;
      // Remove only the untouched automatic starter from the old notebook.
      if (legacy && page.id === 'first-note' && page.folderId === 'inbox' && page.title === 'notes' && !body && !hasTasks && !common.trashed) continue;
      const type = legacy ? (hasTasks && !body.trim() ? 'tasks' : 'notes') : (page.type === 'tasks' ? 'tasks' : 'notes');
      pages.push({ ...common, type, body: type === 'notes' ? body : '', tasks: type === 'tasks' ? tasks : [], deletedTasks: type === 'tasks' ? deletedTasks : [] });
      // Split old mixed notes without losing completed tasks or deletion undo.
      if (legacy && hasTasks && type === 'notes') {
        let taskPageId = page.id.slice(0, 65) + '-tasks';
        for (let n = 2; ids.has(taskPageId); n++) taskPageId = page.id.slice(0, 65) + '-tasks-' + n;
        ids.add(taskPageId);
        pages.push({ ...common, id: taskPageId, type: 'tasks', title: ((common.title || 'untitled') + ' - to-dos').slice(0, 120), body: '', tasks, deletedTasks });
      }
    }
    const selected = legacy ? value.selectedNoteId : value.selectedPageId;
    const selectedPageId = pages.some(page => page.id === selected && !page.trashed)
      ? selected : pages.find(page => !page.trashed)?.id || null;
    return { version: 2, folders, pages, selectedPageId };
  }
  const isTaskHidden = (task, now = Date.now()) => task.completedAt !== null && now - task.completedAt >= COMPLETED_DELAY;
  function nextTaskExpiry(tasks, now = Date.now()) {
    const remaining = tasks.filter(task => task.completedAt !== null && !isTaskHidden(task, now))
      .map(task => Math.max(0, task.completedAt + COMPLETED_DELAY - now));
    return remaining.length ? Math.min(...remaining) : null;
  }
  function deleteCompleted(page) {
    const completed = page.tasks.filter(task => task.completedAt !== null);
    return { tasks: page.tasks.filter(task => task.completedAt === null), deletedTasks: completed.length ? completed : (page.deletedTasks || []) };
  }
  function undoDeleteCompleted(page) {
    if (page.tasks.length + (page.deletedTasks?.length || 0) > 500) return null;
    return { tasks: [...page.tasks, ...(page.deletedTasks || [])], deletedTasks: [] };
  }
  window.STARTPAGE_NOTEBOOK_CORE = Object.freeze({ COMPLETED_DELAY, PAGE_LIMIT, emptyNotebook, normalizeNotebook, isTaskHidden, nextTaskExpiry, deleteCompleted, undoDeleteCompleted });
})();
