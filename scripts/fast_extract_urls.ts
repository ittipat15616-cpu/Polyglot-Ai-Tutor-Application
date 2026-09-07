import { storage } from '../src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import fs from 'fs';

async function fastExtract() {
  console.log('--- PARALLEL FETCHING LESSON 1..50 PAGE 1 URLs FROM FIREBASE ---');

  const getUrl = async (path: string) => {
    try {
      return await getDownloadURL(ref(storage, path));
    } catch (e) {
      return '';
    }
  };

  const interNums = Array.from({ length: 50 }, (_, i) => i + 1);
  const advNums = Array.from({ length: 50 }, (_, i) => i + 1);

  const interUrls = await Promise.all(interNums.map(n => getUrl(`Courseware_Images/listening/intermediate/Lesson${n}/page1.jpg`)));
  const advUrls = await Promise.all(advNums.map(n => getUrl(`Courseware_Images/listening/advanced/Lesson${n}/page1.jpg`)));

  console.log(`SUCCESS! Intermediate page1 URLs: ${interUrls.filter(Boolean).length} / 50`);
  console.log(`SUCCESS! Advanced page1 URLs: ${advUrls.filter(Boolean).length} / 50`);

  fs.writeFileSync('./firebase_listening_urls.json', JSON.stringify({ interUrls, advUrls }, null, 2), 'utf-8');
}

fastExtract();
