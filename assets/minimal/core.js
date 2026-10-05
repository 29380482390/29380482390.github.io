(function (root) {
  'use strict';
  const ENGINES = Object.freeze({
    google: 'https://www.google.com/search?udm=14&q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    startpage: 'https://www.startpage.com/sp/search?query='
  });

  function safeUrl(value) {
    const text = String(value || '').trim();
    if (!text || /\s/.test(text)) return null;
    let candidate = text;
    if (!/^https?:\/\//i.test(candidate)) {
      // A dotted host (including IDNs), localhost or an IP can be typed directly.
      if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(candidate)) return null;
      const host = candidate.split(/[/?#]/)[0].replace(/:\d+$/, '');
      if (host !== 'localhost' && !host.includes('.')) return null;
      candidate = 'https://' + candidate;
    }
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      if (!url.hostname || /[<>"\\]/.test(text)) return null;
      return url.href;
    } catch { return null; }
  }

  function validatePreferences(value) {
    if (!value || (!Object.hasOwn(ENGINES, value.engine) && value.engine !== 'custom')) throw new Error('choose a search engine.');
    let customSearchUrl = '';
    if (value.engine === 'custom') customSearchUrl = validateSearchTemplate(value.customSearchUrl);
    else if (value.customSearchUrl) {
      try { customSearchUrl = validateSearchTemplate(value.customSearchUrl); } catch { /* An inactive, invalid template is discarded. */ }
    }
    if (!Array.isArray(value.bookmarks) || value.bookmarks.length > 64) throw new Error('use up to 64 bookmarks.');
    const keys = new Set();
    const bookmarks = value.bookmarks.map((item, index) => {
      const key = String(item?.key || '').trim().toLowerCase();
      const name = String(item?.name || '').trim();
      const url = safeUrl(item?.url);
      if (!/^[a-z0-9]{1,8}$/.test(key)) throw new Error(`bookmark ${index + 1}: use a key of 1-8 letters or numbers.`);
      if (keys.has(key)) throw new Error(`the key "${key}" is already used.`);
      if (!name || name.length > 40) throw new Error(`bookmark ${index + 1}: use a name of 1-40 characters.`);
      if (!url) throw new Error(`bookmark ${index + 1}: enter a valid http or https address.`);
      keys.add(key);
      return { key, name, url };
    });
    return { version: 1, engine: value.engine, customSearchUrl, bookmarks };
  }

  function validateSearchTemplate(value) {
    const template = String(value || '').trim();
    if (template.length > 2000 || !/^https?:\/\//i.test(template) || !template.includes('{query}')) {
      throw new Error('enter an http or https search address containing {query}.');
    }
    const authority = template.match(/^https?:\/\/([^/?#]*)/i)?.[1] || '';
    if (authority.includes('{query}') || !safeUrl(template.replaceAll('{query}', 'startpage-query'))) {
      throw new Error('use {query} in the search path or parameters of a valid address.');
    }
    return template;
  }

  function destination(value, preferences) {
    const query = String(value).trim();
    if (!query) return null;
    const exact = preferences.bookmarks.find(item => item.key === query.toLowerCase());
    if (exact) return exact.url;
    const address = safeUrl(query);
    if (address) return address;
    if (preferences.engine === 'custom') {
      try { return validateSearchTemplate(preferences.customSearchUrl).replaceAll('{query}', encodeURIComponent(query)); }
      catch { /* Invalid external state falls back to Google. */ }
    }
    return (ENGINES[preferences.engine] || ENGINES.google) + encodeURIComponent(query);
  }

  function matches(bookmarks, value) {
    return matchIndex(indexBookmarks(bookmarks), value);
  }

  function indexBookmarks(bookmarks) {
    return bookmarks.map(bookmark => ({ bookmark, terms: [bookmark.key, bookmark.name, new URL(bookmark.url).hostname].map(text => text.toLowerCase()) }));
  }

  function matchIndex(index, value) {
    const query = value.trim().toLowerCase();
    return index.filter(entry => !query || entry.terms.some(text => text.includes(query))).map(entry => entry.bookmark);
  }

  // Drafts may be incomplete, but never become navigation targets until fully validated.
  function validateDraft(value) {
    if (!value || (!Object.hasOwn(ENGINES, value.engine) && value.engine !== 'custom') || !Array.isArray(value.bookmarks) || value.bookmarks.length > 64) throw new Error('invalid settings draft.');
    const text = (item, limit) => {
      if (typeof item !== 'string' || item.length > limit) throw new Error('invalid settings draft.');
      return item;
    };
    return {
      engine: value.engine,
      customSearchUrl: text(value.customSearchUrl || '', 2000),
      bookmarks: value.bookmarks.map(item => ({ key: text(item?.key, 8), name: text(item?.name, 40), url: text(item?.url, 2000) }))
    };
  }

  function defaults(bookmarks) {
    return validatePreferences({ engine: 'google', bookmarks });
  }

  function migrate(legacy, original) {
    if (!Array.isArray(legacy?.groups)) return defaults(original);
    const used = new Set();
    const bookmarks = [];
    for (const group of legacy.groups) {
      for (const item of Array.isArray(group.items) ? group.items : []) {
        if (bookmarks.length >= 64) break;
        const url = safeUrl(item?.href);
        let name = String(item?.title || '').trim().slice(0, 40);
        if (!url || !name) continue;
        const known = original.find(entry => entry.url === url);
        if (known?.name === 'x' && name.toLowerCase() === 'x.com') name = 'x';
        let base = known?.key || name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'b';
        let key = base;
        for (let count = 2; used.has(key); count++) key = base + count;
        used.add(key);
        bookmarks.push({ key, name, url });
      }
    }
    const github = original.find(item => item.key === 'g');
    if (github && !used.has('g') && !bookmarks.some(item => item.url === github.url) && bookmarks.length < 64) bookmarks.unshift({ ...github });
    return defaults(bookmarks);
  }

  const api = Object.freeze({ ENGINES, safeUrl, validateSearchTemplate, validatePreferences, validateDraft, destination, matches, indexBookmarks, matchIndex, defaults, migrate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.STARTPAGE_CORE = api;
})(globalThis);
