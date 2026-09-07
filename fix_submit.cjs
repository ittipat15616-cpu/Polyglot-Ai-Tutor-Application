const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// The earlier replace 'overallProgressPercent: 0,' failed because there are spaces or newlines.
// Let's replace 'targetLevel: qForm.level,' with 'targetLevel: qForm.level,\n      enWeeklyPart: "Reading",'
code = code.replace(
  'targetLevel: qForm.level,',
  'targetLevel: qForm.level,\n      enWeeklyPart: "Reading",'
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
