const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// 1. Rewrite GoodnotesHanziWord
const oldHanziWord = /function GoodnotesHanziWord\(\{ word, onComplete \}: \{ word: string, onComplete: \(\) => void \}\) \{[\s\S]*?return <div ref=\{containerRef\} className="flex flex-row flex-wrap justify-center items-center gap-2 mb-6" \/>;\n\}/;

const newHanziWord = `function GoodnotesHanziWord({ word, isAnimating }: { word: string, isAnimating: boolean }) {
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
        showOutline: false,
        showCharacter: !isAnimating,
        strokeColor: '#1f2937', // text-gray-800
        strokeAnimationSpeed: 0.6,
        delayBetweenStrokes: 200,
      });
      writersRef.current.push(writer);
    });

    const runAnimation = async () => {
      while (!isCancelled && isAnimating) {
        for (const writer of writersRef.current) {
          if (isCancelled || !isAnimating) break;
          // Hide all characters first to show drawing effect clearly in a loop?
          // Actually HanziWriter animateCharacter will clear the character before animating it
          await new Promise<void>(resolve => {
            writer.animateCharacter({ onComplete: resolve });
          });
        }
        if (isCancelled || !isAnimating) break;
        // Small pause before looping again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    if (isAnimating) {
      runAnimation();
    } else {
      // Just ensure characters are shown statically
      writersRef.current.forEach(writer => {
        writer.hideOutline();
        writer.showCharacter();
      });
    }

    return () => {
      isCancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [word, isAnimating]);

  return <div ref={containerRef} className="flex flex-row flex-wrap justify-center items-center gap-2 mb-6" />;
}`;

code = code.replace(oldHanziWord, newHanziWord);

// 2. Rewrite DeckPlayer rendering of word
const oldWordRender = /\{!isAnimating \? \(\n              <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-6 text-center select-none">\n                \{currentWord\.word\}\n              <\/div>\n            \) : \(\n              <GoodnotesHanziWord word=\{currentWord\.word\} onComplete=\{.*\} \/>\n            \)\}/;

const newWordRender = `{lang === 'CN' ? (
              <GoodnotesHanziWord word={currentWord.word} isAnimating={isAnimating} />
            ) : (
              <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-6 text-center select-none">
                {currentWord.word}
              </div>
            )}`;

code = code.replace(oldWordRender, newWordRender);

// 3. Fix the PenTool button. If isAnimating, maybe allow toggling off?
// The user said: "พอกดเล่นอนิเมชั่นคือให้เล่นไปเรื่อยๆไม่ต้องหยุดครับ ... พอไปคำถัดไปแล้วอนิเมชั่นจะถูกปิดทันที ทำงานเหมือนคำแปลอะครับ"
// So we should make the button toggle isAnimating.
const oldPenButton = /<button \n                onClick=\{\(e\) => \{ e\.stopPropagation\(\); setIsAnimating\(true\); \}\}\n                className="absolute top-6 right-6 p-2\.5 bg-gray-50 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"\n              >\n                <PenTool size=\{24\} \/>\n              <\/button>/;

const newPenButton = `<button 
                onClick={(e) => { e.stopPropagation(); setIsAnimating(!isAnimating); }}
                className={\`absolute top-6 right-6 p-2.5 rounded-full transition-colors \${isAnimating ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}\`}
              >
                <PenTool size={24} />
              </button>`;
              
code = code.replace(oldPenButton, newPenButton);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
