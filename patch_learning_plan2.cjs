const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

code = code.replace(
  "setQForm({ goal: '', timeframe: '', level: '', strengths: '', obstacles: '' });",
  "setQForm({ goal: '', timeframe: '', level: '', vocabPerDay: '', grammarPerDay: '', enSkill: 'Reading', strengths: '', obstacles: '' });"
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
