const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// Update imports
code = code.replace(
  "import { motion, useAnimation, PanInfo } from 'motion/react';",
  "import { motion, AnimatePresence, useAnimation, PanInfo } from 'motion/react';"
);
code = code.replace(
  "import { ChevronLeft, Home, Play, RotateCcw, ArrowRight } from 'lucide-react';",
  "import { ChevronLeft, Home, Play, RotateCcw, ArrowRight, Volume2, CheckCircle2, XCircle, PenTool } from 'lucide-react';"
);
code = code.replace(
  "import HanziWriter from 'hanzi-writer';",
  "import HanziWriter from 'hanzi-writer';\nimport { useRef } from 'react';"
);

// We need to inject GoodnotesHanziWord component
const hanziComponent = `
function GoodnotesHanziWord({ word, onComplete }: { word: string, onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writersRef = useRef<any[]>([]);

  useEffect(() => {
    let isCancelled = false;
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    writersRef.current = [];

    const charSize = Math.max(80, Math.min(120, 300 / word.length));
    
    word.split('').forEach(char => {
      const charDiv = document.createElement('div');
      charDiv.style.width = \`\${charSize}px\`;
      charDiv.style.height = \`\${charSize}px\`;
      charDiv.style.margin = '2px';
      containerRef.current?.appendChild(charDiv);

      const writer = HanziWriter.create(charDiv, char, {
        width: charSize,
        height: charSize,
        padding: 5,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 50,
        showOutline: true
      });
      writersRef.current.push(writer);
    });

    const animateAll = async () => {
      for (const writer of writersRef.current) {
        if (isCancelled) break;
        await new Promise<void>(resolve => {
          writer.animateCharacter({ onComplete: resolve });
        });
      }
      if (!isCancelled) onComplete();
    };

    animateAll();

    return () => {
      isCancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [word, onComplete]);

  return <div ref={containerRef} className="flex flex-row flex-wrap justify-center items-center gap-2 mb-6" />;
}
`;

code = code.replace(
  "function DeckPlayer({",
  hanziComponent + "\nfunction DeckPlayer({"
);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
