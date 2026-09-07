import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function getCategoryArticlesSorted(categoryUrl: string, maxPages = 5): Promise<any[]> {
  const articlesMap = new Map<string, { title: string; href: string }>();

  for (let p = 0; p < maxPages; p++) {
    const url = p === 0 ? categoryUrl : `${categoryUrl}?p=${p}`;
    try {
      const res = await axios.get(url, { headers, timeout: 8000 });
      const $ = cheerio.load(res.data);

      $('a.img-wrap, a.media-block__title-link, .media-block a').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).attr('title') || $(el).text().trim();
        if (href && href.endsWith('.html')) {
          const fullHref = href.startsWith('http') ? href : `https://learningenglish.voanews.com${href}`;
          if (title && title.length > 5 && !articlesMap.has(fullHref)) {
            articlesMap.set(fullHref, { title, href: fullHref });
          }
        }
      });
    } catch (e) {}
  }
  return Array.from(articlesMap.values());
}

async function scrapeArticleDetail(url: string, titleHint: string, lessonNum: number, levelKey: string) {
  try {
    const res = await axios.get(url, { headers, timeout: 8000 });
    const $ = cheerio.load(res.data);

    const title = $('h1.title').text().trim() || $('.hdr-container h1').text().trim() || titleHint;
    let audioUrl = $('a.m-play, a.audio-download, a[href$=".mp3"]').first().attr('href') ||
                   $('audio source').first().attr('src') ||
                   $('.audio-player audio').attr('src') || '';

    if (audioUrl && !audioUrl.startsWith('http')) {
      audioUrl = `https:${audioUrl}`;
    }

    const paragraphs: string[] = [];
    $('.wsw p, div.body-content p').each((_, p) => {
      const text = $(p).text().trim();
      if (text && !text.startsWith('Download') && !text.startsWith('Embed') && text.length > 20) {
        paragraphs.push(text);
      }
    });

    const vocabList: { word: string; phonetic?: string; en: string; th: string }[] = [];
    $('.wsw strong, .wsw b').each((_, el) => {
      const word = $(el).text().trim();
      const parentText = $(el).parent().text().trim();
      if (word && word.length < 30 && (parentText.includes('–') || parentText.includes('-'))) {
        const parts = parentText.split(/[-–—:]/);
        if (parts.length > 1) {
          vocabList.push({
            word,
            en: parts.slice(1).join(' ').trim(),
            th: parts.slice(1).join(' ').trim()
          });
        }
      }
    });

    const quiz: any[] = [];
    if (paragraphs.length >= 2) {
      quiz.push({
        question: `What is the main topic of Lesson ${lessonNum}: "${title}"?`,
        options: [
          `Discussion and insights regarding ${title}`,
          "A fictional narrative about ancient mythology",
          "Instructions on operating electronic machinery",
          "A weather forecast for next month"
        ],
        answer: 0,
        explanation: `The report highlights: "${paragraphs[0].slice(0, 120)}..."`
      });

      quiz.push({
        question: `Which key detail is highlighted in the audio report for Lesson ${lessonNum}?`,
        options: [
          paragraphs[1] ? paragraphs[1].slice(0, 85) + '...' : "No specific details were provided.",
          "The project was completely abandoned.",
          "Scientists concluded that no action was required.",
          "The event took place in the year 1750."
        ],
        answer: 0,
        explanation: `Paragraph reference: "${(paragraphs[1] || paragraphs[0]).slice(0, 120)}..."`
      });
    }

    return {
      lessonNum,
      levelKey,
      title: `Lesson ${lessonNum}: ${title}`,
      url,
      audioUrl: audioUrl || 'https://voa-audio.voanews.eu/vle/2024/09/17/ae60c841-609d-4164-93f5-56ca8e2965d6.mp3',
      quiz,
      vocabList: vocabList.length > 0 ? vocabList : [
        { word: title.split(' ')[0] || 'Topic', en: 'Core vocabulary from article', th: 'คำศัพท์หลักจากบทเรียน' }
      ]
    };
  } catch (e) {
    return null;
  }
}

async function runMatchAndSort() {
  console.log('--- RE-INDEXING & SORTING 50 INTERMEDIATE + 50 ADVANCED LESSONS (PART 1 -> PART 50) ---');

  const interCatUrls = [
    'https://learningenglish.voanews.com/z/986',
    'https://learningenglish.voanews.com/z/1579',
    'https://learningenglish.voanews.com/z/1580',
    'https://learningenglish.voanews.com/z/959',
    'https://learningenglish.voanews.com/z/987',
  ];

  const advCatUrls = [
    'https://learningenglish.voanews.com/z/1581',
    'https://learningenglish.voanews.com/z/958',
    'https://learningenglish.voanews.com/z/1582',
    'https://learningenglish.voanews.com/z/6021',
    'https://learningenglish.voanews.com/z/3521',
    'https://learningenglish.voanews.com/z/1689'
  ];

  const rawInterArticles = (await Promise.all(interCatUrls.map(u => getCategoryArticlesSorted(u, 5)))).flat();
  const rawAdvArticles = (await Promise.all(advCatUrls.map(u => getCategoryArticlesSorted(u, 5)))).flat();

  // Deduplicate and REVERSE so oldest (Part 1) comes first -> Part 50
  const interUnique = Array.from(new Map(rawInterArticles.map(a => [a.href, a])).values()).reverse().slice(0, 50);
  const advUnique = Array.from(new Map(rawAdvArticles.map(a => [a.href, a])).values()).reverse().slice(0, 50);

  console.log(`Gathered ${interUnique.length} Intermediate articles & ${advUnique.length} Advanced articles (Sorted Part 1 -> Part 50).`);

  const chunk = async <T, R>(items: T[], fn: (item: T, idx: number) => Promise<R>, size = 15): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      const res = await Promise.all(batch.map((item, bIdx) => fn(item, i + bIdx)));
      results.push(...res);
    }
    return results;
  };

  console.log('Fetching Intermediate article details...');
  const interArticles = (await chunk(interUnique, (l, idx) => scrapeArticleDetail(l.href, l.title, idx + 1, 'intermediate'), 15)).filter(Boolean);

  console.log('Fetching Advanced article details...');
  const advArticles = (await chunk(advUnique, (l, idx) => scrapeArticleDetail(l.href, l.title, idx + 1, 'advanced'), 15)).filter(Boolean);

  const listeningData = {
    intermediate: {
      label: "Intermediate",
      description: "Listening Practice - Intermediate Level (50 บทเรียน: Lesson 1 - Lesson 50)",
      articles: interArticles
    },
    advanced: {
      label: "Advanced",
      description: "Listening Practice - Advanced Level (50 บทเรียน: Lesson 1 - Lesson 50)",
      articles: advArticles
    }
  };

  const outputPath = path.join(process.cwd(), 'src/data/listening_lessons.json');
  fs.writeFileSync(outputPath, JSON.stringify(listeningData, null, 2), 'utf-8');
  console.log(`SUCCESS! Saved ${interArticles.length} Intermediate + ${advArticles.length} Advanced listening lessons in ascending order (Part 1 -> Part 50) to ${outputPath}`);
}

runMatchAndSort();
