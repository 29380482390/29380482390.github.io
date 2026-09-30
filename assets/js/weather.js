(() => {
  'use strict';
  const { weatherCondition, parseWeather } = window.STARTPAGE_HOME_CORE;
  const $ = selector => document.querySelector(selector);
  const KEY = 'startpage-weather-v1';
  const INTERVAL = 15 * 60000;
  let place = window.STARTPAGE_PREFERENCES.current.weather;
  let request;
  let cached;
  try { cached = JSON.parse(localStorage.getItem(KEY)); } catch { /* Weather still works without storage. */ }
  const placeKey = () => place ? place.latitude + ',' + place.longitude : '';
  const validCache = () => cached?.place === placeKey() && Number.isFinite(cached.at) && cached.at <= Date.now()
    && Number.isFinite(cached.temperature) && Math.abs(cached.temperature) <= 100
    && Number.isInteger(cached.code) && typeof cached.day === 'boolean' && Date.now() - cached.at < 6 * 3600000;
  function render(data, stale = false) {
    const condition = weatherCondition(data.code, data.day);
    $('#weather-temperature').textContent = Math.round(data.temperature) + '°c';
    $('#weather-description').textContent = condition.label + (stale ? ' - saved' : '');
    $('#weather-icon').setAttribute('href', '#i-' + condition.icon);
    $('#weather').title = place.name + ' - ' + condition.label + (stale ? ' - saved weather' : '') + '. change location in settings.';
  }
  function unavailable(description) {
    $('#weather-temperature').textContent = '--°';
    $('#weather-description').textContent = description;
    $('#weather-icon').setAttribute('href', '#i-cloud');
    $('#weather').title = description + '. change location in settings.';
  }
  async function update(force = false) {
    request?.abort();
    request = null;
    if (!place) {
      unavailable('set location');
      return;
    }
    if (validCache()) {
      render(cached, Date.now() - cached.at >= INTERVAL);
      if (!force && Date.now() - cached.at < INTERVAL) return;
    } else {
      unavailable('loading weather');
    }
    const controller = new AbortController();
    request = controller;
    const key = placeKey();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude
        + '&current=temperature_2m,weather_code,is_day&temperature_unit=celsius&forecast_days=1';
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('weather unavailable');
      const data = parseWeather(await response.json());
      if (!data) throw new Error('invalid weather');
      if (request !== controller) return;
      cached = { ...data, at: Date.now(), place: key };
      try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* Optional cache. */ }
      render(cached);
    } catch {
      if (request !== controller) return;
      if (validCache()) render(cached, true);
      else unavailable('weather unavailable');
    } finally { clearTimeout(timeout); }
  }
  window.addEventListener('preferenceschange', event => {
    if (JSON.stringify(place) === JSON.stringify(event.detail.weather)) return;
    place = event.detail.weather;
    update();
  });
  window.addEventListener('online', () => update(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  setInterval(() => { if (!document.hidden) update(); }, INTERVAL);
  update();
})();
