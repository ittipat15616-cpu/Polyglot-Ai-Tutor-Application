import hsk3 from '@leonsilicon/hsk3.0';

console.log('Keys in @leonsilicon/hsk3.0:', Object.keys(hsk3 || {}));
if (Array.isArray(hsk3)) {
  console.log('Total items in hsk3 array:', hsk3.length);
} else {
  for (const k in hsk3) {
    console.log(`Key ${k}:`, Array.isArray((hsk3 as any)[k]) ? (hsk3 as any)[k].length : typeof (hsk3 as any)[k]);
  }
}
