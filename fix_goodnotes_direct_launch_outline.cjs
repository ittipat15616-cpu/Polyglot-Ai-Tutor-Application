const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// 1. Direct Launch support in GoodnotesMode
const oldGoodnotesMode = /export default function GoodnotesMode\(\{[\s\S]*?const decks = getDecks\(allLevelVocab\.length\);/;

const newGoodnotesMode = `export default function GoodnotesMode({
  level,
  lang,
  allLevelVocab,
  onBack,
  directLaunch
}: any) {
  const [activeDeckIndex, setActiveDeckIndex] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(!!directLaunch);
  const decks = getDecks(allLevelVocab.length);

  useEffect(() => {
    let isMounted = true;
    if (directLaunch) {
      async function prep() {
        let s = await loadGoodnotesDeckState(level, lang, directLaunch.deckIndex);
        if (directLaunch.mode === 'review' && s) {
          s.runMode = 'review';
          s.currentIndex = 0;
          s.isCompleted = false;
          s.sessionKeys = [...s.reviewKeys];
          await saveGoodnotesDeckState(s);
        } else if (directLaunch.mode === 'next') {
          if (!s) {
            const deckCards = decks[directLaunch.deckIndex];
            if (deckCards) {
              const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
              s = {
                level, lang, deckIndex: directLaunch.deckIndex,
                masteredKeys: [],
                reviewKeys: deckVocab.map((w: any) => \`\${level}_\${w.word}\`),
                sessionKeys: deckVocab.map((w: any) => \`\${level}_\${w.word}\`),
                currentIndex: 0, runMode: 'all', isCompleted: false, updatedAt: Date.now()
              };
              await saveGoodnotesDeckState(s);
            }
          }
        }
        if (isMounted) {
          setActiveDeckIndex(directLaunch.deckIndex);
          setIsPreparing(false);
        }
      }
      prep();
    } else {
      if (isMounted) setIsPreparing(false);
    }
    return () => { isMounted = false; };
  }, [directLaunch, level, lang]);

  if (isPreparing) {
    return <div className="flex flex-col items-center justify-center h-full"><div className="text-gray-500 font-bold">กำลังเตรียมข้อมูล...</div></div>;
  }`;

code = code.replace(oldGoodnotesMode, newGoodnotesMode);

// 2. Fix the Hanzi outline bug
const oldHanziCreate = /const writer = HanziWriter\.create\(charDiv, char, \{[\s\S]*?delayBetweenStrokes: 200,\n      \}\);/;

const newHanziCreate = `const writer = HanziWriter.create(charDiv, char, {
        width: charSize,
        height: charSize,
        padding: 5,
        showOutline: true,
        outlineColor: '#e5e7eb',
        showCharacter: !isAnimating,
        strokeColor: '#1f2937', // text-gray-800
        strokeAnimationSpeed: 0.6,
        delayBetweenStrokes: 200,
      });`;

code = code.replace(oldHanziCreate, newHanziCreate);

// 3. Fix the prompt select bugs in DeckList (so "review" uses only review keys, "all" uses all keys)
const oldHandlePromptSelect = /const handlePromptSelect = \(index: number, mode: 'all' \| 'review'\) => \{[\s\S]*?\}\n  \};/;

const newHandlePromptSelect = `const handlePromptSelect = (index: number, mode: 'all' | 'review') => {
    const state = states[index];
    if (state) {
      state.runMode = mode;
      state.currentIndex = 0;
      state.isCompleted = false;
      if (mode === 'all') {
        const deckCards = decks[index];
        const deckVocab = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
        state.sessionKeys = deckVocab.map((w: any) => \`\${level}_\${w.word}\`);
      } else {
        state.sessionKeys = [...state.reviewKeys];
      }
      saveGoodnotesDeckState(state).then(() => {
        onSelectDeck(index);
      });
    }
  };`;

// Because the original handlePromptSelect might not have had `decks` or `allLevelVocab` in scope properly in earlier patches, let's make sure it's correct. Wait, DeckList receives `allLevelVocab`? No, DeckList receives `level, lang, decks, onBack, onSelectDeck`. Let's pass `allLevelVocab` to DeckList.

const oldDeckListCall = /<DeckList \n         level=\{level\} \n         lang=\{lang\} \n         decks=\{decks\} \n         onBack=\{onBack\} \n         onSelectDeck=\{setActiveDeckIndex\} \n       \/>/;

const newDeckListCall = `<DeckList 
         level={level} 
         lang={lang} 
         decks={decks}
         allLevelVocab={allLevelVocab}
         onBack={onBack} 
         onSelectDeck={setActiveDeckIndex} 
       />`;
code = code.replace(oldDeckListCall, newDeckListCall);

code = code.replace(/function DeckList\(\{ level, lang, decks, onBack, onSelectDeck \}: any\) \{/, `function DeckList({ level, lang, decks, allLevelVocab, onBack, onSelectDeck }: any) {`);

code = code.replace(oldHandlePromptSelect, newHandlePromptSelect);


fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
