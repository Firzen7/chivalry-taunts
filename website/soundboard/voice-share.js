/* Personalized links and QR codes are generated locally; no external service. */
window.ChivalryVoiceShare = class {
  constructor(section) {
    this.section = section;
    this.voice = null;
    this.picker = document.querySelector('#versions');
    this.formDialog = document.querySelector('#share-form-dialog');
    this.resultDialog = document.querySelector('#share-result-dialog');
    this.form = this.formDialog.querySelector('form');
    this.result = this.resultDialog.querySelector('.share-result');
    this.error = this.formDialog.querySelector('.share-error');
    for (const dialog of [this.formDialog, this.resultDialog]) {
      dialog.querySelector('.share-close').addEventListener('click', () => this.close());
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    }
    this.resultDialog.querySelector('.share-edit').addEventListener('click', () => this.openForm());
    this.form.querySelector('input').addEventListener('input', event => event.target.setCustomValidity(''));
    section.querySelector('.share-open').addEventListener('click', () => {
      if (!this.voice) return;
      this.openForm();
    });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.generate(); });
    this.resultDialog.querySelector('.share-copy').addEventListener('click', async () => {
      const input = this.resultDialog.querySelector('.share-link');
      try {
        await navigator.clipboard.writeText(input.value);
        this.resultDialog.querySelector('.share-copy-status').textContent = 'Link copied';
      } catch {
        input.focus(); input.select();
        this.resultDialog.querySelector('.share-copy-status').textContent = 'Select and copy the link above.';
      }
    });
    this.setVoice(null);
  }
  setVoice(voice) {
    if (voice?.file === this.voice?.file && voice?.faction === this.voice?.faction && voice?.cls === this.voice?.cls) return;
    this.close(false);
    this.voice = voice;
    this.form.hidden = true;
    this.result.hidden = true;
    this.error.hidden = true;
    this.section.querySelector('.share-open').disabled = !voice;
    this.section.querySelector('.share-selection').textContent = voice ? `Version ${voice.version + 1}` : 'Select or preview a version to share it.';
  }
  get activeDialog() { return this.resultDialog.open ? this.resultDialog : this.formDialog.open ? this.formDialog : null; }
  openForm() {
    if (!this.voice) return;
    if (this.resultDialog.open) this.resultDialog.close();
    this.result.hidden = true;
    this.picker.hidden = true;
    this.form.hidden = false;
    this.formDialog.querySelector('.share-voice-label').textContent = `${this.voice.commandName} · Version ${this.voice.version + 1}`;
    if (!this.formDialog.open) this.formDialog.show();
    this.form.querySelector('input').focus();
  }
  close(restoreFocus = true) {
    if (this.formDialog.open) this.formDialog.close();
    if (this.resultDialog.open) this.resultDialog.close();
    this.picker.hidden = false;
    if (restoreFocus) this.section.querySelector('.share-open').focus();
  }
  generate() {
    const voice = this.voice;
    if (!voice) return;
    const nickname = this.form.querySelector('[name="nickname"]');
    nickname.setCustomValidity(nickname.value.trim() ? '' : 'Please enter your nickname.');
    if (!this.form.reportValidity()) return;
    this.error.hidden = true;
    try {
      const data = window.ChivalryMessageCodec.encode({faction: voice.faction, class: voice.cls,
        nickname: nickname.value.trim(), message: this.form.querySelector('textarea').value,
        voice_variant: voice.file});
      const base = /^https?:$/.test(location.protocol) ? location.href : document.querySelector('link[rel="canonical"]').getAttribute('href');
      const url = new URL('message.html', base);
      url.searchParams.set('data', data);
      const qr = new window.ChivalryQRCode(-1, 1); // QR error correction level L.
      qr.addData(url.href);
      qr.make();
      const size = qr.getModuleCount();
      let path = '';
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (qr.isDark(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
      }
      const svg = this.resultDialog.querySelector('.share-qr');
      svg.setAttribute('viewBox', `0 0 ${size + 8} ${size + 8}`);
      svg.querySelector('path').setAttribute('d', path);
      this.resultDialog.querySelector('.share-link').value = url.href;
      this.resultDialog.querySelector('.share-visit').href = url.href;
      this.resultDialog.querySelector('.share-copy-status').textContent = '';
      this.result.hidden = false;
      this.formDialog.close();
      this.form.hidden = true;
      this.resultDialog.show();
      this.resultDialog.querySelector('.share-copy').focus();
    } catch {
      this.result.hidden = true;
      this.error.textContent = 'This message is too long for a QR code. Please shorten it and try again.';
      this.error.hidden = false;
    }
  }
};
