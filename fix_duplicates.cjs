const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const lines = code.split('\n');

// Find submitQuestionnaire bounds
const submitStart = lines.findIndex(l => l.includes('const submitQuestionnaire = async () => {'));
const handleNextDay = lines.findIndex(l => l.includes('const handleNextDay = () => {'));
const handleNextMonth = lines.findIndex(l => l.includes('const handleNextMonth = () => {'));

// Remove duplicates in submitQuestionnaire
for (let i = submitStart; i < handleNextDay; i++) {
  if (lines[i].includes('currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15)') || 
      lines[i].includes('currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1)')) {
    lines[i] = '';
  }
}

// Remove duplicates in handleNextMonth
for (let i = handleNextMonth; i < lines.length; i++) {
  if (lines[i].includes('currentVocabIndex: (plan.currentVocabIndex || 1) + (plan.vocabPerDay || 15)') || 
      lines[i].includes('currentLessonIndex: (plan.currentLessonIndex || 1) + (plan.lessonsPerDay || 1)')) {
    lines[i] = '';
  }
}

fs.writeFileSync('src/components/LearningPlanModal.tsx', lines.join('\n'));
