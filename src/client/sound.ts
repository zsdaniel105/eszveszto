export type SoundCue =
  | "select"
  | "ready"
  | "vote"
  | "category"
  | "sabotage"
  | "attack"
  | "question"
  | "correct"
  | "wrong"
  | "rank"
  | "finale"
  | "winner";
// Replace these modest original motifs with a licensed asset backend later.
const motifs: Record<SoundCue, number[]> = {
  select: [523],
  ready: [523, 659],
  vote: [587, 784],
  category: [392, 523],
  sabotage: [440, 659],
  attack: [330, 247, 330],
  question: [523, 784],
  correct: [523, 659, 784],
  wrong: [349, 294],
  rank: [587, 740, 880],
  finale: [392, 523, 659, 784],
  winner: [523, 659, 784, 1047],
};
export interface SoundBackend {
  unlock(): Promise<void>;
  running(): boolean;
  play(cue: SoundCue): void;
  suspend(): void;
  stop(): void;
}
class WebAudioBackend implements SoundBackend {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  async unlock() {
    const Constructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Constructor) return;
    this.context ??= new Constructor();
    if (this.context.state === "suspended") await this.context.resume();
  }
  running() {
    return this.context?.state === "running";
  }
  play(cue: SoundCue) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    this.stop();
    motifs[cue].forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.085;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      this.voices.add(oscillator);
      oscillator.onended = () => {
        this.voices.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + 0.14);
    });
  }
  stop() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
  }
  suspend() {
    this.stop();
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }
}
export class SoundController {
  private muted: boolean;
  private listeners = new Set<() => void>();
  private seen = new Set<string>();
  private lastPlayedAt = -Infinity;
  private feedbackUntil = -Infinity;
  constructor(
    private backend: SoundBackend,
    private storage?: Pick<Storage, "getItem" | "setItem">,
    private now = Date.now,
  ) {
    try {
      this.muted = storage?.getItem("eszveszto:sound-muted") === "true";
    } catch {
      this.muted = false;
    }
  }
  getMuted = () => this.muted;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async unlock(trusted: boolean) {
    if (!trusted || this.muted) return;
    try {
      await this.backend.unlock();
    } catch {
      /* Playback remains optional; a later gesture can retry. */
    }
  }
  toggle() {
    this.muted = !this.muted;
    if (this.muted) this.backend.stop();
    try {
      this.storage?.setItem("eszveszto:sound-muted", String(this.muted));
    } catch {
      /* Preference remains valid for this page. */
    }
    this.listeners.forEach((listener) => listener());
  }
  play(cue: SoundCue, eventId?: string, visible = true) {
    if (eventId) {
      if (this.seen.has(eventId)) return;
      this.seen.add(eventId);
      if (this.seen.size > 256)
        this.seen.delete(this.seen.values().next().value!);
    }
    if (this.muted || !visible || !this.backend.running()) return;
    const now = this.now();
    // One motif at a time. Decorative taps never interrupt confirmed feedback.
    if (
      cue === "select" &&
      (now - this.lastPlayedAt < 140 || now < this.feedbackUntil)
    )
      return;
    this.lastPlayedAt = now;
    if (cue !== "select")
      this.feedbackUntil = now + (motifs[cue].length - 1) * 85 + 140;
    try {
      this.backend.play(cue);
    } catch {
      this.backend.stop();
    }
  }
  suspend() {
    this.backend.suspend();
  }
}
let storage: Storage | undefined;
try {
  if (typeof window !== "undefined") storage = window.localStorage;
} catch {
  /* Storage can be unavailable. */
}
export const sound = new SoundController(new WebAudioBackend(), storage);
