const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

code = code.replace(
  "const [isInitialized, setIsInitialized] = useState(false);",
  "const [isInitialized, setIsInitialized] = useState(false);\n  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');"
);
fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
