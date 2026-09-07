const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

// Update imports
code = code.replace(
  "import { motion, useAnimation, PanInfo } from 'motion/react';",
  "import { motion, AnimatePresence, useAnimation, PanInfo } from 'motion/react';"
);
code = code.replace(
  "import { ChevronLeft, Home, Play, RotateCcw, ArrowRight } from 'lucide-react';",
  "import { ChevronLeft, Home, Play, RotateCcw, ArrowRight, Volume2, CheckCircle2, XCircle, Edit3 } from 'lucide-react';"
);
code = code.replace(
  "import HanziWriter from 'hanzi-writer';",
  "import HanziWriter from 'hanzi-writer';\nimport { useRef } from 'react';"
);

// Update DeckList handlePromptSelect
code = code.replace(
  "const handlePromptSelect = (index: number, mode: 'all' | 'review') => {",
  `const handlePromptSelect = (index: number, mode: 'all' | 'review') => {
    const state = states[index];
    if (state) {
      state.runMode = mode;
      state.currentIndex = 0;
      const deckCards = decks[index];
      const allDeckWords = allLevelVocab.slice(deckCards.start, deckCards.end + 1);
      state.sessionKeys = mode === 'all' 
        ? allDeckWords.map((w: any) => \`\${level}_\${w.word}\`)
        : [...state.reviewKeys];
      state.isCompleted = false;
      saveGoodnotesDeckState(state).then(() => {
        onSelectDeck(index);
      });
    } else {
      onSelectDeck(index);
    }
  };
  
  // To avoid duplicate code, we can just return early.`
);
// Above replace might be brittle, let's write a proper script to replace DeckPlayer entirely instead, because there are a lot of changes.
