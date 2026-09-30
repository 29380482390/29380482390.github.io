(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const preferences = window.STARTPAGE_PREFERENCES;
  const dialog = $('#settings-dialog');
  const form = $('#settings-form');
  const editor = $('#bookmark-editor');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const narrow = matchMedia('(max-width: 600px)');
  const updateOrientation = () => dialog.querySelector('[role="tablist"]').setAttribute('aria-orientation', narrow.matches ? 'horizontal' : 'vertical');
  narrow.addEventListener('change', updateOrientation);
  updateOrientation();
  let draft;
  let cityRequest = null;

  function selectTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      $('#' + item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (direction) {
        event.preventDefault();
        selectTab(tabs[(index + direction + tabs.length) % tabs.length], true);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        selectTab(tabs[event.key === 'Home' ? 0 : tabs.length - 1], true);
      }
    });
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, action) {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function input(label, value, maxLength, onChange, type = 'text') {
    const node = element('input', 'editor-input');
    node.type = type;
    node.setAttribute('aria-label', label);
    node.value = value;
    node.required = true;
    node.maxLength = maxLength;
    node.autocomplete = 'off';
    node.spellcheck = false;
    node.addEventListener('input', () => { node.setCustomValidity(''); onChange(node.value); });
    return node;
  }
  function renderEditor(focusSelector) {
    editor.replaceChildren();
    draft.groups.forEach((group, groupIndex) => {
      const section = element('fieldset', 'editor-group');
      const legend = element('legend', 'sr-only', `Group ${groupIndex + 1}`);
      const header = element('div', 'editor-group-header');
      const name = input(`Group ${groupIndex + 1} name`, group.name, 24, value => { group.name = value; });
      name.classList.add('group-name');
      const removeGroup = button('Remove group', 'text-button remove-group', () => {
        draft.groups.splice(groupIndex, 1);
        renderEditor('.group-name');
      });
      removeGroup.disabled = draft.groups.length === 1;
      header.append(name, removeGroup);
      section.append(legend, header);
      group.items.forEach((item, itemIndex) => {
        const row = element('div', 'editor-bookmark');
        const title = input(`Bookmark ${itemIndex + 1} name in group ${groupIndex + 1}`, item.title, 40, value => { item.title = value; });
        title.placeholder = 'Name';
        const url = input(`Bookmark ${itemIndex + 1} URL in group ${groupIndex + 1}`, item.href, 2048, value => { item.href = value; }, 'url');
        url.placeholder = 'https://example.com';
        url.classList.add('bookmark-url');
        const remove = button('-', 'remove-bookmark', () => {
          group.items.splice(itemIndex, 1);
          renderEditor(`[data-add-bookmark="${groupIndex}"]`);
        });
        remove.setAttribute('aria-label', `Remove bookmark ${itemIndex + 1} from group ${groupIndex + 1}`);
        remove.title = 'Remove bookmark';
        row.append(title, url, remove);
        section.append(row);
      });
      const add = button('+ Add bookmark', 'text-button add-bookmark', () => {
        group.items.push({ title: '', href: '' });
        renderEditor(`[aria-label="Bookmark ${group.items.length} name in group ${groupIndex + 1}"]`);
      });
      add.dataset.addBookmark = groupIndex;
      add.disabled = group.items.length >= 32;
      section.append(add);
      editor.append(section);
    });
    $('#add-group').disabled = draft.groups.length >= 8;
    if (focusSelector) editor.querySelector(focusSelector)?.focus();
  }

  function updatePhoto(detail = window.STARTPAGE_WALLPAPER.current) {
    const source = $('#wallpaper-source');
    source.textContent = `Photo by ${detail.author}`;
    source.href = detail.source;
    source.hidden = detail.solid || detail.custom;
    $('#wallpaper-preview').style.backgroundImage = detail.solid ? 'none'
      : getComputedStyle(document.querySelector('.wallpaper-layer.is-visible')).backgroundImage;
    $('#wallpaper-preview').style.backgroundColor = detail.color || '#202020';
    $('#next-wallpaper').disabled = detail.solid || detail.custom || detail.message === 'Loading photo...';
    $('#wallpaper-status').textContent = detail.message || '';
  }

  function prepare() {
    draft = preferences.current;
    $('#search-engine').value = draft.searchEngine;
    $('#animation-mode').value = draft.animation;
    $('#wallpaper-mode').value = draft.wallpaper.mode === 'rotate' ? 'rotate-' + draft.wallpaper.minutes : draft.wallpaper.mode;
    $('#wallpaper-url').value = draft.wallpaper.url || '';
    $('#wallpaper-color').value = draft.wallpaper.color || '#202020';
    $('#wallpaper-color-label').textContent = $('#wallpaper-color').value;
    wallpaperFields();
    $('#weather-location').value = draft.weather?.name || '';
    $('#selected-city').textContent = draft.weather ? 'selected: ' + draft.weather.name : 'no city selected';
    $('#city-status').textContent = '';
    $('#city-results').replaceChildren();
    cityRequest?.abort();
    cityRequest = null;
    $('#settings-error').textContent = '';
    renderEditor();
    updatePhoto();
    selectTab(tabs[0]);
  }
  function open(category = 'general') {
    window.STARTPAGE_WINDOWS.open('settings');
    selectTab(tabs.find(tab => tab.id === 'tab-' + category) || tabs[0], true);
  }
  function close() { window.STARTPAGE_WINDOWS.close('settings'); }
  window.addEventListener('app-opening', event => {
    if (event.detail.id === 'settings' && event.detail.fresh) prepare();
  });
  window.STARTPAGE_SETTINGS = Object.freeze({ open });
  $('#settings-cancel').addEventListener('click', close);
  function wallpaperFields() {
    $('#custom-wallpaper-field').hidden = $('#wallpaper-mode').value !== 'custom';
    $('#solid-wallpaper-field').hidden = $('#wallpaper-mode').value !== 'solid';
  }
  $('#wallpaper-mode').addEventListener('change', wallpaperFields);
  $('#wallpaper-color').addEventListener('input', () => {
    $('#wallpaper-color-label').textContent = $('#wallpaper-color').value;
  });
  async function findCity() {
    const query = $('#weather-location').value.trim();
    cityRequest?.abort();
    $('#city-results').replaceChildren();
    if (query.length < 2) { $('#city-status').textContent = 'enter at least two letters.'; return; }
    const request = new AbortController();
    cityRequest = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    $('#city-status').textContent = 'finding cities...';
    try {
      const response = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) + '&count=6&language=en&format=json', { signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('city search unavailable');
      const result = await response.json();
      if (cityRequest !== request) return;
      const cities = (Array.isArray(result.results) ? result.results : []).filter(city => typeof city.name === 'string' && Number.isFinite(city.latitude) && Number.isFinite(city.longitude));
      $('#city-status').textContent = cities.length ? 'choose a city:' : 'no cities found. try another name.';
      cities.forEach(city => {
        const label = [city.name, city.admin1, city.country].filter(Boolean).join(', ');
        const choice = button(label, 'city-result', () => {
          draft.weather = { name: city.name.slice(0, 100), latitude: city.latitude, longitude: city.longitude };
          $('#selected-city').textContent = 'selected: ' + label;
          $('#weather-location').value = city.name;
          $('#city-results').replaceChildren();
          $('#city-status').textContent = 'save to apply this location.';
        });
        $('#city-results').append(choice);
      });
    } catch {
      if (cityRequest === request) $('#city-status').textContent = 'city search is unavailable. try again.';
    } finally { clearTimeout(timeout); }
  }
  $('#find-city').addEventListener('click', findCity);
  $('#weather-location').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); findCity(); }
  });
  $('#add-group').addEventListener('click', () => {
    draft.groups.push({ name: 'new group', items: [] });
    renderEditor(`[aria-label="Group ${draft.groups.length} name"]`);
  });
  $('#restore-bookmarks').addEventListener('click', () => {
    draft.groups = preferences.defaults.groups;
    renderEditor();
    $('#settings-error').textContent = '';
  });
  $('#next-wallpaper').addEventListener('click', () => window.STARTPAGE_WALLPAPER.next());
  window.addEventListener('wallpaperchange', event => updatePhoto(event.detail));

  form.addEventListener('submit', event => {
    event.preventDefault();
    $('#settings-error').textContent = '';
    for (const field of form.querySelectorAll('.bookmark-url')) {
      field.setCustomValidity(window.STARTPAGE_CORE.safeURL(field.value.trim()) ? '' : 'Use a complete http:// or https:// address without login details.');
    }
    $('#wallpaper-url').setCustomValidity($('#wallpaper-mode').value === 'custom' && !/^https:\/\//i.test($('#wallpaper-url').value.trim()) ? 'use a direct https image address.' : '');
    $('#wallpaper-url').disabled = $('#wallpaper-mode').value !== 'custom';
    const invalid = form.querySelector('input:invalid, select:invalid');
    $('#wallpaper-url').disabled = false;
    if (invalid) {
      const panel = invalid.closest('[role="tabpanel"]');
      if (panel) selectTab(tabs.find(tab => tab.getAttribute('aria-controls') === panel.id));
      invalid.reportValidity();
      return;
    }
    draft.searchEngine = $('#search-engine').value;
    draft.animation = $('#animation-mode').value;
    const mode = $('#wallpaper-mode').value;
    draft.wallpaper = mode.startsWith('rotate-') ? { mode: 'rotate', minutes: Number(mode.slice(7)) }
      : { mode, minutes: draft.wallpaper.minutes };
    draft.wallpaper.url = $('#wallpaper-url').value.trim();
    draft.wallpaper.color = $('#wallpaper-color').value;
    try {
      const persisted = preferences.save(draft);
      if (!persisted) {
        $('#settings-error').textContent = 'Applied for this visit. Browser storage is unavailable.';
        return;
      }
      $('#announcement').textContent = 'Settings saved.';
      close();
    } catch (error) {
      $('#settings-error').textContent = error.message;
    }
  });
})();
