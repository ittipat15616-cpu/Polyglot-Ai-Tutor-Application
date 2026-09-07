import hsk1AnswerKey from '../data/hsk1_answer_key.json';
import hsk2AnswerKey from '../data/hsk2_answer_key.json';
import hsk3AnswerKey from '../data/hsk3_answer_key.json';
import hsk4AnswerKey from '../data/hsk4_answer_key.json';
import hsk5AnswerKey from '../data/hsk5_answer_key.json';
import hsk6AnswerKey from '../data/hsk6_answer_key.json';
import { hsk4Keywords } from './hsk4Keywords';
import { hsk5WritingPrompts } from './hsk5Keywords';
import { hsk6Articles } from './hsk6Articles';
import { getStoredByokKey } from '../services/byokService';

export interface ExamResult {
  totalScore: number;
  maxScore: number;
  isPass: boolean;
  parts: {
    listening: { score: number; max: number };
    reading: { score: number; max: number };
    writing: { score: number; max: number };
  };
  results: {
    questionNumber: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanationThai: string;
  }[];
}

export async function gradeExam(level: string, examId: string, userAnswers: Record<string, string>): Promise<ExamResult> {
  if (level === 'HSK1' && (hsk1AnswerKey as any)[examId]) {
    const answers = (hsk1AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    const results = [];
    
    for (let i = 1; i <= 40; i++) {
      const qNum = i.toString();
      const correctAns = answers[qNum] || "";
      const userAns = userAnswers[qNum] || "";
      const isCorrect = userAns !== "" && correctAns.toLowerCase() === userAns.toLowerCase();
      
      if (isCorrect) {
        if (i <= 20) listeningCorrect++;
        else readingCorrect++;
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect,
        explanationThai: ""
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 20) * 100);
    const readingScore = Math.round((readingCorrect / 20) * 100);
    const totalScore = listeningScore + readingScore;
    const isPass = totalScore >= 120;
    
    return {
      totalScore,
      maxScore: 200,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: 0, max: 0 }
      },
      results
    };
  }

  if (level === 'HSK2' && (hsk2AnswerKey as any)[examId]) {
    const answers = (hsk2AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    const results = [];
    
    for (let i = 1; i <= 60; i++) {
      const qNum = i.toString();
      const correctAns = answers[qNum] || "";
      const userAns = userAnswers[qNum] || "";
      const isCorrect = userAns !== "" && correctAns.toLowerCase() === userAns.toLowerCase();
      
      if (isCorrect) {
        if (i <= 35) listeningCorrect++;
        else readingCorrect++;
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect,
        explanationThai: ""
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 35) * 100);
    const readingScore = Math.round((readingCorrect / 25) * 100);
    const totalScore = listeningScore + readingScore;
    const isPass = totalScore >= 120;
    
    return {
      totalScore,
      maxScore: 200,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: 0, max: 0 }
      },
      results
    };
  }

  if (level === 'HSK3' && (hsk3AnswerKey as any)[examId]) {
    const answers = (hsk3AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    let writingScore = 0;
    const results = [];
    
    for (let i = 1; i <= 80; i++) {
      const qNum = i.toString();
      const correctAnsRaw = answers[qNum] || "";
      const userAns = (userAnswers[qNum] || "").trim();
      
      let isCorrect = false;
      if (i <= 70) {
        isCorrect = userAns !== "" && correctAnsRaw.toLowerCase() === userAns.toLowerCase();
        if (isCorrect) {
          if (i <= 40) listeningCorrect++;
          else readingCorrect++;
        }
      } else {
        const cleanUserAns = userAns.replace(/[。！？?!\s]/g, "");
        const possibleAnswers = correctAnsRaw.split("/").map((a: string) => a.replace(/[。！？?!\s]/g, ""));
        isCorrect = cleanUserAns !== "" && possibleAnswers.includes(cleanUserAns);
        if (isCorrect) {
          if (i <= 75) writingScore += 12;
          else writingScore += 8;
        }
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai: ""
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 40) * 100);
    const readingScore = Math.round((readingCorrect / 30) * 100);
    const totalScore = listeningScore + readingScore + writingScore;
    const isPass = totalScore >= 180;
    
    return {
      totalScore,
      maxScore: 300,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: writingScore, max: 100 }
      },
      results
    };
  }

  if (level === 'HSK4' && (hsk4AnswerKey as any)[examId]) {
    const answers = (hsk4AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    let writingScore = 0;
    const results = [];
    
    for (let i = 1; i <= 100; i++) {
      const qNum = i.toString();
      const correctAnsRaw = answers[qNum] || "";
      const userAns = (userAnswers[qNum] || "").trim();
      
      let isCorrect = false;
      let explanationThai = "";

      if (i <= 85) {
        isCorrect = userAns !== "" && correctAnsRaw.toLowerCase() === userAns.toLowerCase();
        if (isCorrect) {
          if (i <= 45) listeningCorrect++;
          else readingCorrect++;
        }
      } else if (i <= 95) {
        const cleanUserAns = userAns.replace(/[。！？?!\s]/g, "");
        const possibleAnswers = correctAnsRaw.split("/").map((a: string) => a.replace(/[。！？?!\s]/g, ""));
        isCorrect = cleanUserAns !== "" && possibleAnswers.includes(cleanUserAns);
        if (isCorrect) {
          writingScore += 6; // Q86-95 (10 items * 6 pts = 60 pts)
        }
      } else {
        // Q96-100: AI Grading (8 pts max each)
        if (userAns !== "") {
          try {
            
            const keyword = hsk4Keywords[examId]?.[qNum] || "";
            const prompt = `คุณคือผู้ตรวจข้อสอบ HSK4 พาร์ทการเขียน (แต่งประโยคจากคำศัพท์ที่กำหนด)
คำศัพท์ที่กำหนดให้คือ: "${keyword}"
ประโยคที่นักเรียนแต่งคือ: "${userAns}"

เกณฑ์การให้คะแนน (เต็ม 8 คะแนน):
- ใช้คำศัพท์ที่กำหนดให้ได้ถูกต้อง
- ไวยากรณ์ถูกต้องตามระดับ HSK4
- ความหมายสมเหตุสมผล

หน้าที่ของคุณ:
1. ให้คะแนนประโยคนี้ (0-8)
2. ถ้าได้ 8 คะแนนเต็ม ให้คืนค่าเป็น JSON แบบนี้: {"score": 8, "feedback": "ได้คะแนนเต็ม"} (ห้ามอธิบายเพิ่ม)
3. ถ้าถูกหักคะแนน ให้อธิบายข้อผิดพลาดและเหตุผลที่หักคะแนนสั้นๆ เป็นภาษาไทย คืนค่า JSON แบบนี้: {"score": <คะแนน>, "feedback": "<คำอธิบาย>"}

กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown block`;
            
            const byokKey = getStoredByokKey();
            const response = await fetch('/api/grade-writing', { 
              method: 'POST', 
              headers: { 
                'Content-Type': 'application/json',
                ...(byokKey ? { 'x-byok-key': byokKey } : {})
              }, 
              body: JSON.stringify({ prompt, byokKey: byokKey || undefined }) 
            });
            if (!response.ok) {
              const errText = await response.text();
              let feedbackMsg = "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI";
              if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("429")) {
                  feedbackMsg = "โควต้า AI เต็ม (RESOURCE_EXHAUSTED)";
              }
              throw new Error(feedbackMsg);
            }
            const parsed = await response.json();
            writingScore += parsed.score;
            isCorrect = parsed.score === 8; // Full mark means fully correct
            explanationThai = parsed.feedback;
          } catch (e) {
            console.error("AI Grading error:", e);
            explanationThai = e.message || "เกิดข้อผิดพลาดในการเรียกใช้ AI ตรวจคำตอบ";
          }
        } else {
          isCorrect = false;
          explanationThai = "ไม่ได้ตอบคำถามข้อนี้";
        }
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 45) * 100);
    const readingScore = Math.round((readingCorrect / 40) * 100);
    const totalScore = listeningScore + readingScore + writingScore;
    const isPass = totalScore >= 180;
    
    return {
      totalScore,
      maxScore: 300,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: writingScore, max: 100 }
      },
      results
    };
  }

  if (level === 'HSK5' && (hsk5AnswerKey as any)[examId]) {
    const answers = (hsk5AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    let writingScore = 0;
    const results = [];
    
    for (let i = 1; i <= 100; i++) {
      const qNum = i.toString();
      const correctAnsRaw = answers[qNum] || "";
      const userAns = (userAnswers[qNum] || "").trim();
      
      let isCorrect = false;
      let explanationThai = "";

      if (i <= 90) {
        isCorrect = userAns !== "" && correctAnsRaw.toLowerCase() === userAns.toLowerCase();
        if (isCorrect) {
          if (i <= 45) listeningCorrect++;
          else readingCorrect++;
        }
      } else if (i <= 98) {
        const cleanUserAns = userAns.replace(/[。！？?!\s]/g, "");
        const possibleAnswers = correctAnsRaw.split("/").map((a: string) => a.replace(/[。！？?!\s]/g, ""));
        isCorrect = cleanUserAns !== "" && possibleAnswers.includes(cleanUserAns);
        if (isCorrect) {
          writingScore += 5;
        }
      } else {
        // Q99-100: AI Grading (30 pts max each)
        if (userAns !== "") {
          try {
            
            
            let prompt = "";
            if (i === 99) {
              const keywordList = hsk5WritingPrompts[examId]?.q99_keywords.join('、') || "";
              prompt = `คุณคือผู้ตรวจข้อสอบ HSK5 พาร์ทการเขียน (แต่งประโยคจากคำศัพท์ที่กำหนด)
คำศัพท์ที่กำหนดให้คือ: "${keywordList}"
ประโยคที่นักเรียนแต่งคือ: "${userAns}"

เกณฑ์การให้คะแนน (เต็ม 30 คะแนน):
- ใช้คำศัพท์ที่กำหนดให้ได้ถูกต้องครบถ้วน
- ไวยากรณ์ถูกต้องตามระดับ HSK5
- ความหมายสมเหตุสมผล และมีความยาวประมาณ 80 ตัวอักษร

หน้าที่ของคุณ:
1. ให้คะแนนประโยคนี้ (0-30)
2. ถ้าได้ 30 คะแนนเต็ม ให้คืนค่าเป็น JSON แบบนี้: {"score": 30, "feedback": "ได้คะแนนเต็ม"} (ห้ามอธิบายเพิ่ม)
3. ถ้าถูกหักคะแนน ให้อธิบายข้อผิดพลาดและเหตุผลที่หักคะแนนสั้นๆ เป็นภาษาไทย คืนค่า JSON แบบนี้: {"score": <คะแนน>, "feedback": "<คำอธิบาย>"}

กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown block`;
            } else {
              const imageTopic = hsk5WritingPrompts[examId]?.q100_image_topic || "";
              prompt = `คุณคือผู้ตรวจข้อสอบ HSK5 พาร์ทการเขียน (แต่งประโยคจากรูปภาพ)
รูปภาพที่กำหนดให้ในข้อสอบมีเนื้อหาดังนี้: "${imageTopic}"
ประโยคที่นักเรียนแต่งคือ: "${userAns}"

เกณฑ์การให้คะแนน (เต็ม 30 คะแนน):
- เนื้อหาที่เขียนมีความสอดคล้องกับรูปภาพที่กำหนด
- ไวยากรณ์และคำศัพท์ถูกต้องตามระดับ HSK5
- ความหมายสมเหตุสมผล และมีความยาวประมาณ 80 ตัวอักษร

หน้าที่ของคุณ:
1. ให้คะแนนประโยคนี้ (0-30)
2. ถ้าได้ 30 คะแนนเต็ม ให้คืนค่าเป็น JSON แบบนี้: {"score": 30, "feedback": "ได้คะแนนเต็ม"} (ห้ามอธิบายเพิ่ม)
3. ถ้าถูกหักคะแนน ให้อธิบายข้อผิดพลาดและเหตุผลที่หักคะแนนสั้นๆ เป็นภาษาไทย คืนค่า JSON แบบนี้: {"score": <คะแนน>, "feedback": "<คำอธิบาย>"}

กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown block`;
            }
            
            const byokKey = getStoredByokKey();
            const response = await fetch('/api/grade-writing', { 
              method: 'POST', 
              headers: { 
                'Content-Type': 'application/json',
                ...(byokKey ? { 'x-byok-key': byokKey } : {})
              }, 
              body: JSON.stringify({ prompt, byokKey: byokKey || undefined }) 
            });
            if (!response.ok) {
              const errText = await response.text();
              let feedbackMsg = "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI";
              if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("429")) {
                  feedbackMsg = "โควต้า AI เต็ม (RESOURCE_EXHAUSTED)";
              }
              throw new Error(feedbackMsg);
            }
            const parsed = await response.json();
            writingScore += parsed.score;
            isCorrect = parsed.score === 30; // Full mark means fully correct
            explanationThai = parsed.feedback;
          } catch (e) {
            console.error("AI Grading error:", e);
            explanationThai = e.message || "เกิดข้อผิดพลาดในการเรียกใช้ AI ตรวจคำตอบ";
          }
        } else {
          isCorrect = false;
          explanationThai = "ไม่ได้ตอบคำถามข้อนี้";
        }
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 45) * 100);
    const readingScore = Math.round((readingCorrect / 45) * 100);
    const totalScore = listeningScore + readingScore + writingScore;
    const isPass = totalScore >= 180;
    
    return {
      totalScore,
      maxScore: 300,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: writingScore, max: 100 }
      },
      results
    };
  }

  if (level === 'HSK6' && (hsk6AnswerKey as any)[examId]) {
    const answers = (hsk6AnswerKey as any)[examId];
    let listeningCorrect = 0;
    let readingCorrect = 0;
    let writingScore = 0;
    const results = [];
    
    for (let i = 1; i <= 101; i++) {
      const qNum = i.toString();
      const correctAnsRaw = answers[qNum] || "";
      const userAns = (userAnswers[qNum] || "").trim();
      
      let isCorrect = false;
      let explanationThai = "";
      
      if (i <= 100) {
        isCorrect = userAns !== "" && correctAnsRaw.toLowerCase() === userAns.toLowerCase();
        if (isCorrect) {
          if (i <= 50) listeningCorrect++;
          else readingCorrect++;
        }
      } else {
        // Q101: AI Grading (100 pts max)
        if (userAns !== "") {
          try {
            
            const originalArticle = hsk6Articles[examId] || "";
            const prompt = `คุณคือผู้ตรวจข้อสอบ HSK6 พาร์ทการเขียน (ย่อความบทความ)
บทความต้นฉบับคือ: "${originalArticle}"

บทความที่นักเรียนเขียนสรุปคือ: "${userAns}"

เกณฑ์การให้คะแนน (เต็ม 100 คะแนน):
1. มีการตั้งชื่อเรื่องที่สอดคล้องกับเนื้อหา
2. ความยาวประมาณ 400 ตัวอักษร (ถ้ายาวไปหรือสั้นไปให้หักคะแนน)
3. สรุปใจความสำคัญจากบทความต้นฉบับได้อย่างครบถ้วน ถูกต้อง ไม่ใส่ความคิดเห็นส่วนตัวลงไป
4. ไวยากรณ์และคำศัพท์มีความถูกต้องตามระดับ HSK6

หน้าที่ของคุณ:
1. ให้คะแนนบทความนี้ (0-100)
2. ถ้าได้ 100 คะแนนเต็ม ให้คืนค่าเป็น JSON แบบนี้: {"score": 100, "feedback": "ได้คะแนนเต็ม"} (ห้ามอธิบายเพิ่ม)
3. ถ้าถูกหักคะแนน ให้อธิบายข้อผิดพลาดและเหตุผลที่หักคะแนนสั้นๆ เป็นภาษาไทย คืนค่า JSON แบบนี้: {"score": <คะแนน>, "feedback": "<คำอธิบาย>"}

กรุณาตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown block`;
            
            const byokKey = getStoredByokKey();
            const response = await fetch('/api/grade-writing', { 
              method: 'POST', 
              headers: { 
                'Content-Type': 'application/json',
                ...(byokKey ? { 'x-byok-key': byokKey } : {})
              }, 
              body: JSON.stringify({ prompt, byokKey: byokKey || undefined }) 
            });
            if (!response.ok) {
              const errText = await response.text();
              let feedbackMsg = "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI";
              if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("429")) {
                  feedbackMsg = "โควต้า AI เต็ม (RESOURCE_EXHAUSTED)";
              }
              throw new Error(feedbackMsg);
            }
            const parsed = await response.json();
            writingScore += parsed.score;
            isCorrect = parsed.score === 100;
            explanationThai = parsed.feedback;
          } catch (e) {
            console.error("AI Grading error:", e);
            explanationThai = e.message || "เกิดข้อผิดพลาดในการเรียกใช้ AI ตรวจคำตอบ";
          }
        } else {
          isCorrect = false;
          explanationThai = "ไม่ได้ตอบคำถามข้อนี้";
        }
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai
      });
    }
    
    const listeningScore = Math.round((listeningCorrect / 50) * 100);
    const readingScore = Math.round((readingCorrect / 50) * 100);
    const totalScore = listeningScore + readingScore + writingScore;
    const isPass = totalScore >= 180;
    
    return {
      totalScore,
      maxScore: 300,
      isPass,
      parts: {
        listening: { score: listeningScore, max: 100 },
        reading: { score: readingScore, max: 100 },
        writing: { score: writingScore, max: 100 }
      },
      results
    };
  }

  throw new Error(`Grading not supported or missing answer key for ${level} - ${examId}`);
}
