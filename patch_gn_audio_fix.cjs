const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

const oldHooks = `  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
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
  }, []);`;

code = code.replace(oldHooks, '');

const insertPos = code.indexOf('const [isAnimating, setIsAnimating] = useState(false);') + 'const [isAnimating, setIsAnimating] = useState(false);'.length;
code = code.substring(0, insertPos) + '\n' + oldHooks + code.substring(insertPos);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
