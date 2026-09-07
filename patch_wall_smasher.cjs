const fs = require('fs');
let code = fs.readFileSync('src/components/games/WallSmasherGame.tsx', 'utf8');

const importStatement = `import { areHomophones } from '../../utils/homophones';`;
if (!code.includes(importStatement)) {
    code = code.replace("import { saveGameStageStars, StageStarRecord } from '../../services/userPersistence';", "import { saveGameStageStars, StageStarRecord } from '../../services/userPersistence';\nimport { areHomophones } from '../../utils/homophones';");
}

const localGroupStart = code.indexOf('const homophoneGroups = [');
const localGroupEnd = code.indexOf('function normalizeThaiAccent', localGroupStart);

if (localGroupStart !== -1 && localGroupEnd !== -1) {
    code = code.slice(0, localGroupStart) + code.slice(localGroupEnd);
}

fs.writeFileSync('src/components/games/WallSmasherGame.tsx', code);
