sed -i '/const \[autoRepeat, setAutoRepeat\] = useState(false);/a\
  const [history, setHistory] = useState<VocabTestResultRecord[]>([]);\
  const [showHistoryModal, setShowHistoryModal] = useState(false);\
  const fetchHistory = async () => {\
    const list = await loadVocabTestResultsHistory();\
    setHistory(list);\
  };\
  useEffect(() => {\
    fetchHistory();\
  }, []);' src/components/VocabExamArea.tsx
