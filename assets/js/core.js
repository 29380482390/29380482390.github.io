(() => {
  'use strict';

  const searchURL = (value, engine = 'startpage') => {
    const query = encodeURIComponent(value);
    if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${query}`;
    if (engine === 'google') return `https://www.google.com/search?q=${query}&udm=14`;
    return `https://www.startpage.com/sp/search?query=${query}`;
  };
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i;
  const local = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#][^\s]*)?$/i;

  function safeURL(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function score(item, query) {
    const title = item.title.toLowerCase();
    if (title === query) return 100;
    if (title.startsWith(query)) return 90;
    return [item.title, item.href, ...(item.aliases || [])].join(' ').toLowerCase().includes(query) ? 70 : -1;
  }

  function resolveSearch(input, bookmarks, engine = 'startpage') {
    const value = input.trim();
    if (!value) return null;
    const query = value.toLowerCase();
    // Exact shortcut names (including cs.rin.ru) retain their original destinations.
    const exact = bookmarks.find(item => item.title.toLowerCase() === query);
    if (exact) return exact.href;
    // An explicit address takes priority over a partial match inside a bookmark URL.
    if (!/\s/.test(value)) {
      const candidate = /^https?:\/\//i.test(value) ? value
        : local.test(value) ? `http://${value}` : domain.test(value) ? `https://${value}` : null;
      if (candidate) return safeURL(candidate) || searchURL(value, engine);
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return searchURL(value, engine);
    }
    let best = null;
    let bestScore = -1;
    for (const item of bookmarks) {
      const rank = score(item, query);
      if (rank > bestScore) { best = item; bestScore = rank; }
    }
    return best ? best.href : searchURL(value, engine);
  }

  function normalizeArticles(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const valid = [];
    for (const item of items) {
      if (!item || typeof item.title !== 'string' || !item.title.trim() || typeof item.date !== 'string') continue;
      const url = safeURL(item.url);
      const timestamp = Date.parse(item.date);
      if (!url || !Number.isFinite(timestamp) || seen.has(url)) continue;
      seen.add(url);
      valid.push({
        title: item.title.trim().slice(0, 350), url, date: new Date(timestamp).toISOString(),
        kind: typeof item.kind === 'string' ? item.kind.slice(0, 30) : 'Updated',
        category: typeof item.category === 'string' ? item.category.slice(0, 80) : '',
        publisher: typeof item.publisher === 'string' && item.publisher.trim()
          ? item.publisher.trim().slice(0, 100) : new URL(url).hostname.replace(/^www\./, '')
      });
    }
    return valid.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 30);
  }

  const plainDashes = value => String(value).replace(/[\u2010\u2011]/g, '-').replace(/\s*[\u2012-\u2015]\s*/g, ' - ');

  function defaultPreferences(cards) {
    const names = ['media', 'social', 'discover', 'workspace'];
    return {
      version: 1,
      promptName: 'you@startpage',
      searchEngine: 'startpage',
      animation: 'smooth',
      weather: { name: 'warsaw', latitude: 52.2297, longitude: 21.0122 },
      groups: cards.map((group, index) => ({
        name: names[index] || group.title,
        items: group.items.map(({ title, href }) => ({ title, href }))
      })),
      wallpaper: { mode: 'rotate', minutes: 30, url: '', color: '#202020' }
    };
  }

  // Validate both stored data and settings drafts before either reaches the UI.
  function validatePreferences(value) {
    const label = (text, max) => typeof text === 'string' && text.trim().length > 0
      && plainDashes(text).trim().length <= max && !/[\u0000-\u001f\u007f]/.test(text);
    if (!value || value.version !== 1 || !label(value.promptName, 32)) throw new Error('Enter a terminal name of 1 to 32 characters.');
    if (!Array.isArray(value.groups) || !value.groups.length || value.groups.length > 8) throw new Error('Keep between 1 and 8 bookmark groups.');
    const groups = value.groups.map(group => {
      if (!group || !label(group.name, 24)) throw new Error('Each group needs a name of 1 to 24 characters.');
      if (!Array.isArray(group.items) || group.items.length > 32) throw new Error('A group can have up to 32 bookmarks.');
      return { name: plainDashes(group.name.trim()), items: group.items.map(item => {
        if (!item || !label(item.title, 40)) throw new Error('Each bookmark needs a name of 1 to 40 characters.');
        const href = typeof item.href === 'string' && item.href.length <= 2048 ? safeURL(item.href) : null;
        if (!href) throw new Error('Use a complete http:// or https:// bookmark address without login details.');
        const url = new URL(href);
        const title = item.title.trim().toLowerCase() === 'x.com' && url.hostname.replace(/^www\./, '') === 'x.com' && url.pathname === '/'
          ? 'x' : plainDashes(item.title.trim());
        return { title, href };
      }) };
    });
    const wallpaper = value.wallpaper;
    if (!wallpaper || !['rotate', 'visit', 'keep', 'solid', 'custom'].includes(wallpaper.mode)
      || ![15, 30, 60].includes(wallpaper.minutes)) throw new Error('Choose a valid wallpaper interval.');
    const color = wallpaper.color ?? '#202020';
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('choose a valid background color.');
    const rawImageURL = wallpaper.url ?? '';
    const imageURL = typeof rawImageURL === 'string' && rawImageURL.length <= 4096
      && rawImageURL.startsWith('https://') ? safeURL(rawImageURL) : null;
    if (wallpaper.mode === 'custom' && !imageURL) throw new Error('use a direct https image address without login details.');
    const searchEngine = value.searchEngine ?? 'startpage';
    const animation = value.animation ?? 'smooth';
    if (!['duckduckgo', 'startpage', 'google'].includes(searchEngine)) throw new Error('choose a valid search engine.');
    if (!['smooth', 'system', 'reduced'].includes(animation)) throw new Error('choose a valid animation setting.');
    const weather = value.weather === undefined ? { name: 'warsaw', latitude: 52.2297, longitude: 21.0122 } : value.weather;
    if (weather !== null && (!weather || !label(weather.name, 100)
      || !Number.isFinite(weather.latitude) || Math.abs(weather.latitude) > 90
      || !Number.isFinite(weather.longitude) || Math.abs(weather.longitude) > 180)) throw new Error('choose a valid weather location.');
    return { version: 1, promptName: plainDashes(value.promptName.trim()), groups, searchEngine, animation,
      weather: weather ? { name: plainDashes(weather.name.trim()), latitude: weather.latitude, longitude: weather.longitude } : null,
      wallpaper: { mode: wallpaper.mode, minutes: wallpaper.minutes, color: color.toLowerCase(), url: imageURL || '' } };
  }

  window.STARTPAGE_CORE = Object.freeze({ safeURL, score, resolveSearch, searchURL, normalizeArticles, plainDashes, defaultPreferences, validatePreferences });
})();
