/* Independent media instances let commands overlap without sharing playback state. */
window.ChivalryPlayback = class {
  constructor({onChange = () => {}, onError = () => {}} = {}) {
    this.onChange = onChange;
    this.onError = onError;
    this.volume = 0.8;
    this.muted = false;
    this.instances = new Map();
    this.serial = 0;
  }

  get active() { return [...this.instances.values()]; }

  start(command, version) {
    const audio = new Audio();
    const id = String(++this.serial);
    const entry = {id, command, version, audio, state: 'loading'};
    const playing = () => {
      if (!this.instances.has(id)) return;
      entry.state = 'playing';
      this.onChange();
    };
    const ended = () => this.stop(id);
    const waiting = () => {
      if (!this.instances.has(id)) return;
      entry.state = 'loading';
      this.onChange();
    };
    const failed = () => {
      if (!this.instances.has(id)) return;
      this.stop(id);
      this.onError(entry);
    };
    entry.listeners = {playing, waiting, ended, error: failed};
    for (const [event, listener] of Object.entries(entry.listeners)) audio.addEventListener(event, listener);
    audio.preload = 'none';
    audio.src = command.clips[version].file;
    audio.volume = this.volume;
    audio.muted = this.muted;
    this.instances.set(id, entry);
    this.onChange();
    // Call play synchronously inside the user's gesture, including on mobile.
    try { Promise.resolve(audio.play()).catch(failed); }
    catch { failed(); }
    return id;
  }

  stop(id, notify = true) {
    const entry = this.instances.get(id);
    if (!entry) return;
    this.instances.delete(id);
    const {audio, listeners} = entry;
    for (const [event, listener] of Object.entries(listeners)) audio.removeEventListener(event, listener);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (notify) this.onChange();
  }

  stopAll() {
    for (const id of this.instances.keys()) this.stop(id, false);
    this.onChange();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    for (const {audio} of this.instances.values()) audio.volume = this.volume;
  }

  setMuted(value) {
    this.muted = value;
    for (const {audio} of this.instances.values()) audio.muted = value;
  }
};
