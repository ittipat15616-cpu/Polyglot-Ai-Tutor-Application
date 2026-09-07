const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const oldSpeechInit = `    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = activeLang === 'CN' ? 'zh-CN' : 'en-US';
    if (false) {
      recognition.lang = 'th-TH';
    } else {
      recognition.lang = activeLang === 'CN' ? 'zh-CN' : 'en-US';
    }

    recognition.onresult = (event: any) => {
      if (!isPlayingRef.current || isSmashedRef.current) return;
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setSpokenTranscript(currentTranscript);

      const currentWord = targetWordsRef.current[currentIndexRef.current];
      const currentMode = promptModeRef.current;
      if (currentWord && checkSpokenMatch(currentTranscript, currentWord, currentMode)) {
        handleSmashSuccess();
      }
    };`;

const newSpeechInit = `    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.lang = activeLang === 'CN' ? 'zh-CN' : 'en-US';

    recognition.onresult = (event: any) => {
      if (!isPlayingRef.current || isSmashedRef.current) return;
      
      const currentWord = targetWordsRef.current[currentIndexRef.current];
      const currentMode = promptModeRef.current;
      if (!currentWord) return;

      let currentTranscript = '';
      let isMatch = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
        
        // Check all alternatives to handle homophones
        for (let j = 0; j < event.results[i].length; j++) {
          const altText = event.results[i][j].transcript;
          if (checkSpokenMatch(altText, currentWord, currentMode)) {
            isMatch = true;
          }
        }
      }
      
      setSpokenTranscript(currentTranscript);

      if (isMatch) {
        handleSmashSuccess();
      }
    };`;

code = code.replace(oldSpeechInit, newSpeechInit);

fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
