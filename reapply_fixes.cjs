const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// 1. Imports
code = code.replace(
  "import { loadStudyPlan, saveStudyPlan, StudyPlanData } from '../services/studyPlanService';",
  "import { loadStudyPlan, saveStudyPlan, StudyPlanData } from '../services/studyPlanService';\nimport { getVocabPerDay, getLessonDesc } from '../utils/curriculumHelper';"
);

// 2. handleResetPlan and handleFullDelete
const startOfModalBody = code.indexOf('const currentPlan = tab === \'EN\' ? planEN : planCN;');
const resetFunc = `
  const handleResetPlan = async () => {
    if (window.confirm('คุณต้องการรีเซตแผนการเรียนทั้งหมดใช่หรือไม่?')) {
      setLoading(true);
      const en = await loadStudyPlan('EN');
      const cn = await loadStudyPlan('CN');
      if (en) await saveStudyPlan({ ...en, currentDay: 1, currentWeek: 1, currentMonth: 1, dailyMissionsCompleted: [false,false,false,false,false], weeklyMissionCompleted: false, overallProgressPercent: 0, enWeeklyPart: 'Reading', currentVocabIndex: 1, currentLessonIndex: 1 });
      if (cn) await saveStudyPlan({ ...cn, currentDay: 1, currentWeek: 1, currentMonth: 1, dailyMissionsCompleted: [false,false,false,false,false], weeklyMissionCompleted: false, overallProgressPercent: 0, currentVocabIndex: 1, currentLessonIndex: 1 });
      
      const newEn = await loadStudyPlan('EN');
      const newCn = await loadStudyPlan('CN');
      setPlanEN(newEn);
      setPlanCN(newCn);
      setLoading(false);
    }
  };

  const handleFullDelete = async () => {
    if (window.confirm('ลบแผนทั้งหมดแล้วประเมินใหม่?')) {
        setLoading(true);
        setPlanEN(null);
        setPlanCN(null);
        setIsQuestionnaire(true);
        setQStep(1);
        setLoading(false);
    }
  };
`;
code = code.slice(0, startOfModalBody) + resetFunc + code.slice(startOfModalBody);

// 3. submitQuestionnaire fixes
const oldSubmit = `vocabPerDay: parseInt(qForm.timeframe) <= 3 ? 30 : 15,
      lessonsPerDay: parseInt(qForm.timeframe) <= 3 ? 2 : 1,`;
const newSubmit = `vocabPerDay: getVocabPerDay(tab, qForm.level, parseInt(qForm.timeframe) || 6),
      lessonsPerDay: 1,`;
code = code.replace(oldSubmit, newSubmit);

code = code.replace(
  'targetLevel: qForm.level,',
  'targetLevel: qForm.level,\n      enWeeklyPart: "Reading",'
);

// 4. Header buttons
const headerEnd = code.indexOf('</button>\n        </div>');
const resetBtn = `
          {auth.currentUser?.email === 'ittipat15616@gmail.com' && (
             <div className="flex gap-2 mr-4">
                <button onClick={handleResetPlan} className="px-3 py-1 bg-rose-100 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-200">รีเซตความคืบหน้า</button>
                <button onClick={handleFullDelete} className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700">ลบแผนทิ้ง</button>
             </div>
          )}
`;
code = code.slice(0, headerEnd) + resetBtn + code.slice(headerEnd);

// 5. Pass onNextGoal to PlanDashboard
code = code.replace(
  '<PlanDashboard \n               plan={currentPlan} \n               onUpdate={(p) => {\n                 saveStudyPlan(p);\n                 if (tab === \'EN\') setPlanEN(p);\n                 else setPlanCN(p);\n               }} \n               onNavigate={(t) => {\n                 onClose();\n                 onNavigate(t);\n               }}\n             />',
  '<PlanDashboard \n               plan={currentPlan} \n               onUpdate={(p) => {\n                 saveStudyPlan(p);\n                 if (tab === \'EN\') setPlanEN(p);\n                 else setPlanCN(p);\n               }} \n               onNavigate={(t) => {\n                 onClose();\n                 onNavigate(t);\n               }}\n               onNextGoal={handleFullDelete}\n             />'
);

code = code.replace(
  'function PlanDashboard({ plan, onUpdate, onNavigate }: { plan: StudyPlanData, onUpdate: (p: StudyPlanData) => void, onNavigate: (tab: string) => void }) {',
  'function PlanDashboard({ plan, onUpdate, onNavigate, onNextGoal }: { plan: StudyPlanData, onUpdate: (p: StudyPlanData) => void, onNavigate: (tab: string) => void, onNextGoal: () => void }) {'
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
