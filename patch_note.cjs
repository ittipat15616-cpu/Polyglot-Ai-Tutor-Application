const fs = require('fs');
let code = fs.readFileSync('src/components/LearningPlanModal.tsx', 'utf8');

const targetStr = `        )}
      </div>
      
      {/* Vocab Choice Modal */}`;

const newStr = `        )}

        <div className="text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100">
          *หมายเหตุ: คุณไม่จำเป็นต้องเรียนตามแผนเสมอไป คุณสามารถไปลองเรียนบทเรียนอื่นๆและลองใช้ฟีเจอร์อื่นๆนอกเหนือจากที่แผนกำหนดไว้ให้ได้อย่างอิสระ แผนที่สร้างเป็นเพียงแค่ไกด์นำทางเท่านั้น*
        </div>
      </div>
      
      {/* Vocab Choice Modal */}`;

code = code.replace(targetStr, newStr);
fs.writeFileSync('src/components/LearningPlanModal.tsx', code);
