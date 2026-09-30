(() => {
  'use strict';

  const { safeURL, normalizeArticles, plainDashes } = window.STARTPAGE_CORE;
  const FEED_URL = 'https://www.changelog.earth/feed.xml';
  const LAYOUT_KEY = 'startpage-desktop-v2';
  const FEED_KEY = 'startpage-earth-feed-v1';
  const REFRESH_MS = 15 * 60 * 1000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const desktop = $('#desktop');
  const search = $('#search');
  const mobile = matchMedia('(max-width: 900px)');
  const reducedMotion = window.STARTPAGE_MOTION;
  const windows = new Map();
  const storage = {
    read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode or full storage: the desktop still works. */ } },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
  let focusedId = null;
  function defaultLayout() {
    const width = desktop.clientWidth;
    const height = desktop.clientHeight;
    const centered = (w, h, offset = 0) => {
      w = Math.min(w, width - 40);
      h = Math.min(h, height - 40);
      return { x: (width - w) / 2 + offset, y: Math.max(20, (height - h) / 2), width: w, height: h };
    };
    return { news: centered(450, 510, Math.min(140, width * .08)),
      notes: centered(720, 550), settings: centered(760, 610) };
  }

  const savedLayout = storage.read(LAYOUT_KEY);
  $$('.window').forEach(element => {
    const id = element.dataset.window;
    const saved = savedLayout?.[id];
    windows.set(id, {
      id, element, name: { settings: 'settings', news: 'information', notes: 'notebook' }[id],
      // Every visit starts with a clear home screen; window positions still persist.
      open: false,
      minimized: false,
      maximized: saved?.maximized === true,
      position: Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? { x: saved.x, y: saved.y } : null,
      motion: null, fades: [], exiting: false
    });
  });

  function saveLayout() {
    storage.write(LAYOUT_KEY, Object.fromEntries([...windows].map(([id, state]) => [id, {
      open: state.open, minimized: state.minimized, maximized: state.maximized,
      ...(state.position || {})
    }])));
  }

  function placeWindow(state) {
    const element = state.element;
    element.hidden = !state.exiting && (!state.open || state.minimized);
    element.classList.toggle('is-maximized', state.maximized && !mobile.matches);
    const button = $('[data-action="maximize"]', element);
    button.setAttribute('aria-pressed', String(state.maximized && !mobile.matches));
    button.setAttribute('aria-label', `${state.maximized ? 'restore size' : 'zoom'} ${state.name}`);
    button.title = state.maximized ? 'restore size' : 'zoom';
    $$(`[data-open="${state.id}"]`).forEach(opener => opener.setAttribute('aria-expanded', String(state.open && !state.minimized)));
    const dock = $(`.dock-item[data-open="${state.id}"]`);
    dock.classList.toggle('is-minimized', state.minimized);
    if (mobile.matches) return;
    const base = defaultLayout()[state.id];
    const width = state.maximized ? desktop.clientWidth - 40 : base.width;
    const height = state.maximized ? Math.max(200, desktop.clientHeight - 40) : base.height;
    const wanted = state.position || base;
    const x = state.maximized ? 20 : clamp(wanted.x, 14, desktop.clientWidth - width - 14);
    const y = state.maximized ? 20 : clamp(wanted.y, 14, desktop.clientHeight - height - 12);
    Object.assign(element.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  }

  function focusWindow(id) {
    focusedId = id;
    // A bounded stacking order keeps the dock above the windows forever.
    windows.forEach(state => {
      state.element.style.zIndex = state.id === id ? '20' : '10';
      state.element.classList.toggle('is-focused', state.id === id);
    });
  }

  function cancelMotion(state) {
    const previous = state.motion;
    state.motion = null;
    previous?.cancel();
    state.fades.forEach(motion => motion.cancel());
    state.fades = [];
    state.exiting = false;
    state.element.inert = false;
    state.element.classList.remove('is-animating');
  }

  function animateWindow(state, frames, options, complete = () => {}) {
    if (reducedMotion.matches || typeof state.element.animate !== 'function') {
      complete();
      return;
    }
    state.element.classList.add('is-animating');
    const timing = {
      duration: 360, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both', ...options
    };
    // Opacity on the outer window creates a backdrop root, cutting its glass off
    // from the desktop. Fade the surface and contents independently instead.
    const hasFade = frames.some(frame => 'opacity' in frame);
    let outerFrames = frames;
    if (hasFade) {
      const style = getComputedStyle(state.element);
      outerFrames = frames.map(({ opacity, ...frame }) => ({ ...frame,
        borderColor: opacity === 0 ? 'transparent' : style.borderColor,
        boxShadow: opacity === 0 ? 'none' : style.boxShadow
      }));
      const fadeFrames = frames.map(({ opacity, offset, easing }) => ({ opacity,
        ...(offset === undefined ? {} : { offset }), ...(easing ? { easing } : {})
      }));
      state.fades = [...state.element.children].filter(child => !child.hidden)
        .map(child => child.animate(fadeFrames, timing));
    }
    const motion = state.element.animate(outerFrames, timing);
    state.motion = motion;
    motion.finished.then(() => {
      if (state.motion !== motion) return;
      state.motion = null;
      complete();
      motion.cancel();
      state.fades.forEach(fade => fade.cancel());
      state.fades = [];
      state.element.classList.remove('is-animating');
    }).catch(() => { /* Reopening or resizing can intentionally interrupt a transition. */ });
  }

  function dockTransform(state) {
    const windowRect = state.element.getBoundingClientRect();
    const target = $('#apps-toggle').getAttribute('aria-expanded') === 'true'
      ? document.querySelector('.dock-item[data-open="' + state.id + '"]') : $('#apps-toggle');
    const dockRect = target.getBoundingClientRect();
    return {
      x: dockRect.x + dockRect.width / 2 - windowRect.x - windowRect.width / 2,
      y: dockRect.y + dockRect.height / 2 - windowRect.y - windowRect.height / 2,
      scaleX: Math.min(.18, dockRect.width / windowRect.width),
      scaleY: Math.min(.09, dockRect.height / windowRect.height * .35)
    };
  }

  function dockBounce(id) {
    if (reducedMotion.matches) return;
    const icon = $(`.dock-item[data-open="${id}"] .dock-icon`);
    if (typeof icon.animate !== 'function') return;
    icon.getAnimations?.().forEach(animation => animation.cancel());
    icon.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-7px)', offset: .45 },
      { transform: 'translateY(0)' }
    ], { duration: 320, easing: 'ease-out' });
  }

  function focusSearch() {
    focusWindow(null);
    search.focus({ preventScroll: true });
  }

  function openWindow(id) {
    const state = windows.get(id);
    const wasHidden = state.element.hidden || state.exiting;
    const wasMinimized = state.minimized;
    window.dispatchEvent(new CustomEvent('app-opening', { detail: { id, fresh: !state.open } }));
    cancelMotion(state);
    state.open = true;
    state.minimized = false;
    placeWindow(state);
    focusWindow(id);
    if (wasHidden) {
      if (wasMinimized) {
        const { x, y, scaleX, scaleY } = dockTransform(state);
        animateWindow(state, [
          { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, opacity: 0 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 }
        ], { duration: 420, easing: 'cubic-bezier(.18,.85,.25,1)' });
      } else {
        animateWindow(state, [
          { transform: 'translateY(12px) scale(.965)', opacity: 0 },
          { transform: 'translateY(0) scale(1)', opacity: 1 }
        ], { duration: 380 });
      }
      dockBounce(id);
    }
    state.element.focus({ preventScroll: true });
    if (id === 'news') loadNews();
    if (id === 'notes') window.dispatchEvent(new Event('notebook-open'));
    saveLayout();
  }

  function hideWindow(id, minimize = false) {
    const state = windows.get(id);
    if (state.exiting || state.element.hidden) return;
    cancelMotion(state);
    const target = minimize ? dockTransform(state) : null;
    state.open = minimize;
    state.minimized = minimize;
    state.exiting = true;
    // The window remains visible for the animation, but can no longer receive input.
    state.element.inert = true;
    placeWindow(state);
    $('#apps-toggle').focus({ preventScroll: true });
    $('#announcement').textContent = `${state.name} ${minimize ? 'minimized' : 'closed'}. open it again from the app menu.`;
    const next = [...windows.values()].find(item => item.open && !item.minimized);
    if (next) focusWindow(next.id);
    else focusSearch();
    saveLayout();
    const complete = () => {
      state.exiting = false;
      state.element.inert = false;
      placeWindow(state);
      if (minimize) dockBounce(id);
    };
    if (minimize) {
      const { x, y, scaleX, scaleY } = target;
      animateWindow(state, [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${x * .12}px, ${y * .12}px) scale(.96, .87)`, opacity: 1, offset: .3 },
        { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, opacity: 0 }
      ], { duration: 430, easing: 'cubic-bezier(.42,0,.3,1)' }, complete);
    } else {
      animateWindow(state, [
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(8px) scale(.95)', opacity: 0 }
      ], { duration: 220, easing: 'cubic-bezier(.4,0,.6,1)' }, complete);
    }
  }

  function toggleMaximize(state) {
    if (mobile.matches) return;
    cancelMotion(state);
    const before = state.element.getBoundingClientRect();
    state.maximized = !state.maximized;
    placeWindow(state);
    const after = state.element.getBoundingClientRect();
    const x = before.x + before.width / 2 - after.x - after.width / 2;
    const y = before.y + before.height / 2 - after.y - after.height / 2;
    animateWindow(state, [
      { transform: `translate(${x}px, ${y}px) scale(${before.width / after.width}, ${before.height / after.height})` },
      { transform: 'translate(0, 0) scale(1)' }
    ], { duration: 320 });
    focusWindow(state.id);
    saveLayout();
  }

  windows.forEach(state => {
    const element = state.element;
    const bar = $('.window-bar', element);
    let drag = null;
    element.addEventListener('pointerdown', () => focusWindow(state.id));
    element.addEventListener('focusin', () => focusWindow(state.id));
    $$('[data-action]', element).forEach(button => button.addEventListener('click', () => {
      if (button.dataset.action === 'maximize') toggleMaximize(state);
      else hideWindow(state.id, button.dataset.action === 'minimize');
    }));
    bar.addEventListener('dblclick', event => {
      if (!event.target.closest('button')) toggleMaximize(state);
    });
    bar.addEventListener('pointerdown', event => {
      if (mobile.matches || state.maximized || event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();
      cancelMotion(state);
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop };
      bar.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
    });
    bar.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      state.position = {
        x: clamp(drag.left + event.clientX - drag.x, 14, desktop.clientWidth - element.offsetWidth - 14),
        y: clamp(drag.top + event.clientY - drag.y, 14, desktop.clientHeight - element.offsetHeight - 12)
      };
      placeWindow(state);
    });
    const finishDrag = () => {
      if (!drag) return;
      drag = null;
      element.classList.remove('is-dragging');
      saveLayout();
    };
    bar.addEventListener('pointerup', finishDrag);
    bar.addEventListener('pointercancel', finishDrag);
    bar.addEventListener('lostpointercapture', finishDrag);
    bar.addEventListener('keydown', event => {
      if (event.target !== bar || mobile.matches || state.maximized || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 20 : 5;
      state.position = {
        x: clamp(element.offsetLeft + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), 14, desktop.clientWidth - element.offsetWidth - 14),
        y: clamp(element.offsetTop + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), 14, desktop.clientHeight - element.offsetHeight - 12)
      };
      placeWindow(state);
      saveLayout();
    });
    placeWindow(state);
  });
  focusWindow([...windows.values()].find(state => state.open && !state.minimized)?.id || null);
  $$('[data-open]').forEach(button => button.addEventListener('click', () => openWindow(button.dataset.open)));
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      windows.forEach(state => {
        cancelMotion(state);
        placeWindow(state);
      });
    });
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    windows.forEach(state => { cancelMotion(state); placeWindow(state); });
    $$('.dock-icon').forEach(icon => icon.getAnimations?.().forEach(animation => animation.cancel()));
  });
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.defaultPrevented) return;
    const typing = event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      focusSearch();
    }
    if (event.key === 'Escape' && (!typing || focusedId === 'settings')) {
      const state = windows.get(focusedId);
      if (state?.open && !state.minimized) hideWindow(focusedId);
    }
  });

  // Read the public RSS endpoint directly. It permits cross-origin requests.
  // No proxy, credentials, build step or server is required on GitHub Pages.
  let articles = [];
  let fetchedAt = 0;
  let loading = false;
  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.querySelector('rss > channel')) throw new Error('Invalid RSS');
    return normalizeArticles($$('item', doc).map(item => {
      const text = selector => $(selector, item)?.textContent?.trim() || '';
      const rawTitle = text('title');
      const prefix = rawTitle.match(/^\[([^\]]+)\]\s*/);
      // The description is read as inert HTML for the publisher label only.
      // No remote markup is inserted into the live page.
      const template = document.createElement('template');
      template.innerHTML = text('description');
      const source = [...template.content.querySelectorAll('p')].map(p => p.textContent.trim()).find(p => p.startsWith('Source:'));
      const url = safeURL(text('link'));
      return {
        title: prefix ? rawTitle.slice(prefix[0].length) : rawTitle,
        kind: prefix ? prefix[1] : 'Updated', category: text('category'),
        url, date: text('pubDate'), publisher: source?.replace(/^Source:\s*/, '') || (url ? new URL(url).hostname.replace(/^www\./, '') : '')
      };
    }));
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function renderNews() {
    const feed = $('#news-feed');
    const focusedArticle = document.activeElement.closest('.news-article');
    const focusedURL = focusedArticle && feed.contains(focusedArticle) ? focusedArticle.href : null;
    const previousScroll = $('.news-body').scrollTop;
    const fragment = document.createDocumentFragment();
    const kinds = { Unlocked: '+ Unlocked', Added: '+ Added', Updated: '~ Updated', Fixed: '✓ Fixed', Nerfed: '↓ Nerfed', Buffed: '↑ Buffed' };
    articles.forEach(item => {
      const link = document.createElement('a');
      link.className = 'news-article';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const meta = document.createElement('div');
      meta.className = 'article-meta';
      const kind = document.createElement('span');
      kind.className = `article-kind ${item.kind === 'Updated' ? 'updated' : item.kind === 'Fixed' ? 'fixed' : ''}`;
      kind.textContent = kinds[item.kind] || plainDashes(item.kind);
      const category = document.createElement('span');
      category.textContent = plainDashes(item.category);
      meta.append(kind);
      if (item.category) meta.append('·', category);
      const title = document.createElement('div');
      title.className = 'article-title';
      const text = document.createElement('span');
      text.textContent = plainDashes(item.title);
      title.append(text, icon('arrow'));
      const source = document.createElement('div');
      source.className = 'article-source';
      const date = document.createElement('time');
      date.dateTime = item.date;
      date.textContent = new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      source.append(plainDashes(item.publisher), '·', date);
      link.append(meta, title, source);
      fragment.append(link);
    });
    feed.replaceChildren(fragment);
    if (focusedURL) {
      const replacement = $$('.news-article', feed).find(link => link.href === focusedURL);
      (replacement || $('#window-news')).focus({ preventScroll: true });
    }
    $('.news-body').scrollTop = previousScroll;
  }

  function setFeedStatus(message, error = false) {
    $('#feed-status').textContent = message;
    $('#feed-status').classList.toggle('is-error', error);
  }

  function showLastUpdate() {
    const date = new Date(fetchedAt);
    const sameDay = date.toDateString() === new Date().toDateString();
    $('#feed-update').textContent = `Checked ${date.toLocaleString('en-GB', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  }

  async function loadNews(force = false) {
    if (loading || (!force && articles.length && Date.now() - fetchedAt < REFRESH_MS)) return;
    loading = true;
    const refresh = $('#refresh-news');
    refresh.disabled = true;
    refresh.classList.add('is-loading');
    $('#news-feed').setAttribute('aria-busy', 'true');
    setFeedStatus(articles.length ? '' : 'connecting to source...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(FEED_URL, { signal: controller.signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const fresh = parseFeed(await response.text());
      if (!fresh.length) throw new Error('Empty RSS');
      const changed = JSON.stringify(articles) !== JSON.stringify(fresh);
      articles = fresh;
      fetchedAt = Date.now();
      storage.write(FEED_KEY, { articles, fetchedAt });
      if (changed) renderNews();
      setFeedStatus('');
      showLastUpdate();
    } catch {
      setFeedStatus(articles.length
        ? 'Could not refresh. Showing the last saved stories.'
        : 'Could not load the news. Try refreshing or open the source below.', true);
      if (!articles.length) $('#feed-update').textContent = 'Source temporarily unavailable';
    } finally {
      clearTimeout(timeout);
      loading = false;
      refresh.disabled = false;
      refresh.classList.remove('is-loading');
      $('#news-feed').setAttribute('aria-busy', 'false');
      if (force && !reducedMotion.matches) $('#news-feed').animate([
        { opacity: .45, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }

  const cached = storage.read(FEED_KEY);
  if (cached && Number.isFinite(cached.fetchedAt) && cached.fetchedAt >= 0 && cached.fetchedAt <= Date.now()) {
    articles = normalizeArticles(cached.articles);
    if (articles.length) {
      fetchedAt = cached.fetchedAt;
      renderNews();
      showLastUpdate();
      setFeedStatus(Date.now() - fetchedAt >= REFRESH_MS ? 'Saved stories - waiting for an update.' : '');
    }
  }
  $('#news-feed').setAttribute('aria-busy', 'false');
  $('#refresh-news').addEventListener('click', () => loadNews(true));
  const newsVisible = () => windows.get('news').open && !windows.get('news').minimized;
  if (newsVisible()) loadNews();
  setInterval(() => { if (!document.hidden && newsVisible()) loadNews(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (newsVisible()) loadNews();
    }
  });
  window.addEventListener('online', () => { if (newsVisible()) loadNews(true); });
  window.STARTPAGE_WINDOWS = Object.freeze({ open: openWindow, close: hideWindow });
  search.addEventListener('focus', () => focusWindow(null));
  requestAnimationFrame(focusSearch);
  window.addEventListener('pageshow', event => { if (event.persisted) focusSearch(); });
})();
