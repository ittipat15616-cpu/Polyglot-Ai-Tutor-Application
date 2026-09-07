const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const match = `    return false;
  }, []);`;
const newMatch = `    return false;
  }, [vocabList, activeLang]);`;
code = code.replace(match, newMatch);
fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
