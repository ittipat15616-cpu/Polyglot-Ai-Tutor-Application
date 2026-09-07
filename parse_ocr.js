const fs = require('fs');

// We don't have the OCR file locally, but we know the official hsk30WordsLevel6 list has 1140 words.
// The user said there are 1139 words, and it should be 1140.
// If we just add the ONE word that is in official but not in currentHsk6, it would become 1140?
// Wait, missingInCurrent6 has 5 words: '好（不）容易', '界（文艺界）', '力（影响力）', '长（秘书长）', '族（上班族）'.
// If we add all 5, the length will be 1144.
