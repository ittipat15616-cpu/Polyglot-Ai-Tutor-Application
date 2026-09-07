const fs = require('fs');
let code = fs.readFileSync('src/components/FlashcardsArea.tsx', 'utf8');

// We will find the index of "          {/* Navigation Controls (Separate from Save Status Buttons) */}"
// and find the index of "            {/* Translation Section */}"
// and we'll just write a regex that matches everything between them to see.

code = code.replace(/<\/div>\s*<\/div>\s*<\/motion\.div>\s*<\/AnimatePresence>\s*<\/div>/g, 
  "</div>\n          </motion.div>\n        </AnimatePresence>\n      </div>"
);

fs.writeFileSync('src/components/FlashcardsArea.tsx', code);
