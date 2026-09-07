const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Pass handleFullDelete to PlanDashboard
code = code.replace(
  '<PlanDashboard \n               plan={currentPlan} \n               onUpdate={(p) => {\n                 saveStudyPlan(p);\n                 if (tab === \'EN\') setPlanEN(p);\n                 else setPlanCN(p);\n               }} \n               onNavigate={(t) => {\n                 onClose();\n                 onNavigate(t);\n               }}\n             />',
  '<PlanDashboard \n               plan={currentPlan} \n               onUpdate={(p) => {\n                 saveStudyPlan(p);\n                 if (tab === \'EN\') setPlanEN(p);\n                 else setPlanCN(p);\n               }} \n               onNavigate={(t) => {\n                 onClose();\n                 onNavigate(t);\n               }}\n               onNextGoal={handleFullDelete}\n             />'
);

code = code.replace(
  'function PlanDashboard({ plan, onUpdate, onNavigate }: { plan: StudyPlanData, onUpdate: (p: StudyPlanData) => void, onNavigate: (tab: string) => void }) {',
  'function PlanDashboard({ plan, onUpdate, onNavigate, onNextGoal }: { plan: StudyPlanData, onUpdate: (p: StudyPlanData) => void, onNavigate: (tab: string) => void, onNextGoal: () => void }) {'
);

code = code.replace(
  'handleFullDelete();\n                }',
  'onNextGoal();\n                }'
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
