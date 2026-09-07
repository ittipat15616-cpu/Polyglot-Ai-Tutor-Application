const fs = require('fs');

// 1. Update StudyPlanData interface
let sp = fs.readFileSync('src/services/studyPlanService.ts', 'utf8');
if (!sp.includes('monthlyMissionCompleted')) {
  sp = sp.replace('weeklyMissionCompleted: boolean;', 'weeklyMissionCompleted: boolean;\n  monthlyMissionCompleted?: boolean;');
  fs.writeFileSync('src/services/studyPlanService.ts', sp);
  console.log('Updated studyPlanService.ts');
}

// 2. Update expected outcome in curriculumHelper.ts
let ch = fs.readFileSync('src/utils/curriculumHelper.ts', 'utf8');
ch = ch.replace(/จดจำคำศัพท์ \$\{plan\.targetLevel\} ได้/g, 'จดจำคำศัพท์ระดับ ${plan.targetLevel} (และระดับถัดไปหากครบแล้ว) ได้รวม');
ch = ch.replace(/เรียนไวยากรณ์\/การอ่าน\/เขียน\/ฟัง อย่างเป็นระบบ/g, 'ฝึกทักษะไวยากรณ์/การอ่าน/เขียน/ฟัง อย่างเป็นระบบ');
ch = ch.replace(/จดจำคำศัพท์ HSK \$\{levelNum\} ได้/g, 'จดจำคำศัพท์ HSK ${levelNum} (และระดับถัดไปหากครบแล้ว) ได้รวม');
fs.writeFileSync('src/utils/curriculumHelper.ts', ch);
console.log('Updated curriculumHelper.ts');

// 3. Update LearningPlanModal.tsx
let lp = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// Add Trophy icon
if (!lp.includes('Trophy,')) {
  lp = lp.replace('Target,', 'Target, Trophy,');
}

// Add isMonthlyDone variable
if (!lp.includes('const isMonthlyDone')) {
  lp = lp.replace(
    'const isWeeklyDone = plan.weeklyMissionCompleted;',
    'const isWeeklyDone = plan.weeklyMissionCompleted;\n  const isMonthlyDone = !!plan.monthlyMissionCompleted;'
  );
}

// Update Weekly Title
lp = lp.replace(
  /\{plan\.lang === 'EN'[\s\S]*?\(Mock Test\)\}/,
  `{plan.lang === 'EN' 
                    ? \`ศึกษาแนวข้อสอบพาร์ท \${plan.enWeeklyPart || 'Reading'} ชุดที่ \${plan.currentWeek}\`
                    : \`ศึกษาแนวข้อสอบ \${plan.currentWeek <= 2 ? 'HSK' : 'HSKK'} ชุดที่ \${plan.currentWeek}\`}`
);

// Update Weekly Desc
lp = lp.replace(
  '<p className="text-sm text-gray-500 mt-1">ศึกษาข้อสอบเสมือนจริงและจับเวลา (ต้องใช้เวลาศึกษาอย่างน้อย 60 นาที)</p>',
  '<p className="text-sm text-gray-500 mt-1">เข้าไปศึกษาโจทย์และเฉลยในหน้าข้อสอบ เพื่อทำความคุ้นเคยกับแนวข้อสอบจริง</p>'
);

// Insert Monthly block
const monthlyBlock = `
        {/* Monthly Specific Mission */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Trophy className="text-rose-500" />
              ภารกิจวัดผลประจำเดือน (จำลองสอบจริง)
            </h3>
          </div>
          <div className="relative p-4 rounded-2xl border-2 border-rose-100 bg-rose-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <Target size={24} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">
                  สอบจำลองเสมือนจริง (Mock Test)
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  ทำข้อสอบแบบจับเวลาจริง เป้าหมาย: <strong>ทำคะแนนให้เพิ่มขึ้นอย่างน้อย 10-15%</strong> จากเดิมเพื่อพิสูจน์ความก้าวหน้า
                </p>
              </div>
            </div>
            {!isMonthlyDone ? (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onNavigate('mocktests')} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all text-center">
                  ไปสอบ
                </button>
                <button onClick={() => onUpdate({...plan, monthlyMissionCompleted: true})} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all text-center">
                  เสร็จสิ้น
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-bold px-4 py-2 bg-green-50 rounded-xl shrink-0">
                <CheckCircle size={20} /> สอบผ่านแล้ว
              </div>
            )}
          </div>
        </div>
`;

if (!lp.includes('ภารกิจวัดผลประจำเดือน')) {
  lp = lp.replace('{/* Month Completion */}', monthlyBlock + '        {/* Month Completion */}');
}

// Require monthly done to finish month
lp = lp.replace(
  '{plan.currentDay >= 30 && isDailyDone && isWeeklyDone && (',
  '{plan.currentDay >= 30 && isDailyDone && isWeeklyDone && isMonthlyDone && ('
);

// Reset monthly on new month/plan
lp = lp.replace(/weeklyMissionCompleted: false,/g, 'weeklyMissionCompleted: false, monthlyMissionCompleted: false,');

fs.writeFileSync('src/components/LearningPlanModal.tsx', lp);
console.log('Updated LearningPlanModal.tsx');

