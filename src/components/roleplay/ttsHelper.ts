let currentAudio: HTMLAudioElement | null = null;
const audioDataUriCache = new Map<string, string>();

export function stopRoleplayPhraseAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export async function playRoleplayPhraseAudio(
  text: string,
  lang: 'EN' | 'CN'
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  stopRoleplayPhraseAudio();

  const cacheKey = `${lang}:${clean}`;
  let dataUri = audioDataUriCache.get(cacheKey);

  if (!dataUri) {
    try {
      const resp = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, lang }),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json?.audio && typeof json.audio === 'string') {
          dataUri = `data:audio/mp3;base64,${json.audio}`;
          audioDataUriCache.set(cacheKey, dataUri);
          if (audioDataUriCache.size > 120) {
            const firstKey = audioDataUriCache.keys().next().value;
            if (firstKey) audioDataUriCache.delete(firstKey);
          }
        }
      }
    } catch (e) {
      console.warn('[Roleplay TTS] /api/synthesize failed, falling back to speechSynthesis:', e);
    }
  }

  if (dataUri) {
    await new Promise<void>((resolve) => {
      const audio = new Audio(dataUri);
      currentAudio = audio;
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      audio.play().catch(() => {
        if (currentAudio === audio) currentAudio = null;
        resolve();
      });
    });
    return;
  }

  // Fallback to Web Speech API
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    await new Promise<void>((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        u.rate = 0.95;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }
}

export function playObjectiveChime() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880.0]; // D5 -> A5 gentle pleasant chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.34);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.36);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {}
}
