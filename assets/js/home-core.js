(() => {
  'use strict';
  function bookmarkChords(items) {
    const preferred = { youtube: 'yt', twitch: 'tw', primevideo: 'pv', tiktok: 'tt',
      instagram: 'i', 'x.com': 'x', x: 'x', reddit: 'rd', '4chan': '4', 'gg.deals': 'gg',
      'cs.rin.ru': 'cs', fmhy: 'fm', megathread: 'mt', proton: 'pm', gmail: 'gm', notes: 'nt', deepseek: 'ds',
      'hacker news': 'hn', hackernews: 'hn' };
    // Reserve single-key prefixes first, even when their bookmark appears later.
    // This keeps every shortcut unambiguous as soon as its last key is pressed.
    const singles = new Set(items.map(item => preferred[item.title.toLowerCase()]).filter(value => value?.length === 1));
    const editingPrefixes = new Set(['a', 'v', 'z']);
    const used = new Set();
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return items.map(item => {
      const label = item.title.toLowerCase();
      const clean = label.replace(/[^a-z0-9]/g, '');
      let chord = preferred[label] || clean.slice(0, 2);
      if (!chord || used.has(chord) || editingPrefixes.has(chord[0]) || (chord.length === 2 && singles.has(chord[0])) || (chord.length === 1 && !singles.has(chord))) {
        chord = '';
        for (const first of alphabet) {
          for (const second of alphabet) {
            if (!singles.has(first) && !editingPrefixes.has(first) && !used.has(first + second)) { chord = first + second; break; }
          }
          if (chord) break;
        }
      }
      used.add(chord);
      return chord;
    });
  }
  function createBookmarkShortcuts({ getBookmarks, isEnabled, navigate }) {
    let chord = '';
    let consumed = false;
    const reset = () => { chord = ''; consumed = false; };
    function keydown(event) {
      if (event.key === 'Control') { if (!event.repeat) reset(); return; }
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented || !isEnabled(event)) {
        reset(); return;
      }
      if (!/^[a-z0-9]$/i.test(event.key)) { reset(); return; }
      if (consumed || (event.repeat && chord)) { event.preventDefault(); return; }
      if (event.repeat) return;
      const candidate = chord + event.key.toLowerCase();
      const items = getBookmarks();
      const matching = items.filter(item => item.chord.startsWith(candidate));
      if (!matching.length) {
        // Once a chord begins, an incorrect second key must not become a browser command.
        if (chord) { event.preventDefault(); consumed = true; chord = ''; }
        return;
      }
      event.preventDefault();
      chord = candidate;
      const exact = matching.find(item => item.chord === chord);
      if (exact) { consumed = true; chord = ''; navigate(exact.href); }
    }
    return { keydown, reset, keyup(event) { if (event.key === 'Control' || !event.ctrlKey) reset(); } };
  }
  function weatherCondition(code, day = true) {
    if (code === 0) return { label: day ? 'clear sky' : 'clear night', icon: day ? 'sun' : 'moon' };
    if ([1, 2].includes(code)) return { label: 'partly cloudy', icon: 'cloud' };
    if (code === 3) return { label: 'overcast', icon: 'cloud' };
    if ([45, 48].includes(code)) return { label: 'fog', icon: 'cloud' };
    if ([51, 53, 55, 56, 57].includes(code)) return { label: 'drizzle', icon: 'rain' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'rain', icon: 'rain' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'snow', icon: 'snow' };
    if ([95, 96, 99].includes(code)) return { label: 'thunderstorms', icon: 'storm' };
    return { label: 'conditions unavailable', icon: 'cloud' };
  }
  function parseWeather(data) {
    const current = data?.current;
    if (!current || !Number.isFinite(current.temperature_2m) || Math.abs(current.temperature_2m) > 100
      || !Number.isInteger(current.weather_code) || ![0, 1].includes(current.is_day)) return null;
    return { temperature: current.temperature_2m, code: current.weather_code, day: current.is_day === 1 };
  }
  window.STARTPAGE_HOME_CORE = Object.freeze({ bookmarkChords, createBookmarkShortcuts, weatherCondition, parseWeather });
})();
