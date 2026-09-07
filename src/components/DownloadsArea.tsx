import React, { useState, useEffect } from 'react';
import { Download, ChevronLeft, Image as ImageIcon, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { getFirebaseStorageUrl } from '../utils/firebaseStorage';

interface DownloadsAreaProps {
  onBack?: () => void;
}

export default function DownloadsArea({ onBack }: DownloadsAreaProps) {
  const [data, setData] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/downloads')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const toggleSet = (setId: string) => {
    setExpandedSets(prev => ({ ...prev, [setId]: !prev[setId] }));
  };

  return (
    <div className="w-full flex flex-col h-full animate-fade-in pb-10">
      <div className="flex flex-col gap-4 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold gradient-text flex items-center gap-2">
          <Download className="text-purple-600" />
          คลังดาวน์โหลดไฟล์
        </h2>
        <p className="text-sm text-gray-500">รวมไฟล์ข้อสอบและสื่อการเรียนที่ดึงแยกเป็นรายหน้าเรียบร้อยแล้ว</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : Object.keys(data).length === 0 ? (
        <div className="text-center p-10 text-gray-500 bg-white/50 rounded-2xl border border-purple-100">
          ยังไม่มีไฟล์ดาวน์โหลดในระบบ
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(data).sort().map(([level, files]) => {
            // Group by exam set
            const sets: Record<string, { filename: string; page: number }[]> = {};
            files.forEach(f => {
              const match = f.match(/^(.*?)_page(\d+)\.(jpg|png)$/);
              if (match) {
                const setId = match[1];
                const page = parseInt(match[2], 10);
                if (!sets[setId]) sets[setId] = [];
                sets[setId].push({ filename: f, page });
              }
            });

            // Sort each set by page
            Object.values(sets).forEach(list => list.sort((a, b) => a.page - b.page));
            const sortedSets = Object.keys(sets).sort();

            return (
              <div key={level} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center text-sm">
                    {level.replace('H', 'HSK ')}
                  </div>
                  ระดับ {level}
                </h3>
                
                <div className="grid grid-cols-1 gap-4">
                  {sortedSets.map(setId => (
                    <div key={setId} className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-purple-50 transition-colors"
                        onClick={() => toggleSet(setId)}
                      >
                        <div className="flex items-center gap-3">
                          <ImageIcon className="text-purple-500" size={20} />
                          <span className="font-semibold text-gray-800">ชุดข้อสอบ {setId}</span>
                          <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            {sets[setId].length} หน้า
                          </span>
                        </div>
                        {expandedSets[setId] ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                      </div>

                      {expandedSets[setId] && (
                        <div className="p-4 bg-gray-50 border-t border-purple-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {sets[setId].map(item => (
                            <a 
                              key={item.filename}
                              href={getFirebaseStorageUrl(`HSK_Images/${level}/${item.filename}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative aspect-[3/4] bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all border border-gray-200"
                            >
                              <img 
                                src={getFirebaseStorageUrl(`HSK_Images/${level}/${item.filename}`)} 
                                alt={`Page ${item.page}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                <ExternalLink className="text-white" size={24} />
                                <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded-lg">
                                  หน้า {item.page}
                                </span>
                              </div>
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-xs font-bold px-2 py-1 rounded shadow-sm">
                                p.{item.page}
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
