import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const {parseHTML} = await import(process.env.DOM_TEST_HELPER || 'linkedom');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function collection({remote = false, exists = () => true, request, count = 65} = {}) {
  const rows = Array.from({length: count}, (_, i) => `<tr data-faction="agatha" data-class="vanguard" data-groups="personal_messages" data-types="Yes"><td>Agatha</td><td>Vanguard</td><td>voice-${i}</td><td><button class="play" data-src="audio/voice-${i}.mp3" data-label="voice-${i}">Play</button><a href="audio/voice-${i}.mp3">MP3</a></td></tr>`).join('');
  const {window} = parseHTML(read('full-list.html').replace(/<tbody hidden>[\s\S]*?<\/tbody>/, `<tbody hidden>${rows}</tbody>`));
  const {document, Event} = window;
  for (const select of document.querySelectorAll('select')) {
    let value = '';
    Object.defineProperty(select, 'value', {get: () => value, set: next => {value = next;}});
  }
  const checks = [], probes = [];
  function Audio() {
    const audio = document.createElement('audio');
    Object.defineProperty(audio, 'src', {get: () => audio.getAttribute('src') || '', set: value => audio.setAttribute('src', value)});
    audio.pause = () => {};
    audio.play = () => { throw new Error('Availability must never play recordings'); };
    audio.load = () => {
      if (!audio.src) { audio.released = true; return; }
      checks.push(audio.src);
      probes.push(audio);
      Promise.resolve().then(() => audio.dispatchEvent(new Event(exists(audio.src) ? 'loadedmetadata' : 'error')));
    };
    return audio;
  }
  const context = vm.createContext({window, document, location: {protocol: remote ? 'http:' : 'file:'}, Audio, AbortController, setTimeout, clearTimeout,
    fetch: async (file, options) => { checks.push(file); return request(file, options); }});
  vm.runInContext(read('soundboard/availability.js'), context);
  vm.runInContext(read('collection.js'), context);
  return {document, checks, probes,
    visible: () => [...document.querySelectorAll('tbody tr')].filter(row => !row.hidden),
    click: selector => document.querySelector(selector).dispatchEvent(new Event('click', {bubbles: true})),
    filter: (id, value) => {
      const element = document.querySelector(id);
      element.value = value;
      element.dispatchEvent(new Event(id === '#search' ? 'input' : 'change', {bubbles: true}));
    },
  };
}

test('full list opened from disk shows only confirmed files, including counts and pagination', async () => {
  const a = collection({count: 15, exists: file => file === 'audio/voice-0.mp3'});
  assert.equal(a.visible().length, 0, 'Unverified rows stay hidden');
  await tick();
  assert.equal(a.visible().length, 1);
  assert.match(a.visible()[0].textContent, /voice-0/);
  assert.equal(a.document.querySelector('#count').textContent, '1 available voice clips');
  assert.equal(a.document.querySelector('#page-count').textContent, 'Page 1 of 1');
  assert.equal(a.document.querySelector('#next').disabled, true);
  assert.equal(a.checks.length, 15);
  assert.ok(a.probes.every(audio => audio.released && !audio.src));
});

test('full list HTTP availability drives filtering, pages, reset, and cached checks', async () => {
  const a = collection({remote: true, request: async file => new Response(null, {
    status: ['audio/voice-0.mp3', 'audio/voice-55.mp3'].includes(file) ? 404 : 200,
    headers: {'Content-Type': 'audio/mpeg'},
  })});
  await tick();
  assert.equal(a.visible().length, 50);
  assert.equal(a.document.querySelector('#count').textContent, '63 available voice clips');
  a.click('#next');
  assert.equal(a.visible().length, 13);
  a.filter('#search', 'voice-55'); await tick();
  assert.equal(a.visible().length, 0);
  assert.equal(a.document.querySelector('#empty').hidden, false);
  assert.equal(a.document.querySelector('#count').textContent, '0 available voice clips');
  a.click('#reset'); await tick();
  assert.equal(a.visible().length, 50);
  assert.equal(a.checks.length, 65);
});

test('full list keeps failed checks hidden and offers a retry', async () => {
  let fail = true;
  const a = collection({remote: true, count: 15, request: async () => new Response(null, {
    status: fail ? 503 : 200, headers: {'Content-Type': 'audio/mpeg'},
  })});
  await tick();
  assert.equal(a.visible().length, 0);
  assert.equal(a.document.querySelector('#availability-error').hidden, false);
  fail = false;
  a.click('#retry-availability'); await tick();
  assert.equal(a.visible().length, 15);
  assert.equal(a.document.querySelector('#availability-error').hidden, true);
});

test('late full-list availability results respect a newer filter', async () => {
  const waiting = [];
  const a = collection({remote: true, count: 15, request: () => new Promise(resolve => {
    waiting.push(() => resolve(new Response(null, {headers: {'Content-Type': 'audio/mpeg'}})));
  })});
  a.filter('#search', 'voice-14');
  while (waiting.length) { waiting.splice(0).forEach(resolve => resolve()); await tick(); }
  assert.equal(a.visible().length, 1);
  assert.match(a.visible()[0].textContent, /voice-14/);
  assert.equal(a.document.querySelector('#count').textContent, '1 available voice clips');
});
