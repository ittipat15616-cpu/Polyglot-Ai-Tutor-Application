const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

// 1. Add AnimatePresence import
code = code.replace(
  "import { EyeOff, Eye, ChevronLeft, ChevronRight, Home, Bot, Volume2, CheckCircle2, XCircle, BookOpen, Layers, Play, BookmarkCheck } from 'lucide-react';",
  "import { EyeOff, Eye, ChevronLeft, ChevronRight, Home, Bot, Volume2, CheckCircle2, XCircle, BookOpen, Layers, Play, BookmarkCheck } from 'lucide-react';\nimport { motion, AnimatePresence } from 'motion/react';"
);

// 2. Add slideDir state and transition in normal FlashcardPlayer
// Let's replace the handleNext / handlePrev to set slideDir
code = code.replace(
  "const [currentIndex, setCurrentIndex] = useState(0);",
  "const [currentIndex, setCurrentIndex] = useState(0);\n  const [slideDir, setSlideDir] = useState<'next'|'prev'>('next');"
);

code = code.replace(
  /const handleNext = \(\) => \{\n    setHasInteracted\(true\);\n    setCurrentIndex\(\(prev\) => \(prev < activeVocabList\.length - 1 \? prev \+ 1 : prev\)\);\n  \};/,
  `const handleNext = () => {
    setHasInteracted(true);
    setSlideDir('next');
    setCurrentIndex((prev) => (prev < activeVocabList.length - 1 ? prev + 1 : prev));
  };`
);

code = code.replace(
  /const handlePrev = \(\) => \{\n    setHasInteracted\(true\);\n    setCurrentIndex\(\(prev\) => \(prev > 0 \? prev - 1 : prev\)\);\n  \};/,
  `const handlePrev = () => {
    setHasInteracted(true);
    setSlideDir('prev');
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };`
);

// 3. Wrap normal flashcard in AnimatePresence
// Locate THE FLASHCARD ELEMENT
code = code.replace(
  /\{\/\* THE FLASHCARD ELEMENT \*\/\}\n          <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center min-h-\[420px\] relative">/,
  `{/* THE FLASHCARD ELEMENT */}
          <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: slideDir === 'next' ? 40 : -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: slideDir === 'next' ? -40 : 40 }}
                transition={{ duration: 0.15 }}
                className="w-full flex-1 flex flex-col items-center justify-center p-8 absolute inset-0"
              >`
);
// We need to close the AnimatePresence and motion.div right before Navigation Controls
code = code.replace(
  /\{\/\* Navigation Controls \(Separate from Save Status Buttons\) \*\/\}/,
  `         </motion.div>
            </AnimatePresence>
          </div>
          {/* Navigation Controls (Separate from Save Status Buttons) */}`
);

// We need to remove the duplicate closing tag of the original flashcard div, since we moved it above.
// But wait, the original flashcard div is closed right before Navigation Controls.
// Ah, the regex replacement:
// If I replace `</div>\n\n          {/* Navigation Controls`, it will match the closing of the original div.
code = code.replace(
  /<\/div>\n\n          \{\/\* Navigation Controls \(Separate from Save Status Buttons\) \*\/\}/,
  `  </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Controls (Separate from Save Status Buttons) */}`
);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
