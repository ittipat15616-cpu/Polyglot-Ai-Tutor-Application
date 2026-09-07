const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

code = code.replace(
  'currentWeek: nextWeek,\n      dailyMissionsCompleted: [false, false, false, false, false]',
  'currentWeek: nextWeek,\n      currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),\n      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),\n      dailyMissionsCompleted: [false, false, false, false, false]'
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
