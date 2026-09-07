export const grammarBeginner = [
  { word: 'Present Simple', type: 'Tense', th: 'ใช้กับเหตุการณ์ที่เกิดขึ้นเป็นประจำหรือเป็นข้อเท็จจริง', example: 'I wake up at 7 AM every day.', exampleTh: 'ฉันตื่นนอนตอน 7 โมงเช้าทุกวัน' },
  { word: 'Present Continuous', type: 'Tense', th: 'ใช้กับเหตุการณ์ที่กำลังเกิดขึ้นในขณะนี้', example: 'She is reading a book right now.', exampleTh: 'เธอกำลังอ่านหนังสืออยู่ตอนนี้' },
  { word: 'Past Simple', type: 'Tense', th: 'ใช้กับเหตุการณ์ที่เกิดขึ้นและจบลงไปแล้วในอดีต (มักมีเวลากำหนดชัดเจน)', example: 'They visited Japan last year.', exampleTh: 'พวกเขาไปเที่ยวญี่ปุ่นเมื่อปีที่แล้ว' },
  { word: 'Future Simple', type: 'Tense', th: 'ใช้กับเหตุการณ์ที่จะเกิดขึ้นในอนาคต มักใช้กับ will / shall', example: 'I will call you tomorrow.', exampleTh: 'ฉันจะโทรหาคุณพรุ่งนี้' },
  { word: 'Verb to Be', type: 'Grammar', th: 'คำกริยา is, am, are ใช้บอกสถานะ เป็น, อยู่, คือ', example: 'He is a student.', exampleTh: 'เขาเป็นนักเรียน' },
  { word: 'Articles (a, an, the)', type: 'Grammar', th: 'คำนำหน้านาม a/an นำหน้านามทั่วไปเอกพจน์, the นำหน้านามเฉพาะเจาะจง', example: 'I have an apple and a banana.', exampleTh: 'ฉันมีแอปเปิ้ลและกล้วย' },
  { word: 'Pronouns', type: 'Grammar', th: 'สรรพนามใช้เรียกแทนคำนาม (I, you, we, they, he, she, it)', example: 'She is my best friend.', exampleTh: 'เธอคือเพื่อนสนิทของฉัน' },
  { word: 'Prepositions of Time (in, on, at)', type: 'Grammar', th: 'คำบุพบทบอกเวลา (in ใช้กับเดือน/ปี, on ใช้กับวัน, at ใช้กับเวลา)', example: 'The meeting is on Monday at 9 AM.', exampleTh: 'การประชุมมีขึ้นในวันจันทร์เวลา 9 โมงเช้า' },
  { word: 'Plural Nouns', type: 'Grammar', th: 'คำนามพหูพจน์ (เติม -s หรือ -es)', example: 'There are two cats in the garden.', exampleTh: 'มีแมวสองตัวอยู่ในสวน' },
  { word: 'Possessive Adjectives', type: 'Grammar', th: 'คำขยายเพื่อแสดงความเป็นเจ้าของ (my, your, his, her, its, our, their)', example: 'This is my house.', exampleTh: 'นี่คือบ้านของฉัน' }
];

export const grammarIntermediate = [
  { word: 'Present Perfect', type: 'Tense', th: 'เหตุการณ์ที่เกิดในอดีตและดำเนินมาถึงปัจจุบัน หรือเพิ่งจบลง', example: 'I have lived here for 5 years.', exampleTh: 'ฉันอาศัยอยู่ที่นี่มา 5 ปีแล้ว' },
  { word: 'Past Continuous', type: 'Tense', th: 'เหตุการณ์ที่กำลังเกิดขึ้นในอดีต หรือถูกแทรกด้วยอีกเหตุการณ์', example: 'I was sleeping when the phone rang.', exampleTh: 'ฉันกำลังนอนหลับตอนที่โทรศัพท์ดัง' },
  { word: 'Conditional (Zero & First)', type: 'Grammar', th: 'ประโยคเงื่อนไข (If clauses) แบบเป็นจริงเสมอ หรือมีความเป็นไปได้ในอนาคต', example: 'If it rains, I will stay home.', exampleTh: 'ถ้าฝนตก ฉันจะอยู่บ้าน' },
  { word: 'Modal Verbs (can, could, should)', type: 'Grammar', th: 'กริยาช่วยที่แสดงความสามารถ คำแนะนำ หรือความเป็นไปได้', example: 'You should drink more water.', exampleTh: 'คุณควรดื่มน้ำให้มากขึ้น' },
  { word: 'Passive Voice', type: 'Grammar', th: 'ประโยคที่เน้นผู้ถูกกระทำ (Subject + to be + V3)', example: 'The letter was written by John.', exampleTh: 'จดหมายถูกเขียนโดยจอห์น' },
  { word: 'Relative Clauses', type: 'Grammar', th: 'อนุประโยคขยายคำนาม (who, which, that)', example: 'The man who lives next door is a doctor.', exampleTh: 'ผู้ชายที่อาศัยอยู่ข้างบ้านเป็นหมอ' },
  { word: 'Gerunds vs Infinitives', type: 'Grammar', th: 'การใช้คำกริยาเติม -ing ทำหน้าที่เป็นนาม หรือ to + V1', example: 'I enjoy reading books.', exampleTh: 'ฉันสนุกกับการอ่านหนังสือ' },
  { word: 'Countable vs Uncountable Nouns', type: 'Grammar', th: 'นามนับได้และนามนับไม่ได้ (ใช้อธิบายปริมาณ much, many, a lot of)', example: 'I do not have much money.', exampleTh: 'ฉันมีเงินไม่มาก' },
  { word: 'Comparatives & Superlatives', type: 'Grammar', th: 'การเปรียบเทียบขั้นกว่า และขั้นสูงสุด', example: 'Cheetahs are the fastest land animals.', exampleTh: 'ชีตาห์เป็นสัตว์บกที่วิ่งเร็วที่สุด' },
  { word: 'Used to', type: 'Grammar', th: 'ใช้กับสิ่งที่เคยทำในอดีต แต่ปัจจุบันไม่ได้ทำแล้ว', example: 'I used to play tennis when I was young.', exampleTh: 'ฉันเคยเล่นเทนนิสตอนที่ฉันยังเด็ก' }
];

export const grammarAdvanced = [
  { word: 'Past Perfect', type: 'Tense', th: 'เหตุการณ์ที่เกิดขึ้นและจบลงไปแล้ว ก่อนอีกเหตุการณ์หนึ่งในอดีต (Had + V3)', example: 'When I arrived, the train had left.', exampleTh: 'เมื่อฉันมาถึง รถไฟก็ได้ออกไปแล้ว' },
  { word: 'Future Perfect', type: 'Tense', th: 'เหตุการณ์ที่จะจบสมบูรณ์ ณ เวลาหนึ่งในอนาคต (Will have + V3)', example: 'I will have finished my work by 5 PM.', exampleTh: 'ฉันจะทำงานเสร็จภายในเวลา 5 โมงเย็น' },
  { word: 'Mixed Conditionals', type: 'Grammar', th: 'ประโยคเงื่อนไขแบบผสม (มักผสมระหว่างอดีตกับปัจจุบัน)', example: 'If I had studied harder, I would have a better job now.', exampleTh: 'ถ้าฉันเรียนให้หนักกว่านี้ ฉันคงได้ทำงานที่ดีกว่านี้ไปแล้วในตอนนี้' },
  { word: 'Inversion', type: 'Grammar', th: 'การสลับตำแหน่งประธานและกริยา เพื่อเน้นย้ำความหมาย มักใช้กับคำปฏิเสธ', example: 'Never have I seen such a beautiful sunset.', exampleTh: 'ฉันไม่เคยเห็นพระอาทิตย์ตกที่สวยงามขนาดนี้มาก่อนเลย' },
  { word: 'Reported Speech', type: 'Grammar', th: 'การนำคำพูดของผู้อื่นมาเล่าต่อ (Indirect speech)', example: 'He said that he was going to the store.', exampleTh: 'เขาพูดว่าเขากำลังจะไปที่ร้าน' },
  { word: 'Cleft Sentences', type: 'Grammar', th: 'รูปประโยคที่แตกออกเพื่อเน้นส่วนใดส่วนหนึ่ง (It is... that)', example: 'It was John who broke the window.', exampleTh: 'จอห์นนี่แหละที่เป็นคนทำหน้าต่างแตก' },
  { word: 'Subjunctive', type: 'Grammar', th: 'การใช้กริยาช่อง 1 ที่ไม่ผันตามประธาน หลังคำกริยาแนะนำหรือสำคัญ', example: 'It is essential that he be present tomorrow.', exampleTh: 'มันเป็นเรื่องสำคัญที่เขาจะต้องมาในวันพรุ่งนี้' },
  { word: 'Participle Clauses', type: 'Grammar', th: 'การลดรูปอนุประโยคโดยใช้ V-ing หรือ V3', example: 'Feeling exhausted, she went straight to bed.', exampleTh: 'เพราะรู้สึกหมดแรง เธอจึงตรงไปนอนที่เตียงทันที' },
  { word: 'Phrasal Verbs', type: 'Grammar', th: 'กริยาวลีที่เป็นกริยา + บุพบท/วิเศษณ์ ความหมายมักต่างจากเดิม', example: 'We need to figure out a solution before the deadline.', exampleTh: 'เราจำเป็นต้องหาทางแก้ปัญหาให้ได้ก่อนกำหนดเวลา' },
  { word: 'Nuances of Modals (Deduction & Speculation)', type: 'Grammar', th: 'การใช้กริยาช่วยเพื่อคาดเดาเหตุการณ์ในปัจจุบันหรืออดีต (must have, might have, cannot have)', example: 'He must have left early because his coat is gone.', exampleTh: 'เขาต้องออกไปเร็วแน่ๆ เพราะเสื้อโค้ตของเขาหายไปแล้ว' }
];

export const grammarLessonsData = [
  ...grammarBeginner,
  ...grammarIntermediate,
  ...grammarAdvanced
];
