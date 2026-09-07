const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const oldHandleNextDay = `  const handleNextDay = () => {
    let nextDay = plan.currentDay + 1;
    let nextWeek = plan.currentWeek;
    if (nextDay > 7 && nextDay <= 14) nextWeek = 2;
    else if (nextDay > 14 && nextDay <= 21) nextWeek = 3;
    else if (nextDay > 21) nextWeek = 4;

    onUpdate({
      ...plan,
      currentDay: nextDay,
      currentWeek: nextWeek,
      currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),
      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),
      dailyMissionsCompleted: [false, false, false, false, false]
    });
  };`;

const newHandleNextDay = `  const handleNextDay = () => {
    let nextDay = plan.currentDay + 1;
    
    onUpdate({
      ...plan,
      currentDay: nextDay,
      currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15),
      currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1),
      dailyMissionsCompleted: [false, false, false, false, false]
    });
  };`;

code = code.replace(oldHandleNextDay, newHandleNextDay);
fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
