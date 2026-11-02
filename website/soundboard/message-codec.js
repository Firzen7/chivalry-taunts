/* Compact share-link format. Audio identities remain paths, never catalog indices. */
(() => {
  'use strict';
  const factions = {a: 'agatha', m: 'masons'};
  const classes = {k: 'knight', a: 'archer', v: 'vanguard', m: 'man_at_arms'};
  const folders = {p: 'personal_messages', t: 'tactical_messages', br: 'battlecry/running', ba: 'battlecry/animated', o: 'other'};
  const lookup = (mapping, value) => Object.hasOwn(mapping, value) ? mapping[value] : value;
  function expand(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid message');
    if (!Object.hasOwn(payload, 'f')) return payload; // Existing verbose links.
    const faction = lookup(factions, payload.f);
    const cls = lookup(classes, payload.c);
    if (typeof payload.v !== 'string') throw new Error('Invalid voice');
    const slash = payload.v.indexOf('/');
    const prefix = payload.v.slice(0, slash);
    if (slash < 1 || !Object.hasOwn(folders, prefix)) throw new Error('Invalid voice prefix');
    return {faction, class: cls, nickname: payload.n, message: payload.m,
      voice_variant: `audio/${faction}/${cls}/${folders[prefix]}/${payload.v.slice(slash + 1)}`};
  }
  function compact(payload) {
    const full = expand(payload);
    const f = Object.keys(factions).find(key => factions[key] === full.faction);
    const c = Object.keys(classes).find(key => classes[key] === full.class);
    if (!f || !c || typeof full.nickname !== 'string' || typeof full.message !== 'string' || typeof full.voice_variant !== 'string') throw new Error('Invalid message');
    const base = `audio/${full.faction}/${full.class}/`;
    if (!full.voice_variant.startsWith(base)) throw new Error('Voice does not match warrior');
    const relative = full.voice_variant.slice(base.length);
    const folder = Object.keys(folders).find(key => relative.startsWith(folders[key] + '/'));
    if (!folder) throw new Error('Invalid voice folder');
    return {f, c, n: full.nickname, m: full.message, v: `${folder}/${relative.slice(folders[folder].length + 1)}`};
  }
  function encode(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(compact(payload)));
    return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  window.ChivalryMessageCodec = {expand, compact, encode};
})();
