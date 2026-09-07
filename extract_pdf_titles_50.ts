import { storage } from './src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import fs from 'fs';

async function extractPdfTitles() {
  console.log('--- FETCHING LESSON 1..50 PAGE 1 URLs FROM FIREBASE ---');

  const interUrls: string[] = [];
  for (let i = 1; i <= 50; i++) {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/intermediate/Lesson${i}/page1.jpg`));
      interUrls.push(url);
    } catch (e) {
      interUrls.push('');
    }
  }

  const advUrls: string[] = [];
  for (let i = 1; i <= 50; i++) {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/advanced/Lesson${i}/page1.jpg`));
      advUrls.push(url);
    } catch (e) {
      advUrls.push('');
    }
  }

  console.log(`Fetched ${interUrls.filter(Boolean).length} Intermediate page1 URLs.`);
  console.log(`Fetched ${advUrls.filter(Boolean).length} Advanced page1 URLs.`);

  fs.writeFileSync('./firebase_listening_urls.json', JSON.stringify({ interUrls, advUrls }, null, 2), 'utf-8');
}

extractPdfTitles();
