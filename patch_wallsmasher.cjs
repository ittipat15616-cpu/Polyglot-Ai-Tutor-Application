const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const importStr = "import { calculateSimilarity } from '../../utils/similarity';";
const newImportStr = "import { calculateSimilarity } from '../../utils/similarity';\nimport { areHomophones } from '../../utils/homophones';";

code = code.replace(importStr, newImportStr);
fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
