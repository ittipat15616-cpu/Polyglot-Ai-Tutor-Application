import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src', 'data', 'ielts_answer_keys.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(rawData);

console.log("=== IELTS ANSWER KEYS INVENTORY ===");
const keys = Object.keys(data);
console.log("Total Exam Sets in file:", keys.length);

for (let i = 1; i <= 20; i++) {
  const examId = `IELTS_Mock_Test_${i}`;
  const exam = data[examId];
  if (!exam) {
    console.log(`Set ${i} (${examId}): MISSING COMPLETELY`);
    continue;
  }
  
  const listening = exam.listening;
  const reading = exam.reading;

  let lCount = 0;
  let lBlankCount = 0;
  if (listening && listening.parts) {
    listening.parts.forEach((p: any) => {
      if (p.questions) {
        lCount += p.questions.length;
        p.questions.forEach((q: any) => {
          const ans = String(q.correct_answer || '').trim();
          if (!ans) lBlankCount++;
        });
      }
    });
  }

  let rCount = 0;
  let rBlankCount = 0;
  if (reading && reading.passages) {
    reading.passages.forEach((p: any) => {
      if (p.questions) {
        rCount += p.questions.length;
        p.questions.forEach((q: any) => {
          const ans = String(q.correct_answer || '').trim();
          if (!ans) rBlankCount++;
        });
      }
    });
  }

  console.log(`Set ${i}: Listening = ${listening ? lCount : 'NONE'} (Blank: ${lBlankCount}), Reading = ${reading ? rCount : 'NONE'} (Blank: ${rBlankCount})`);
}
