const fs = require('fs');
let code = fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8');

code = code.replace(
  /let globalReminderDeck = null;\n  for \(let i = 0; i < decks\.length; i\+\+\) \{\n    if \(states\[i\] && states\[i\]\.isCompleted && states\[i\]\.reviewKeys\.length > 0\) \{\n      globalReminderDeck = i;\n      break;\n    \}\n  \}\n\n/,
  ""
);

code = code.replace(
  /\{globalReminderDeck !== null && \([\s\S]*?\}\)/,
  ""
);

fs.writeFileSync('src/components/GoodnotesMode.tsx', code);
