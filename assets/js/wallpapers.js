(() => {
  'use strict';
  // Curated landscape photographs from the public Lorem Picsum catalog.
  const photos = [
    { id: 10, author: 'Paul Jarvis', source: 'https://unsplash.com/photos/6J--NXulQCs' },
    { id: 15, author: 'Paul Jarvis', source: 'https://unsplash.com/photos/NYDo21ssGao' },
    { id: 16, author: 'Paul Jarvis', source: 'https://unsplash.com/photos/gkT4FfgHO5o' },
    { id: 28, author: 'Jerry Adney', source: 'https://unsplash.com/photos/_WiFMBRT7Aw' },
    { id: 29, author: 'Go Wild', source: 'https://unsplash.com/photos/V0yAek6BgGk' },
    { id: 37, author: 'Austin Neill', source: 'https://unsplash.com/photos/erTjj730fMk' },
    { id: 49, author: 'Margaret Barley', source: 'https://unsplash.com/photos/Qo51KwK1dKg' },
    { id: 54, author: 'Nicholas Swanson', source: 'https://unsplash.com/photos/d19by2PLaPc' }
  ];
  const KEY = 'startpage-wallpaper-v1';
  const layers = [...document.querySelectorAll('.wallpaper-layer')];
  const surface = document.querySelector('.wallpaper');
  let settings = window.STARTPAGE_PREFERENCES.current.wallpaper;
  let current = photos.find(photo => photo.id === 29);
  let previousId;
  try { previousId = Number(localStorage.getItem(KEY)); } catch { /* Storage is optional. */ }
  let activeLayer = 0;
  let pending = null;
  let timer;
  let lastChanged = Date.now();
  let lastMessage = '';

  function notify(message = '') {
    lastMessage = message;
    const detail = { ...current, solid: settings.mode === 'solid', custom: settings.mode === 'custom' || Boolean(current.custom), color: settings.color || '#202020', message };
    const credit = document.querySelector('#photo-credit');
    credit.textContent = `Photo by ${current.author}`;
    credit.href = current.source;
    credit.parentElement.hidden = detail.solid || detail.custom;
    window.dispatchEvent(new CustomEvent('wallpaperchange', { detail }));
  }

  function schedule() {
    clearTimeout(timer);
    if (settings.mode !== 'rotate' || document.hidden) return;
    const remaining = Math.max(0, settings.minutes * 60000 - (Date.now() - lastChanged));
    timer = setTimeout(() => changePhoto(), remaining);
  }

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.image.onload = pending.image.onerror = null;
    pending.image.src = '';
    pending = null;
  }

  function changePhoto(requested) {
    if (settings.mode === 'solid' || (settings.mode === 'custom' && !requested)) return;
    cancelPending();
    const choices = photos.filter(photo => photo.id !== current.id && photo.id !== previousId);
    const photo = requested || choices[Math.floor(Math.random() * choices.length)];
    const width = Math.min(2560, Math.max(1280, Math.round(innerWidth * Math.min(devicePixelRatio || 1, 1.5))));
    const height = Math.round(width * Math.max(.5625, Math.min(1.7, innerHeight / innerWidth)));
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    const job = { image, timeout: null };
    pending = job;
    notify('Loading photo...');
    const finish = success => {
      if (pending !== job) return;
      clearTimeout(job.timeout);
      pending = null;
      image.onload = image.onerror = null;
      lastChanged = Date.now();
      if (success) {
        const next = 1 - activeLayer;
        layers[next].style.backgroundImage = 'url(' + JSON.stringify(image.src) + ')';
        layers[next].classList.add('is-visible');
        layers[activeLayer].classList.remove('is-visible');
        activeLayer = next;
        current = photo;
        previousId = photo.id;
        try { localStorage.setItem(KEY, photo.custom ? JSON.stringify({ url: photo.url }) : String(photo.id)); } catch { /* Storage is optional. */ }
      }
      notify(success ? '' : 'Could not load another photo. Keeping this background.');
      schedule();
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    job.timeout = setTimeout(() => finish(false), 15000);
    image.src = photo.url || 'https://picsum.photos/id/' + photo.id + '/' + width + '/' + height;
  }

  function apply() {
    surface.classList.toggle('is-solid', settings.mode === 'solid');
    surface.style.backgroundColor = settings.color || '#202020';
    cancelPending();
    notify();
    schedule();
    if (settings.mode === 'custom') changePhoto({ id: 'custom', custom: true, url: settings.url, source: settings.url, author: '' });
  }

  window.STARTPAGE_WALLPAPER = Object.freeze({
    next: () => changePhoto(),
    get current() { return { ...current, solid: settings.mode === 'solid', custom: settings.mode === 'custom' || Boolean(current.custom), color: settings.color || '#202020', message: lastMessage }; }
  });
  window.addEventListener('preferenceschange', event => {
    if (JSON.stringify(settings) === JSON.stringify(event.detail.wallpaper)) return;
    const previousMode = settings.mode;
    settings = event.detail.wallpaper;
    if (settings.mode === 'keep') {
      try { localStorage.setItem(KEY, current.custom ? JSON.stringify({ url: current.url }) : String(current.id)); } catch { /* Storage is optional. */ }
    }
    lastChanged = Date.now();
    apply();
    if (['solid', 'custom'].includes(previousMode) && !['solid', 'custom', 'keep'].includes(settings.mode)) changePhoto();
  });
  document.addEventListener('visibilitychange', schedule);
  apply();
  if (settings.mode === 'keep') {
    const saved = photos.find(photo => photo.id === previousId);
    if (saved && saved.id !== current.id) changePhoto(saved);
    else {
      try {
        const record = JSON.parse(localStorage.getItem(KEY));
        const url = window.STARTPAGE_CORE.safeURL(record?.url);
        if (url?.startsWith('https://')) changePhoto({ id: 'custom', custom: true, url, source: url, author: '' });
      } catch { /* Old numeric records or unavailable storage need no migration. */ }
    }
  } else if (!['solid', 'custom'].includes(settings.mode)) changePhoto();
})();
