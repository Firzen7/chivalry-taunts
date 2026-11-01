import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseHTML } = await import(process.env.DOM_TEST_HELPER || 'linkedom');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

function app(hash = '') {
  const { window } = parseHTML(read('soundboard.html'));
  const { document, Event } = window;
  const location = { hash, pathname: '/soundboard.html', search: '' };
  window.scrollTo = () => {};
  let focused = null;
  window.HTMLElement.prototype.focus = function () { focused = this; };
  const dialog = document.querySelector('dialog');
  Object.defineProperty(dialog, 'open', { get() { return this.hasAttribute('open'); } });
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
  const audio = document.querySelector('audio');
  Object.assign(audio, { paused: true, currentTime: 0, duration: NaN, volume: 0.8, muted: false });
  audio.pause = () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); };
  audio.load = () => { audio.currentTime = 0; audio.duration = NaN; audio.dispatchEvent(new Event('emptied')); };
  audio.play = () => {
    if (audio.rejectNext) { audio.rejectNext = false; return Promise.reject(new Error('Media unavailable')); }
    audio.paused = false;
    audio.duration = 4;
    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('loadedmetadata'));
    return Promise.resolve();
  };
  const context = vm.createContext({ window, document, location, history: { replaceState(_, __, url) { location.hash = url.includes('#') ? '#' + url.split('#')[1] : ''; } }, localStorage: {getItem: () => null, setItem() {}}, console });
  vm.runInContext(read('soundboard/catalog.js'), context);
  vm.runInContext(read('soundboard/app.js'), context);
  return {
    window, document, audio, dialog,
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
      for (const image of a.document.querySelectorAll('image')) assert.ok(existsSync(resolve(root, image.getAttribute('href'))));
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

test('command clicks select valid recordings without immediate repetition; player pauses and resumes', async () => {
  const a = app('#agatha/vanguard');
  const selector = '[data-action="random"][data-id="personal-8"]';
  const files = a.window.CHIVALRY_CATALOG.agatha.vanguard.personal[8].clips.map(c => c.file);
  let last;
  for (let i = 0; i < 12; i++) {
    a.click(selector); await tick();
    assert.ok(files.includes(a.audio.src));
    assert.notEqual(a.audio.src, last);
    last = a.audio.src;
  }
  assert.equal(a.document.querySelector('.player').hidden, false);
  assert.ok(a.document.querySelector('[data-command="personal-8"]').classList.contains('is-playing'));
  a.click('.player-toggle'); assert.equal(a.audio.paused, true);
  a.click('.player-toggle'); await tick(); assert.equal(a.audio.paused, false);
  a.input('#volume', '0.35'); assert.equal(a.audio.volume, 0.35);
  a.click('#mute'); assert.equal(a.audio.muted, true);
  a.click('#mute'); assert.equal(a.audio.muted, false);
  a.input('#seek', '50'); assert.equal(a.audio.currentTime, 2);
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
  a.route('#masons'); assert.equal(a.audio.paused, true); assert.equal(a.document.querySelector('.player').hidden, true);
  assert.equal(a.document.querySelectorAll('.class-card').length, 4);
  a.route('#masons/vanguard');
  a.click('[data-action="random"]'); await tick(); a.click('[data-action="stop"]'); assert.equal(a.document.querySelector('.player').hidden, true);
  a.route('#toString/__proto__'); assert.equal(a.document.querySelectorAll('.faction-card').length, 2);
  a.route('#agatha/unknown'); assert.equal(a.document.querySelectorAll('.class-card').length, 4);
});

test('failed playback offers retry and does not leave the recording highlighted as playing', async () => {
  const a = app('#agatha/vanguard');
  a.audio.rejectNext = true;
  a.click('[data-action="random"]'); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, false);
  assert.equal(a.document.querySelectorAll('.is-playing').length, 0);
  a.click('[data-action="retry"]'); await tick();
  assert.equal(a.document.querySelector('.audio-error').hidden, true);
  assert.equal(a.audio.paused, false);
});
