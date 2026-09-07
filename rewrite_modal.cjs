const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

// 1. Add reset function inside LearningPlanModal
const startOfModalBody = code.indexOf('const currentPlan = tab === \'EN\' ? planEN : planCN;');
const resetFunc = `
  const handleResetPlan = async () => {
    if (window.confirm('คุณต้องการรีเซตแผนการเรียนทั้งหมดใช่หรือไม่?')) {
      setLoading(true);
      const en = await loadStudyPlan('EN');
      const cn = await loadStudyPlan('CN');
      if (en) await saveStudyPlan({ ...en, currentDay: 1, currentWeek: 1, currentMonth: 1, dailyMissionsCompleted: [false,false,false,false,false], weeklyMissionCompleted: false, overallProgressPercent: 0, currentVocabIndex: 1, currentLessonIndex: 1 });
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
        // Note: we just clear it out from state here to let them start over
        setPlanEN(null);
        setPlanCN(null);
        setIsQuestionnaire(true);
        setQStep(1);
        setLoading(false);
    }
  };
`;

code = code.slice(0, startOfModalBody) + resetFunc + code.slice(startOfModalBody);

// In submitQuestionnaire, add enWeeklyPart
code = code.replace(
  'overallProgressPercent: 0,',
  'overallProgressPercent: 0,\n      enWeeklyPart: \'Reading\','
);

// 2. Add Reset button to header if email matches
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

// 3. Fix handleNextMonth to calculate progress correctly
// Currently: const newOverall = Math.min(100, plan.overallProgressPercent + increment);
const nextMonthReplace = `const handleNextMonth = () => {
    const increment = 100 / (parseInt(plan.timeframe) || 6);
    const newOverall = Math.min(100, plan.overallProgressPercent + increment);
    const parts = ['Reading', 'Listening', 'Writing', 'Speaking'];
    const nextPart = parts[(parts.indexOf(plan.enWeeklyPart || 'Reading') + 1) % 4];
    
    onUpdate({
      ...plan,
      currentMonth: plan.currentMonth + 1,
      currentWeek: 1,
      currentDay: 1,
      dailyMissionsCompleted: [false, false, false, false, false],
      weeklyMissionCompleted: false,
      overallProgressPercent: newOverall,
      enWeeklyPart: nextPart
    });
  };`;
code = code.replace(/const handleNextMonth = \(\) => \{[\s\S]*?\}\);[\s]*\};/, nextMonthReplace);

// 4. Update the Weekly Mission text
// find "จำลองสอบ {plan.lang === 'EN' ? 'IELTS' : 'HSK'} (Mock Test)"
const weeklyTitleRegex = /<h4 className="font-bold text-gray-800">จำลองสอบ.*?<\/h4>/;
const newWeeklyTitle = `
                <h4 className="font-bold text-gray-800">
                  {plan.lang === 'EN' 
                    ? \`จำลองสอบพาร์ท \${plan.enWeeklyPart || 'Reading'} ชุดที่ \${plan.currentWeek}\`
                    : (plan.currentWeek % 2 !== 0 ? 'ศึกษาข้อสอบ HSK' : 'ศึกษาข้อสอบ HSKK')} (Mock Test)
                </h4>
`;
code = code.replace(weeklyTitleRegex, newWeeklyTitle);

// 5. Update Daily Missions texts
// Vocab
code = code.replace(
  /desc=\{\`ระดับ \$\{levelText\} คำที่ \$\{vStart\} - \$\{vEnd\} \(ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ\)\`\}/,
  'desc={`จำและทำความเข้าใจศัพท์ระดับ ${levelText} คำที่ ${vStart} - ${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)`}'
);
// Lesson
code = code.replace(
  /desc=\{\`พาร์ท \$\{levelText\} บทที่ \$\{lStart\} - \$\{lEnd\} \(ใช้อย่างน้อย 7 นาที\)\`\}/,
  'desc={`ทำความเข้าใจบทเรียน ${levelText} บทที่ ${lStart} - ${lEnd} (ใช้อย่างน้อย 7 นาที)`}'
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
