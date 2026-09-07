const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

code = code.replace(
  "import { loadStudyPlan, saveStudyPlan, StudyPlanData } from '../services/studyPlanService';",
  "import { loadStudyPlan, saveStudyPlan, StudyPlanData } from '../services/studyPlanService';\nimport { getVocabPerDay, getLessonDesc } from '../utils/curriculumHelper';"
);

const oldSubmit = `      vocabPerDay: parseInt(qForm.timeframe) <= 3 ? 30 : 15,
      lessonsPerDay: parseInt(qForm.timeframe) <= 3 ? 2 : 1,`;
const newSubmit = `      vocabPerDay: getVocabPerDay(tab, qForm.level, parseInt(qForm.timeframe) || 6),
      lessonsPerDay: 1,`;

code = code.replace(oldSubmit, newSubmit);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
