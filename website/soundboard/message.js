/* Shared messages use UTF-8 Base64 JSON, with a catalogued file as voice_variant. */
(() => {
  'use strict';
  const find = id => document.getElementById(id);
  const fail = text => { find('message-error').textContent = text; find('message-error').hidden = false; };
  let message;
  try {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const encoded = fragment.get('data') || query.get('data');
    if (!encoded) throw new Error('This link has no message attached.');
    if (encoded.length > 24000) throw new Error('This message link is too long.');
    const base64 = encoded.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    message = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error();
    if (!['agatha', 'masons'].includes(message.faction) || !['archer', 'man_at_arms', 'vanguard', 'knight'].includes(message.class)) throw new Error();
    if (typeof message.nickname !== 'string' || !message.nickname.trim() || message.nickname.length > 80 || typeof message.message !== 'string' || !message.message.trim() || message.message.length > 4000) throw new Error();
    const groups = window.CHIVALRY_CATALOG?.[message.faction]?.[message.class];
    if (typeof message.voice_variant !== 'string' || !groups || !Object.values(groups).flat().some(command => command.clips.some(clip => clip.file === message.voice_variant))) {
      throw new Error('The voice recording in this link is not available for this warrior.');
    }
  } catch (error) {
    fail(error.message && /^(This |The voice)/.test(error.message) ? error.message : 'This message link is invalid or incomplete.');
    return;
  }
  const classes = {archer: 'Archer', man_at_arms: 'Man-at-Arms', vanguard: 'Vanguard', knight: 'Knight'};
  const portrait = find('message-warrior');
  const base = `soundboard/assets/optimized/${message.faction}-${message.class}`;
  portrait.src = `${base}-640.webp`;
  portrait.srcset = `${base}-384.webp 384w, ${base}-640.webp 640w, ${base}-1024.webp 1024w`;
  portrait.sizes = '(max-width:600px) calc(100vw - 58px), (max-width:680px) calc(100vw - 96px), 560px';
  portrait.alt = `${message.faction === 'agatha' ? 'Agatha Knights' : 'Mason Order'} ${classes[message.class]}`;
  find('message-title').textContent = `Message from ${message.nickname.trim()}`;
  find('message-text').textContent = message.message;
  find('message-content').hidden = false;
  document.title = `Message from ${message.nickname.trim()} · Chivalry`;
  const audio = new Audio();
  audio.preload = 'none';
  audio.src = message.voice_variant;
  let revealed = false;
  const playbackFailed = () => { find('message-audio-error').hidden = false; };
  function play() {
    find('message-audio-error').hidden = true;
    audio.currentTime = 0;
    try { Promise.resolve(audio.play()).catch(playbackFailed); }
    catch { playbackFailed(); }
  }
  audio.addEventListener('error', playbackFailed);
  find('message-sound').addEventListener('click', () => {
    audio.muted = !audio.muted;
    find('message-sound').setAttribute('aria-checked', String(!audio.muted));
    find('sound-label').textContent = audio.muted ? 'Sound off' : 'Sound on';
  });
  find('message-reveal').addEventListener('click', () => {
    if (revealed) return;
    revealed = true;
    find('message-text').classList.remove('concealed');
    find('message-text').removeAttribute('aria-hidden');
    find('message-text').setAttribute('tabindex', '-1');
    find('message-text').focus({preventScroll: true});
    find('message-reveal').hidden = true;
    find('message-replay').hidden = false;
    // Start playback inside the reveal gesture, alongside the fade animation.
    play();
  });
  find('message-replay').addEventListener('click', play);
  window.addEventListener('pagehide', () => {
    audio.pause(); audio.removeAttribute('src'); audio.load();
  });
})();
