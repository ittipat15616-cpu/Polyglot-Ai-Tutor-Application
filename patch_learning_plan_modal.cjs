const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

code = code.replace(
  "import { loadStudyPlan, saveStudyPlan, StudyPlanData } from '../services/studyPlanService';",
  "import { loadStudyPlan, saveStudyPlan, deleteStudyPlan, StudyPlanData } from '../services/studyPlanService';"
);

const oldHandleFullDelete = `  const handleFullDelete = async () => {
    if (window.confirm('ลบแผนทั้งหมดแล้วประเมินใหม่?')) {
        setLoading(true);
        setPlanEN(null);
        setPlanCN(null);
        setIsQuestionnaire(true);
        setQStep(1);
        setLoading(false);
    }
  };`;
  
const newHandleFullDelete = `  const handleFullDelete = async () => {
    if (window.confirm('ลบแผนทั้งหมดแล้วประเมินใหม่?')) {
        setLoading(true);
        await deleteStudyPlan('EN');
        await deleteStudyPlan('CN');
        setPlanEN(null);
        setPlanCN(null);
        setIsQuestionnaire(true);
        setQStep(1);
        setLoading(false);
    }
  };`;

code = code.replace(oldHandleFullDelete, newHandleFullDelete);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
