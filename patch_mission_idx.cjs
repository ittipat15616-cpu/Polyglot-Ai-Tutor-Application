const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// For Exam: idx 2
// It was:
// done={plan.dailyMissionsCompleted[3]}
// onSkip={() => handleSkipMission(3)}
code = code.replace('done={plan.dailyMissionsCompleted[3]}', 'done={plan.dailyMissionsCompleted[2]}');
code = code.replace('onSkip={() => handleSkipMission(3)}', 'onSkip={() => handleSkipMission(2)}');

// For Lesson: idx 3
// It was:
// done={plan.dailyMissionsCompleted[4]}
// onSkip={() => handleSkipMission(4)}
code = code.replace('done={plan.dailyMissionsCompleted[4]}', 'done={plan.dailyMissionsCompleted[3]}');
code = code.replace('onSkip={() => handleSkipMission(4)}', 'onSkip={() => handleSkipMission(3)}');

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
