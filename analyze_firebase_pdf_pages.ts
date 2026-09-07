import { storage } from './src/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

async function downloadSamplePages() {
  console.log('--- DOWNLOADING PAGE 1 FOR SAMPLE LESSONS FROM FIREBASE ---');
  const tempDir = path.join(process.cwd(), 'scratch_pdf_samples');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  // Sample Intermediate Lesson 1, 2, 48, 49, 50
  const sampleInter = [1, 2, 10, 20, 30, 40, 48, 49, 50];
  for (const n of sampleInter) {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/intermediate/Lesson${n}/page1.jpg`));
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      const dest = path.join(tempDir, `inter_lesson${n}_page1.jpg`);
      fs.writeFileSync(dest, res.data);
      console.log(`Downloaded Intermediate Lesson${n} page1.jpg (${res.data.length} bytes)`);
    } catch (e) {
      console.error(`Error downloading Intermediate Lesson${n}:`, e);
    }
  }

  // Sample Advanced Lesson 1, 2, 10, 50
  const sampleAdv = [1, 2, 10, 50];
  for (const n of sampleAdv) {
    try {
      const url = await getDownloadURL(ref(storage, `Courseware_Images/listening/advanced/Lesson${n}/page1.jpg`));
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      const dest = path.join(tempDir, `adv_lesson${n}_page1.jpg`);
      fs.writeFileSync(dest, res.data);
      console.log(`Downloaded Advanced Lesson${n} page1.jpg (${res.data.length} bytes)`);
    } catch (e) {
      console.error(`Error downloading Advanced Lesson${n}:`, e);
    }
  }

  console.log(`Saved sample images to ${tempDir}`);
}

downloadSamplePages();
