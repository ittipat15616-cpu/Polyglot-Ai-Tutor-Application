const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

code = code.replace(
  "(plan.currentWeek % 2 !== 0 ? 'ศึกษาข้อสอบ HSK' : 'ศึกษาข้อสอบ HSKK')",
  "(plan.currentWeek <= 2 ? 'ศึกษาข้อสอบ HSK' : 'ศึกษาข้อสอบ HSKK')"
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
