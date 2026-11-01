/* The catalog is a classic script so this page also works from file://. */
(() => {
  'use strict';
  const catalog = window.CHIVALRY_CATALOG;
  const factions = {
    agatha: {name: 'Agatha Knights', short: 'Agatha', color: '#71a6eb', emblem: [446, 352, 350, 350]},
    masons: {name: 'Mason Order', short: 'Masons', color: '#db6b62', emblem: [916, 350, 320, 350]},
  };
  const classes = {archer: 'Archer', man_at_arms: 'Man-at-Arms', vanguard: 'Vanguard', knight: 'Knight'};
  // Reusable viewports into the approved bitmap sheets, in their native coordinates.
  const portraits = {
    agatha: [[225, 310, 270, 400], [548, 310, 270, 400], [865, 310, 270, 400], [1180, 310, 270, 400]],
    masons: [[190, 300, 280, 390], [530, 300, 280, 390], [865, 300, 280, 390], [1200, 300, 280, 390]],
  };
  const sheets = {agatha: 'designs/02-agatha-class-selection.png', masons: 'designs/03-masons-class-selection.png'};
  const icons = {
    play: '<path d="m7 4 14 8L7 20Z" fill="currentColor"/>',
    pause: '<path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor"/>',
    back: '<path d="m15 4-8 8 8 8"/>',
    speaker: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8m3-11q7 7 0 14"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4zm13 0 5 6m0-6-5 6"/>',
    horn: '<path d="M3 15c7 0 10-3 15-9l3 12C14 15 9 17 4 19ZM17 7l2 11M7 16l2 5"/>',
  };
  const icon = (name, css = '') => `<svg class="${css}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icons[name]}</svg>`;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const main = document.querySelector('main');
  const audio = document.querySelector('#audio');
  const player = document.querySelector('.player');
  const dialog = document.querySelector('#versions');
  const announcement = document.querySelector('#announcement');
  const error = document.querySelector('.audio-error');
  const seek = document.querySelector('#seek');
  const volume = document.querySelector('#volume');
  const lastVersions = new Map();
  let route = {};
  let current = null;
  let pickerCommand = null;
  let pickerTrigger = null;
  let playbackRequest = 0;
  let initialized = false;

  function artwork(faction, cls = null) {
    const rectangle = cls ? portraits[faction][Object.keys(classes).indexOf(cls)] : factions[faction].emblem;
    const file = cls ? sheets[faction] : 'designs/01-faction-selection.png';
    const label = cls ? `${factions[faction].name} ${classes[cls]}` : `${factions[faction].name} emblem`;
    return `<svg class="artwork ${cls ? 'portrait' : 'crest'}" viewBox="${rectangle.join(' ')}" role="img" aria-label="${label}"><image href="${file}" width="1672" height="941"/></svg>`;
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
    return `<div class="command-row${battle ? ' battlecry' : ''}" data-command="${command.id}">
      <button class="command-play" type="button" data-action="random" data-id="${command.id}" aria-label="Play a random ${escape(command.name)} recording">${battle ? icon('horn', 'horn-icon') : ''}${icon('play', 'play-icon')}<span>${escape(command.name)}</span></button>
      <button class="version-trigger" type="button" data-action="versions" data-id="${command.id}" aria-label="Choose a ${escape(command.name)} version" aria-haspopup="dialog" aria-controls="versions">•••</button></div>`;
  }
  function renderVoices() {
    const f = factions[route.faction], groups = catalog[route.faction][route.cls];
    return `<section aria-labelledby="page-title"><div class="page-heading voice-heading"><p class="voice-context">${f.name} <span aria-hidden="true">/</span> ${classes[route.cls]}</p><h1 id="page-title">Make yourself heard</h1></div>
      <div class="voice-layout"><aside class="steel identity-panel" aria-label="Selected voice">${artwork(route.faction)}${artwork(route.faction, route.cls)}<div class="identity-copy"><h2>${classes[route.cls]}</h2><p>${f.name}</p></div>
      <div class="identity-actions"><a class="steel-button" href="#${route.faction}">Change class</a><a class="steel-button" href="#">Change faction</a></div><a class="identity-change" href="#${route.faction}" aria-label="Change class; ${classes[route.cls]} currently selected">Change ›</a></aside>
      <div class="command-area">${[['personal', 'Personal Messages'], ['tactical', 'Tactical Messages']].map(([group, label]) => `<section class="steel command-panel" aria-labelledby="${group}-title"><h2 id="${group}-title">${label}</h2><div class="commands">${groups[group].map(c => commandRow(c)).join('')}</div></section>`).join('')}
      ${commandRow(groups.battlecry[0], true)}<p class="voice-help">Tap a command to play a random line. Use <strong>•••</strong> to choose a version.</p></div></div></section>`;
  }
  function closePicker() {
    if (!dialog.open) return;
    dialog.close();
    if (pickerTrigger?.isConnected) pickerTrigger.focus();
    pickerCommand = null;
  }
  function stop() {
    playbackRequest++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    current = null;
    player.hidden = true;
    error.hidden = true;
    document.body.classList.remove('has-audio');
    seek.value = '0';
    seek.disabled = true;
    updateHighlights();
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
    stop();
    route = {faction, cls};
    document.body.style.setProperty('--faction', faction ? factions[faction].color : factions.agatha.color);
    document.body.dataset.stage = cls ? 'voice' : faction ? 'class' : 'faction';
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
  function updateHighlights() {
    document.querySelectorAll('[data-command]').forEach(row => row.classList.toggle('is-playing', !!current && !audio.paused && row.dataset.command === current.command.id));
    const toggle = document.querySelector('.player-toggle');
    toggle.innerHTML = icon(audio.paused ? 'play' : 'pause');
    toggle.setAttribute('aria-label', audio.paused ? 'Resume playback' : 'Pause playback');
  }
  function updateProgress() {
    const duration = audio.duration;
    document.querySelector('#elapsed').textContent = clock(audio.currentTime);
    document.querySelector('#duration').textContent = clock(duration);
    seek.disabled = !Number.isFinite(duration) || duration <= 0;
    seek.value = seek.disabled ? '0' : String(audio.currentTime / duration * 100);
    seek.setAttribute('aria-valuetext', `${clock(audio.currentTime)} of ${clock(duration)}`);
  }
  async function play(command, version = null) {
    if (!command?.clips.length) return;
    const key = `${route.faction}/${route.cls}/${command.id}`;
    if (version === null) {
      const last = lastVersions.get(key);
      const choices = command.clips.map((_, i) => i).filter(i => command.clips.length === 1 || i !== last);
      version = choices[Math.floor(Math.random() * choices.length)];
    }
    if (!Number.isInteger(version) || !command.clips[version]) return;
    lastVersions.set(key, version);
    const request = ++playbackRequest;
    audio.pause();
    audio.src = command.clips[version].file;
    current = {command, version};
    player.hidden = false;
    error.hidden = true;
    document.body.classList.add('has-audio');
    document.querySelector('#playing-command').textContent = command.name;
    document.querySelector('#playing-version').textContent = `${factions[route.faction].short} ${classes[route.cls]} · Version ${version + 1}`;
    announcement.textContent = `${command.name}, version ${version + 1}`;
    updateProgress();
    try { await audio.play(); }
    catch (failure) {
      if (request === playbackRequest && failure.name !== 'AbortError') error.hidden = false;
    }
    if (request === playbackRequest) updateHighlights();
  }
  function openPicker(command, trigger) {
    if (!command) return;
    pickerCommand = command;
    pickerTrigger = trigger;
    document.querySelector('#versions-title').textContent = command.name;
    document.querySelector('#version-list').innerHTML = `<button type="button" class="version-option" data-action="pick" data-version="random">Random version ${icon('play')}</button>` + command.clips.map((clip, i) => `<button type="button" class="version-option" data-action="pick" data-version="${i}"${current?.command.id === command.id && current.version === i ? ' aria-current="true"' : ''}>Version ${i + 1}<small>${clock(clip.duration)}</small>${icon('play')}</button>`).join('');
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    const disabled = event.target.closest('a[aria-disabled="true"]');
    if (disabled) { event.preventDefault(); return; }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    switch (button.dataset.action) {
      case 'random': play(commandById(button.dataset.id)); break;
      case 'versions': openPicker(commandById(button.dataset.id), button); break;
      case 'close-versions': closePicker(); break;
      case 'pick': {
        const command = pickerCommand;
        const version = button.dataset.version === 'random' ? null : Number(button.dataset.version);
        closePicker();
        play(command, version);
        break;
      }
      case 'toggle':
        if (!current) break;
        if (audio.paused) audio.play().catch(() => { error.hidden = false; });
        else audio.pause();
        break;
      case 'stop': stop(); break;
      case 'retry': if (current) play(current.command, current.version); break;
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePicker();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
  ['play', 'pause', 'ended'].forEach(event => audio.addEventListener(event, updateHighlights));
  ['loadedmetadata', 'timeupdate', 'durationchange', 'emptied'].forEach(event => audio.addEventListener(event, updateProgress));
  audio.addEventListener('error', () => { if (current) error.hidden = false; });
  seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 100 * audio.duration; });
  function updateVolume() {
    document.querySelector('#mute').innerHTML = icon(audio.muted || audio.volume === 0 ? 'mute' : 'speaker');
    document.querySelector('#mute').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  }
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    audio.muted = false;
    updateVolume();
    try { localStorage.setItem('chivalry-volume', volume.value); } catch { /* Storage is optional for file URLs. */ }
  });
  document.querySelector('#mute').addEventListener('click', () => { audio.muted = !audio.muted; updateVolume(); });
  try {
    const saved = localStorage.getItem('chivalry-volume');
    if (saved !== null && Number.isFinite(Number(saved))) volume.value = String(Math.max(0, Math.min(1, Number(saved))));
  } catch { /* The soundboard also works with storage disabled. */ }
  audio.volume = Number(volume.value);
  updateVolume();
  window.addEventListener('hashchange', renderRoute);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open) closePicker();
    if (event.code === 'Space' && !dialog.open && current && event.target === document.body) {
      event.preventDefault();
      document.querySelector('.player-toggle').click();
    }
  });
  if (!catalog || !Object.keys(catalog).length) {
    main.innerHTML = '<p class="notice">The voice collection could not be loaded. Please open the <a href="index.html">full collection</a>.</p>';
    return;
  }
  renderRoute();
})();
