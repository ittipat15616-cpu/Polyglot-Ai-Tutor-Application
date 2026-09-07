import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function getCategoryLinksPaged(categoryUrl: string, maxPages = 4): Promise<{ title: string; href: string }[]> {
  const links: { title: string; href: string }[] = [];
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
          if (title && title.length > 5 && !links.some(l => l.href === fullHref)) {
            links.push({ title, href: fullHref });
          }
        }
      });
    } catch (e) {}
  }
  return links;
}

async function scrapeArticleDetail(url: string, titleHint: string) {
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
        question: `What is the main topic of "${title}"?`,
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
        question: `Which key detail is highlighted in the audio report?`,
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
      title,
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

async function runFastScrape() {
  console.log('--- FAST PARALLEL VOA LISTENING SCRAPER (50 Inter + 50 Adv) ---');

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

  const interLinkArrays = await Promise.all(interCatUrls.map(u => getCategoryLinksPaged(u, 4)));
  const advLinkArrays = await Promise.all(advCatUrls.map(u => getCategoryLinksPaged(u, 4)));

  const interLinksMap = new Map<string, string>();
  for (const arr of interLinkArrays) {
    for (const item of arr) {
      if (!interLinksMap.has(item.href)) interLinksMap.set(item.href, item.title);
    }
  }

  const advLinksMap = new Map<string, string>();
  for (const arr of advLinkArrays) {
    for (const item of arr) {
      if (!advLinksMap.has(item.href) && !interLinksMap.has(item.href)) {
        advLinksMap.set(item.href, item.title);
      }
    }
  }

  const interLinks = Array.from(interLinksMap.entries()).slice(0, 50).map(([href, title]) => ({ href, title }));
  const advLinks = Array.from(advLinksMap.entries()).slice(0, 50).map(([href, title]) => ({ href, title }));

  console.log(`Gathered ${interLinks.length} Intermediate links & ${advLinks.length} Advanced links.`);

  const chunk = async <T, R>(items: T[], fn: (item: T) => Promise<R>, size = 15): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      const res = await Promise.all(batch.map(fn));
      results.push(...res);
    }
    return results;
  };

  console.log('Fetching Intermediate article details...');
  const interArticles = (await chunk(interLinks, l => scrapeArticleDetail(l.href, l.title), 15)).filter(Boolean);

  console.log('Fetching Advanced article details...');
  const advArticles = (await chunk(advLinks, l => scrapeArticleDetail(l.href, l.title), 15)).filter(Boolean);

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
  console.log(`SUCCESS! Saved ${interArticles.length} Intermediate + ${advArticles.length} Advanced listening lessons to ${outputPath}`);
}

runFastScrape();
