/* 音效（Web Audio 合成叮咚，無外部音檔）、中文語音提示（Web Speech API）與螢幕防休眠（Wake Lock）
   保留原創 v12 針對 iOS / iPadOS Safari 實測調校的靜音鍵穿透與首次觸控解鎖機制 */

export const WARN_VOICE_VOLUME = 0.6;
const TIME_UP_SPEECH_DELAY_MS = 800;
const PREVIEW_PAUSE_MS = 700;
const PREVIEW_WARN_FALLBACK_MS = 3500;

export const Bell = {
  ctx: null,
  out: null,
  primed: false,

  ensureCtx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      const master = this.ctx.createGain();
      master.gain.value = 1.0;
      master.connect(comp);
      comp.connect(this.ctx.destination);
      this.out = master;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  },

  unlock() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch { /* ignore */ }

    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!this.primed) {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        this.primed = true;
      }
    } catch { /* ignore */ }
  },

  ring(level = 1.0) {
    try {
      const ctx = this.ensureCtx();
      if (!ctx) return Promise.resolve(false);
      if (ctx.state === 'running') {
        this.chime(ctx, level);
        return Promise.resolve(true);
      }
      return ctx.resume().then(() => { this.chime(ctx, level); return true; }).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  },

  chime(ctx, level) {
    const t0 = ctx.currentTime + 0.03;
    this.strike(ctx, 1046.5, t0, level);              // C6 叮
    this.strike(ctx, 784.0, t0 + 0.42, level * 0.95); // G5 咚
  },

  strike(ctx, freq, t, level) {
    const partials = [
      [1.0, 0.55, 2.2],
      [2.0, 0.22, 1.4],
      [2.76, 0.14, 0.9],
      [5.40, 0.06, 0.5],
      [0.5, 0.10, 1.8],
    ];
    partials.forEach(([ratio, gain, decay]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * level, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g);
      g.connect(this.out);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
  },
};

export const Voice = {
  synth: null,
  voice: null,
  primed: false,
  pendingId: null,

  init() {
    try {
      if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      this.synth = window.speechSynthesis;
      this.pickVoice();
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', () => this.pickVoice());
      } else {
        this.synth.onvoiceschanged = () => this.pickVoice();
      }
    } catch {
      this.synth = null;
    }
  },

  pickVoice() {
    try {
      const voices = this.synth ? this.synth.getVoices() || [] : [];
      const norm = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
      this.voice =
        voices.find((v) => norm(v) === 'zh-tw') ||
        voices.find((v) => norm(v).startsWith('zh-hant')) ||
        voices.find((v) => norm(v).startsWith('zh')) ||
        null;
    } catch {
      this.voice = null;
    }
  },

  makeUtterance(text, volume) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    if (this.voice) u.voice = this.voice;
    u.volume = volume;
    u.rate = 1.3;
    u.pitch = 1;
    return u;
  },

  unlock() {
    if (!this.synth || this.primed) return;
    try {
      this.synth.speak(this.makeUtterance(' ', 0));
      this.primed = true;
    } catch { /* ignore */ }
  },

  speak(text, volume) {
    if (!this.synth) return null;
    try {
      if (this.synth.speaking || this.synth.pending) this.synth.cancel();
      if (this.synth.paused) this.synth.resume();
      const u = this.makeUtterance(text, volume);
      this.synth.speak(u);
      return u;
    } catch {
      return null;
    }
  },

  speakLater(text, volume, delayMs) {
    this.cancelPending();
    this.pendingId = setTimeout(() => {
      this.pendingId = null;
      this.speak(text, volume);
    }, delayMs);
  },

  cancelPending() {
    if (this.pendingId !== null) {
      clearTimeout(this.pendingId);
      this.pendingId = null;
    }
  },

  stop() {
    this.cancelPending();
    if (!this.synth) return;
    try {
      if (this.synth.speaking || this.synth.pending) this.synth.cancel();
    } catch { /* ignore */ }
  },
};

Voice.init();

export function playTimeUpCue() {
  Bell.ring(1.0).then(() => {
    Voice.speakLater('時間到', 1.0, TIME_UP_SPEECH_DELAY_MS);
  });
}

const preview = { token: 0, timerId: null };

export function cancelSoundPreview() {
  preview.token++;
  if (preview.timerId !== null) {
    clearTimeout(preview.timerId);
    preview.timerId = null;
  }
  Voice.stop();
}

export function previewAllSounds() {
  cancelSoundPreview();
  const token = preview.token;
  const live = () => token === preview.token;
  const schedule = (fn, ms) => {
    if (preview.timerId !== null) clearTimeout(preview.timerId);
    preview.timerId = setTimeout(() => { preview.timerId = null; if (live()) fn(); }, ms);
  };

  let advanced = false;
  const afterWarn = () => {
    if (advanced || !live()) return;
    advanced = true;
    schedule(() => {
      Bell.ring(1.0).then(() => {
        if (live()) Voice.speakLater('時間到', 1.0, TIME_UP_SPEECH_DELAY_MS);
      });
    }, PREVIEW_PAUSE_MS);
  };

  const u = Voice.speak('剩下 20 秒', WARN_VOICE_VOLUME);
  if (u) {
    u.onend = afterWarn;
    u.onerror = afterWarn;
    schedule(afterWarn, PREVIEW_WARN_FALLBACK_MS);
  } else {
    afterWarn();
  }
}

export function bindAudioUnlockGestures() {
  ['touchend', 'pointerdown', 'click', 'keydown'].forEach((type) => {
    document.addEventListener(type, () => {
      Bell.unlock();
      if (type !== 'pointerdown') Voice.unlock();
    }, { capture: true, passive: true });
  });
}

export const Wake = {
  sentinel: null,
  pending: false,
  isRunningFn: () => false,

  async sync() {
    if (!('wakeLock' in navigator)) return;
    const wanted = this.isRunningFn() && document.visibilityState === 'visible';
    if (wanted) {
      if (this.sentinel || this.pending) return;
      this.pending = true;
      try {
        const s = await navigator.wakeLock.request('screen');
        s.addEventListener('release', () => { if (this.sentinel === s) this.sentinel = null; });
        this.sentinel = s;
        if (!(this.isRunningFn() && document.visibilityState === 'visible')) this.release();
      } catch {
        /* unsupported / denied */
      } finally {
        this.pending = false;
      }
    } else {
      this.release();
    }
  },

  release() {
    const s = this.sentinel;
    this.sentinel = null;
    if (s) s.release().catch(() => {});
  },
};
