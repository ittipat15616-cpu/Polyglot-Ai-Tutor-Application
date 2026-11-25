import hsk1AnswerKey from '../data/hsk1_answer_key.json';
import hsk2AnswerKey from '../data/hsk2_answer_key.json';
import hsk3AnswerKey from '../data/hsk3_answer_key.json';
import hsk4AnswerKey from '../data/hsk4_answer_key.json';
import hsk5AnswerKey from '../data/hsk5_answer_key.json';
import hsk6AnswerKey from '../data/hsk6_answer_key.json';
import { hsk4Keywords } from './hsk4Keywords';
import { hsk5WritingPrompts } from './hsk5Keywords';
import { hsk6Articles } from './hsk6Articles';
import { getFirebaseAuthHeaders } from '../services/authHeaders';

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

export interface HskGradingByokOptions {
  useByokQuota?: boolean;
  byokKey?: string | null;
}

/**
 * Returns true if this HSK level + answers requires an AI grading call (HSK4 Q96-100, HSK5 Q99-100, HSK6 Q101).
 * HSK1, HSK2, HSK3 are 100% locally graded without any AI call.
 */
export function doesHskExamNeedAi(level: string, userAnswers: Record<string, string>): boolean {
  if (level === 'HSK4') {
    for (let i = 96; i <= 100; i++) {
      if ((userAnswers[String(i)] || '').trim() !== '') return true;
    }
    return false;
  }
  if (level === 'HSK5') {
    return (userAnswers['99'] || '').trim() !== '' || (userAnswers['100'] || '').trim() !== '';
  }
  if (level === 'HSK6') {
    return (userAnswers['101'] || '').trim() !== '';
  }
  return false;
}

export async function gradeExam(
  level: string,
  examId: string,
  userAnswers: Record<string, string>,
  byokOpts?: HskGradingByokOptions
): Promise<ExamResult> {
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
        // Placeholder for Q96-100 — batch-graded below in 1 single AI request
        isCorrect = false;
        explanationThai = userAns === "" ? "ไม่ได้ตอบคำถามข้อนี้" : "";
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai
      });
    }

    // Batch-grade HSK4 Q96-100 in 1 single API call
    const hsk4BatchItems = [];
    for (let i = 96; i <= 100; i++) {
      const qNum = i.toString();
      const userAns = (userAnswers[qNum] || "").trim();
      if (userAns !== "") {
        const keyword = hsk4Keywords[examId]?.[qNum] || "";
        hsk4BatchItems.push({
          questionNumber: qNum,
          maxScore: 8,
          instruction: `แต่งประโยคระดับ HSK4 จากคำศัพท์ "${keyword}" ให้ถูกต้องตามไวยากรณ์และความหมายสมเหตุสมผล`,
          studentAnswer: userAns,
        });
      }
    }

    if (hsk4BatchItems.length > 0) {
      const response = await fetch('/api/grade-writing-batch', {
        method: 'POST',
        headers: await getFirebaseAuthHeaders(),
        body: JSON.stringify({
          level: 'HSK4',
          items: hsk4BatchItems,
          useByokQuota: Boolean(byokOpts?.useByokQuota),
          byokKey: byokOpts?.byokKey || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err: any = new Error(data.error || "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI");
        err.status = response.status;
        err.byokInvalidKey = Boolean(data.byokInvalidKey);
        err.authRequired = Boolean(data.authRequired || (response.status === 401 && !data.byokInvalidKey));
        err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || response.status === 429);
        throw err;
      }
      const gradedMap = new Map<string, { score: number; feedback: string }>();
      if (Array.isArray(data.results)) {
        for (const r of data.results) {
          gradedMap.set(String(r.questionNumber), {
            score: Math.max(0, Math.min(8, Number(r.score) || 0)),
            feedback: String(r.feedback || ""),
          });
        }
      }
      for (const r of results) {
        const g = gradedMap.get(r.questionNumber);
        if (g) {
          writingScore += g.score;
          r.isCorrect = g.score === 8;
          r.explanationThai = g.feedback;
        }
      }
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
        // Placeholder for Q99-100 — batch-graded below in 1 single AI request
        isCorrect = false;
        explanationThai = userAns === "" ? "ไม่ได้ตอบคำถามข้อนี้" : "";
      }
      
      results.push({
        questionNumber: qNum,
        userAnswer: userAns,
        correctAnswer: correctAnsRaw,
        isCorrect,
        explanationThai
      });
    }

    // Batch-grade HSK5 Q99-100 in 1 single API call
    const hsk5BatchItems = [];
    const ans99 = (userAnswers["99"] || "").trim();
    if (ans99 !== "") {
      const keywordList = hsk5WritingPrompts[examId]?.q99_keywords.join('、') || "";
      hsk5BatchItems.push({
        questionNumber: "99",
        maxScore: 30,
        instruction: `เขียนเรียงความสั้นประมาณ 80 ตัวอักษรระดับ HSK5 โดยใช้คำศัพท์ที่กำหนดครบถ้วน: "${keywordList}"`,
        studentAnswer: ans99,
      });
    }
    const ans100 = (userAnswers["100"] || "").trim();
    if (ans100 !== "") {
      const imageTopic = hsk5WritingPrompts[examId]?.q100_image_topic || "";
      hsk5BatchItems.push({
        questionNumber: "100",
        maxScore: 30,
        instruction: `เขียนเรียงความสั้นประมาณ 80 ตัวอักษรระดับ HSK5 ให้สอดคล้องกับรูปภาพ: "${imageTopic}"`,
        studentAnswer: ans100,
      });
    }

    if (hsk5BatchItems.length > 0) {
      const response = await fetch('/api/grade-writing-batch', {
        method: 'POST',
        headers: await getFirebaseAuthHeaders(),
        body: JSON.stringify({
          level: 'HSK5',
          items: hsk5BatchItems,
          useByokQuota: Boolean(byokOpts?.useByokQuota),
          byokKey: byokOpts?.byokKey || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err: any = new Error(data.error || "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI");
        err.status = response.status;
        err.byokInvalidKey = Boolean(data.byokInvalidKey);
        err.authRequired = Boolean(data.authRequired || (response.status === 401 && !data.byokInvalidKey));
        err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || response.status === 429);
        throw err;
      }
      const gradedMap = new Map<string, { score: number; feedback: string }>();
      if (Array.isArray(data.results)) {
        for (const r of data.results) {
          gradedMap.set(String(r.questionNumber), {
            score: Math.max(0, Math.min(30, Number(r.score) || 0)),
            feedback: String(r.feedback || ""),
          });
        }
      }
      for (const r of results) {
        const g = gradedMap.get(r.questionNumber);
        if (g) {
          writingScore += g.score;
          r.isCorrect = g.score === 30;
          r.explanationThai = g.feedback;
        }
      }
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
            
            const response = await fetch('/api/grade-writing', { 
              method: 'POST', 
              headers: await getFirebaseAuthHeaders(), 
              body: JSON.stringify({
                prompt,
                useByokQuota: Boolean(byokOpts?.useByokQuota),
                byokKey: byokOpts?.byokKey || null,
              }) 
            });
            const parsed = await response.json().catch(() => ({}));
            if (!response.ok) {
              const err: any = new Error(parsed.error || "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI");
              err.status = response.status;
              err.byokInvalidKey = Boolean(parsed.byokInvalidKey);
              err.authRequired = Boolean(parsed.authRequired || (response.status === 401 && !parsed.byokInvalidKey));
              err.byokQuotaExhausted = Boolean(parsed.byokQuotaExhausted || response.status === 429);
              throw err;
            }
            writingScore += Number(parsed.score) || 0;
            isCorrect = Number(parsed.score) === 100;
            explanationThai = parsed.feedback || "";
          } catch (e: any) {
            console.error("AI Grading error:", e);
            throw e;
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
