export const homophoneGroups = [
  // English Homophones
  ['to', 'too', 'two'],
  ['there', 'their', 'theyre', "they're"],
  ['your', 'youre', "you're"],
  ['its', "it's"],
  ['here', 'hear'],
  ['knight', 'night'],
  ['bare', 'bear'],
  ['cell', 'sell'],
  ['cent', 'scent', 'sent'],
  ['eye', 'i'],
  ['for', 'four', 'fore'],
  ['know', 'no'],
  ['knew', 'new'],
  ['our', 'hour'],
  ['sea', 'see'],
  ['son', 'sun'],
  ['write', 'right'],
  ['wait', 'weight'],
  ['meat', 'meet'],
  ['piece', 'peace'],
  ['buy', 'by', 'bye'],
  ['blew', 'blue'],
  ['board', 'bored'],
  ['hair', 'hare'],
  ['heal', 'heel'],
  ['stair', 'stare'],
  ['steal', 'steel'],
  ['threw', 'through'],
  ['waist', 'waste'],
  ['one', 'won'],
  ['be', 'bee'],
  ['dear', 'deer'],
  ['die', 'dye'],
  ['fair', 'fare'],
  ['flew', 'flu'],
  ['hole', 'whole'],
  ['mail', 'male'],
  ['pair', 'pear'],
  ['sail', 'sale'],
  ['tail', 'tale'],
  ['weak', 'week'],
  
  // Chinese Homophones (Common ones, for Speech Recognition fallback)
  ['他', '她', '它'],
  ['的', '得', '地'],
  ['做', '作'],
  ['在', '再'],
  ['坐', '座'],
  ['向', '像', '象'],
  ['带', '戴'],
  ['只', '指'],
  ['是', '事', '市', '室'],
  ['期', '七', '妻', '欺'],
  ['完', '玩'],
  ['男', '难'],
  ['进', '近'],
  ['名', '明'],
  ['声', '生'],
  ['权', '全'],
  ['报', '抱'],
  ['力', '利', '立', '丽'],
  ['同', '童'],
  ['到', '道'],
  ['以', '已'],
  ['原', '元', '园', '圆'],
  ['级', '极'],
  ['常', '长'],
  ['及', '急'],
  ['觉', '决'],
  ['知', '支', '只'],
  ['话', '画', '化'],
  ['工', '公']
];

export function areHomophones(w1: string, w2: string): boolean {
  if (!w1 || !w2) return false;
  const cleanW1 = w1.toLowerCase().trim();
  const cleanW2 = w2.toLowerCase().trim();
  if (cleanW1 === cleanW2) return true;
  for (const group of homophoneGroups) {
    if (group.includes(cleanW1) && group.includes(cleanW2)) {
      return true;
    }
  }
  return false;
}
