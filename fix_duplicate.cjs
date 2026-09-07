const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// The first replacement was wrong and hit 3 places.
// We'll just replace the whole file since we know exactly what is wrong, 
// but it's easier to use a regex or string replacement carefully.

// Let's just fix it by replacing the lines 66, 330, 346.
const lines = code.split('\n');

// submitQuestionnaire
const submitStart = lines.findIndex(l => l.includes('const submitQuestionnaire = async () => {'));
const handleNextWeek = lines.findIndex(l => l.includes('const handleNextWeek = () => {'));
const handleNextMonth = lines.findIndex(l => l.includes('const handleNextMonth = () => {'));

// In submitQuestionnaire, remove the duplicated currentWeek
for (let i = submitStart; i < handleNextWeek; i++) {
    if (lines[i].includes('currentWeek: plan.currentWeek < 4 ? plan.currentWeek + 1 : plan.currentWeek,')) {
        lines[i] = ''; // remove
    }
}

// In handleNextMonth, remove the duplicated currentWeek
for (let i = handleNextMonth; i < lines.length; i++) {
    if (lines[i].includes('currentWeek: plan.currentWeek < 4 ? plan.currentWeek + 1 : plan.currentWeek,')) {
        lines[i] = ''; // remove
    }
}

fs.writeFileSync('src/components/LearningPlanModal.tsx', lines.join('\n'));
