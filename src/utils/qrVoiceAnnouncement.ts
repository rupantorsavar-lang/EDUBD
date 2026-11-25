export interface PreparedSpeechPayload {
  cleanText: string;
  prefersBengali: boolean;
  lang: string;
  rate: number;
}

export function buildSpeechPayload(rawText: string): PreparedSpeechPayload {
  let cleanText = String(rawText || '')
    .replace(/[✓✕⚠️🔒•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    return { cleanText: '', prefersBengali: false, lang: 'en-US', rate: 1.1 };
  }

  const hasBengaliChars = /[\u0980-\u09FF]/.test(cleanText);
  if (hasBengaliChars && /^ok\s+/i.test(cleanText)) {
    cleanText = cleanText.replace(/^ok\s+/i, 'ওকে ');
  }

  return {
    cleanText,
    prefersBengali: hasBengaliChars,
    lang: hasBengaliChars ? 'bn-BD' : 'en-US',
    rate: hasBengaliChars ? 1.08 : 1.12,
  };
}

export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  prefersBengali: boolean
): SpeechSynthesisVoice | null {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  if (prefersBengali) {
    const isBangla = (v: SpeechSynthesisVoice) => {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return lang.startsWith('bn') || name.includes('bangla') || name.includes('bengali');
    };
    return (
      voices.find((v) => isBangla(v) && v.localService === true) ||
      voices.find((v) => isBangla(v)) ||
      null
    );
  }

  const isEnglish = (v: SpeechSynthesisVoice) => (v.lang || '').toLowerCase().startsWith('en');
  return (
    voices.find((v) => isEnglish(v) && v.localService === true) ||
    voices.find((v) => isEnglish(v) && !/network/i.test(v.name || '')) ||
    voices.find((v) => isEnglish(v)) ||
    null
  );
}

export interface QrVoiceCallbacks {
  onVoiceStart?: (text: string) => void;
  onVoiceEnd?: () => void;
  onAutoplayBlocked?: (blocked: boolean) => void;
}

export class QrVoiceController {
  private audioCtx: AudioContext | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private startWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private clearTextTimer: ReturnType<typeof setTimeout> | null = null;
  private utteranceSeq = 0;
  private speechPrimed = false;
  private voicesBound = false;
  private callbacks: QrVoiceCallbacks = {};
  private handleVoicesChanged = () => {
    this.refreshVoices();
  };

  setCallbacks(callbacks: QrVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  init() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.refreshVoices();
    if (!this.voicesBound) {
      this.voicesBound = true;
      try {
        window.speechSynthesis.addEventListener?.('voiceschanged', this.handleVoicesChanged);
      } catch {
        window.speechSynthesis.onvoiceschanged = this.handleVoicesChanged;
      }
    }
  }

  refreshVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    try {
      const list = window.speechSynthesis.getVoices();
      if (Array.isArray(list) && list.length > 0) {
        this.cachedVoices = list;
      }
    } catch {}
    return this.cachedVoices;
  }

  /**
   * Unlocks Web AudioContext & SpeechSynthesis inside a real user gesture (tap/click/keydown)
   * so camera-triggered attendance scans speak immediately without autoplay blocks.
   */
  unlockAudioAndSpeech() {
    if (typeof window === 'undefined') return;

    // 1. Unlock / resume AudioContext with silent 1ms pulse
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
          this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume().catch(() => {});
        }
        const buffer = this.audioCtx.createBuffer(1, 1, 22050);
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        source.start(0);
      }
    } catch {}

    // 2. Unlock SpeechSynthesis once if completely idle
    if ('speechSynthesis' in window && !this.speechPrimed) {
      this.speechPrimed = true;
      try {
        this.refreshVoices();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          const primer = new SpeechSynthesisUtterance(' ');
          primer.volume = 0;
          primer.rate = 2;
          primer.onend = () => {
            this.callbacks.onAutoplayBlocked?.(false);
          };
          primer.onerror = () => {};
          window.speechSynthesis.speak(primer);
        }
        this.callbacks.onAutoplayBlocked?.(false);
      } catch {}
    }
  }

  playBeep(type: 'success' | 'warning' | 'error') {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtx();
      }
      const audioCtx = this.audioCtx;
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume().catch(() => {});
      }
      const now = audioCtx.currentTime;

      if (type === 'success') {
        // Short crisp 180ms two-tone chime so it never ducks or delays the voice announcement
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        const gain2 = audioCtx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        gain1.gain.setValueAtTime(0.16, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.09);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(783.99, now + 0.06);
        gain2.gain.setValueAtTime(0.18, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.06);
        osc2.stop(now + 0.19);
      } else if (type === 'warning') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.1);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {}
  }

  private clearPendingTimers() {
    if (this.speakTimer) {
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
    if (this.startWatchdogTimer) {
      clearTimeout(this.startWatchdogTimer);
      this.startWatchdogTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    if (this.clearTextTimer) {
      clearTimeout(this.clearTextTimer);
      this.clearTextTimer = null;
    }
  }

  speak(rawText: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const payload = buildSpeechPayload(rawText);
    if (!payload.cleanText) return;

    this.clearPendingTimers();
    const seq = ++this.utteranceSeq;
    const synth = window.speechSynthesis;

    try {
      if (synth.paused) {
        synth.resume();
      }
    } catch {}

    this.callbacks.onVoiceStart?.(payload.cleanText);

    const dispatchUtterance = (allowExplicitVoice: boolean, isRetry: boolean) => {
      if (seq !== this.utteranceSeq) return;
      try {
        if (synth.paused) {
          synth.resume();
        }
        const utterance = new SpeechSynthesisUtterance(payload.cleanText);
        this.activeUtterance = utterance;
        utterance.lang = payload.lang;
        utterance.rate = payload.rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (allowExplicitVoice) {
          const voices = this.cachedVoices.length > 0 ? this.cachedVoices : this.refreshVoices();
          const chosen = pickBestVoice(voices, payload.prefersBengali);
          if (chosen) {
            utterance.voice = chosen;
          }
        }

        let started = false;

        utterance.onstart = () => {
          if (seq !== this.utteranceSeq) return;
          started = true;
          this.speechPrimed = true;
          this.callbacks.onAutoplayBlocked?.(false);
          if (this.startWatchdogTimer) {
            clearTimeout(this.startWatchdogTimer);
            this.startWatchdogTimer = null;
          }
        };

        utterance.onend = () => {
          if (seq !== this.utteranceSeq) return;
          if (this.activeUtterance === utterance) {
            this.activeUtterance = null;
          }
          if (this.startWatchdogTimer) {
            clearTimeout(this.startWatchdogTimer);
            this.startWatchdogTimer = null;
          }
          if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
          }
          this.clearTextTimer = setTimeout(() => {
            if (seq === this.utteranceSeq) {
              this.callbacks.onVoiceEnd?.();
            }
          }, 600);
        };

        utterance.onerror = (ev: SpeechSynthesisErrorEvent) => {
          if (seq !== this.utteranceSeq) return;
          if (this.activeUtterance === utterance) {
            this.activeUtterance = null;
          }
          if (this.startWatchdogTimer) {
            clearTimeout(this.startWatchdogTimer);
            this.startWatchdogTimer = null;
          }
          const errCode = (ev && ev.error) || '';
          if (errCode === 'not-allowed') {
            this.callbacks.onAutoplayBlocked?.(true);
            this.callbacks.onVoiceEnd?.();
            return;
          }
          // Ignore intentional cancellations from a newer scan
          if (errCode === 'canceled' || errCode === 'interrupted') {
            return;
          }
          // Retry once immediately with OS default voice if chosen voice failed
          if (!isRetry && allowExplicitVoice) {
            try {
              synth.cancel();
            } catch {}
            this.speakTimer = setTimeout(() => {
              dispatchUtterance(false, true);
            }, 40);
            return;
          }
          this.callbacks.onVoiceEnd?.();
        };

        // Watchdog 1: If Chromium TTS stalls in pending/network-fetch for > 1100ms, reset & fallback to default offline voice
        this.startWatchdogTimer = setTimeout(() => {
          if (seq !== this.utteranceSeq || started) return;
          try {
            synth.cancel();
            if (synth.paused) synth.resume();
          } catch {}
          if (!isRetry) {
            this.speakTimer = setTimeout(() => {
              dispatchUtterance(false, true);
            }, 45);
          } else {
            this.callbacks.onVoiceEnd?.();
          }
        }, 1100);

        // Watchdog 2: Guard against Chromium's stuck `speaking: true` deadlock
        this.maxDurationTimer = setTimeout(() => {
          if (seq !== this.utteranceSeq) return;
          if (synth.speaking || synth.pending) {
            try {
              synth.cancel();
            } catch {}
          }
          if (this.activeUtterance === utterance) {
            this.activeUtterance = null;
          }
          this.callbacks.onVoiceEnd?.();
        }, 4500);

        synth.speak(utterance);
      } catch {
        this.callbacks.onVoiceEnd?.();
      }
    };

    const isEngineBusy = synth.speaking || synth.pending;
    if (!isEngineBusy) {
      // Zero-latency synchronous dispatch when engine is ready!
      dispatchUtterance(true, false);
    } else {
      // Cancel currently playing utterance and wait a brief 45ms settle tick for Android Chromium
      try {
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch {}
      this.speakTimer = setTimeout(() => {
        dispatchUtterance(true, false);
      }, 45);
    }
  }

  dispose() {
    this.utteranceSeq += 1;
    this.clearPendingTimers();
    this.activeUtterance = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (this.voicesBound) {
          window.speechSynthesis.removeEventListener?.('voiceschanged', this.handleVoicesChanged);
          this.voicesBound = false;
        }
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
