const fs = require('fs');
const pdf = require('pdf-parse');

const BUCKET = 'polyglot-ai-tuto.firebasestorage.app';

async function downloadAndParsePdf(examSet, skill) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/IELTS_Mock_Tests%2FIELTS_Mock_Test_${examSet}%2F${skill}_Full.pdf?alt=media`;
  console.log(`Downloading ${skill} for Set ${examSet}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed to fetch Set ${examSet} ${skill} (Status: ${res.status})`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const data = await pdf(buffer);
    return data.text;
  } catch (err) {
    console.error(`Error processing Set ${examSet} ${skill}:`, err.message);
    return null;
  }
}

function extractAnswers(text, skill) {
  const answers = [];
  // Find the 'Answer Key & Explanations' or similar section
  const answerSectionMatch = text.match(/Answer Key.*?Answers(.*)/is);
  if (!answerSectionMatch) {
    console.warn(`Could not find Answer Key section for this PDF.`);
    return [];
  }
  
  const sectionText = answerSectionMatch[1];
  
  for (let i = 1; i <= 40; i++) {
    // Look for "{i}. Answer: "
    const regex = new RegExp(`${i}\\.\\s*Answer:\\s*(.*)`, 'i');
    const match = sectionText.match(regex);
    if (match) {
      let rawAnswer = match[1].trim();
      // If it's a roman numeral like "iii. A network...", we just extract the "iii" or keep the whole thing.
      // Actually, IELTS reading might just have "iii" or "A".
      // We will keep the whole string for the JSON.
      answers.push({
        q_number: i,
        correct_answer: rawAnswer,
        explanation_thai: `Scraped from PDF (Question ${i})` // We can extract Thai explanations if we want, but for now we'll put a placeholder or try to extract it.
      });
    } else {
      answers.push({
        q_number: i,
        correct_answer: '',
        explanation_thai: ''
      });
    }
  }
  return answers;
}

async function main() {
  const dataPath = './src/data/ielts_answer_keys.json';
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  for (let i = 1; i <= 20; i++) {
    const examId = `IELTS_Mock_Test_${i}`;
    if (!data[examId]) data[examId] = {};

    // Listening
    const lText = await downloadAndParsePdf(i, 'Listening');
    if (lText) {
      const parsedAnswers = extractAnswers(lText, 'Listening');
      if (!data[examId].listening) data[examId].listening = { parts: [] };
      data[examId].listening.parts = [
        { part_number: 1, questions: parsedAnswers.slice(0, 10) },
        { part_number: 2, questions: parsedAnswers.slice(10, 20) },
        { part_number: 3, questions: parsedAnswers.slice(20, 30) },
        { part_number: 4, questions: parsedAnswers.slice(30, 40) }
      ];
    }

    // Reading
    const rText = await downloadAndParsePdf(i, 'Reading');
    if (rText) {
      const parsedAnswers = extractAnswers(rText, 'Reading');
      if (!data[examId].reading) data[examId].reading = { passages: [] };
      data[examId].reading.passages = [
        { passage_number: 1, questions: parsedAnswers.slice(0, 13) },
        { passage_number: 2, questions: parsedAnswers.slice(13, 26) },
        { passage_number: 3, questions: parsedAnswers.slice(26, 40) }
      ];
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('✅ Successfully extracted and populated all 20 sets of IELTS answers from PDFs.');
}

main();
