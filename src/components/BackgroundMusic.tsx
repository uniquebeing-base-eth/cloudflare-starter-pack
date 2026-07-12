import { useEffect, useState } from "react";
import { Music, Pause } from "lucide-react";
import { audio } from "@/lib/audio";

/**
 * Boots the Shreds theme song on app open. Renders a small header button
 * (icon-only when `bare`) that toggles play/pause and can restart the track
 * after it naturally ends.
 */
export function BackgroundMusic({ bare = false }: { bare?: boolean }) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audio.init();
    const unsub = audio.subscribe((s) => setPlaying(s.playing));
    void audio.startTheme();
    const kick = () => { void audio.startTheme(); cleanup(); };
    const cleanup = () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      window.removeEventListener("touchstart", kick);
    };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    window.addEventListener("touchstart", kick, { once: true });
    return () => { unsub(); cleanup(); };
  }, []);

  const toggle = () => { void audio.toggleTheme(); };

  if (bare) {
    return (
      <button
        onClick={toggle}
        aria-label={playing ? "Pause theme song" : "Play theme song"}
        className="icon-tile w-9 h-9 rounded-lg flex items-center justify-center active:scale-95 transition"
      >
        {playing
          ? <Pause className="w-4 h-4 text-shred" />
          : <Music className="w-4 h-4 text-shred" />}
      </button>
    );
  }

  return null;
}
