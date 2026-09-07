const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Add getGrammarDesc and getSkillDesc to imports
code = code.replace(
  "import { getVocabPerDay, getLessonDesc, getMonthlyExpectedOutcome } from '../utils/curriculumHelper';",
  "import { getVocabPerDay, getLessonDesc, getGrammarDesc, getSkillDesc, getMonthlyExpectedOutcome } from '../utils/curriculumHelper';"
);

// Update qForm
code = code.replace(
  `  const [qForm, setQForm] = useState({
    goal: '',
    timeframe: '',
    level: '',
    strengths: '',
    obstacles: ''
  });`,
  `  const [qForm, setQForm] = useState({
    goal: '',
    timeframe: '',
    level: '',
    vocabPerDay: '',
    grammarPerDay: '',
    enSkill: 'Reading',
    strengths: '',
    obstacles: ''
  });`
);

// Update submitQuestionnaire
const oldSubmit = `  const submitQuestionnaire = async () => {
    setLoading(true);
    // Determine overall percentage based on timeframe? Just start at 0
    const newPlan: StudyPlanData = {
      lang: tab,
      goal: qForm.goal,
      timeframe: qForm.timeframe,
      level: qForm.level,
      strengths: qForm.strengths,
      obstacles: qForm.obstacles,
      targetLevel: qForm.level,
      enWeeklyPart: "Reading",
      vocabPerDay: getVocabPerDay(tab, qForm.level, parseInt(qForm.timeframe) || 6),
      lessonsPerDay: 1,
      currentVocabIndex: 1,
      currentLessonIndex: 1,
      overallProgressPercent: 0,
      currentMonth: 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false,false,false,false,false],
      weeklyMissionCompleted: false,
      monthlyMissionCompleted: false
    };`;

const newSubmit = `  const submitQuestionnaire = async () => {
    setLoading(true);
    // adjust target level up by 1
    let targetLevel = qForm.level;
    if (tab === 'CN') {
       if (targetLevel === 'Beginner') targetLevel = 'HSK1';
       else if (targetLevel === 'HSK1') targetLevel = 'HSK2';
       else if (targetLevel === 'HSK2') targetLevel = 'HSK3';
       else if (targetLevel === 'HSK3') targetLevel = 'HSK4';
       else if (targetLevel === 'HSK4') targetLevel = 'HSK5';
       else if (targetLevel === 'HSK5') targetLevel = 'HSK6';
       else if (targetLevel === 'HSK6') targetLevel = 'HSK6';
    } else {
       if (targetLevel === 'Beginner') targetLevel = 'A1';
       else if (targetLevel === 'A1') targetLevel = 'A2';
       else if (targetLevel === 'A2') targetLevel = 'B1';
       else if (targetLevel === 'B1') targetLevel = 'B2';
       else if (targetLevel === 'B2') targetLevel = 'C1';
       else if (targetLevel === 'C1') targetLevel = 'C2';
       else if (targetLevel === 'C2') targetLevel = 'C2';
    }

    const vocabDefault = getVocabPerDay(tab, qForm.level, parseInt(qForm.timeframe) || 6);

    const newPlan: StudyPlanData = {
      lang: tab,
      goal: qForm.goal,
      timeframe: qForm.timeframe,
      level: qForm.level,
      strengths: qForm.strengths,
      obstacles: qForm.obstacles,
      targetLevel: targetLevel,
      enWeeklyPart: tab === 'EN' ? qForm.enSkill : "Reading",
      vocabPerDay: parseInt(qForm.vocabPerDay) || vocabDefault,
      lessonsPerDay: parseInt(qForm.grammarPerDay) || 1,
      currentVocabIndex: 1,
      currentLessonIndex: 1,
      overallProgressPercent: 0,
      currentMonth: 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false,false,false,false,false,false],
      weeklyMissionCompleted: false,
      monthlyMissionCompleted: false
    };`;
code = code.replace(oldSubmit, newSubmit);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
