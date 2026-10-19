import { localDB } from './localDB';
import { prefersReducedMotion } from './perf';

// Sound & Haptic Feedback using Web Audio API

class SoundHapticsService {
  private audioCtx: AudioContext | null = null;
  private soundOn = localDB.getSettings().soundEnabled;
  private hapticsOn = localDB.getSettings().hapticsEnabled;

  public get soundEnabled(): boolean { return this.soundOn; }
  public set soundEnabled(enabled: boolean) {
    this.soundOn = enabled;
    localDB.saveSettings({ soundEnabled: enabled });
  }

  public get hapticsEnabled(): boolean { return this.hapticsOn; }
  public set hapticsEnabled(enabled: boolean) {
    this.hapticsOn = enabled;
    localDB.saveSettings({ hapticsEnabled: enabled });
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => { /* Audio can be blocked by browser policy. */ });
    }
    return this.audioCtx;
  }

  // Runs audio work after the browser has painted the tap feedback,
  // so a touch never waits for the Web Audio engine (main cause of "heavy" taps in a WebView).
  private defer(fn: () => void) {
    setTimeout(fn, 0);
  }

  public playClick() {
    if (!this.soundEnabled) return;
    this.defer(() => this.clickNow());
  }

  private clickNow() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // AudioContext might be blocked until user gesture
    }
  }

  public playOperator() {
    if (!this.soundEnabled) return;
    this.defer(() => this.operatorNow());
  }

  private operatorNow() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // ignore
    }
  }

  public playEquals() {
    if (!this.soundEnabled) return;
    this.defer(() => this.equalsNow());
  }

  private equalsNow() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // ignore
    }
  }

  public playError() {
    if (!this.soundEnabled) return;
    this.defer(() => this.errorNow());
  }

  private errorNow() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // ignore
    }
  }

  public vibrate(durationMs: number = 20) {
    if (
      !this.hapticsEnabled ||
      prefersReducedMotion() ||
      typeof navigator === 'undefined' ||
      !navigator.vibrate
    ) return;
    this.defer(() => {
      try {
        navigator.vibrate(durationMs);
      } catch {
        // ignore
      }
    });
  }
}

export const soundHaptics = new SoundHapticsService();
