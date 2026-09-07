const fs = require('fs');

function cleanIeltsAnswers() {
  const dataPath = './src/data/ielts_answer_keys.json';
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  for (const [examId, examData] of Object.entries(data)) {
    // Clean Reading
    if (examData.reading && examData.reading.passages) {
      for (const passage of examData.reading.passages) {
        for (const q of passage.questions) {
           if (q.correct_answer) {
             // Look for formats like "A. Some text" or "iii. Some text"
             // Be careful not to match simple text like "True" or "False" or "Buddhism"
             
             // Match Roman numerals: i., ii., iii., iv., v., vi., vii., viii., ix., x.
             const romanMatch = q.correct_answer.match(/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\.\s+.+/i);
             if (romanMatch) {
               q.correct_answer = romanMatch[1];
             } else {
               // Match single letters: A., B., C., D., E., F., G., H.
               const letterMatch = q.correct_answer.match(/^([A-H])\.\s+.+/i);
               if (letterMatch) {
                 q.correct_answer = letterMatch[1];
               }
             }
           }
        }
      }
    }

    // Clean Listening
    if (examData.listening && examData.listening.parts) {
      for (const part of examData.listening.parts) {
        for (const q of part.questions) {
           if (q.correct_answer) {
             // Listening sometimes has "A", "B", "C" as options.
             const letterMatch = q.correct_answer.match(/^([A-H])\.\s+.+/i);
             if (letterMatch) {
               q.correct_answer = letterMatch[1];
             }
           }
        }
      }
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('✅ Successfully cleaned answer formats in ielts_answer_keys.json.');
}

cleanIeltsAnswers();
