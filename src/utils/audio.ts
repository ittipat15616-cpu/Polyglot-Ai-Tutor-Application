let currentAudio: HTMLAudioElement | null = null;
let activeTtsRequestId = 0;

export const playTTS = async (text: string, lang: 'EN' | 'CN' | 'TH', onEnd?: () => void) => {
  // Invalidate any previous in-flight requests
  const requestId = ++activeTtsRequestId;

  // Cancel any currently playing TTS
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }

  try {
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        lang,
      })
    });
    
    // If a newer TTS request was triggered while fetching, ignore this result
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
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      currentAudio = audio;
      
      if (onEnd) {
        audio.onended = () => {
          if (requestId === activeTtsRequestId) {
            onEnd();
          }
        };
      }
      
      try {
        await audio.play();
        return audio;
      } catch (e) {
        console.warn('Audio play prevented by browser, using fallback:', e);
        if (requestId === activeTtsRequestId) {
          playLocalFallbackTTS(text, lang, onEnd);
        }
      }
    } else {
      throw new Error('No audio data received');
    }
  } catch (err) {
    console.warn("TTS API failed, using local fallback", err);
    if (requestId === activeTtsRequestId) {
      playLocalFallbackTTS(text, lang, onEnd);
    }
  }
  return null;
};

export const playLocalFallbackTTS = (text: string, lang: string, onEnd?: () => void) => {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'CN' ? 'zh-CN' : lang === 'TH' ? 'th-TH' : 'en-US';
      const voices = window.speechSynthesis.getVoices();

      if (lang === 'EN') {
        const maleVoice = voices.find(v => 
          v.lang.startsWith('en') && (
            v.name.toLowerCase().includes('male') || 
            v.name.toLowerCase().includes('david') || 
            v.name.toLowerCase().includes('george') || 
            v.name.toLowerCase().includes('james') || 
            v.name.toLowerCase().includes('alex') || 
            v.name.toLowerCase().includes('daniel') ||
            v.name.toLowerCase().includes('guy') ||
            v.name.toLowerCase().includes('natural')
          )
        );
        if (maleVoice) utterance.voice = maleVoice;
      } else if (lang === 'TH') {
        // Find Thai male voice (e.g. Niwat, Santi, Pattara, or male indicator)
        const thaiMaleVoice = voices.find(v => 
          (v.lang.startsWith('th') || v.lang.includes('TH')) && (
            v.name.toLowerCase().includes('niwat') || 
            v.name.toLowerCase().includes('male') || 
            v.name.toLowerCase().includes('man') || 
            v.name.toLowerCase().includes('santi') || 
            v.name.toLowerCase().includes('pattara') || 
            v.name.toLowerCase().includes('tatchakorn')
          )
        );
        if (thaiMaleVoice) {
          utterance.voice = thaiMaleVoice;
        } else {
          // If only default female or generic voice is installed, lower pitch to natural masculine range
          utterance.pitch = 0.85;
          utterance.rate = 0.95;
        }
      }

      if (onEnd) {
        utterance.onend = onEnd;
        utterance.onerror = onEnd;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      if (onEnd) onEnd();
    }
  } else {
    if (onEnd) onEnd();
  }
};

export const playThaiTTS = async (text: string, onEnd?: () => void) => {
  return playTTS(text, 'TH', onEnd);
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
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

