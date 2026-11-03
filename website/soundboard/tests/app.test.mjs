import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseHTML } = await import(process.env.DOM_TEST_HELPER || 'linkedom');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

function app(hash = '', storage = new Map(), features = {}) {
  const { window } = parseHTML(read('index.html'));
  const { document, Event } = window;
  const location = { hash, pathname: '/index.html', search: '', protocol: features.request ? 'https:' : 'file:', href: features.request ? 'https://example.test/index.html' : 'file:///tmp/index.html' };
  const metrics = {measurements: 0, barHeight: 60, observedResize: null, requests: [], localProbes: []};
  const fetch = (file, options) => {
    metrics.requests.push({file, options});
    return features.request(file, options);
  };
  document.querySelector('.sound-controls').getBoundingClientRect = () => {
    metrics.measurements++;
    return {height: metrics.barHeight};
  };
  const ResizeObserver = features.resizeObserver ? class {
    constructor(callback) { metrics.observedResize = callback; }
    observe() {}
  } : undefined;

  window.scrollTo = () => {};
  let focused = null;
  window.HTMLElement.prototype.focus = function () { focused = this; };
  window.HTMLElement.prototype.setCustomValidity = function (message) { this.validationMessage = message; };
  window.HTMLElement.prototype.reportValidity = function () { const input = this.querySelector('[name="nickname"]'); return !!input.value.trim() && !input.validationMessage; };
  Object.defineProperty(document, 'activeElement', {get: () => focused});
  const dialog = document.querySelector('#versions');
  for (const popup of document.querySelectorAll('dialog')) {
    Object.defineProperty(popup, 'open', {get() {return this.hasAttribute('open');}});
    popup.showModal = () => {throw new Error('A modal picker would block the dashboard');};
    popup.show = () => popup.setAttribute('open', '');
    popup.close = () => popup.removeAttribute('open');
  }
  const recordings = [];
  const mediaOptions = {};
  function MockAudio() {
    const audio = document.createElement('audio');
    Object.assign(audio, { paused: true, currentTime: 0, duration: NaN, volume: 0.8, muted: false });
    Object.defineProperty(audio, 'src', {get: () => audio.getAttribute('src') || '', set: value => audio.setAttribute('src', value)});
    audio.pause = () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); };
    audio.load = () => {
      if (audio.src && audio.preload === 'metadata') {
        const file = audio.src;
        metrics.localProbes.push(audio);
        Promise.resolve().then(() => {
          const exists = features.localFiles ? features.localFiles(file) : true;
          audio.dispatchEvent(new Event(exists ? 'loadedmetadata' : 'error'));
        });
      } else {
        audio.released = true; audio.currentTime = 0; audio.duration = NaN;
      }
    };
    audio.finish = () => { audio.paused = true; audio.dispatchEvent(new Event('ended')); };
    const playing = () => { audio.paused = false; audio.dispatchEvent(new Event('playing')); };
    audio.play = () => {
      if (!recordings.includes(audio)) recordings.push(audio);
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
    return audio;
  }
  const context = vm.createContext({ window, document, URL, TextEncoder, atob, btoa, location, fetch, AbortController, setTimeout, clearTimeout, Audio: MockAudio, ResizeObserver, history: { replaceState(_, __, url) { location.hash = url.includes('#') ? '#' + url.split('#')[1] : ''; } }, localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}, console });
  vm.runInContext(read('soundboard/catalog.js'), context);
  vm.runInContext(read('soundboard/playback.js'), context);
  vm.runInContext(read('soundboard/availability.js'), context);
  for (const file of ['message-codec.js', 'vendor/qrcode.js', 'voice-share.js', 'app.js']) vm.runInContext(read('soundboard/' + file), context);
  return {
    window, document, dialog, recordings, mediaOptions, metrics,
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

test('both factions and all four classes have 20 commands plus both battle cries; shared bitmap sheets exist', () => {
  const a = app();
  assert.equal(a.document.querySelectorAll('.faction-card').length, 2);
  for (const faction of ['agatha', 'masons']) {
    a.route(`#${faction}`);
    assert.equal(a.document.querySelectorAll('.class-card').length, 4);
    for (const cls of ['archer', 'man_at_arms', 'vanguard', 'knight']) {
      a.route(`#${faction}/${cls}`);
      assert.equal(a.document.querySelectorAll('.command-panel').length, 2);
      assert.equal(a.document.querySelectorAll('[data-action="random"]').length, 22);
      assert.equal(a.document.querySelectorAll('.version-trigger').length, 22);
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
      for (const clip of command.clips) {
        assert.ok(clip.file.startsWith('audio/'), clip.file);
        assert.ok(!clip.file.split('/').includes('..'), clip.file);
      }
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
      const bitmap = readFileSync(resolve(root, source));
      assert.equal(bitmap.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bitmap.toString('ascii', 8, 12), 'WEBP');
      assert.ok(bitmap.includes(Buffer.from('ALPH')), 'Portrait must retain its transparency channel');
      assert.match(portraits[index].getAttribute('srcset'), /384w.*640w.*1024w/);
      assert.equal(portraits[index].getAttribute('decoding'), 'async');
      for (const candidate of portraits[index].getAttribute('srcset').split(',')) {
        assert.ok(existsSync(resolve(root, candidate.trim().split(' ')[0])));
      }
      a.route(`#${faction}/${cls}`);
      assert.equal(a.document.querySelector('.identity-panel img.portrait').getAttribute('src'), source);
      assert.match(a.document.querySelector('.identity-panel img.portrait').getAttribute('sizes'), /55px/);
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
  a.click(trigger); await tick(); assert.equal(a.dialog.open, true);
  assert.equal(a.document.querySelector('#versions-title').textContent, 'Laugh');
  const command = a.window.CHIVALRY_CATALOG.masons.knight.personal[8];
  assert.equal(a.document.querySelectorAll('.version-option').length, command.clips.length + 1);
  a.click('[data-action="pick"][data-version="1"]'); await tick();
  assert.equal(a.audio.src, command.clips[1].file);
  assert.equal(a.dialog.open, true);
  a.click('[data-action="close-versions"]');
  assert.equal(a.dialog.open, false);
  assert.equal(a.focused, a.document.querySelector(trigger));
  a.click('[data-action="versions"][data-id="battlecry-0"]'); await tick();
  assert.equal(a.document.querySelector('#versions-title').textContent, 'Battle cry (animated)');
  a.click('[data-version="0"]'); await tick();
  assert.equal(a.audio.src, a.window.CHIVALRY_CATALOG.masons.knight.battlecry[0].clips[0].file);
});

test('navigation and stop clean up audio; invalid routes recover safely; menu keyboard dismissal works', async () => {
  const a = app('#agatha/archer');
  a.click('[data-action="random"]'); await tick();
  a.click('[data-action="versions"]'); await tick(); assert.equal(a.dialog.open, true);
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
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
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
  reloaded.click('[data-action="versions"][data-id="personal-4"]'); await tick();
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
  a.click('[data-action="versions"][data-id="battlecry-0"]'); await tick();
  a.click('[data-action="pick"][data-version="1"]'); await tick();
  assert.equal(a.document.querySelector('.battlecry .version-label').textContent, 'Version 2');
  a.click('[data-action="versions"][data-id="battlecry-0"]'); await tick();
  a.click('[data-version="random"]'); await tick();
  assert.equal(a.document.querySelector('.battlecry .version-label').hidden, true);
  assert.deepEqual(JSON.parse(storage.get('chivalry-command-versions')), {});
  const reloaded = app('#masons/knight', storage);
  assert.equal(reloaded.document.querySelector('.battlecry .version-label').hidden, true);
  reloaded.click('[data-action="versions"][data-id="battlecry-0"]'); await tick();
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
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
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

test('saved badges survive completion and selecting Random replaces the earlier preview', async () => {
  const a = app('#agatha/vanguard');
  const row = a.document.querySelector('[data-command="personal-4"]');
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
  a.click('[data-version="2"]'); await tick();
  const chosen = a.audio;
  chosen.finish();
  assert.equal(row.querySelector('.version-label').textContent, 'Version 3');
  assert.equal(row.querySelector('.version-label').hidden, false);
  assert.equal(row.querySelector('.playback-feedback').hidden, true);
  a.click('[data-action="random"][data-id="personal-4"]'); await tick();
  const pinned = a.audio;
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
  a.click('[data-version="random"]'); await tick();
  assert.equal(row.querySelector('.version-label').hidden, true);
  assert.equal(pinned.paused, true);
  assert.equal(pinned.released, true);
  assert.match(row.querySelector('.playback-status').textContent, /^Playing Version/);
});

test('variant auditions keep the dialog structure stable with only an inline equalizer', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  const option = a.document.querySelector('[data-version="0"]');
  const rowCount = a.document.querySelectorAll('.version-option').length;
  const childCount = a.dialog.querySelectorAll('*').length;
  const indicator = option.querySelector('.variant-indicator');
  assert.equal(indicator.parentElement.firstElementChild, indicator);
  assert.equal(indicator.nextElementSibling.textContent, 'Version 1');
  assert.equal(option.querySelector('.variant-state').classList.contains('sr-only'), true);
  a.click(option); await tick();
  const first = a.audio;
  a.click(option); await tick();
  assert.equal(a.dialog.open, true);
  assert.equal(option.querySelector('.equalizer').hidden, false);
  assert.equal(a.document.querySelectorAll('.version-option').length, rowCount);
  assert.equal(a.dialog.querySelectorAll('*').length, childCount);
  assert.equal(a.document.querySelector('#active-recordings'), null);
  assert.equal(a.dialog.querySelector('[data-action="stop-one"]'), null);
  first.finish(); a.audio.finish();
  assert.equal(option.querySelector('.equalizer').hidden, true);
  assert.equal(a.dialog.querySelectorAll('*').length, childCount);
});

test('pending playback, errors and late events cannot revive stopped voices or disturb other commands', async () => {
  const a = app('#agatha/vanguard');
  a.mediaOptions.deferNext = true;
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
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

test('picker stays open while variant previews replace each other, including repeated selections', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  const first = a.document.querySelector('[data-version="0"]');
  const second = a.document.querySelector('[data-version="1"]');
  assert.equal(first.querySelector('.equalizer').hidden, true);
  a.click(first); await tick();
  const firstAudio = a.audio;
  assert.equal(a.dialog.open, true);
  assert.equal(first.querySelector('.equalizer').hidden, false);
  assert.equal(first.querySelector('.variant-state').textContent, 'Playing');
  a.click(second); await tick();
  assert.equal(a.dialog.open, true);
  assert.equal(first.classList.contains('is-playing'), false);
  assert.equal(firstAudio.paused, true);
  assert.equal(firstAudio.released, true);
  assert.equal(second.classList.contains('is-playing'), true);
  assert.equal(first.hasAttribute('aria-current'), false);
  assert.equal(second.getAttribute('aria-current'), 'true');
  const previousSecond = a.audio;
  a.click(second); await tick();
  assert.equal(previousSecond.released, true);
  assert.equal(second.querySelector('.variant-state').textContent, 'Playing');
  assert.equal(a.recordings.filter(audio => !audio.paused).length, 1);
  firstAudio.finish();
  assert.equal(first.querySelector('.equalizer').hidden, true);
  assert.equal(first.classList.contains('is-playing'), false);
  assert.equal(second.classList.contains('is-playing'), true);
  assert.equal(a.dialog.open, true);
  a.click('[data-action="stop-all"]');
  assert.equal(a.dialog.open, true);
  assert.equal(second.querySelector('.equalizer').hidden, true);
  assert.equal(a.document.querySelector('[data-command="personal-8"] .version-label').textContent, 'Version 2');
});

test('dashboard stays usable with picker open, background is inert, and outside click restores focus', async () => {
  const a = app('#masons/knight');
  const trigger = '[data-action="versions"][data-id="battlecry-0"]';
  a.click(trigger); await tick();
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
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  a.click('[data-version="0"]'); await tick();
  const tab = shift => {
    const event = new a.window.Event('keydown', {bubbles: true, cancelable: true});
    Object.assign(event, {key: 'Tab', shiftKey: shift});
    a.document.dispatchEvent(event);
  };
  const buttons = [...a.dialog.querySelectorAll('button:not([disabled])')].filter(button => !button.closest('[hidden]'));
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
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  a.mediaOptions.deferNext = true;
  a.click('[data-version="0"]');
  const option = a.document.querySelector('[data-version="0"]');
  assert.equal(option.querySelector('.variant-state').textContent, 'Loading');
  assert.equal(option.querySelector('.equalizer').hidden, true);
  a.audio.rejectPlay(new Error('cannot play')); await tick();
  assert.equal(a.dialog.open, true);
  assert.equal(option.querySelector('.equalizer').hidden, true);
  assert.equal(a.document.querySelector('.audio-error').hidden, false);
  a.click(option); await tick();
  assert.equal(option.querySelector('.equalizer').hidden, false);
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
});


test('viewport-height changes avoid layout measurements; only changed toolbar height updates clearance', async () => {
  const a = app('#agatha/vanguard', new Map(), {resizeObserver: true});
  for (let i = 0; i < 10; i++) a.window.dispatchEvent(new a.window.Event('resize'));
  assert.equal(a.metrics.measurements, 0);
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  assert.equal(a.metrics.measurements, 1);
  const clearance = a.document.documentElement.style.getPropertyValue('--controls-clearance');
  a.metrics.observedResize();
  a.metrics.observedResize();
  assert.equal(a.document.documentElement.style.getPropertyValue('--controls-clearance'), clearance);
  a.metrics.barHeight = 96;
  a.metrics.observedResize();
  assert.match(a.document.documentElement.style.getPropertyValue('--controls-clearance'), /128px/);
});


test('picker previews stop existing mixed voices and pending previews; main buttons can still overlap afterward', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="random"][data-id="personal-0"]');
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
  const mixed = [...a.recordings];
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
  a.mediaOptions.deferNext = true;
  a.click('[data-version="0"]');
  const pending = a.audio;
  assert.ok(mixed.every(audio => audio.paused && audio.released));
  a.click('[data-version="1"]'); await tick();
  assert.equal(pending.released, true);
  assert.equal(a.recordings.filter(audio => !audio.paused).length, 1);
  pending.rejectPlay(new Error('Interrupted preview')); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
  assert.equal(a.audio.paused, false);
  a.click('[data-action="close-versions"]');
  a.click('[data-action="random"][data-id="personal-4"]');
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
  assert.equal(a.recordings.filter(audio => !audio.paused).length, 3);
});

test('saved favorites from the old faction paths migrate to the new audio folder', async () => {
  const catalog = app('#agatha/vanguard').window.CHIVALRY_CATALOG;
  const file = catalog.agatha.vanguard.personal[4].clips[2].file;
  assert.ok(file.startsWith('audio/agatha/'));
  const storage = new Map([['chivalry-command-versions', JSON.stringify({
    'agatha/vanguard/personal-4': file.slice('audio/'.length),
  })]]);
  const a = app('#agatha/vanguard', storage);
  assert.equal(a.document.querySelector('[data-command="personal-4"] .version-label').textContent, 'Version 3');
  a.click('[data-action="random"][data-id="personal-4"]'); await tick();
  assert.equal(a.audio.src, file);
  assert.equal(JSON.parse(storage.get('chivalry-command-versions'))['agatha/vanguard/personal-4'], file);
});

test('every categorized recording and battle cry is available in the soundboard', () => {
  const a = app();
  const catalog = a.window.CHIVALRY_CATALOG;
  const manifest = JSON.parse(read('taunts.json'));
  for (const record of manifest.files) {
    const groups = catalog[record.faction][record.class];
    const commands = Object.values(groups).flat();
    for (const [category, file] of Object.entries(record.category_files)) {
      if (category === 'Other') continue;
      const label = category === 'Objective' ? 'Go for the Objective' : category;
      const command = commands.find(c => c.name === label);
      assert.ok(command, `${record.faction}/${record.class}/${label}`);
      assert.ok(command.clips.some(clip => clip.file === file), `Missing ${file}`);
    }
    if (record.voice_types.includes('Battle cry')) {
      assert.ok(groups.battlecry.some(command => command.clips.some(clip => clip.file === record.file)), `Missing battle cry ${record.file}`);
    }
  }
  for (const classes of Object.values(catalog)) for (const groups of Object.values(classes)) {
    for (const commands of Object.values(groups)) for (const command of commands) {
      assert.equal(new Set(command.clips.map(clip => clip.file)).size, command.clips.length);
    }
  }
});

test('Agatha Knight objective picker exposes and plays every remaining objective recording', async () => {
  const a = app('#agatha/knight');
  const command = a.window.CHIVALRY_CATALOG.agatha.knight.tactical[4];
  const expected = JSON.parse(read('taunts.json')).files
    .filter(record => record.faction === 'agatha' && record.class === 'knight')
    .map(record => record.category_files.Objective).filter(Boolean);
  assert.ok(expected.length > 1);
  assert.deepEqual(Array.from(command.clips, clip => clip.file).sort(), expected.sort());
  a.click('[data-action="versions"][data-id="tactical-4"]'); await tick();
  assert.equal(a.document.querySelectorAll('.version-option').length, expected.length + 1);
  const last = command.clips.length - 1;
  a.click(`[data-version="${last}"]`); await tick();
  assert.equal(a.audio.src, command.clips[last].file);
  assert.equal(a.dialog.open, true);
  assert.equal(a.document.querySelector('[data-command="tactical-4"] .version-label').textContent, `Version ${last + 1}`);
});

const audioResponse = (status = 200, type = 'audio/mpeg') => new Response(null, {status, headers: {'Content-Type': type}});

test('HTTP picker intersects existing audio with the catalog, preserves version numbers, and caches checks', async () => {
  const missing = new Set();
  const a = app('#agatha/vanguard', new Map(), {request: async file => audioResponse(missing.has(file) ? 404 : 200)});
  const command = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[8];
  missing.add(command.clips[0].file);
  missing.add(command.clips[2].file);
  a.click('[data-action="versions"][data-id="personal-8"]');
  assert.equal(a.dialog.open, true);
  assert.equal(a.document.querySelectorAll('.version-option').length, 0, 'No unverified variants shown while loading');
  await tick();
  assert.equal(a.document.querySelectorAll('.version-option').length, command.clips.length - 2 + 1);
  assert.equal(a.document.querySelector('[data-version="0"]'), null);
  assert.equal(a.document.querySelector('[data-version="2"]'), null);
  assert.match(a.document.querySelector('[data-version="1"]').textContent, /Version 2/);
  a.click('[data-version="1"]'); await tick();
  assert.equal(a.audio.src, command.clips[1].file);
  for (let i = 0; i < 12; i++) {
    a.click('[data-version="random"]'); await tick();
    assert.ok(!missing.has(a.audio.src));
  }
  a.click('[data-action="close-versions"]');
  a.click('[data-action="versions"][data-id="personal-8"]');
  assert.equal(a.metrics.requests.length, command.clips.length);
  assert.ok(a.metrics.requests.every(({file, options}) => command.clips.some(clip => clip.file === file) && options.method === 'HEAD' && options.cache === 'no-store'));
});

test('main playback checks availability and falls back from a missing saved take without deleting the preference', async () => {
  const command = app().window.CHIVALRY_CATALOG.agatha.vanguard.personal[8];
  const preferred = command.clips[0].file;
  const storage = new Map([['chivalry-command-versions', JSON.stringify({'agatha/vanguard/personal-8': preferred})]]);
  const a = app('#agatha/vanguard', storage, {request: async file => audioResponse(file === preferred ? 404 : 200)});
  a.click('[data-action="random"][data-id="personal-8"]'); await tick();
  assert.ok(command.clips.some(clip => clip.file === a.audio.src));
  assert.notEqual(a.audio.src, preferred);
  assert.equal(a.document.querySelector('[data-command="personal-8"] .version-label').hidden, true);
  assert.equal(JSON.parse(storage.get('chivalry-command-versions'))['agatha/vanguard/personal-8'], preferred);
});

test('missing files and HTML fallback pages produce an empty picker with no playback option', async () => {
  let count = 0;
  const a = app('#agatha/vanguard', new Map(), {request: async () => ++count % 2 ? audioResponse(404) : audioResponse(200, 'text/html')});
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  assert.equal(a.document.querySelectorAll('.version-option').length, 0);
  assert.match(a.document.querySelector('#version-list').textContent, /No recordings are available/);
  assert.equal(a.document.querySelector('[data-action="random"][data-id="personal-8"]').disabled, true);
  assert.equal(a.recordings.length, 0);
});

test('availability errors are retryable and hosts without HEAD support use a cancelled ranged GET', async () => {
  let fail = true;
  let cancelled = 0;
  const a = app('#agatha/vanguard', new Map(), {request: async (_, options) => {
    if (fail) return audioResponse(503);
    if (options.method === 'HEAD') return audioResponse(405);
    assert.equal(options.headers.Range, 'bytes=0-0');
    return {ok: true, status: 206, headers: new Headers({'Content-Type': 'audio/mpeg'}), body: {cancel: async () => cancelled++}};
  }});
  a.click('[data-action="versions"][data-id="personal-8"]'); await tick();
  assert.match(a.document.querySelector('#version-list').textContent, /Unable to check/);
  assert.equal(a.recordings.length, 0);
  fail = false;
  a.click('[data-action="retry-versions"]'); await tick();
  const command = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[8];
  assert.equal(cancelled, command.clips.length);
  assert.equal(a.document.querySelectorAll('.version-option').length, command.clips.length + 1);
});

test('availability requests are bounded and late results cannot reopen a picker or play after Stop all/navigation', async () => {
  const waiting = [];
  let active = 0, maximum = 0;
  const a = app('#agatha/knight', new Map(), {request: () => new Promise(resolve => {
    active++;
    maximum = Math.max(maximum, active);
    waiting.push(() => { active--; resolve(audioResponse()); });
  })});
  a.click('[data-action="versions"][data-id="tactical-4"]');
  a.click('[data-action="close-versions"]');
  a.click('[data-action="random"][data-id="tactical-4"]');
  assert.equal(a.document.querySelector('[data-action="stop-all"]').disabled, false);
  assert.match(a.document.querySelector('#active-count').textContent, /checking/);
  a.click('[data-action="stop-all"]');
  a.route('#masons');
  while (waiting.length) {
    waiting.splice(0).forEach(resolve => resolve());
    await tick();
  }
  assert.equal(maximum, 6);
  assert.equal(a.metrics.requests.length, a.window.CHIVALRY_CATALOG.agatha.knight.tactical[4].clips.length);
  assert.equal(a.dialog.open, false);
  assert.equal(a.document.querySelector('#version-list').textContent, '');
  assert.equal(a.recordings.length, 0);
});

test('file:// Yes picker excludes moved recordings and silently releases metadata probes', async () => {
  const a = app('#agatha/vanguard', new Map(), {localFiles: file => file.endsWith('/snook_yes_01.mp3')});
  const command = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[0];
  assert.equal(command.clips.length, 15);
  a.click('[data-action="versions"][data-id="personal-0"]');
  assert.equal(a.document.querySelectorAll('[data-action="pick"]').length, 0);
  await tick();
  assert.equal(a.document.querySelectorAll('[data-action="pick"]').length, 2, 'One numbered variant plus Random');
  assert.equal(a.document.querySelector('[data-version="1"]'), null);
  assert.match(a.document.querySelector('[data-version="0"]').textContent, /Version 1/);
  assert.equal(a.metrics.localProbes.length, 15);
  assert.equal(a.metrics.requests.length, 0, 'Local files must not use fetch');
  assert.equal(a.recordings.length, 0, 'Existence checks must never play audio');
  assert.ok(a.metrics.localProbes.every(audio => audio.released && !audio.src));
  a.click('[data-version="random"]'); await tick();
  assert.equal(a.audio.src, command.clips[0].file);
  a.click('[data-action="close-versions"]');
  a.click('[data-action="versions"][data-id="personal-0"]');
  assert.equal(a.metrics.localProbes.length, 15, 'Reuse availability results within the page session');
});

test('file:// picker matches catalogued files present in the actual project directory', async () => {
  const a = app('#agatha/vanguard', new Map(), {localFiles: file => existsSync(resolve(root, file))});
  const command = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[0];
  const expected = command.clips.flatMap((clip, i) => existsSync(resolve(root, clip.file)) ? [String(i)] : []);
  a.click('[data-action="versions"][data-id="personal-0"]'); await tick();
  const shown = [...a.document.querySelectorAll('[data-action="pick"]')]
    .map(option => option.dataset.version).filter(version => version !== 'random');
  assert.deepEqual(shown, Array.from(expected));
  assert.equal(a.recordings.length, 0);
});

test('every voice has separate animated and running battle cry controls and recordings', async () => {
  const a = app();
  const manifest = JSON.parse(read('taunts.json'));
  for (const faction of ['agatha', 'masons']) for (const cls of ['archer', 'man_at_arms', 'vanguard', 'knight']) {
    a.route(`#${faction}/${cls}`);
    const commands = a.window.CHIVALRY_CATALOG[faction][cls].battlecry;
    assert.equal(commands.length, 2);
    for (const [i, variant] of ['animated', 'running'].entries()) {
      const command = commands[i];
      assert.equal(command.name, `Battle cry (${variant})`);
      const column = a.document.querySelector(`[data-command="battlecry-${i}"]`).closest('.message-column');
      assert.ok(column.querySelector(i === 0 ? '#personal-title' : '#tactical-title'), 'Battle cry must follow its corresponding message panel');
      assert.equal(column.lastElementChild.dataset.command, `battlecry-${i}`);
      assert.ok(command.clips.length);
      const categoryPaths = new Set(manifest.files.filter(record => record.faction === faction && record.class === cls)
        .map(record => record.category_files[command.name]).filter(Boolean));
      assert.ok(command.clips.every(clip => categoryPaths.has(clip.file)), 'Every battle cry must belong to the matching metadata category, including relocated files');
      a.click(`[data-action="versions"][data-id="battlecry-${i}"]`); await tick();
      a.click('[data-version="0"]'); await tick();
      assert.equal(a.audio.src, command.clips[0].file);
      a.click('[data-action="close-versions"]');
    }
  }
});

test('old battle cry favorites migrate to their new paths and the corresponding command', async () => {
  const catalog = app().window.CHIVALRY_CATALOG;
  for (const [slot, variant] of ['animated', 'running'].entries()) {
    const file = catalog.agatha.vanguard.battlecry[slot].clips[0].file;
    const oldFile = file.replace(`/battlecry/${variant}/`, '/other/');
    const storage = new Map([['chivalry-command-versions', JSON.stringify({'agatha/vanguard/battlecry-0': oldFile})]]);
    const a = app('#agatha/vanguard', storage);
    const preferences = JSON.parse(storage.get('chivalry-command-versions'));
    assert.equal(preferences[`agatha/vanguard/battlecry-${slot}`], file);
    if (slot === 1) assert.equal(preferences['agatha/vanguard/battlecry-0'], undefined);
    a.click(`[data-action="random"][data-id="battlecry-${slot}"]`); await tick();
    assert.equal(a.audio.src, file);
  }
});

test('sharing an exact take requires a nickname and creates a compact link plus a local QR code', async () => {
  const a = app('#agatha/knight');
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
  const section = a.document.querySelector('#voice-share');
  assert.equal(section.querySelector('.share-open').disabled, true);
  a.click('[data-version="1"]'); await tick();
  a.click('.share-open');
  const form = a.document.querySelector('.share-form');
  const nickname = form.querySelector('input');
  const submit = () => form.dispatchEvent(new a.window.Event('submit', {cancelable: true}));
  nickname.value = '   '; submit();
  assert.equal(a.document.querySelector('.share-result').hidden, true);
  nickname.value = 'Žižka ⚔'; nickname.dispatchEvent(new a.window.Event('input'));
  form.querySelector('textarea').value = ''; submit();
  assert.equal(a.document.querySelector('.share-result').hidden, false);
  const url = new URL(a.document.querySelector('.share-link').value);
  assert.equal(url.pathname, '/message.html');
  assert.equal(url.hostname, 'chivalry.firzen.net');
  const payload = JSON.parse(Buffer.from(url.searchParams.get('data'), 'base64url').toString());
  assert.equal(payload.f, 'a'); assert.equal(payload.c, 'k'); assert.equal(payload.n, 'Žižka ⚔'); assert.equal(payload.m, '');
  const expanded = a.window.ChivalryMessageCodec.expand(payload);
  assert.equal(expanded.voice_variant, a.window.CHIVALRY_CATALOG.agatha.knight.personal[4].clips[1].file);
  assert.equal(a.document.querySelector('.share-visit').href, url.href);
  assert.ok(a.document.querySelector('.share-qr path').getAttribute('d').length > 100);
  a.click('#share-result-dialog .share-close');
  a.click('[data-version="2"]'); await tick();
  assert.equal(form.hidden, true);
  assert.equal(a.document.querySelector('.share-result').hidden, true);
  assert.match(section.querySelector('.share-open').title, /Version 3/);
});

test('sharing a random audition freezes the last actual version and uses the current server URL', async () => {
  const a = app('#masons/vanguard', new Map(), {request: async () => audioResponse()});
  a.click('[data-action="versions"][data-id="battlecry-1"]'); await tick();
  a.click('[data-version="random"]'); await tick();
  const played = a.audio.src;
  a.click('.share-open');
  const form = a.document.querySelector('.share-form');
  form.querySelector('input').value = 'Firzen';
  form.querySelector('textarea').value = 'See you on the battlefield!';
  form.dispatchEvent(new a.window.Event('submit', {cancelable: true}));
  const url = new URL(a.document.querySelector('.share-link').value);
  assert.equal(url.hostname, 'example.test');
  const payload = JSON.parse(Buffer.from(url.searchParams.get('data'), 'base64url').toString());
  assert.ok(payload.v.startsWith('br/'));
  assert.equal(a.window.ChivalryMessageCodec.expand(payload).voice_variant, played);
});

test('sharing uses separate form/result dialogs with editing, dismissal, and navigation cleanup', async () => {
  const a = app('#agatha/vanguard');
  a.click('[data-action="versions"][data-id="personal-4"]'); await tick();
  a.click('[data-version="0"]'); await tick();
  a.click('.share-open');
  const formDialog = a.document.querySelector('#share-form-dialog');
  const resultDialog = a.document.querySelector('#share-result-dialog');
  const form = formDialog.querySelector('form');
  assert.equal(formDialog.open, true);
  assert.equal(a.dialog.hidden, true);
  assert.equal(a.focused, form.querySelector('input'));
  form.querySelector('input').value = 'Firzen';
  form.querySelector('textarea').value = 'For Agatha!';
  form.dispatchEvent(new a.window.Event('submit', {cancelable: true}));
  assert.equal(formDialog.open, false);
  assert.equal(resultDialog.open, true);
  assert.equal(a.focused, resultDialog.querySelector('.share-copy'));
  a.click('.share-edit');
  assert.equal(formDialog.open, true);
  assert.equal(resultDialog.open, false);
  assert.equal(form.querySelector('textarea').value, 'For Agatha!');
  const escape = new a.window.Event('keydown', {bubbles: true, cancelable: true});
  escape.key = 'Escape'; a.document.dispatchEvent(escape);
  assert.equal(formDialog.open, false);
  assert.equal(a.dialog.open, true);
  assert.equal(a.dialog.hidden, false);
  assert.equal(a.focused, a.document.querySelector('.share-open'));
  a.click('.share-open');
  a.click('#picker-shade');
  assert.equal(formDialog.open, false);
  assert.equal(a.dialog.open, true);
  a.click('.share-open');
  a.route('#masons');
  assert.equal(formDialog.open, false);
  assert.equal(resultDialog.open, false);
  assert.equal(a.dialog.open, false);
});
