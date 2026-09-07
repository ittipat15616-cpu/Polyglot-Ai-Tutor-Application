const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const dailyMissionsStart = code.indexOf('<div className="space-y-3">');
const dailyMissionsEnd = code.indexOf('</div>', dailyMissionsStart);

const missionsJSX = `          <div className="space-y-3">
            <MissionItem 
              idx={0}
              title="คลังคำศัพท์ หรือ แฟลชการ์ด"
              desc={\`จำและทำความเข้าใจศัพท์ระดับ \${levelText} คำที่ \${vStart} - \${vEnd} (ปักหมุดคำสุดท้าย หรือ บันทึกศัพท์เพื่อจบภารกิจ)\`}
              done={plan.dailyMissionsCompleted[0]}
              onSkip={() => handleSkipMission(0)}
              onGo={() => setShowVocabChoice(true)}
            />
            <MissionItem 
              idx={1}
              title="คัดศัพท์"
              desc={plan.lang === 'EN' ? "ลองเขียนทุกอย่างที่จำได้ลงไป" : "ลองเขียนทุกอย่างที่จำได้ลงไป (สำคัญมากสำหรับอักษรจีน)"}
              done={plan.dailyMissionsCompleted[1]}
              onSkip={() => handleSkipMission(1)}
              onGo={() => onNavigate('vocab')}
            />
            
            <MissionItem 
              idx={2}
              title="สอบศัพท์"
              desc="ทำแบบทดสอบศัพท์โดยผิดไม่เกิน 2 ข้อ"
              done={plan.dailyMissionsCompleted[2]}
              onSkip={() => handleSkipMission(2)}
              onGo={() => onNavigate('vocab_exam')}
            />
            {plan.lang === 'EN' ? (
              <>
                <MissionItem 
                  idx={3}
                  title="เรียน Grammar"
                  desc={\`\${getGrammarDesc(plan)} (ใช้อย่างน้อย 7 นาที)\`}
                  done={plan.dailyMissionsCompleted[3]}
                  onSkip={() => handleSkipMission(3)}
                  onGo={() => onNavigate('exercises')}
                />
                <MissionItem 
                  idx={4}
                  title="ฝึกทักษะประจำเดือน"
                  desc={\`\${getSkillDesc(plan)} (ใช้อย่างน้อย 7 นาที)\`}
                  done={plan.dailyMissionsCompleted[4]}
                  onSkip={() => handleSkipMission(4)}
                  onGo={() => onNavigate('exercises')}
                />
              </>
            ) : (
              <MissionItem 
                idx={3}
                title="อ่านบทเรียน"
                desc={\`\${getLessonDesc(plan)} (ใช้อย่างน้อย 7 นาที)\`}
                done={plan.dailyMissionsCompleted[3]}
                onSkip={() => handleSkipMission(3)}
                onGo={() => onNavigate('exercises')}
              />
            )}
          </div>`;

code = code.substring(0, dailyMissionsStart) + missionsJSX + code.substring(dailyMissionsEnd + 6);

// Need to update dailyDoneCount logic
code = code.replace(
  `const dailyDoneCount = [0,1,2,3].filter(i => plan.dailyMissionsCompleted[i]).length;
  const isDailyDone = dailyDoneCount === 4;`,
  `const dailyCount = plan.lang === 'EN' ? 5 : 4;
  const dailyDoneCount = Array.from({length: dailyCount}, (_, i) => i).filter(i => plan.dailyMissionsCompleted[i]).length;
  const isDailyDone = dailyDoneCount === dailyCount;`
);

// Progress bar text
code = code.replace(
  `{progressView === 'DAILY' && \`\${(dailyDoneCount / 4) * 100}%\`}`,
  `{progressView === 'DAILY' && \`\${Math.round((dailyDoneCount / dailyCount) * 100)}%\`}`
);
code = code.replace(
  `animate={{ width: \`\${(dailyDoneCount / 4) * 100}%\` }}`,
  `animate={{ width: \`\${(dailyDoneCount / dailyCount) * 100}%\` }}`
);

fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
