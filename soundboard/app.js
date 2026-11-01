/* The catalog is a classic script so this page also works from file://. */
(() => {
  'use strict';
  const catalog = window.CHIVALRY_CATALOG;
  const factions = {
    agatha: {name: 'Agatha Knights', short: 'Agatha', color: '#71a6eb', emblem: 0},
    masons: {name: 'Mason Order', short: 'Masons', color: '#db6b62', emblem: 1},
  };
  const classes = {archer: 'Archer', man_at_arms: 'Man-at-Arms', vanguard: 'Vanguard', knight: 'Knight'};
  // Production artwork has transparent backgrounds, independent of the panel styling.
  const emblemSheet = {file: 'soundboard/assets/faction-emblems.png', width: 1774, height: 887};
  const icons = {
    play: '<path d="m7 4 14 8L7 20Z" fill="currentColor"/>',
    back: '<path d="m15 4-8 8 8 8"/>',
    speaker: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8m3-11q7 7 0 14"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4zm13 0 5 6m0-6-5 6"/>',
    horn: '<path d="M3 15c7 0 10-3 15-9l3 12C14 15 9 17 4 19ZM17 7l2 11M7 16l2 5"/>',
  };
  const icon = (name, css = '') => `<svg class="${css}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icons[name]}</svg>`;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const main = document.querySelector('main');
  const controls = document.querySelector('.sound-controls');
  const dialog = document.querySelector('#versions');
  const shade = document.querySelector('#picker-shade');
  const announcement = document.querySelector('#announcement');
  const error = document.querySelector('.audio-error');
  const volume = document.querySelector('#volume');
  const lastVersions = new Map();
  const preferenceKey = 'chivalry-command-versions';
  const versionPreferences = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [key, file] of Object.entries(saved)) {
        if (typeof file === 'string') versionPreferences.set(key, file);
      }
    }
  } catch { /* Preferences remain available in memory when storage is unavailable. */ }
  let route = {};
  let pickerCommand = null;
  let pickerTrigger = null;
  let initialized = false;
  let artworkSerial = 0;
  const playback = new window.ChivalryPlayback({
    onChange: updatePlayback,
    onError: ({command, version}) => {
      error.textContent = `Unable to play ${command.name}, Version ${version + 1}. Tap the command to try again.`;
      error.hidden = false;
      updatePickerClearance();
    },
  });

  function artwork(faction, cls = null) {
    const label = cls ? `${factions[faction].name} ${classes[cls]}` : `${factions[faction].name} emblem`;
    if (cls) return `<img class="artwork portrait" src="soundboard/assets/${faction}-${cls}.png" alt="${label}" width="1024" height="1536">`;
    const cell = emblemSheet.width / 2;
    const x = factions[faction].emblem * cell;
    const clipId = `emblem-clip-${++artworkSerial}`;
    // A viewBox alone leaves the letterboxed area visible in wide mobile cards.
    // Clip the sheet in image coordinates, before the SVG scales it to fit.
    return `<svg class="artwork crest" viewBox="${x} 0 ${cell} ${emblemSheet.height}" role="img" aria-label="${label}">
      <defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="0" width="${cell}" height="${emblemSheet.height}"/></clipPath></defs>
      <image href="${emblemSheet.file}" width="${emblemSheet.width}" height="${emblemSheet.height}" clip-path="url(#${clipId})"/>
    </svg>`;
  }
  const knot = '<img class="focus-knot" src="soundboard/assets/knot.svg" alt="" width="48" height="48">';
  const clock = seconds => {
    const s = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  function commandById(id) {
    const groups = catalog[route.faction]?.[route.cls];
    return groups ? Object.values(groups).flat().find(c => c.id === id) : null;
  }
  function commandKey(command) {
    return `${route.faction}/${route.cls}/${command.id}`;
  }
  function preferredVersion(command) {
    if (!command) return null;
    const file = versionPreferences.get(commandKey(command));
    const index = command.clips.findIndex(clip => clip.file === file);
    return index === -1 ? null : index;
  }
  function saveVersion(command, version) {
    // Store the file identity so catalog reordering cannot select a different take.
    if (version === null) versionPreferences.delete(commandKey(command));
    else versionPreferences.set(commandKey(command), command.clips[version].file);
    try { localStorage.setItem(preferenceKey, JSON.stringify(Object.fromEntries(versionPreferences))); }
    catch { /* Playback and the current session still work with storage disabled. */ }
    updatePreferenceLabels();
    updatePlayback();
  }
  function updatePreferenceLabels() {
    document.querySelectorAll('[data-command]').forEach(row => {
      const command = commandById(row.dataset.command);
      const version = preferredVersion(command);
      const badge = row.querySelector('.version-label');
      badge.hidden = version === null;
      badge.textContent = version === null ? '' : `Version ${version + 1}`;
      row.querySelector('.command-play').setAttribute('aria-label', version === null
        ? `Play a random ${command.name} recording` : `Play ${command.name}, Version ${version + 1}`);
    });
  }
  function renderFactions() {
    return `<section aria-labelledby="page-title"><div class="page-heading"><h1 id="page-title">Choose your faction</h1><p>Choose a side. Find your voice.</p></div>
      <div class="faction-grid">${Object.entries(factions).map(([id, f]) => `<a href="#${id}" class="steel selection-card faction-card" style="--faction:${f.color}">${knot}<h2>${f.name}</h2>${artwork(id)}<span class="card-action">Choose ${f.short}</span></a>`).join('')}</div>
      <p class="selection-hint">Select a faction to continue</p></section>`;
  }
  function renderClasses() {
    const f = factions[route.faction];
    return `<section aria-labelledby="page-title"><div class="page-heading"><div class="faction-label">${artwork(route.faction)}<span>${f.name}</span></div><h1 id="page-title">Choose your class</h1></div>
      <div class="class-grid">${Object.entries(classes).map(([id, name]) => `<a href="#${route.faction}/${id}" class="steel selection-card class-card">${knot}${artwork(route.faction, id)}<h2>${name}</h2><span class="card-action">Choose voice</span></a>`).join('')}</div>
      <a href="#" class="back-button">${icon('back')}Back to factions</a></section>`;
  }
  function commandRow(command, battle = false) {
    const version = preferredVersion(command);
    const label = version === null ? `Play a random ${command.name} recording` : `Play ${command.name}, Version ${version + 1}`;
    return `<div class="command-row${battle ? ' battlecry' : ''}" data-command="${command.id}">
      <button class="command-play" type="button" data-action="random" data-id="${command.id}" aria-label="${escape(label)}">${battle ? icon('horn', 'horn-icon') : ''}${icon('play', 'play-icon')}<span class="command-label"><span>${escape(command.name)}</span><small class="version-label"${version === null ? ' hidden' : ''}>${version === null ? '' : `Version ${version + 1}`}</small><span class="playback-feedback" hidden><span class="equalizer" aria-hidden="true"><i></i><i></i><i></i></span><small class="playback-status" id="playback-${command.id}"></small></span></span></button>
      <button class="version-trigger" type="button" data-action="versions" data-id="${command.id}" aria-label="Choose a ${escape(command.name)} version" aria-haspopup="dialog" aria-controls="versions">•••</button></div>`;
  }
  function renderVoices() {
    const f = factions[route.faction], groups = catalog[route.faction][route.cls];
    return `<section aria-labelledby="page-title"><div class="page-heading voice-heading"><p class="voice-context">${f.name} <span aria-hidden="true">/</span> ${classes[route.cls]}</p><h1 id="page-title">Make yourself heard</h1></div>
      <div class="voice-layout"><aside class="steel identity-panel" aria-label="Selected voice">${artwork(route.faction)}${artwork(route.faction, route.cls)}<div class="identity-copy"><h2>${classes[route.cls]}</h2><p>${f.name}</p></div>
      <div class="identity-actions"><a class="steel-button" href="#${route.faction}">Change class</a><a class="steel-button" href="#">Change faction</a></div><a class="identity-change" href="#${route.faction}" aria-label="Change class; ${classes[route.cls]} currently selected">Change ›</a></aside>
      <div class="command-area">${[['personal', 'Personal Messages'], ['tactical', 'Tactical Messages']].map(([group, label]) => `<section class="steel command-panel" aria-labelledby="${group}-title"><h2 id="${group}-title">${label}</h2><div class="commands">${groups[group].map(c => commandRow(c)).join('')}</div></section>`).join('')}
      ${commandRow(groups.battlecry[0], true)}<p class="voice-help">Tap to play. Voices can overlap. Use <strong>•••</strong> to choose a version or stop a recording.</p></div></div></section>`;
  }
  function closePicker() {
    if (!dialog.open) return;
    dialog.close();
    document.querySelector('#version-list').replaceChildren();
    shade.hidden = true;
    document.body.classList.remove('picker-open');
    setBackgroundInert(false);
    if (pickerTrigger?.isConnected) pickerTrigger.focus();
    pickerCommand = null;
  }
  function setBackgroundInert(inert) {
    document.querySelectorAll('main, .site-header, .site-footer').forEach(element => {
      if (inert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    });
  }
  function updatePickerClearance() {
    const height = controls.getBoundingClientRect?.().height || 60;
    document.documentElement.style.setProperty('--controls-clearance', `calc(${Math.ceil(height) + 32}px + env(safe-area-inset-bottom, 0px))`);
  }
  function stopAll() {
    playback.stopAll();
    error.hidden = true;
  }
  function renderRoute() {
    const parts = location.hash.slice(1).split('/').filter(Boolean);
    const faction = Object.hasOwn(factions, parts[0]) ? parts[0] : null;
    const cls = faction && Object.hasOwn(classes, parts[1]) ? parts[1] : null;
    const validHash = faction ? `#${faction}${cls ? '/' + cls : ''}` : '';
    if ((location.hash || '') !== validHash && location.hash !== '#') {
      try { history.replaceState(null, '', location.pathname + location.search + validHash); }
      catch { /* Some file:// browsers disallow URL normalization; the route is still safe. */ }
    }
    closePicker();
    stopAll();
    route = {faction, cls};
    document.body.style.setProperty('--faction', faction ? factions[faction].color : factions.agatha.color);
    document.body.dataset.stage = cls ? 'voice' : faction ? 'class' : 'faction';
    controls.hidden = !cls;
    main.innerHTML = cls ? renderVoices() : faction ? renderClasses() : renderFactions();
    document.title = `${cls ? classes[cls] + ' · ' : ''}${faction ? factions[faction].name + ' · ' : ''}Chivalry Voice Commands`;
    const step = cls ? 'voice' : faction ? 'class' : 'faction';
    document.querySelectorAll('[data-step]').forEach(link => {
      const name = link.dataset.step;
      const enabled = name === 'faction' || name === 'class' && faction || name === 'voice' && cls;
      link.setAttribute('href', name === 'class' && faction ? `#${faction}` : name === 'voice' && cls ? `#${faction}/${cls}` : '#');
      link.setAttribute('aria-disabled', String(!enabled));
      link.tabIndex = enabled ? 0 : -1;
      if (name === step) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    if (initialized) {
      main.focus({preventScroll: true});
      window.scrollTo({top: 0, behavior: 'instant'});
    }
    initialized = true;
  }
  function updatePlayback() {
    const active = playback.active;
    const playingCount = active.filter(entry => entry.state === 'playing').length;
    const loadingCount = active.length - playingCount;
    document.querySelector('#active-count').textContent = active.length
      ? [playingCount ? `${playingCount} playing` : '', loadingCount ? `${loadingCount} loading` : ''].filter(Boolean).join(' · ')
      : 'No voices playing';
    document.querySelector('[data-action="stop-all"]').disabled = !active.length;
    document.querySelectorAll('[data-command]').forEach(row => {
      const entries = active.filter(entry => entry.command.id === row.dataset.command);
      const playing = entries.filter(entry => entry.state === 'playing');
      row.classList.toggle('is-playing', !!playing.length);
      row.classList.toggle('is-loading', !!entries.length && !playing.length);
      const feedback = row.querySelector('.playback-feedback');
      feedback.hidden = !entries.length;
      row.querySelector('.equalizer').hidden = !playing.length;
      const status = row.querySelector('.playback-status');
      const button = row.querySelector('.command-play');
      if (entries.length) button.setAttribute('aria-describedby', status.id);
      else button.removeAttribute('aria-describedby');
      if (entries.length === 1) {
        status.textContent = `${playing.length ? 'Playing' : 'Loading'} Version ${entries[0].version + 1}`;
      } else if (entries.length) {
        const versions = [...new Set(entries.map(entry => entry.version + 1))];
        const summary = versions.slice(0, 3).join(', ') + (versions.length > 3 ? '…' : '');
        status.textContent = `${playing.length} playing${entries.length > playing.length ? ` · ${entries.length - playing.length} loading` : ''} · ${versions.length === 1 ? 'Version' : 'Versions'} ${summary}`;
      } else status.textContent = '';
    });
    updateVariantFeedback();
  }
  function updateVariantFeedback() {
    if (!dialog.open || !pickerCommand) return;
    const entries = playback.active.filter(entry => entry.command.id === pickerCommand.id);
    const selected = preferredVersion(pickerCommand);
    dialog.querySelectorAll('.version-option').forEach(option => {
      const version = option.dataset.version === 'random' ? null : Number(option.dataset.version);
      if (version === selected) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
      if (version === null) return;
      const instances = entries.filter(entry => entry.version === version);
      const playing = instances.filter(entry => entry.state === 'playing').length;
      const loading = instances.length - playing;
      option.classList.toggle('is-playing', !!playing);
      option.querySelector('.equalizer').hidden = !playing;
      option.querySelector('.variant-state').textContent = instances.length === 1
        ? (playing ? 'Playing' : 'Loading')
        : [playing ? `${playing} playing` : '', loading ? `${loading} loading` : ''].filter(Boolean).join(' · ');
    });
  }

  function play(command, version = null) {
    if (!command?.clips.length) return;
    const key = commandKey(command);
    if (version === null) {
      const last = lastVersions.get(key);
      const choices = command.clips.map((_, i) => i).filter(i => command.clips.length === 1 || i !== last);
      version = choices[Math.floor(Math.random() * choices.length)];
    }
    if (!Number.isInteger(version) || !command.clips[version]) return;
    lastVersions.set(key, version);
    error.hidden = true;
    announcement.textContent = `${command.name}, version ${version + 1}`;
    playback.start(command, version);
  }
  function openPicker(command, trigger) {
    if (!command) return;
    pickerCommand = command;
    pickerTrigger = trigger;
    const selected = preferredVersion(command);
    document.querySelector('#versions-title').textContent = command.name;
    document.querySelector('#version-list').innerHTML = `<button type="button" class="version-option" data-action="pick" data-version="random"${selected === null ? ' aria-current="true"' : ''}>Random version ${icon('play')}</button>` + command.clips.map((clip, i) => `<button type="button" class="version-option" data-action="pick" data-version="${i}"${selected === i ? ' aria-current="true"' : ''}><span class="variant-name"><span class="variant-indicator" aria-hidden="true"><span class="equalizer" hidden><i></i><i></i><i></i></span></span><span>Version ${i + 1}</span><span class="variant-state sr-only"></span></span><small class="variant-duration">${clock(clip.duration)}</small>${icon('play')}</button>`).join('');
    updatePickerClearance();
    shade.hidden = false;
    document.body.classList.add('picker-open');
    setBackgroundInert(true);
    // A non-modal dialog permits interaction with the undimmed sound controls.
    if (!dialog.open) dialog.show();
    dialog.querySelector('[data-action="close-versions"]').focus();
    updateVariantFeedback();
  }
  document.addEventListener('click', event => {
    const disabled = event.target.closest('a[aria-disabled="true"]');
    if (disabled) { event.preventDefault(); return; }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    switch (button.dataset.action) {
      case 'random': {
        const command = commandById(button.dataset.id);
        play(command, preferredVersion(command));
        break;
      }
      case 'versions': openPicker(commandById(button.dataset.id), button); break;
      case 'close-versions': closePicker(); break;
      case 'pick': {
        const command = pickerCommand;
        const version = button.dataset.version === 'random' ? null : Number(button.dataset.version);
        if (!command || version !== null && (!Number.isInteger(version) || !command.clips[version])) break;
        saveVersion(command, version);
        play(command, version);
        break;
      }
      case 'stop-all': stopAll(); break;

    }
  });
  shade.addEventListener('click', closePicker);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
  function updateVolume() {
    document.querySelector('#mute').innerHTML = icon(playback.muted || playback.volume === 0 ? 'mute' : 'speaker');
    document.querySelector('#mute').setAttribute('aria-label', playback.muted ? 'Unmute' : 'Mute');
  }
  volume.addEventListener('input', () => {
    playback.setVolume(Number(volume.value));
    playback.setMuted(false);
    updateVolume();
    try { localStorage.setItem('chivalry-volume', volume.value); } catch { /* Storage is optional for file URLs. */ }
  });
  document.querySelector('#mute').addEventListener('click', () => { playback.setMuted(!playback.muted); updateVolume(); });
  try {
    const saved = localStorage.getItem('chivalry-volume');
    if (saved !== null && Number.isFinite(Number(saved))) volume.value = String(Math.max(0, Math.min(1, Number(saved))));
  } catch { /* The soundboard also works with storage disabled. */ }
  playback.setVolume(Number(volume.value));
  updateVolume();
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('pagehide', stopAll);
  window.addEventListener('resize', updatePickerClearance);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updatePickerClearance).observe(controls);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open) closePicker();
    if (event.key === 'Tab' && dialog.open) {
      // Keep keyboard focus within the picker AND the still-accessible dashboard.
      const targets = [...dialog.querySelectorAll('button:not([disabled])'), ...controls.querySelectorAll('button:not([disabled]), input:not([disabled])')]
        .filter(element => !element.closest('[hidden]'));
      const index = targets.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? targets.length - 1 : index - 1) : (index + 1) % targets.length;
      event.preventDefault();
      targets[next]?.focus();
    }
  });
  if (!catalog || !Object.keys(catalog).length) {
    main.innerHTML = '<p class="notice">The voice collection could not be loaded. Please open the <a href="full-list.html">full collection</a>.</p>';
    return;
  }
  renderRoute();
})();
