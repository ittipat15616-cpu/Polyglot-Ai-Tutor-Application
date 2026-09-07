import fs from 'fs';
import path from 'path';

const manifestPath = path.join(process.cwd(), 'src', 'data', 'image_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

console.log("=== IMAGE MANIFEST INSPECTION ===");
const keys = Object.keys(manifest);
console.log("Total manifest folders:", keys.length);

const targets = ['IELTS_Mock_Test_2', 'IELTS_Mock_Test_5', 'IELTS_Mock_Test_6', 'IELTS_Mock_Test_7', 'IELTS_Mock_Test_8', 'IELTS_Mock_Test_9', 'IELTS_Mock_Test_20'];

keys.filter(k => k.includes('IELTS')).forEach(k => {
  if (targets.some(t => k.includes(t))) {
    console.log(`Folder: ${k} => Pages: ${manifest[k].length}`);
  }
});
