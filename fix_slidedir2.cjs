const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

if (!code.includes("const [slideDir, setSlideDir]")) {
  code = code.replace(
    "const [isFlipped, setIsFlipped] = useState(false);",
    "const [isFlipped, setIsFlipped] = useState(false);\n  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');"
  );
  fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
}
