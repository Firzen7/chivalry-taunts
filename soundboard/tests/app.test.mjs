import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseHTML } = await import(process.env.DOM_TEST_HELPER || 'linkedom');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

function app(hash = '', storage = new Map()) {
  const { window } = parseHTML(read('soundboard.html'));
  const { document, Event } = window;
  const location = { hash, pathname: '/soundboard.html', search: '' };
  window.scrollTo = () => {};
  let focused = null;
  window.HTMLElement.prototype.focus = function () { focused = this; };
  Object.defineProperty(document, 'activeElement', {get: () => focused});
  const dialog = document.querySelector('dialog');
  Object.defineProperty(dialog, 'open', { get() { return this.hasAttribute('open'); } });
  dialog.showModal = () => { throw new Error('A modal picker would block the dashboard'); };
  dialog.show = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
  const recordings = [];
  const mediaOptions = {};
  function MockAudio() {
    const audio = document.createElement('audio');
    Object.assign(audio, { paused: true, currentTime: 0, duration: NaN, volume: 0.8, muted: false });
    Object.defineProperty(audio, 'src', {get: () => audio.getAttribute('src') || '', set: value => audio.setAttribute('src', value)});
    audio.pause = () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); };
    audio.load = () => { audio.released = true; audio.currentTime = 0; audio.duration = NaN; };
    audio.finish = () => { audio.paused = true; audio.dispatchEvent(new Event('ended')); };
    const playing = () => { audio.paused = false; audio.dispatchEvent(new Event('playing')); };
    audio.play = () => {
      if (mediaOptions.rejectNext) { mediaOptions.rejectNext = false; return Promise.reject(new Error('Media unavailable')); }
      if (mediaOptions.deferNext) {
        mediaOptions.deferNext = false;
        return new Promise((resolve, reject) => {
          audio.resolvePlay = () => { playing(); resolve(); };
          audio.rejectPlay = reject;
        });
      }
      playing();
      return Promise.resolve();
    };
    recordings.push(audio);
    return audio;
  }
  const context = vm.createContext({ window, document, location, Audio: MockAudio, history: { replaceState(_, __, url) { location.hash = url.includes('#') ? '#' + url.split('#')[1] : ''; } }, localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}, console });
  vm.runInContext(read('soundboard/catalog.js'), context);
  vm.runInContext(read('soundboard/playback.js'), context);
  vm.runInContext(read('soundboard/app.js'), context);
  return {
    window, document, dialog, recordings, mediaOptions,
    get audio() { return recordings.at(-1); },
    get focused() { return focused; },
    route(hash) { location.hash = hash; window.dispatchEvent(new Event('hashchange')); },
    click(selector) {
      const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
      assert.ok(target, `Missing control: ${selector}`);
      target.dispatchEvent(new Event('click', { bubbles: true }));
    },
    input(selector, value) { const el = document.querySelector(selector); el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('both factions and all four classes have 20 commands plus a battle cry; shared bitmap sheets exist', () => {
  const a = app();
  assert.equal(a.document.querySelectorAll('.faction-card').length, 2);
  for (const faction of ['agatha', 'masons']) {
    a.route(`#${faction}`);
    assert.equal(a.document.querySelectorAll('.class-card').length, 4);
    for (const cls of ['archer', 'man_at_arms', 'vanguard', 'knight']) {
      a.route(`#${faction}/${cls}`);
      assert.equal(a.document.querySelectorAll('.command-panel').length, 2);
      assert.equal(a.document.querySelectorAll('[data-action="random"]').length, 21);
      assert.equal(a.document.querySelectorAll('.version-trigger').length, 21);
      assert.equal(a.document.querySelectorAll('.wordmark').length, 1);
      for (const image of a.document.querySelectorAll('image, img.portrait')) {
        const source = image.getAttribute('href') || image.getAttribute('src');
        assert.ok(source.startsWith('soundboard/assets/'), 'Production artwork must not crop a UI screenshot');
        assert.ok(existsSync(resolve(root, source)), source);
      }
    }
  }
  assert.equal(a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[0].clips.length, 15);
  assert.equal(a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[1].clips.length, 16);
  assert.equal(a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[8].clips.length, 7);
  for (const voices of Object.values(a.window.CHIVALRY_CATALOG)) for (const groups of Object.values(voices)) {
    for (const commands of Object.values(groups)) for (const command of commands) {
      assert.ok(command.clips.length);
      for (const clip of command.clips) assert.ok(existsSync(resolve(root, clip.file)), clip.file);
    }
  }
});

test('selection and voice screens reuse each complete transparent character image', () => {
  const a = app();
  for (const faction of ['agatha', 'masons']) {
    a.route(`#${faction}`);
    const portraits = [...a.document.querySelectorAll('.class-card img.portrait')];
    assert.equal(portraits.length, 4);
    for (const [index, cls] of ['archer', 'man_at_arms', 'vanguard', 'knight'].entries()) {
      const source = portraits[index].getAttribute('src');
      const png = readFileSync(resolve(root, source));
      assert.equal(png.readUInt8(25), 6, 'Portrait must have an RGBA transparency channel');
      a.route(`#${faction}/${cls}`);
      assert.equal(a.document.querySelector('.identity-panel img.portrait').getAttribute('src'), source);
      assert.equal(a.document.querySelectorAll('svg.portrait').length, 0, 'Character artwork must not use a clipping viewport');
    }
  }
});

test('repeated and different commands overlap; volume and mute affect every active recording', async () => {
  const a = app('#agatha/vanguard');
  const selector = '[data-action="random"][data-id="personal-8"]';
  const files = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[8].clips.map(c => c.file);
  let last;
  for (let i = 0; i < 4; i++) {
    a.click(selector); await tick();
    assert.ok(files.includes(a.audio.src));
    assert.notEqual(a.audio.src, last);
    last = a.audio.src;
  }
  a.click('[data-action="random"][data-id="personal-0"]'); await tick();
  assert.equal(a.recordings.length, 5);
  assert.ok(a.recordings.every(audio => !audio.paused));
  assert.match(a.document.querySelector('[data-command="personal-8"] .playback-status').textContent, /4 playing/);
  assert.match(a.document.querySelector('[data-command="personal-0"] .playback-status').textContent, /Playing Version/);
  assert.equal(a.document.querySelector('.player'), null);
  a.input('#volume', '0.35'); assert.ok(a.recordings.every(audio => audio.volume === 0.35));
  a.click('#mute'); assert.ok(a.recordings.every(audio => audio.muted));
  a.click('[data-action="random"]'); await tick();
  assert.equal(a.audio.muted, true); assert.equal(a.audio.volume, 0.35);
  a.click('#mute'); assert.ok(a.recordings.every(audio => !audio.muted));
  a.click('[data-action="stop-all"]');
  assert.ok(a.recordings.every(audio => audio.paused && audio.released));
  assert.equal(a.document.querySelectorAll('.is-playing').length, 0);
  assert.equal(a.document.querySelector('#active-count').textContent, 'No voices playing');
});

test('three-dot picker plays exact versions, restores focus, and also supports battle cry', async () => {
  const a = app('#masons/knight');
  const trigger = '[data-action="versions"][data-id="personal-8"]';
  a.click(trigger); assert.equal(a.dialog.open, true);
  assert.equal(a.document.querySelector('#versions-title').textContent, 'Laugh');
  const command = a.window.CHIVALRY_CATALOG.masons.knight.personal[8];
  assert.equal(a.document.querySelectorAll('.version-option').length, command.clips.length + 1);
  a.click('[data-action="pick"][data-version="1"]'); await tick();
  assert.equal(a.audio.src, command.clips[1].file);
  assert.equal(a.dialog.open, true);
  a.click('[data-action="close-versions"]');
  assert.equal(a.dialog.open, false);
  assert.equal(a.focused, a.document.querySelector(trigger));
  a.click('[data-action="versions"][data-id="battlecry-0"]');
  assert.equal(a.document.querySelector('#versions-title').textContent, 'Battle cry');
  a.click('[data-version="0"]'); await tick();
  assert.equal(a.audio.src, a.window.CHIVALRY_CATALOG.masons.knight.battlecry[0].clips[0].file);
});

test('navigation and stop clean up audio; invalid routes recover safely; menu keyboard dismissal works', async () => {
  const a = app('#agatha/archer');
  a.click('[data-action="random"]'); await tick();
  a.click('[data-action="versions"]'); assert.equal(a.dialog.open, true);
  a.dialog.dispatchEvent(new a.window.Event('cancel', { cancelable: true })); assert.equal(a.dialog.open, false);
  a.route('#masons'); assert.equal(a.audio.paused, true); assert.equal(a.document.querySelector('.sound-controls').hidden, true);
  assert.equal(a.document.querySelectorAll('.class-card').length, 4);
  a.route('#masons/vanguard');
  a.click('[data-action="random"]'); await tick(); a.click('[data-action="stop-all"]'); assert.equal(a.document.querySelectorAll('.is-playing').length, 0);
  a.route('#toString/__proto__'); assert.equal(a.document.querySelectorAll('.faction-card').length, 2);
  a.route('#agatha/unknown'); assert.equal(a.document.querySelectorAll('.class-card').length, 4);
});

test('failed playback clears only its own state and allows playing again', async () => {
  const a = app('#agatha/vanguard');
  a.mediaOptions.rejectNext = true;
  a.click('[data-action="random"]'); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, false);
  assert.equal(a.document.querySelectorAll('.is-playing').length, 0);
  assert.ok(a.audio.released);
  a.click('[data-action="random"]'); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
  assert.equal(a.audio.paused, false);
});

test('custom versions survive reload, label their command, and stay scoped to the character', async () => {
  const storage = new Map();
  const a = app('#agatha/vanguard', storage);
  a.click('[data-action="versions"][data-id="personal-4"]');
  a.click('[data-action="pick"][data-version="2"]'); await tick();
  const row = a.document.querySelector('[data-command="personal-4"]');
  assert.equal(row.querySelector('.version-label').hidden, false);
  assert.equal(row.querySelector('.version-label').textContent, 'Version 3');
  const file = a.audio.src;
  a.click(row.querySelector('.command-play')); await tick();
  assert.equal(a.audio.src, file);
  const reloaded = app('#agatha/vanguard', storage);
  const savedRow = reloaded.document.querySelector('[data-command="personal-4"]');
  assert.equal(savedRow.querySelector('.version-label').textContent, 'Version 3');
  assert.match(savedRow.querySelector('.command-play').getAttribute('aria-label'), /Thanks, Version 3/);
  reloaded.click(savedRow.querySelector('.command-play')); await tick();
  assert.equal(reloaded.audio.src, file);
  reloaded.click('[data-action="versions"][data-id="personal-4"]');
  assert.equal(reloaded.document.querySelector('[data-version="2"]').getAttribute('aria-current'), 'true');
  reloaded.route('#masons/vanguard');
  assert.equal(reloaded.document.querySelector('[data-command="personal-4"] .version-label').hidden, true);
  reloaded.route('#agatha/archer');
  assert.equal(reloaded.document.querySelector('[data-command="personal-4"] .version-label').hidden, true);
  reloaded.route('#agatha/vanguard');
  assert.equal(reloaded.document.querySelector('[data-command="personal-4"] .version-label').textContent, 'Version 3');
});

test('Random version clears the saved preference, badge, and pinned playback after reload', async () => {
  const storage = new Map();
  const a = app('#masons/knight', storage);
  a.click('[data-action="versions"][data-id="battlecry-0"]');
  a.click('[data-action="pick"][data-version="1"]'); await tick();
  assert.equal(a.document.querySelector('.battlecry .version-label').textContent, 'Version 2');
  a.click('[data-action="versions"][data-id="battlecry-0"]');
  a.click('[data-version="random"]'); await tick();
  assert.equal(a.document.querySelector('.battlecry .version-label').hidden, true);
  assert.deepEqual(JSON.parse(storage.get('chivalry-command-versions')), {});
  const reloaded = app('#masons/knight', storage);
  assert.equal(reloaded.document.querySelector('.battlecry .version-label').hidden, true);
  reloaded.click('[data-action="versions"][data-id="battlecry-0"]');
  assert.equal(reloaded.document.querySelector('[data-version="random"]').getAttribute('aria-current'), 'true');
});

test('malformed, obsolete or blocked storage falls back safely; session choices still work', async () => {
  for (const value of ['invalid-json', 'null', '[]', '{"agatha/vanguard/personal-4":"missing.mp3"}']) {
    const a = app('#agatha/vanguard', new Map([['chivalry-command-versions', value]]));
    assert.equal(a.document.querySelector('[data-command="personal-4"] .version-label').hidden, true);
    a.click('[data-action="random"][data-id="personal-4"]'); await tick();
    assert.equal(a.audio.paused, false);
  }
  const denied = {get() { throw new Error('Storage disabled'); }, set() { throw new Error('Storage disabled'); }};
  const a = app('#agatha/vanguard', denied);
  a.click('[data-action="versions"][data-id="personal-4"]');
  a.click('[data-version="2"]'); await tick();
  assert.equal(a.document.querySelector('[data-command="personal-4"] .version-label').textContent, 'Version 3');
  const file = a.audio.src;
  a.click('[data-action="random"][data-id="personal-4"]'); await tick();
  assert.equal(a.audio.src, file);
});

test('temporary random feedback tracks remaining voices and disappears when the last one ends', async () => {
  const a = app('#agatha/vanguard');
  const command = '[data-action="random"][data-id="personal-8"]';
  const row = a.document.querySelector('[data-command="personal-8"]');
  a.click(command); await tick();
  const first = a.audio;
  const firstStatus = row.querySelector('.playback-status').textContent;
  assert.match(firstStatus, /^Playing Version \d+$/);
  assert.equal(row.querySelector('.version-label').hidden, true);
  assert.equal(row.querySelector('.equalizer').hidden, false);
  assert.equal(row.querySelector('.command-play').getAttribute('aria-describedby'), 'playback-personal-8');
  a.click(command); await tick();
  assert.match(row.querySelector('.playback-status').textContent, /2 playing/);
  a.audio.finish();
  assert.equal(first.paused, false);
  assert.equal(row.querySelector('.playback-status').textContent, firstStatus);
  first.finish();
  assert.equal(row.querySelector('.playback-feedback').hidden, true);
  assert.equal(row.querySelector('.playback-status').textContent, '');
  assert.equal(row.querySelector('.command-play').hasAttribute('aria-describedby'), false);
  assert.equal(row.classList.contains('is-playing'), false);
  assert.ok(a.recordings.every(audio => audio.released));
});

test('saved version badges survive completion and changes while earlier recordings keep playing', async () => {
  const a = app('#agatha/vanguard');
  const row = a.document.querySelector('[data-command="personal-4"]');
  a.click('[data-action="versions"][data-id="personal-4"]');
  a.click('[data-version="2"]'); await tick();
  const chosen = a.audio;
  chosen.finish();
  assert.equal(row.querySelector('.version-label').textContent, 'Version 3');
  assert.equal(row.querySelector('.version-label').hidden, false);
  assert.equal(row.querySelector('.playback-feedback').hidden, true);
  a.click('[data-action="random"][data-id="personal-4"]'); await tick();
  const pinned = a.audio;
  a.click('[data-action="versions"][data-id="personal-4"]');
  a.click('[data-version="random"]'); await tick();
  assert.equal(row.querySelector('.version-label').hidden, true);
  assert.equal(pinned.paused, false);
  assert.match(row.querySelector('.playback-status').textContent, /2 playing/);
});

test('three-dot menu can stop one of several instances without stopping the others or changing preferences', async () => {
  const storage = new Map();
  const a = app('#masons/knight', storage);
  a.click('[data-action="versions"][data-id="personal-8"]');
  a.click('[data-version="1"]'); await tick();
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
  a.click('[data-action="random"][data-id="personal-0"]'); await tick();
  a.click('[data-action="versions"][data-id="personal-8"]');
  assert.equal(a.document.querySelectorAll('.active-recording').length, 2);
  a.click('[data-action="stop-one"][data-playback="1"]');
  assert.equal(a.recordings[0].released, true);
  assert.ok(a.recordings.slice(1).every(audio => !audio.paused));
  assert.equal(a.document.querySelectorAll('.active-recording').length, 1);
  a.recordings[1].finish();
  assert.equal(a.document.querySelector('#active-recordings').hidden, true);
  assert.equal(a.audio.paused, false);
  assert.equal(a.document.querySelector('[data-command="personal-8"] .version-label').textContent, 'Version 2');
  assert.equal(Object.keys(JSON.parse(storage.get('chivalry-command-versions'))).length, 1);
});

test('pending playback, errors and late events cannot revive stopped voices or disturb other commands', async () => {
  const a = app('#agatha/vanguard');
  a.mediaOptions.deferNext = true;
  a.click('[data-action="random"][data-id="personal-8"]');
  const pending = a.audio;
  const row = a.document.querySelector('[data-command="personal-8"]');
  assert.match(row.querySelector('.playback-status').textContent, /Loading Version/);
  assert.equal(row.querySelector('.equalizer').hidden, true);
  a.click('[data-action="stop-all"]');
  a.click('[data-action="random"][data-id="personal-0"]'); await tick();
  pending.rejectPlay(new Error('late rejection')); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
  assert.equal(a.document.querySelectorAll('.is-playing').length, 1);
  assert.equal(a.audio.paused, false);
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
  a.audio.dispatchEvent(new a.window.Event('error'));
  assert.equal(row.querySelector('.playback-feedback').hidden, true);
  assert.equal(a.recordings[1].paused, false);
  a.window.dispatchEvent(new a.window.Event('pagehide'));
  assert.ok(a.recordings.every(audio => audio.released));
  assert.equal(a.document.querySelectorAll('.is-playing').length, 0);
});

test('picker stays open for auditioning and every variant independently reports overlapping playback', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-8"]');
  const first = a.document.querySelector('[data-version="0"]');
  const second = a.document.querySelector('[data-version="1"]');
  assert.equal(first.querySelector('.variant-feedback').hidden, true);
  a.click(first); await tick();
  const firstAudio = a.audio;
  assert.equal(a.dialog.open, true);
  assert.equal(first.querySelector('.equalizer').hidden, false);
  assert.equal(first.querySelector('.variant-state').textContent, 'Playing');
  a.click(second); await tick();
  assert.equal(a.dialog.open, true);
  assert.equal(first.classList.contains('is-playing'), true);
  assert.equal(second.classList.contains('is-playing'), true);
  assert.equal(first.hasAttribute('aria-current'), false);
  assert.equal(second.getAttribute('aria-current'), 'true');
  a.click(second); await tick();
  assert.equal(second.querySelector('.variant-state').textContent, '2 playing');
  firstAudio.finish();
  assert.equal(first.querySelector('.variant-feedback').hidden, true);
  assert.equal(first.classList.contains('is-playing'), false);
  assert.equal(second.classList.contains('is-playing'), true);
  assert.equal(a.dialog.open, true);
  a.click('[data-action="stop-all"]');
  assert.equal(a.dialog.open, true);
  assert.equal(second.querySelector('.variant-feedback').hidden, true);
  assert.equal(a.document.querySelector('[data-command="personal-8"] .version-label').textContent, 'Version 2');
});

test('dashboard stays usable with picker open, background is inert, and outside click restores focus', async () => {
  const a = app('#masons/knight');
  const trigger = '[data-action="versions"][data-id="battlecry-0"]';
  a.click(trigger);
  assert.equal(a.dialog.getAttribute('aria-modal'), 'false');
  assert.equal(a.document.querySelector('#picker-shade').hidden, false);
  assert.equal(a.document.querySelector('main').hasAttribute('inert'), true);
  assert.equal(a.document.querySelector('.sound-controls').closest('[inert]'), null);
  a.click('[data-version="0"]'); await tick();
  a.input('#volume', '0.25'); assert.equal(a.audio.volume, 0.25);
  a.click('#mute'); assert.equal(a.audio.muted, true);
  assert.equal(a.dialog.open, true);
  a.click('[data-action="stop-all"]'); assert.equal(a.audio.paused, true);
  assert.equal(a.dialog.open, true);
  a.click('#picker-shade');
  assert.equal(a.dialog.open, false);
  assert.equal(a.document.querySelector('#picker-shade').hidden, true);
  assert.equal(a.document.querySelector('main').hasAttribute('inert'), false);
  assert.equal(a.focused, a.document.querySelector(trigger));
});

test('keyboard focus cycles through both the picker and dashboard; Escape closes without stopping voices', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-8"]');
  a.click('[data-version="0"]'); await tick();
  const tab = shift => {
    const event = new a.window.Event('keydown', {bubbles: true, cancelable: true});
    Object.assign(event, {key: 'Tab', shiftKey: shift});
    a.document.dispatchEvent(event);
  };
  const buttons = [...a.dialog.querySelectorAll('button:not([disabled])')];
  buttons.at(-1).focus(); tab(false);
  assert.equal(a.focused, a.document.querySelector('#mute'));
  a.document.querySelector('[data-action="stop-all"]').focus(); tab(false);
  assert.equal(a.focused, a.document.querySelector('[data-action="close-versions"]'));
  tab(true);
  assert.equal(a.focused, a.document.querySelector('[data-action="stop-all"]'));
  const escape = new a.window.Event('keydown', {bubbles: true});
  escape.key = 'Escape'; a.document.dispatchEvent(escape);
  assert.equal(a.dialog.open, false);
  assert.equal(a.audio.paused, false);
});

test('loading and failed variant auditions update feedback without dismissing the picker', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-8"]');
  a.mediaOptions.deferNext = true;
  a.click('[data-version="0"]');
  const option = a.document.querySelector('[data-version="0"]');
  assert.equal(option.querySelector('.variant-state').textContent, 'Loading');
  assert.equal(option.querySelector('.equalizer').hidden, true);
  a.audio.rejectPlay(new Error('cannot play')); await tick();
  assert.equal(a.dialog.open, true);
  assert.equal(option.querySelector('.variant-feedback').hidden, true);
  assert.equal(a.document.querySelector('.audio-error').hidden, false);
  a.click(option); await tick();
  assert.equal(option.querySelector('.equalizer').hidden, false);
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
});
