let currentAudio: HTMLAudioElement | null = null;

export const playTTS = async (text: string, lang: 'EN' | 'CN' | 'TH', onEnd?: () => void) => {
  // Cancel any currently playing TTS
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
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
    
    if (!response.ok) {
      throw new Error(`TTS API failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.audio) {
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      currentAudio = audio;
      
      if (onEnd) {
        audio.onended = onEnd;
      }
      
      await audio.play().catch(e => {
        console.warn('Audio play prevented by browser, using fallback:', e);
        playLocalFallbackTTS(text, lang, onEnd);
      });
      return audio;
    } else {
       throw new Error('No audio data received');
    }
  } catch (err) {
    console.warn("TTS API failed, using local fallback", err);
    playLocalFallbackTTS(text, lang, onEnd);
  }
  return null;
};

export const playLocalFallbackTTS = (text: string, lang: string, onEnd?: () => void) => {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'CN' ? 'zh-CN' : lang === 'TH' ? 'th-TH' : 'en-US';
      if (lang === 'EN') {
        const voices = window.speechSynthesis.getVoices();
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
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
