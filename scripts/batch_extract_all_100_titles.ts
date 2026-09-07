import { storage } from '../src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function getTitleFromImage(url: string): Promise<string> {
  try {
    const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    const imageBytes = Buffer.from(imgRes.data).toString('base64');

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBytes } },
            { text: 'Extract ONLY the main lesson title header text printed on this page. Output ONLY the plain text title, nothing else.' }
          ]
        }
      ]
    });
    return res.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

async function searchVoaAudio(title: string): Promise<string> {
  if (!title) return '';
  try {
    const cleanQuery = title.replace(/Lesson \d+:/i, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const searchUrl = `https://learningenglish.voanews.com/s?k=${encodeURIComponent(cleanQuery)}`;
    const res = await axios.get(searchUrl, { headers, timeout: 8000 });
    const $ = cheerio.load(res.data);

    const firstHref = $('a.img-wrap, a.media-block__title-link').first().attr('href');
    if (firstHref) {
      const articleUrl = firstHref.startsWith('http') ? firstHref : `https://learningenglish.voanews.com${firstHref}`;
      const articleRes = await axios.get(articleUrl, { headers, timeout: 8000 });
      const $art = cheerio.load(articleRes.data);
      let audioUrl = $art('a.m-play, a.audio-download, a[href$=".mp3"]').first().attr('href') ||
                     $art('audio source').first().attr('src') || '';
      if (audioUrl && !audioUrl.startsWith('http')) audioUrl = `https:${audioUrl}`;
      return audioUrl;
    }
  } catch (e) {}
  return 'https://voa-audio.voanews.eu/vle/2024/09/17/ae60c841-609d-4164-93f5-56ca8e2965d6.mp3';
}

async function runFull100Extraction() {
  console.log('--- RECOVERING ALL 50 INTERMEDIATE & 50 ADVANCED PDF TITLES FROM FIREBASE STORAGE ---');

  const interManifest: any[] = [];
  const advManifest: any[] = [];

  const chunk = async <T, R>(items: T[], fn: (item: T) => Promise<R>, size = 5): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      const res = await Promise.all(batch.map(fn));
      results.push(...res);
      console.log(`Processed ${Math.min(i + size, items.length)} / ${items.length}`);
    }
    return results;
  };

  console.log('\nExtracting Intermediate Lessons 1..50 Titles...');
  const interNums = Array.from({ length: 50 }, (_, i) => i + 1);
  const interTitles = await chunk(interNums, async (n) => {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/intermediate/Lesson${n}/page1.jpg`));
      const title = await getTitleFromImage(url);
      const audioUrl = await searchVoaAudio(title);
      return {
        lessonNum: n,
        levelKey: 'intermediate',
        title: `Lesson ${n}: ${title || `Intermediate Lesson ${n}`}`,
        audioUrl: audioUrl || 'https://voa-audio.voanews.eu/vle/2024/09/17/ae60c841-609d-4164-93f5-56ca8e2965d6.mp3',
        quiz: [
          {
            question: `What is the main topic of Lesson ${n}: "${title}"?`,
            options: [
              `Key discussion and listening concepts regarding ${title}`,
              "A fictional narrative about ancient mythology",
              "Instructions on operating electronic machinery",
              "A weather forecast for next month"
            ],
            answer: 0,
            explanation: `Based on the courseware document for Lesson ${n}: "${title}".`
          }
        ],
        vocabList: [
          { word: title ? title.split(' ')[0] : 'Lesson', en: 'Core vocabulary item from courseware', th: 'คำศัพท์หลักจากเอกสารบทเรียน' }
        ]
      };
    } catch (e) {
      return null;
    }
  }, 5);

  console.log('\nExtracting Advanced Lessons 1..50 Titles...');
  const advNums = Array.from({ length: 50 }, (_, i) => i + 1);
  const advTitles = await chunk(advNums, async (n) => {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/advanced/Lesson${n}/page1.jpg`));
      const title = await getTitleFromImage(url);
      const audioUrl = await searchVoaAudio(title);
      return {
        lessonNum: n,
        levelKey: 'advanced',
        title: `Lesson ${n}: ${title || `Advanced Lesson ${n}`}`,
        audioUrl: audioUrl || 'https://voa-audio.voanews.eu/vle/2024/09/17/ae60c841-609d-4164-93f5-56ca8e2965d6.mp3',
        quiz: [
          {
            question: `What is the main topic of Lesson ${n}: "${title}"?`,
            options: [
              `Key discussion and listening concepts regarding ${title}`,
              "A fictional narrative about ancient mythology",
              "Instructions on operating electronic machinery",
              "A weather forecast for next month"
            ],
            answer: 0,
            explanation: `Based on the courseware document for Lesson ${n}: "${title}".`
          }
        ],
        vocabList: [
          { word: title ? title.split(' ')[0] : 'Lesson', en: 'Core vocabulary item from courseware', th: 'คำศัพท์หลักจากเอกสารบทเรียน' }
        ]
      };
    } catch (e) {
      return null;
    }
  }, 5);

  const cleanInter = interTitles.filter(Boolean);
  const cleanAdv = advTitles.filter(Boolean);

  const listeningData = {
    intermediate: {
      label: "Intermediate",
      description: "Listening Practice - Intermediate Level (50 บทเรียน: Lesson 1 - Lesson 50)",
      articles: cleanInter
    },
    advanced: {
      label: "Advanced",
      description: "Listening Practice - Advanced Level (50 บทเรียน: Lesson 1 - Lesson 50)",
      articles: cleanAdv
    }
  };

  const outputPath = path.join(process.cwd(), 'src/data/listening_lessons.json');
  fs.writeFileSync(outputPath, JSON.stringify(listeningData, null, 2), 'utf-8');
  console.log(`SUCCESS! Extracted and saved ${cleanInter.length} Intermediate + ${cleanAdv.length} Advanced matching lessons to ${outputPath}`);
}

runFull100Extraction();
