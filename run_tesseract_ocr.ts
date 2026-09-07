import fs from 'fs';
import path from 'path';

// Let's inspect image sizes and binary text strings embedded in JPEG markers or EXIF if any
const samples = fs.readdirSync('./scratch_pdf_samples');
console.log('Downloaded sample images:', samples);

for (const file of samples) {
  const buf = fs.readFileSync(path.join('./scratch_pdf_samples', file));
  const str = buf.toString('binary');
  // Check for text strings longer than 4 chars
  const printable = str.match(/[A-Za-z0-9\s:,\.\?'"\(\)\-]{10,}/g) || [];
  console.log(`\nFile: ${file} (size: ${buf.length} bytes)`);
  console.log('Sample text strings:', printable.slice(0, 5));
}
