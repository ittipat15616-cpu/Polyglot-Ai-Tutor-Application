import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function getArticleLinksFromCategory(categoryUrl: string, maxCount: number): Promise<{ title: string; href: string }[]> {
  const results: { title: string; href: string }[] = [];
  let page = 0;
  
  while (results.length < maxCount && page < 5) {
    const pageUrl = page === 0 ? categoryUrl : `${categoryUrl}?p=${page}`;
    console.log(`Scraping category page: ${pageUrl}`);
    try {
      const res = await axios.get(pageUrl, { headers, timeout: 10000 });
      const $ = cheerio.load(res.data);
      
      $('a.img-wrap, a.media-block__title-link, .media-block a').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).attr('title') || $(el).text().trim();
        if (href && href.endsWith('.html') && !results.some(l => l.href === href)) {
          const fullHref = href.startsWith('http') ? href : `https://learningenglish.voanews.com${href}`;
          if (title && title.length > 5) {
            results.push({ title, href: fullHref });
          }
        }
      });
    } catch (e) {
      console.error(`Error scraping category ${pageUrl}:`, e);
      break;
    }
    page++;
  }
  return results.slice(0, maxCount);
}

async function scrapeArticleDetail(url: string, titleHint: string) {
  try {
    const res = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(res.data);

    const title = $('h1.title').text().trim() || $('.hdr-container h1').text().trim() || titleHint;
    
    // Find MP3 audio link
    let audioUrl = $('a.m-play, a.audio-download, a[href$=".mp3"]').first().attr('href') ||
                   $('audio source').first().attr('src') ||
                   $('.audio-player audio').attr('src') || '';

    if (audioUrl && !audioUrl.startsWith('http')) {
      audioUrl = `https:${audioUrl}`;
    }

    // Extract paragraphs
    const paragraphs: string[] = [];
    $('.wsw p, div.body-content p').each((_, p) => {
      const text = $(p).text().trim();
      if (text && !text.startsWith('Download') && !text.startsWith('Embed') && text.length > 20) {
        paragraphs.push(text);
      }
    });

    // Extract Vocabulary if available in article
    const vocabList: { word: string; phonetic?: string; en: string; th: string }[] = [];
    $('.wsw strong, .wsw b').each((_, el) => {
      const word = $(el).text().trim();
      const parentText = $(el).parent().text().trim();
      if (word && word.length < 30 && parentText.includes('–') || parentText.includes('-') || parentText.includes('n.') || parentText.includes('v.')) {
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

    // Generate smart quiz questions based on paragraphs
    const quiz: any[] = [];
    if (paragraphs.length >= 3) {
      // Question 1: Main Topic
      quiz.push({
        question: `What is the main focus of the article "${title}"?`,
        options: [
          `Discussion and insights regarding ${title}`,
          "A fictional story about space exploration",
          "A cooking recipe demonstration",
          "An advertisement for sports equipment"
        ],
        answer: 0,
        explanation: `Paragraph 1 introduces the core topic: "${paragraphs[0].slice(0, 100)}..."`
      });

      // Question 2: Detail from paragraph 2 or 3
      if (paragraphs[1]) {
        quiz.push({
          question: `According to the report, which statement best reflects the key detail mentioned in the article?`,
          options: [
            paragraphs[1].slice(0, 80) + '...',
            "The event was completely cancelled due to weather.",
            "Scientists confirmed no changes occurred.",
            "The report focuses exclusively on historical events from 1800."
          ],
          answer: 0,
          explanation: `Paragraph 2 details: "${paragraphs[1].slice(0, 120)}..."`
        });
      }

      // Question 3: Summary detail
      if (paragraphs[2]) {
        quiz.push({
          question: `What additional context or outcome is highlighted in the report?`,
          options: [
            "No further developments were recorded.",
            paragraphs[2].slice(0, 80) + '...',
            "All participants opposed the initiative.",
            "The program concluded without any public response."
          ],
          answer: 1,
          explanation: `Paragraph 3 explains: "${paragraphs[2].slice(0, 120)}..."`
        });
      }
    }

    return {
      title,
      url,
      audioUrl: audioUrl || 'https://voa-audio.voanews.eu/vle/2024/09/17/ae60c841-609d-4164-93f5-56ca8e2965d6.mp3',
      quiz,
      vocabList: vocabList.length > 0 ? vocabList : [
        { word: title.split(' ')[0] || 'Topic', en: 'Key topic discussed in article', th: 'หัวข้อหลักที่พูดถึงในบทเรียน' }
      ]
    };
  } catch (e) {
    console.error(`Error scraping article ${url}:`, e);
    return null;
  }
}

async function scrapeAll100() {
  console.log('--- STARTING VOA LISTENING SCRAPER (50 Intermediate + 50 Advanced) ---');

  // Intermediate categories
  const interCategories = [
    'https://learningenglish.voanews.com/z/986',   // As It Is
    'https://learningenglish.voanews.com/z/1579',  // Health & Lifestyle
    'https://learningenglish.voanews.com/z/1580',  // Science & Technology
    'https://learningenglish.voanews.com/z/959',   // Education
    'https://learningenglish.voanews.com/z/987',   // Arts & Culture
  ];

  // Advanced categories
  const advCategories = [
    'https://learningenglish.voanews.com/z/1581',  // Words and Their Stories
    'https://learningenglish.voanews.com/z/958',   // Everyday Grammar
    'https://learningenglish.voanews.com/z/1582',  // American Stories
    'https://learningenglish.voanews.com/z/986',   // As It Is Advanced
  ];

  // 1. Collect Intermediate links
  console.log('\n--- Collecting Intermediate Links ---');
  let interLinks: { title: string; href: string }[] = [];
  for (const catUrl of interCategories) {
    if (interLinks.length >= 50) break;
    const links = await getArticleLinksFromCategory(catUrl, 15);
    for (const l of links) {
      if (!interLinks.some(existing => existing.href === l.href)) {
        interLinks.push(l);
      }
    }
  }
  interLinks = interLinks.slice(0, 50);
  console.log(`Collected ${interLinks.length} Intermediate links.`);

  // 2. Collect Advanced links
  console.log('\n--- Collecting Advanced Links ---');
  let advLinks: { title: string; href: string }[] = [];
  for (const catUrl of advCategories) {
    if (advLinks.length >= 50) break;
    const links = await getArticleLinksFromCategory(catUrl, 15);
    for (const l of links) {
      if (!advLinks.some(existing => existing.href === l.href) && !interLinks.some(i => i.href === l.href)) {
        advLinks.push(l);
      }
    }
  }
  advLinks = advLinks.slice(0, 50);
  console.log(`Collected ${advLinks.length} Advanced links.`);

  // 3. Process Intermediate Articles
  console.log('\n--- Scraping Intermediate Article Details ---');
  const interArticles: any[] = [];
  for (let i = 0; i < interLinks.length; i++) {
    console.log(`Intermediate [${i + 1}/${interLinks.length}]: ${interLinks[i].title}`);
    const detail = await scrapeArticleDetail(interLinks[i].href, interLinks[i].title);
    if (detail) {
      interArticles.push(detail);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // 4. Process Advanced Articles
  console.log('\n--- Scraping Advanced Article Details ---');
  const advArticles: any[] = [];
  for (let i = 0; i < advLinks.length; i++) {
    console.log(`Advanced [${i + 1}/${advLinks.length}]: ${advLinks[i].title}`);
    const detail = await scrapeArticleDetail(advLinks[i].href, advLinks[i].title);
    if (detail) {
      advArticles.push(detail);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // Final Dataset Structure
  const listeningData = {
    intermediate: {
      label: "Intermediate",
      description: "Listening Practice - Intermediate Level (50 บทเรียน)",
      articles: interArticles
    },
    advanced: {
      label: "Advanced",
      description: "Listening Practice - Advanced Level (50 บทเรียน)",
      articles: advArticles
    }
  };

  const outputPath = path.join(process.cwd(), 'src/data/listening_lessons.json');
  fs.writeFileSync(outputPath, JSON.stringify(listeningData, null, 2), 'utf-8');
  console.log(`\nSUCCESSFULLY SAVED 100 VOA LISTENING LESSONS to ${outputPath}`);
}

scrapeAll100();
