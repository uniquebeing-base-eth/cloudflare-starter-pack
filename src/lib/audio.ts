// Global theme + shred audio manager. Assets live in /public/audio so they
// ship with the deployed build (works in MiniPay outside the preview).
// Theme plays once (no loop) on app open; user can pause/replay from header.
type Listener = (state: { playing: boolean; ended: boolean }) => void;

type AudioBus = {
  theme: HTMLAudioElement | null;
  shred: HTMLAudioElement | null;
  started: boolean;
  ended: boolean;
  listeners: Set<Listener>;
};

const bus: AudioBus = { theme: null, shred: null, started: false, ended: false, listeners: new Set() };

function ensure() {
  if (typeof window === "undefined") return;
  if (!bus.theme) {
    const t = new Audio("/audio/theme.mp3");
    t.loop = false;
    t.preload = "auto";
    t.volume = THEME_VOL;
    t.addEventListener("ended", () => { bus.ended = true; emit(); });
    t.addEventListener("play", emit);
    t.addEventListener("pause", emit);
    bus.theme = t;
  }
  if (!bus.shred) {
    const s = new Audio("/audio/shred.m4a");
    s.preload = "auto";
    s.volume = 0.9;
    bus.shred = s;
  }
}

const THEME_VOL = 0.4;

function emit() {
  const t = bus.theme;
  const state = { playing: !!t && !t.paused && !t.ended, ended: !!t?.ended };
  bus.listeners.forEach((l) => l(state));
}

function fade(el: HTMLAudioElement, to: number, ms: number) {
  const from = el.volume;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const audio = {
  init() { ensure(); },
  async startTheme() {
    ensure();
    if (!bus.theme || bus.started) return;
    try {
      bus.theme.volume = THEME_VOL;
      await bus.theme.play();
      bus.started = true;
      emit();
    } catch { /* autoplay blocked — will start on first user gesture */ }
  },
  async toggleTheme() {
    ensure();
    if (!bus.theme) return;
    if (bus.theme.ended || bus.theme.currentTime >= bus.theme.duration - 0.05) {
      bus.theme.currentTime = 0;
      bus.ended = false;
    }
    if (bus.theme.paused) {
      bus.theme.volume = THEME_VOL;
      try { await bus.theme.play(); bus.started = true; } catch { /* noop */ }
    } else {
      bus.theme.pause();
    }
    emit();
  },
  duckTheme() {
    ensure();
    if (bus.theme && !bus.theme.paused) fade(bus.theme, THEME_VOL * 0.15, 260);
  },
  restoreTheme() {
    ensure();
    if (bus.theme && !bus.theme.paused) fade(bus.theme, THEME_VOL, 600);
  },
  playShred() {
    ensure();
    if (!bus.shred) return;
    try { bus.shred.currentTime = 0; void bus.shred.play(); } catch { /* noop */ }
  },
  getShredDuration() {
    ensure();
    const d = bus.shred?.duration;
    return isFinite(d ?? NaN) ? (d as number) : 1.0;
  },
  isPlaying() { ensure(); return !!bus.theme && !bus.theme.paused && !bus.theme.ended; },
  subscribe(l: Listener) {
    bus.listeners.add(l);
    l({ playing: this.isPlaying(), ended: !!bus.theme?.ended });
    return () => bus.listeners.delete(l);
  },
};
