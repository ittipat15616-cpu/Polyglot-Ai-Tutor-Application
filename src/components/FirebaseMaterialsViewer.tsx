import React, { useEffect, useState } from 'react';
import { Download, FileText, PlayCircle, Image as ImageIcon } from 'lucide-react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface MaterialItem {
  id: string;
  name: string;
  jpgUrl?: string;
  pdfUrl?: string;
  mp3Urls?: { name: string; url: string }[];
}

interface FirebaseMaterialsViewerProps {
  prefix: string;
  title: string;
}

export default function FirebaseMaterialsViewer({ prefix, title }: FirebaseMaterialsViewerProps) {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMaterials = async () => {
      setLoading(true);
      try {
        const listRef = ref(storage, prefix);
        const res = await listAll(listRef);
        
        if (res.items.length > 0) {
          const grouped = new Map<string, MaterialItem>();
          
          await Promise.all(res.items.map(async (itemRef) => {
            const fileName = itemRef.name;
            if (!fileName) return;
            
            const match = fileName.match(/^(.*?)(_task\d+)?\.(jpg|pdf|mp3)$/i);
            if (!match) return;
            
            const baseName = match[1];
            const suffix = match[2] || '';
            const ext = match[3].toLowerCase();
            
            if (!grouped.has(baseName)) {
              grouped.set(baseName, { id: baseName, name: baseName.replace(/_/g, ' '), mp3Urls: [] });
            }
            
            const group = grouped.get(baseName)!;
            const url = await getDownloadURL(itemRef);
            
            if (ext === 'jpg') {
              group.jpgUrl = url;
            } else if (ext === 'pdf') {
              group.pdfUrl = url;
            } else if (ext === 'mp3') {
              group.mp3Urls!.push({ name: fileName, url });
            }
          }));
          
          // Sort items naturally
          const sortedItems = Array.from(grouped.values()).sort((a, b) => {
            const numA = parseInt(a.id.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.id.match(/\d+/)?.[0] || '0');
            return numA - numB;
          });
          
          setItems(sortedItems);
        }
      } catch (err) {
        console.error('Failed to fetch materials:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMaterials();
  }, [prefix]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <span className="ml-3 text-indigo-600 font-medium">กำลังโหลดบทเรียน...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-2xl border border-gray-100">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">ไม่พบบทเรียนในหมวดหมู่นี้</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, idx) => (
          <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
            {item.jpgUrl ? (
              <div className="aspect-[4/3] bg-gray-50 relative group border-b border-gray-100">
                <img 
                  src={item.jpgUrl} 
                  alt={item.name}
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center border-b border-gray-100">
                <ImageIcon className="w-12 h-12 text-gray-300" />
              </div>
            )}
            
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-gray-900 mb-4 truncate text-lg">{item.name}</h3>
              
              <div className="mt-auto space-y-3">
                
                
                {item.mp3Urls && item.mp3Urls.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-50">
                    {item.mp3Urls.sort((a,b) => a.name.localeCompare(b.name)).map((mp3, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded-lg">
                        <PlayCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                        <audio controls className="h-8 w-full" controlsList="nodownload">
                          <source src={mp3.url} type="audio/mpeg" />
                        </audio>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
