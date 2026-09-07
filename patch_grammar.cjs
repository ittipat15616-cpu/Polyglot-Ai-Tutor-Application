const fs = require('fs');
let code = fs.readFileSync('src/utils/curriculumHelper.ts', 'utf8');

const oldGrammarDesc = `export const getGrammarDesc = (plan: StudyPlanData) => {
  const dayInWeek = ((plan.currentDay - 1) % 7) + 1; // 1 to 7
  const grammarPattern = [3, 2, 3, 2, 3, 3, 2];
  const count = grammarPattern[dayInWeek - 1];
  let startSub = 1;
  for (let i = 0; i < dayInWeek - 1; i++) {
    startSub += grammarPattern[i];
  }
  const endSub = startSub + count - 1;
  const getChap = (sub: number) => {
    if (sub <= 8) return \`1.\${sub}\`;
    if (sub <= 13) return \`2.\${sub - 8}\`;
    return \`3.\${sub - 13}\`;
  };
  return \`เรียน Grammar บทที่ \${getChap(startSub)} ถึง \${getChap(endSub)}\`;
};`;

const newGrammarDesc = `export const getGrammarDesc = (plan: StudyPlanData) => {
  const currentTotalLessonIndex = plan.currentLessonIndex || 1;
  const count = plan.lessonsPerDay || 1;
  const startSub = currentTotalLessonIndex;
  const endSub = startSub + count - 1;
  
  const getChap = (sub: number) => {
    // Just a continuous numbering assuming roughly 20-30 subtopics per level
    // We can simplify by just saying "บทย่อยที่ X" or keep the logic
    const mainChap = Math.floor((sub - 1) / 5) + 1;
    const subChap = ((sub - 1) % 5) + 1;
    return \`\${mainChap}.\${subChap}\`;
  };
  
  if (count === 1) {
    return \`เรียน Grammar บทที่ \${getChap(startSub)}\`;
  }
  return \`เรียน Grammar บทที่ \${getChap(startSub)} ถึง \${getChap(endSub)}\`;
};`;

code = code.replace(oldGrammarDesc, newGrammarDesc);
fs.writeFileSync('src/utils/curriculumHelper.ts', code);
