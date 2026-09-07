import fs from 'fs';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const manualTranslations: any = {
  "哄": { th: "เสียงหัวเราะดังลั่น, เสียงดังอึกทึก", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"เสียงหัวเราะดังลั่น\"" },
  "晃": { th: "ส่าย, แกว่ง, โยกเยก", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"ส่าย\"" },
  "码": { th: "รหัส, หลา (หน่วยวัด), ขนาด", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"รหัส\"" },
  "麻": { th: "ป่าน, ชา (ความรู้สึก)", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"ป่าน\"" },
  "闷": { th: "อบอ้าว, อึดอัด, ปิดทึบ", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"อบอ้าว\"" },
  "拧": { th: "บิด, หยิก", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"บิด\"" },
  "且": { th: "และ, ยิ่งกว่านั้น, ชั่วคราว", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"และ\"" },
  "则": { th: "กฎ, หลักเกณฑ์, ก็ (สันธาน)", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"กฎ\"" },
  "之": { th: "ของ (ใช้เหมือน 的)", exampleTh: "นี่คือตัวอย่างเกี่ยวกับ \"ของ\"" }
};

let count = 0;
for (const item of hsk7to9Data) {
  if (manualTranslations[item.word]) {
    item.th = manualTranslations[item.word].th;
    item.exampleTh = manualTranslations[item.word].exampleTh;
    count++;
  }
}
console.log("Updated", count, "items.");

const fileContent = `export const hsk7to9Data = ${JSON.stringify(hsk7to9Data, null, 2)};\n`;
fs.writeFileSync('./src/data/hsk7to9Data.ts', fileContent, 'utf-8');
console.log('Fixed final words!');
