export type QuestionType = 'choice' | 'true_false' | 'matching_drag_drop' | 'ordering_input' | 'writing_textarea';

export interface QuestionPart {
  name: string; // e.g., "Listening Part 1"
  startQ: number;
  endQ: number;
  type: QuestionType;
  options?: string[]; // for choice, e.g., ['A', 'B', 'C', 'D']
  choicesPool?: string[]; // for matching_drag_drop, e.g., ['A', 'B', 'C', 'D', 'E', 'F']
}

export interface HskTestStructure {
  level: string;
  totalTimeMinutes: number;
  passingScore: number;
  totalScore: number;
  parts: {
    listening: QuestionPart[];
    reading: QuestionPart[];
    writing: QuestionPart[];
  };
}

export const hskStructures: Record<string, HskTestStructure> = {
  HSK1: {
    level: 'HSK1',
    totalTimeMinutes: 40,
    passingScore: 120,
    totalScore: 200,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1', startQ: 1, endQ: 5, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การฟัง ส่วนที่ 2', startQ: 6, endQ: 10, type: 'choice', options: ['A', 'B', 'C'] },
        { name: 'การฟัง ส่วนที่ 3', startQ: 11, endQ: 15, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การฟัง ส่วนที่ 4', startQ: 16, endQ: 20, type: 'choice', options: ['A', 'B', 'C'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1', startQ: 21, endQ: 25, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การอ่าน ส่วนที่ 2', startQ: 26, endQ: 30, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 3', startQ: 31, endQ: 35, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 4', startQ: 36, endQ: 40, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
      ],
      writing: []
    }
  },
  HSK2: {
    level: 'HSK2',
    totalTimeMinutes: 55,
    passingScore: 120,
    totalScore: 200,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1', startQ: 1, endQ: 10, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การฟัง ส่วนที่ 2 (ข้อ 11-15)', startQ: 11, endQ: 15, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การฟัง ส่วนที่ 2 (ข้อ 16-20)', startQ: 16, endQ: 20, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E'] },
        { name: 'การฟัง ส่วนที่ 3', startQ: 21, endQ: 30, type: 'choice', options: ['A', 'B', 'C'] },
        { name: 'การฟัง ส่วนที่ 4', startQ: 31, endQ: 35, type: 'choice', options: ['A', 'B', 'C'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1', startQ: 36, endQ: 40, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 2', startQ: 41, endQ: 45, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 3', startQ: 46, endQ: 50, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การอ่าน ส่วนที่ 4 (ข้อ 51-55)', startQ: 51, endQ: 55, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 4 (ข้อ 56-60)', startQ: 56, endQ: 60, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
      ],
      writing: []
    }
  },
  HSK3: {
    level: 'HSK3',
    totalTimeMinutes: 90,
    passingScore: 180,
    totalScore: 300,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1 (ข้อ 1-5)', startQ: 1, endQ: 5, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การฟัง ส่วนที่ 1 (ข้อ 6-10)', startQ: 6, endQ: 10, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การฟัง ส่วนที่ 2', startQ: 11, endQ: 20, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การฟัง ส่วนที่ 3', startQ: 21, endQ: 30, type: 'choice', options: ['A', 'B', 'C'] },
        { name: 'การฟัง ส่วนที่ 4', startQ: 31, endQ: 40, type: 'choice', options: ['A', 'B', 'C'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1 (ข้อ 41-45)', startQ: 41, endQ: 45, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 1 (ข้อ 46-50)', startQ: 46, endQ: 50, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 2 (ข้อ 51-55)', startQ: 51, endQ: 55, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 2 (ข้อ 56-60)', startQ: 56, endQ: 60, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 3', startQ: 61, endQ: 70, type: 'choice', options: ['A', 'B', 'C'] },
      ],
      writing: [
        { name: 'การเขียน ส่วนที่ 1 (เรียงประโยค)', startQ: 71, endQ: 75, type: 'writing_textarea' },
        { name: 'การเขียน ส่วนที่ 2 (เขียนตัวจีน)', startQ: 76, endQ: 80, type: 'writing_textarea' },
      ]
    }
  },
  HSK4: {
    level: 'HSK4',
    totalTimeMinutes: 105,
    passingScore: 180,
    totalScore: 300,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1', startQ: 1, endQ: 10, type: 'true_false', options: ['✓', '✗'] },
        { name: 'การฟัง ส่วนที่ 2', startQ: 11, endQ: 25, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การฟัง ส่วนที่ 3', startQ: 26, endQ: 45, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1 (ข้อ 46-50)', startQ: 46, endQ: 50, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 1 (ข้อ 51-55)', startQ: 51, endQ: 55, type: 'matching_drag_drop', choicesPool: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { name: 'การอ่าน ส่วนที่ 2 (เรียงประโยค)', startQ: 56, endQ: 65, type: 'ordering_input' }, 
        { name: 'การอ่าน ส่วนที่ 3', startQ: 66, endQ: 85, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      writing: [
        { name: 'การเขียน ส่วนที่ 1 (เรียงประโยค)', startQ: 86, endQ: 95, type: 'writing_textarea' },
        { name: 'การเขียน ส่วนที่ 2 (แต่งประโยคจากรูป)', startQ: 96, endQ: 100, type: 'writing_textarea' },
      ]
    }
  },
  HSK5: {
    level: 'HSK5',
    totalTimeMinutes: 125,
    passingScore: 180,
    totalScore: 300,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1', startQ: 1, endQ: 20, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การฟัง ส่วนที่ 2', startQ: 21, endQ: 45, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1', startQ: 46, endQ: 60, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การอ่าน ส่วนที่ 2', startQ: 61, endQ: 70, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การอ่าน ส่วนที่ 3', startQ: 71, endQ: 90, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      writing: [
        { name: 'การเขียน ส่วนที่ 1 (เรียงประโยค)', startQ: 91, endQ: 98, type: 'writing_textarea' },
        { name: 'การเขียน ส่วนที่ 2 (เขียนเรียงความ)', startQ: 99, endQ: 100, type: 'writing_textarea' },
      ]
    }
  },
  HSK6: {
    level: 'HSK6',
    totalTimeMinutes: 140,
    passingScore: 180,
    totalScore: 300,
    parts: {
      listening: [
        { name: 'การฟัง ส่วนที่ 1', startQ: 1, endQ: 15, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การฟัง ส่วนที่ 2', startQ: 16, endQ: 30, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การฟัง ส่วนที่ 3', startQ: 31, endQ: 50, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      reading: [
        { name: 'การอ่าน ส่วนที่ 1', startQ: 51, endQ: 60, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การอ่าน ส่วนที่ 2', startQ: 61, endQ: 70, type: 'choice', options: ['A', 'B', 'C', 'D'] },
        { name: 'การอ่าน ส่วนที่ 3', startQ: 71, endQ: 80, type: 'choice', options: ['A', 'B', 'C', 'D', 'E'] },
        { name: 'การอ่าน ส่วนที่ 4', startQ: 81, endQ: 100, type: 'choice', options: ['A', 'B', 'C', 'D'] },
      ],
      writing: [
        { name: 'การเขียน (ย่อความ)', startQ: 101, endQ: 101, type: 'writing_textarea' },
      ]
    }
  }
};
