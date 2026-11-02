/* Intersect catalog entries with accessible HTTP or local audio files. */
(() => {
  'use strict';
  window.ChivalryAvailability = class {
    constructor({remote, request = (...args) => fetch(...args)}) {
      this.remote = remote;
      this.request = request;
      this.files = new Map();
      this.commands = new WeakMap();
      this.pending = new WeakMap();
      this.queue = [];
      this.active = 0;
    }
    ready(command) {
      return this.commands.get(command) ?? null;
    }
    load(command) {
      const ready = this.ready(command);
      if (ready !== null) return Promise.resolve(ready);
      if (!this.pending.has(command)) {
        const pending = Promise.all(command.clips.map(clip => this.check(clip.file)))
          .then(results => {
            const indices = results.flatMap((exists, i) => exists ? [i] : []);
            this.commands.set(command, indices);
            return indices;
          }).finally(() => this.pending.delete(command));
        this.pending.set(command, pending);
      }
      return this.pending.get(command);
    }
    check(file) {
      if (!this.files.has(file)) {
        const result = new Promise((resolve, reject) => {
          this.queue.push({file, resolve, reject});
          this.drain();
        }).catch(error => {
          // Temporary network/server failures must be retryable, not cached as missing.
          this.files.delete(file);
          throw error;
        });
        this.files.set(file, result);
      }
      return this.files.get(file);
    }
    drain() {
      while (this.active < 6 && this.queue.length) {
        const job = this.queue.shift();
        this.active++;
        this.probe(job.file).then(job.resolve, job.reject).finally(() => {
          this.active--;
          this.drain();
        });
      }
    }
    async probe(file) {
      if (!this.remote) return this.probeLocal(file);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const options = {method: 'HEAD', cache: 'no-store', signal: controller.signal};
        let response = await this.request(file, options);
        if (response.status === 405 || response.status === 501) {
          // Some hosts do not implement HEAD. Request only a byte, then cancel the body.
          response = await this.request(file, {...options, method: 'GET', headers: {Range: 'bytes=0-0'}});
          await response.body?.cancel();
        }
        if ([403, 404, 410].includes(response.status)) return false;
        if (!response.ok) throw new Error(`Availability check failed (${response.status})`);
        const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        // Avoid treating an HTML error page / SPA fallback as an existing recording.
        return !type || type.startsWith('audio/') || type === 'application/octet-stream';
      } finally {
        clearTimeout(timer);
      }
    }
    probeLocal(file) {
      // Local fetch is blocked by browsers, but media elements may load file:// audio.
      // Load metadata silently, then release the media resource without playing it.
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        const finish = (exists, error = null) => {
          clearTimeout(timer);
          audio.removeEventListener('loadedmetadata', loaded);
          audio.removeEventListener('error', failed);
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          if (error) reject(error);
          else resolve(exists);
        };
        const loaded = () => finish(true);
        const failed = () => finish(false);
        const timer = setTimeout(() => finish(false, new Error('Local audio check timed out')), 15000);
        audio.addEventListener('loadedmetadata', loaded);
        audio.addEventListener('error', failed);
        audio.preload = 'metadata';
        try {
          audio.src = file;
          audio.load();
        } catch (error) {
          finish(false, error);
        }
      });
    }
  };
})();
