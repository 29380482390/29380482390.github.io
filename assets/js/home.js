(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const { score, resolveSearch, searchURL } = window.STARTPAGE_CORE;
  const search = $('#search');
  const form = $('#search-form');
  const platforms = [
    { id: 'duckduckgo', label: 'duckduckgo', host: 'duckduckgo.com', key: 'a' },
    { id: 'startpage', label: 'startpage', host: 'startpage.com', key: 's' },
    { id: 'google', label: 'google', host: 'google.com', key: 'd' },
    { id: 'youtube', label: 'youtube', host: 'youtube.com', key: 'f' },
    { id: 'reddit', label: 'reddit', host: 'reddit.com', key: 'g' }
  ];
  let preferences = window.STARTPAGE_PREFERENCES.current;
  let bookmarks = [];
  let activeGroup = 'all';
  const visibleBookmarks = () => bookmarks.filter(item => activeGroup === 'all' || item.group === activeGroup);
  let composing = false;
  const homeIsActive = () => !document.querySelector('.window:not([hidden]):not([inert])');
  const focusHomeSearch = () => { if (homeIsActive()) search.focus({ preventScroll: true }); };
  const shortcuts = window.STARTPAGE_HOME_CORE.createBookmarkShortcuts({
    getBookmarks: visibleBookmarks,
    navigate: href => location.assign(href),
    isEnabled: event => {
      if (!homeIsActive() || event.target.closest('.window')) return false;
      const editable = event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (editable && editable !== search) return false;
      // Keep normal editing commands, including cutting/copying a selection.
      const key = event.key.toLowerCase();
      return editable !== search || !(['a', 'v', 'z'].includes(key)
        || (['c', 'x'].includes(key) && search.selectionStart !== search.selectionEnd));
    }
  });
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function favicon(host, label, href) {
    const icon = node('span', 'bookmark-icon', label.slice(0, 1));
    icon.setAttribute('aria-hidden', 'true');
    // Never send local/private hosts to an external favicon service.
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !/\.(local|localhost|internal|test)$/i.test(host)) {
      const image = node('img');
      image.alt = '';
      image.width = image.height = 16;
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      const original = window.STARTPAGE_CONFIG.cards.flatMap(group => group.items).find(item => item.href === href);
      image.src = original?.icon || 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico';
      icon.append(image);
    }
    return icon;
  }
  function runPlatform(id) {
    const query = search.value.trim();
    if (!query) { search.focus(); return; }
    const encoded = encodeURIComponent(query);
    location.assign(id === 'youtube' ? 'https://www.youtube.com/results?search_query=' + encoded
      : id === 'reddit' ? 'https://www.reddit.com/search/?q=' + encoded : searchURL(query, id));
  }
  platforms.forEach(platform => {
    const button = node('button', 'platform-chip');
    button.type = 'button';
    button.dataset.engine = platform.id;
    button.title = 'search with ' + platform.label + ' (alt + ' + platform.key + ')';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-keyshortcuts', 'Alt+' + platform.key);
    button.append(favicon(platform.host, platform.label), node('span', '', platform.label), node('kbd', '', 'alt + ' + platform.key));
    button.addEventListener('click', () => runPlatform(platform.id));
    $('#search-platforms').append(button);
  });
  function render() {
    $('#bookmarks').replaceChildren();
    const items = preferences.groups.flatMap(group => group.items);
    const chords = window.STARTPAGE_HOME_CORE.bookmarkChords(items);
    bookmarks = [];
    if (activeGroup !== 'all' && Number(activeGroup) >= preferences.groups.length) activeGroup = 'all';
    $('#bookmark-filters').replaceChildren();
    const filters = [{ id: 'all', name: 'all' }, ...preferences.groups.map((group, index) => ({ id: String(index), name: group.name }))];
    filters.forEach(group => {
      const filter = node('button', 'group-filter', group.name);
      filter.type = 'button';
      filter.dataset.group = group.id;
      filter.title = group.name;
      filter.setAttribute('aria-pressed', String(activeGroup === group.id));
      filter.setAttribute('aria-controls', 'bookmarks');
      filter.addEventListener('click', () => {
        activeGroup = group.id;
        shortcuts.reset();
        document.querySelectorAll('.group-filter').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === activeGroup)));
        updateSearch();
      });
      $('#bookmark-filters').append(filter);
    });
    preferences.groups.forEach((group, groupIndex) => {
      group.items.forEach(item => {
        const link = node('a', 'bookmark-link');
        link.href = item.href;
        link.draggable = false;
        const label = node('span', 'bookmark-name', item.title);
        const shortcut = chords[bookmarks.length];
        link.title = group.name + ' - ' + item.title + ' (hold ctrl + ' + shortcut.split('').join(' ') + ')';
        if (shortcut.length === 1) link.setAttribute('aria-keyshortcuts', 'Control+' + shortcut);
        link.append(favicon(new URL(item.href).hostname, item.title, item.href), label, node('kbd', '', shortcut.split('').join(' ')));
        const card = node('div', 'bookmark-card');
        card.setAttribute('role', 'listitem');
        card.append(link);
        $('#bookmarks').append(card);
        bookmarks.push({ ...item, link, label, card, group: String(groupIndex), chord: shortcut });
      });
    });
    document.querySelectorAll('[data-engine]').forEach(button => {
      button.classList.toggle('is-default', button.dataset.engine === preferences.searchEngine);
    });
    updateSearch();
  }
  function updateSearch() {
    const query = search.value.trim().toLowerCase();
    const visible = visibleBookmarks();
    const destination = resolveSearch(search.value, visible, preferences.searchEngine);
    let matches = 0;
    bookmarks.forEach(item => {
      item.card.hidden = activeGroup !== 'all' && item.group !== activeGroup;
      const matched = !item.card.hidden && (!query || score(item, query) >= 0);
      if (matched) matches++;
      item.link.classList.toggle('is-dimmed', !matched);
      item.link.classList.toggle('primary-match', Boolean(query) && destination === item.href);
    });
    $('#link-count').textContent = query ? matches + ' matching bookmarks' : visible.length + ' bookmarks';
    $('#bookmarks-empty').hidden = visible.length > 0;
    $('#no-matches').classList.toggle('is-visible', Boolean(query) && matches === 0);
    $('#clear-search').hidden = !search.value;
    const match = query && visible.find(item => item.href === destination);
    $('#search-hint').textContent = match ? 'open ' + match.title : 'search ' + preferences.searchEngine;
    document.querySelectorAll('.platform-chip').forEach(button => { button.disabled = !query; });
  }
  search.addEventListener('input', updateSearch);
  search.addEventListener('compositionstart', () => { shortcuts.reset(); composing = true; });
  search.addEventListener('compositionend', () => { composing = false; updateSearch(); });
  const clearSearch = () => { search.value = ''; updateSearch(); search.focus({ preventScroll: true }); };
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault(); event.stopPropagation(); clearSearch();
    }
  });
  $('#clear-search').addEventListener('click', clearSearch);
  form.addEventListener('click', event => { if (!event.target.closest('button')) search.focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing) return;
    const url = resolveSearch(search.value, visibleBookmarks(), preferences.searchEngine);
    if (url) location.assign(url);
  });
  $('#add-bookmark').addEventListener('click', () => window.STARTPAGE_SETTINGS.open('bookmarks'));
  $('#weather').addEventListener('click', () => window.STARTPAGE_SETTINGS.open('weather'));
  window.addEventListener('preferenceschange', event => { shortcuts.reset(); preferences = event.detail; render(); });
  render();

  const toggle = $('#apps-toggle');
  const menu = $('#app-menu');
  function setMenu(open, focus = false) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'close app menu' : 'open app menu');
    menu.inert = !open;
    menu.classList.toggle('is-open', open);
    if (focus) (open ? menu.querySelector('button') : homeIsActive() ? search : toggle).focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  toggle.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setMenu(true, true); }
  });
  menu.addEventListener('click', event => { if (event.target.closest('button')) setMenu(false); });
  menu.addEventListener('keydown', event => {
    const buttons = [...menu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.app-launcher')) setMenu(false);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.window') && toggle.getAttribute('aria-expanded') !== 'true') focusHomeSearch();
  });
  search.addEventListener('blur', event => {
    if (!event.relatedTarget || event.relatedTarget === document.body) {
      requestAnimationFrame(() => {
        if (document.hasFocus() && document.activeElement === document.body && toggle.getAttribute('aria-expanded') !== 'true') focusHomeSearch();
      });
    }
  });
  window.addEventListener('focus', () => {
    if (toggle.getAttribute('aria-expanded') !== 'true') focusHomeSearch();
  });
  window.addEventListener('blur', shortcuts.reset);
  window.addEventListener('app-opening', shortcuts.reset);
  document.addEventListener('visibilitychange', shortcuts.reset);
  document.addEventListener('keyup', shortcuts.keyup, true);
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.defaultPrevented) return;
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault(); event.stopPropagation(); setMenu(false, true); return;
    }
    const editable = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (homeIsActive() && event.altKey && !event.ctrlKey && !event.metaKey && (!editable || event.target === search)) {
      const platform = platforms.find(item => item.key === event.key.toLowerCase());
      if (platform) { event.preventDefault(); runPlatform(platform.id); }
      return;
    }
    shortcuts.keydown(event);
  }, true);
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('selectstart', event => {
    if (!event.target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
  });
  document.querySelectorAll('button, a, img').forEach(element => { element.draggable = false; });

  function tick() {
    const date = new Date();
    $('#clock').textContent = date.toLocaleTimeString('en-GB', { hour12: false });
    $('#clock').dateTime = date.toISOString();
  }
  tick();
  setInterval(() => { if (!document.hidden) tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
