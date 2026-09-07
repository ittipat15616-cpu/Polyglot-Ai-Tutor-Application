const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

const oldPlayAudio = `  const playAudio = () => {
    if (!currentWord) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = currentWord.word;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  };`;

const newPlayAudio = `  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (e) {}
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    };
  }, []);

  const playAudio = async () => {
    if (!currentWord) return;
    const wordText = currentWord.word;
    setIsPlayingAudio(true);

    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch(e) {}
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch(e) {}
    }

    try {
      const reqBody: any = { text: wordText, lang: lang === 'CN' ? 'CN' : 'EN' };
      if (lang !== 'CN') {
        reqBody.voice = 'en-US-ChristopherNeural';
      }
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      const data = await response.json();
      if (data.audio) {
        const audio = new Audio(\`data:audio/mp3;base64,\${data.audio}\`);
        audioRef.current = audio;
        audio.onended = () => setIsPlayingAudio(false);
        audio.onerror = () => setIsPlayingAudio(false);
        audio.play().catch(e => {
          console.warn('Audio play prevented by browser, using fallback:', e);
          playLocalFallback(wordText);
        });
        return;
      } else {
        throw new Error('No audio data received');
      }
    } catch (e) {
      console.error('TTS error', e);
      playLocalFallback(wordText);
    }
  };

  const playLocalFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        if (lang !== 'CN') {
          const voices = window.speechSynthesis.getVoices();
          const maleVoice = voices.find(v => 
            v.lang.startsWith('en') && (
              v.name.toLowerCase().includes('male') || 
              v.name.toLowerCase().includes('david') || 
              v.name.toLowerCase().includes('george') || 
              v.name.toLowerCase().includes('mark')
            )
          );
          if (maleVoice) utterance.voice = maleVoice;
        }
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Fallback speech synthesis failed', err);
        setIsPlayingAudio(false);
      }
    } else {
      setIsPlayingAudio(false);
    }
  };`;

code = code.replace(oldPlayAudio, newPlayAudio);

// Let's also update the Volume button in DeckPlayer to show animation when playing audio.
const oldVolumeButton = `<Volume2 size={24} />`;
const newVolumeButton = `<Volume2 size={24} className={isPlayingAudio ? 'animate-pulse' : ''} />`;
code = code.replace(oldVolumeButton, newVolumeButton);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
