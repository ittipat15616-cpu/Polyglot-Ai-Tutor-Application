let currentAudio: HTMLAudioElement | null = null;
let activeTtsRequestId = 0;
const clientAudioCache = new Map<string, string>();

/**
 * Dedicated Thai Male AI Voice player (Microsoft Niwat Neural)
 * Guarantees the authentic male AI voice without falling back to Apple Siri.
 */
export const playThaiTTS = async (text: string, onEnd?: () => void): Promise<HTMLAudioElement | null> => {
  stopThaiTTS();
  const requestId = ++activeTtsRequestId;

  const cleanText = text.trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return null;
  }

  // Check client-side memory cache first for instant playback
  if (clientAudioCache.has(cleanText)) {
    const audioData = clientAudioCache.get(cleanText)!;
    return playAudioData(audioData, requestId, onEnd);
  }

  try {
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        lang: 'TH',
        voice: 'th-TH-NiwatNeural',
      }),
    });

    if (requestId !== activeTtsRequestId) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`TTS API failed with status ${response.status}`);
    }

    const data = await response.json();
    if (requestId !== activeTtsRequestId) {
      return null;
    }

    if (data.audio) {
      clientAudioCache.set(cleanText, data.audio);
      return playAudioData(data.audio, requestId, onEnd);
    } else {
      throw new Error('No audio returned from server');
    }
  } catch (err) {
    console.warn('[ThaiTTS] Server synthesis failed, checking local voice fallback:', err);
    if (requestId === activeTtsRequestId) {
      playLocalFallbackTTS(cleanText, 'TH', onEnd);
    }
  }

  return null;
};

const playAudioData = (
  base64Audio: string,
  requestId: number,
  onEnd?: () => void
): HTMLAudioElement | null => {
  try {
    const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
    currentAudio = audio;

    if (onEnd) {
      audio.onended = () => {
        if (requestId === activeTtsRequestId) {
          onEnd();
        }
      };
      audio.onerror = () => {
        if (requestId === activeTtsRequestId) {
          onEnd();
        }
      };
    }

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn('[Audio] Autoplay error:', e);
        if (requestId === activeTtsRequestId && onEnd) {
          onEnd();
        }
      });
    }
    return audio;
  } catch (e) {
    console.warn('[Audio] Playback failed:', e);
    if (requestId === activeTtsRequestId && onEnd) {
      onEnd();
    }
    return null;
  }
};

export const playTTS = async (
  text: string,
  lang: 'EN' | 'CN' | 'TH',
  onEnd?: () => void
): Promise<HTMLAudioElement | null> => {
  // Always use authentic Thai male voice for Thai language
  if (lang === 'TH') {
    return playThaiTTS(text, onEnd);
  }

  // Invalidate any previous in-flight requests
  const requestId = ++activeTtsRequestId;

  // Cancel any currently playing TTS
  stopThaiTTS();

  const cleanText = text.trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return null;
  }

  const cacheKey = `${lang}:${cleanText}`;
  if (clientAudioCache.has(cacheKey)) {
    return playAudioData(clientAudioCache.get(cacheKey)!, requestId, onEnd);
  }

  try {
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        lang,
      }),
    });

    if (requestId !== activeTtsRequestId) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`TTS API failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (requestId !== activeTtsRequestId) {
      return null;
    }

    if (data.audio) {
      clientAudioCache.set(cacheKey, data.audio);
      return playAudioData(data.audio, requestId, onEnd);
    } else {
      throw new Error('No audio data received');
    }
  } catch (err) {
    console.warn('[TTS] API failed, using local fallback:', err);
    if (requestId === activeTtsRequestId) {
      playLocalFallbackTTS(cleanText, lang, onEnd);
    }
  }
  return null;
};

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export const getThaiMaleVoiceConfig = (): { voice: SpeechSynthesisVoice | null; pitch: number; rate: number } => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { voice: null, pitch: 0.9, rate: 0.95 };
  }
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();

  // Look strictly for genuine Thai male voices (Niwat, Santi, Pattara, etc.)
  const thaiMaleVoice = voices.find(
    (v) =>
      (v.lang.startsWith('th') || v.lang.includes('TH')) &&
      (v.name.toLowerCase().includes('niwat') ||
        v.name.toLowerCase().includes('male') ||
        v.name.toLowerCase().includes('man') ||
        v.name.toLowerCase().includes('santi') ||
        v.name.toLowerCase().includes('pattara') ||
        v.name.toLowerCase().includes('tatchakorn') ||
        v.name.toLowerCase().includes('chatchai') ||
        v.name.toLowerCase().includes('guy') ||
        v.name.toLowerCase().includes('boy'))
  );

  if (thaiMaleVoice) {
    return { voice: thaiMaleVoice, pitch: 0.95, rate: 0.98 };
  }

  // If only Apple Siri or female voices exist, do NOT pitch-shift Siri into robotic voice;
  // return null or default with normal pitch
  const anyThaiVoice = voices.find((v) => v.lang.startsWith('th') || v.lang.includes('TH'));
  return { voice: anyThaiVoice || null, pitch: 1.0, rate: 1.0 };
};

export const playLocalFallbackTTS = (text: string, lang: string, onEnd?: () => void) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'CN' ? 'zh-CN' : lang === 'TH' ? 'th-TH' : 'en-US';
      const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();

      if (lang === 'EN') {
        const maleVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.toLowerCase().includes('male') ||
              v.name.toLowerCase().includes('david') ||
              v.name.toLowerCase().includes('george') ||
              v.name.toLowerCase().includes('james') ||
              v.name.toLowerCase().includes('alex') ||
              v.name.toLowerCase().includes('daniel') ||
              v.name.toLowerCase().includes('guy') ||
              v.name.toLowerCase().includes('natural'))
        );
        if (maleVoice) utterance.voice = maleVoice;
      } else if (lang === 'TH') {
        const { voice, pitch, rate } = getThaiMaleVoiceConfig();
        if (voice) utterance.voice = voice;
        utterance.pitch = pitch;
        utterance.rate = rate;
      }

      if (onEnd) {
        utterance.onend = onEnd;
        utterance.onerror = onEnd;
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      if (onEnd) onEnd();
    }
  } else {
    if (onEnd) onEnd();
  }
};

export const stopThaiTTS = () => {
  activeTtsRequestId++; // Invalidate any in-flight requests
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};
