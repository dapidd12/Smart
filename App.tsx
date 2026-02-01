
import React, { useState, useEffect, useMemo } from 'react';
import { AppData, Semester, Subject, StatusColor, HistoryItem } from './types';
import { 
  calculateSemesterAverage, 
  calculateOverallAverage, 
  saveToStorage, 
  loadFromStorage 
} from './utils';

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_DATA: AppData = {
  userName: '',
  semesters: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, subjects: [] })),
  targetAvg: 85,
  totalSemestersTarget: 6,
  history: []
};

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [activeSemesterId, setActiveSemesterId] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Load Initial Data
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      setData(saved);
      if (!saved.userName) setShowWelcome(true);
    } else {
      setShowWelcome(true);
    }
    setIsLoaded(true);
  }, []);

  // Save Data
  useEffect(() => {
    if (isLoaded) saveToStorage(data);
  }, [data, isLoaded]);

  // Sync Semester Count
  useEffect(() => {
    if (!isLoaded) return;
    const target = Math.max(0, data.totalSemestersTarget);
    
    setData(prev => {
      const currentSems = [...prev.semesters];
      if (currentSems.length < target) {
        const toAdd = target - currentSems.length;
        const newSems = Array.from({ length: toAdd }, (_, i) => ({ 
          id: currentSems.length + i + 1, 
          subjects: currentSems[0]?.subjects.map(s => ({ ...s, score: 0 })) || [] 
        }));
        return { ...prev, semesters: [...currentSems, ...newSems] };
      } else if (currentSems.length > target) {
        return { ...prev, semesters: currentSems.slice(0, target) };
      }
      return prev;
    });
    
    if (activeSemesterId > target && target > 0) {
      setActiveSemesterId(1);
    } else if (target === 0) {
      setActiveSemesterId(0);
    }
  }, [data.totalSemestersTarget, isLoaded]);

  const activeSemester = useMemo(() => 
    data.semesters.find(s => s.id === activeSemesterId) || null,
    [data.semesters, activeSemesterId]
  );

  const getSemesterStatus = (semester: Semester) => {
    if (!semester || semester.subjects.length === 0) return 'empty';
    const scoredCount = semester.subjects.filter(s => s.score > 0).length;
    if (scoredCount === 0) return 'empty';
    if (scoredCount < semester.subjects.length) return 'partial';
    return 'complete';
  };

  const completeSemesters = useMemo(() => 
    data.semesters.filter(s => getSemesterStatus(s) === 'complete'), 
  [data.semesters]);

  const overallAvg = useMemo(() => calculateOverallAverage(completeSemesters), [completeSemesters]);
  const totalScore = useMemo(() => {
    return completeSemesters.reduce((acc, sem) => 
      acc + sem.subjects.reduce((sAcc, sub) => sAcc + sub.score, 0), 0
    );
  }, [completeSemesters]);

  const validation = useMemo(() => {
    const hasPartial = data.semesters.some(s => getSemesterStatus(s) === 'partial');
    const hasComplete = completeSemesters.length > 0;
    const isValidTarget = data.targetAvg > 0 && data.targetAvg <= 100;
    const isValidSemCount = data.totalSemestersTarget > 0;

    return { 
      hasPartial, 
      hasComplete, 
      isValidTarget, 
      isValidSemCount, 
      canCalculate: !hasPartial && hasComplete && isValidTarget && isValidSemCount 
    };
  }, [data, completeSemesters]);

  const subjectAverages = useMemo(() => {
    const masterSubjects = data.semesters[0]?.subjects || [];
    return masterSubjects.map(masterSub => {
      let sum = 0;
      let count = 0;
      completeSemesters.forEach(sem => {
        const sub = sem.subjects.find(s => s.id === masterSub.id);
        if (sub && sub.score > 0) {
          sum += sub.score;
          count++;
        }
      });
      return {
        id: masterSub.id,
        name: masterSub.name || 'Mapel',
        avg: count > 0 ? sum / count : 0
      };
    });
  }, [data.semesters, completeSemesters]);

  const neededAvg = useMemo(() => {
    const remaining = data.totalSemestersTarget - completeSemesters.length;
    if (remaining <= 0) return 0;
    const targetTotalSum = data.targetAvg * data.totalSemestersTarget;
    const currentSumOfAverages = completeSemesters.reduce((acc, sem) => acc + calculateSemesterAverage(sem), 0);
    const needed = (targetTotalSum - currentSumOfAverages) / remaining;
    return Math.max(0, needed);
  }, [data.targetAvg, data.totalSemestersTarget, completeSemesters]);

  const getStatus = (val: number) => {
    if (val >= data.targetAvg) return StatusColor.SAFE;
    if (val >= data.targetAvg - 5) return StatusColor.WARNING;
    return StatusColor.DANGER;
  };

  const handleAddSubject = () => {
    const newId = generateId();
    const newSemesters = data.semesters.map(s => ({
      ...s,
      subjects: [...s.subjects, { id: newId, name: '', score: 0 }]
    }));
    setData({ ...data, semesters: newSemesters });
    setShowResults(false);
  };

  const handleUpdateSubject = (subId: string, field: keyof Subject, value: string | number) => {
    const newSemesters = data.semesters.map(s => {
      if (field === 'name') {
        return {
          ...s,
          subjects: s.subjects.map(sub => sub.id === subId ? { ...sub, name: value as string } : sub)
        };
      }
      if (s.id === activeSemesterId) {
        return {
          ...s,
          subjects: s.subjects.map(sub => sub.id === subId ? { ...sub, [field]: value } : sub)
        };
      }
      return s;
    });
    setData({ ...data, semesters: newSemesters });
    setShowResults(false);
  };

  const handleDeleteSubject = (subId: string) => {
    const newSemesters = data.semesters.map(s => ({
      ...s,
      subjects: s.subjects.filter(sub => sub.id !== subId)
    }));
    setData({ ...data, semesters: newSemesters });
    setShowResults(false);
  };

  const addToHistory = () => {
    const newItem: HistoryItem = {
      id: generateId(),
      timestamp: Date.now(),
      userName: data.userName,
      overallAvg,
      totalScore,
      targetAvg: data.targetAvg,
      completedSemesters: completeSemesters.map(s => s.id)
    };
    setData(prev => ({
      ...prev,
      history: [newItem, ...(prev.history || [])].slice(0, 10) // Keep last 10
    }));
  };

  const deleteHistoryItem = (id: string) => {
    setData(prev => ({
      ...prev,
      history: prev.history.filter(item => item.id !== id)
    }));
  };

  const triggerAnalysis = () => {
    if (!validation.canCalculate) return;
    setIsCalculating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setIsCalculating(false);
      setShowSummaryPopup(true);
      addToHistory();
    }, 2000);
  };

  return (
    <div className="min-h-screen pb-10 transition-all duration-500 bg-[#060b18] text-slate-200 selection:bg-cyan-500/30 overflow-x-hidden">
      
      {/* Welcome Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-[fadeIn_0.5s_ease-out]">
          <div className="glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-12 max-w-lg w-full relative shadow-[0_0_80px_rgba(34,211,238,0.2)] border-cyan-500/30 border-2 overflow-hidden animate-[popIn_0.6s_ease-out]">
            <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-[scan_4s_linear_infinite]"></div>
            <div className="text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-cyan-500 rounded-2xl mx-auto mb-6 md:mb-8 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.5)]">
                <span className="text-slate-950 font-black text-2xl md:text-3xl">R</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-4 uppercase">Identitas Siswa</h2>
              <p className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mb-8 leading-relaxed italic">
                Inisialisasi sistem kalkulasi rapor masa depan. <br/>Masukkan nama untuk memulai profil akademik Anda.
              </p>
              
              <div className="relative mb-8 md:mb-12">
                <input 
                  type="text" 
                  value={data.userName}
                  onChange={(e) => setData(prev => ({ ...prev, userName: e.target.value }))}
                  className="w-full bg-white/5 border-2 border-white/10 rounded-2xl md:rounded-3xl py-4 md:py-6 px-6 md:px-10 text-center text-lg md:text-xl font-bold tech-font text-white outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-800"
                  placeholder="SIAPA NAMA ANDA?"
                  onKeyDown={(e) => e.key === 'Enter' && data.userName && setShowWelcome(false)}
                />
              </div>

              <button 
                onClick={() => data.userName && setShowWelcome(false)}
                disabled={!data.userName}
                className={`w-full py-4 md:py-6 rounded-2xl md:rounded-3xl font-black text-xs uppercase tracking-[0.5em] transition-all ${
                  data.userName 
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.4)] hover:scale-105 border-b-8 border-cyan-700 active:scale-95' 
                    : 'bg-slate-900 text-slate-700 opacity-50 cursor-not-allowed border border-white/5'
                }`}
              >
                MASUK KE SISTEM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal (Petunjuk Penggunaan) */}
      {showGuide && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl animate-[fadeIn_0.3s_ease-out]">
          <div className="glass-card rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 max-w-2xl w-full relative shadow-2xl border-white/10 border overflow-y-auto max-h-[90vh]">
            <button 
              onClick={() => setShowGuide(false)}
              className="absolute top-6 right-6 text-slate-500 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-cyan-400 mb-6 uppercase tracking-widest">Petunjuk Penggunaan</h2>
            <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">1</div>
                <p>Masukkan <b>Nama Anda</b> di profil (klik ID di header jika ingin mengubah).</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">2</div>
                <p>Atur <b>Target Rata-rata</b> (0-100) dan <b>Total Semester Program</b> (misal 6 untuk SMA/SMK).</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">3</div>
                <p>Di <b>Semester 1</b>, tambahkan semua mata pelajaran menggunakan tombol (+). Nama mapel ini akan otomatis sinkron ke semester lain.</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">4</div>
                <p>Klik tab semester lain (Sem 2, dst) untuk menginput nilai pada mapel yang sudah ada.</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">5</div>
                <p>Setelah minimal 1 semester terisi lengkap, klik tombol <b>"Analisis Hasil"</b>.</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold flex-shrink-0">6</div>
                <p>Sistem akan menghitung estimasi nilai yang kamu butuhkan di semester tersisa untuk mencapai target.</p>
              </div>
            </div>
            <button 
              onClick={() => setShowGuide(false)}
              className="mt-10 w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-cyan-500 hover:text-slate-950 transition-all"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/5 glass-card sticky top-0 z-40 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.3)] border border-white/20">
              <span className="text-slate-950 font-black text-lg">R</span>
            </div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter text-white">
              FUTURE <span className="text-cyan-400">RAPOR</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-[9px] md:text-[10px] tech-font text-slate-500 font-bold uppercase tracking-widest">
            <button onClick={() => setShowGuide(true)} className="hover:text-cyan-400 transition-colors hidden sm:block">GUIDE_BOOK</button>
            <div className="flex items-center gap-2 border-l border-white/10 pl-4 md:pl-6 cursor-pointer hover:text-cyan-400 transition-colors" onClick={() => setShowWelcome(true)}>
               <span className="text-white truncate max-w-[80px] md:max-w-[150px]">ID: {data.userName ? data.userName.toUpperCase() : 'ANON'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-6 md:mt-8">
        {/* Guide Trigger Mobile */}
        <div className="sm:hidden mb-4">
          <button 
            onClick={() => setShowGuide(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-cyan-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Buka Petunjuk Penggunaan
          </button>
        </div>

        {/* Main Inputs */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 md:mb-8">
          <div className={`glass-card rounded-2xl p-4 md:p-6 border transition-all ${!validation.isValidTarget ? 'border-rose-500/50 bg-rose-500/5' : 'border-white/5'}`}>
            <label className="text-[8px] md:text-[9px] text-slate-500 uppercase tracking-widest mb-2 font-black block">Target Rata-rata Akhir</label>
            <div className="flex items-center gap-3">
              <input 
                type="number" 
                value={data.targetAvg === 0 ? '' : data.targetAvg}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setData(prev => ({ ...prev, targetAvg: val }));
                  setShowResults(false);
                }}
                className={`bg-transparent text-2xl md:text-3xl font-black tech-font outline-none w-full ${!validation.isValidTarget ? 'text-rose-500' : 'text-cyan-400'}`}
                placeholder="0"
              />
              {!validation.isValidTarget && <span className="text-[8px] font-black bg-rose-500/20 text-rose-400 px-2 py-1 rounded">INVALID</span>}
            </div>
          </div>
          <div className={`glass-card rounded-2xl p-4 md:p-6 border transition-all ${!validation.isValidSemCount ? 'border-rose-500/50 bg-rose-500/5' : 'border-white/5 border-l-4 border-l-cyan-500'}`}>
            <label className="text-[8px] md:text-[9px] text-slate-500 uppercase tracking-widest mb-2 font-black block">Total Semester Program</label>
            <div className="flex items-center gap-3">
              <input 
                type="number" 
                value={data.totalSemestersTarget === 0 ? '' : data.totalSemestersTarget}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setData(prev => ({ ...prev, totalSemestersTarget: val }));
                  setShowResults(false);
                }}
                className={`bg-transparent text-2xl md:text-3xl font-black tech-font outline-none w-full ${!validation.isValidSemCount ? 'text-rose-500' : 'text-white'}`}
                placeholder="0"
              />
              {!validation.isValidSemCount && <span className="text-[8px] font-black bg-rose-500/20 text-rose-400 px-2 py-1 rounded">RANGE!</span>}
            </div>
          </div>
        </section>

        {/* Semester Tabs */}
        <div className="mb-6 md:mb-10 space-y-4 md:space-y-6">
          <div className="flex overflow-x-auto gap-2 md:gap-3 pb-2 no-scrollbar scroll-smooth">
            {data.semesters.map(sem => {
              const status = getSemesterStatus(sem);
              return (
                <button
                  key={sem.id}
                  onClick={() => setActiveSemesterId(sem.id)}
                  className={`flex-shrink-0 px-6 md:px-10 py-3 md:py-4 rounded-xl md:rounded-2xl transition-all relative border-2 ${
                    activeSemesterId === sem.id 
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-[0_0_25px_rgba(34,211,238,0.4)]' 
                      : 'glass-card border-white/5 text-slate-500 hover:text-white font-bold'
                  }`}
                >
                  <span className="text-[10px] md:text-xs uppercase tracking-tighter">Sem {sem.id}</span>
                  {status === 'partial' && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 border-2 border-slate-950 rounded-full animate-pulse shadow-lg flex items-center justify-center text-[8px] text-white font-bold">!</span>}
                  {status === 'complete' && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 border-2 border-slate-950 rounded-full shadow-lg flex items-center justify-center text-[8px] text-slate-950">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Subject Entry Card */}
          <section className="glass-card rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 border border-white/5 relative overflow-hidden group min-h-[300px]">
            <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 blur-[120px] rounded-full group-hover:bg-cyan-500/10 transition-all duration-700"></div>
            
            {!activeSemester ? (
              <div className="flex flex-col items-center justify-center h-64">
                <p className="text-slate-600 font-black uppercase tracking-widest italic text-center text-xs">Atur semester di input atas</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 md:mb-12 relative z-10 gap-4">
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase">Entry <span className="text-cyan-400">Semester {activeSemesterId}</span></h3>
                    <p className="text-[9px] text-slate-600 uppercase tracking-[0.3em] font-bold mt-1">Point entry module</p>
                  </div>
                  {activeSemesterId === 1 && (
                    <button 
                      onClick={handleAddSubject} 
                      className="w-full sm:w-auto bg-cyan-500 text-slate-950 p-3 rounded-xl hover:bg-cyan-400 transition-all shadow-xl active:scale-95 border-b-4 border-cyan-700 font-black flex items-center justify-center gap-2 group/btn"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      <span className="text-[10px] uppercase tracking-widest font-black">Tambah Mapel</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3 md:space-y-4 relative z-10">
                  {activeSemester.subjects.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-[1.5rem] md:rounded-[2rem]">
                      <p className="text-slate-700 text-[10px] md:text-xs font-black uppercase tracking-[0.2em]">
                        {activeSemesterId === 1 ? 'Klik (+) di atas untuk memulai mapel' : 'Mapel diatur di Semester 1'}
                      </p>
                    </div>
                  ) : (
                    activeSemester.subjects.map((sub, idx) => (
                      <div key={sub.id} className="flex items-center gap-3 md:gap-5 bg-[#0d1526]/60 p-3 md:p-5 rounded-xl md:rounded-[1.5rem] border border-white/5 hover:border-cyan-500/40 transition-all group/item shadow-inner">
                        <div className="text-[10px] tech-font text-slate-700 font-black w-4 md:w-6">{(idx + 1).toString().padStart(2, '0')}</div>
                        <input 
                          type="text" 
                          value={sub.name}
                          readOnly={activeSemesterId !== 1}
                          onChange={(e) => handleUpdateSubject(sub.id, 'name', e.target.value)}
                          className={`flex-grow bg-transparent text-white text-xs md:text-sm outline-none font-bold uppercase tracking-tight placeholder:text-slate-800 transition-all ${activeSemesterId !== 1 ? 'opacity-50' : 'focus:text-cyan-400'}`}
                          placeholder="MATA PELAJARAN..."
                        />
                        <div className="flex items-center gap-2 md:gap-4">
                          <input 
                            type="number" 
                            value={sub.score === 0 ? '' : sub.score}
                            min="0"
                            max="100"
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              handleUpdateSubject(sub.id, 'score', val);
                            }}
                            className="w-12 md:w-16 bg-slate-950 border-2 border-white/10 rounded-lg md:rounded-xl py-2 text-center text-cyan-400 font-black tech-font outline-none focus:border-cyan-500 transition-all text-xs md:text-base"
                          />
                          {activeSemesterId === 1 && (
                            <button onClick={() => handleDeleteSubject(sub.id)} className="text-slate-700 hover:text-rose-500 p-2 rounded-lg opacity-30 hover:opacity-100 transition-all">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Big Action Button */}
        <div className="mt-12 md:mt-16 text-center px-4">
          {!validation.canCalculate && (
            <div className="mb-6 flex flex-col gap-2 items-center text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] bg-slate-900/50 py-3 rounded-xl border border-white/5">
              {validation.hasPartial && <span className="text-rose-500 flex items-center gap-2 animate-pulse"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> ERR: INCOMPLETE_DATA</span>}
              {!validation.hasComplete && !validation.hasPartial && <span className="text-slate-600 flex items-center gap-2">STATUS: STANDBY</span>}
              {!validation.isValidTarget && <span className="text-rose-500 flex items-center gap-2">ERR: TARGET_EMPTY_OR_ZERO</span>}
              {!validation.isValidSemCount && <span className="text-rose-500 flex items-center gap-2">ERR: SEMESTER_COUNT_INVALID</span>}
            </div>
          )}
          
          <button 
            disabled={!validation.canCalculate || isCalculating}
            onClick={triggerAnalysis}
            className={`w-full md:w-auto group relative px-10 md:px-20 py-5 md:py-7 rounded-2xl md:rounded-[2rem] font-black tech-font text-base md:text-xl tracking-[0.3em] uppercase transition-all overflow-hidden ${
              validation.canCalculate && !isCalculating
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.3)] hover:scale-105 active:scale-95 cursor-pointer border-b-4 md:border-b-8 border-cyan-700' 
                : 'bg-slate-900 text-slate-700 cursor-not-allowed border border-white/5 opacity-40'
            }`}
          >
            {isCalculating ? (
              <span className="flex items-center justify-center gap-4">
                <svg className="animate-spin h-5 w-5 text-slate-950" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                CALCULATING...
              </span>
            ) : (
              'Analisis Hasil'
            )}
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
          </button>
        </div>

        {/* History Log Section */}
        {data.history && data.history.length > 0 && (
          <section className="mt-20">
            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-8 flex items-center gap-4">
              <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
              Riwayat Analisis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.history.map(item => (
                <div key={item.id} className="glass-card p-6 rounded-2xl border border-white/5 flex justify-between items-center group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/20 group-hover:bg-cyan-500 transition-all"></div>
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">
                      {new Date(item.timestamp).toLocaleString('id-ID')}
                    </div>
                    <div className="text-sm font-black text-white uppercase mb-2">Target: {item.targetAvg}</div>
                    <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                      <span>Sem: {item.completedSemesters.join(', ')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-cyan-400 tech-font">{item.overallAvg.toFixed(1)}</div>
                    <button 
                      onClick={() => deleteHistoryItem(item.id)}
                      className="text-slate-700 hover:text-rose-500 mt-2 p-1 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Popup Result Card */}
        {showSummaryPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-[fadeIn_0.3s_ease-out]">
            <div className="glass-card rounded-[3rem] md:rounded-[4rem] p-8 md:p-14 max-w-md w-full relative shadow-[0_0_120px_rgba(34,211,238,0.3)] border-cyan-500/40 border-2 overflow-hidden animate-[popIn_0.4s_ease-out]">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-[scan_2s_linear_infinite]"></div>
              
              <button 
                onClick={() => setShowSummaryPopup(false)}
                className="absolute top-8 right-8 text-slate-600 hover:text-white transition-all bg-white/5 p-3 rounded-2xl border border-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="text-center relative z-10">
                <div className="inline-block px-5 py-1.5 rounded-full border-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[8px] md:text-[9px] font-black tracking-[0.3em] mb-8 uppercase">
                  MODULE_SUMMARY_FINAL
                </div>
                
                <h2 className="text-white text-2xl md:text-3xl font-black tracking-tighter mb-1 uppercase truncate">{data.userName}</h2>
                <p className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.2em] mb-8 italic">Academic snapshot</p>

                <div className="bg-slate-950/50 p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-white/5 mb-8 md:mb-12 shadow-2xl relative">
                  <div className="text-slate-600 text-[8px] uppercase tracking-widest mb-1 font-black">Overall Average</div>
                  <div className="text-7xl md:text-8xl font-black text-white tech-font tracking-tighter drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                    {overallAvg.toFixed(1)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-10">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[7px] text-slate-600 uppercase font-black block mb-1">Total Score</span>
                    <span className="text-xl md:text-2xl font-black text-cyan-400 tech-font">{totalScore}</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[7px] text-slate-600 uppercase font-black block mb-1">Data Origin</span>
                    <span className="text-[9px] font-black text-slate-200">SEM {completeSemesters.map(s => s.id).join(',')}</span>
                  </div>
                </div>
                
                <div className={`text-[10px] font-black mb-10 px-6 py-4 rounded-[2rem] border-2 ${getStatus(overallAvg)} uppercase tracking-[0.2em]`}>
                   {overallAvg >= data.targetAvg ? 'System Status: OPTIMIZED' : 'System Status: IMPROVE'}
                </div>

                <button 
                  onClick={() => { setShowSummaryPopup(false); setShowResults(true); }}
                  className="w-full py-5 md:py-6 bg-cyan-500 text-slate-950 rounded-[1.5rem] md:rounded-[2.5rem] font-black text-xs uppercase tracking-[0.4em] hover:bg-cyan-400 transition-all shadow-xl active:scale-95 border-b-4 md:border-b-8 border-cyan-700"
                >
                  Lihat Detail Laporan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Results (Below) */}
        {showResults && (
          <div className="mt-24 space-y-20 animate-[fadeIn_0.8s_ease-out] mb-32 px-2">
            <div className="text-center relative">
               <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10"></div>
               <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase px-6 bg-[#060b18] inline-block">Deep Analysis <span className="text-cyan-400">Metrics</span></h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {data.semesters.map(sem => {
                const status = getSemesterStatus(sem);
                const avg = calculateSemesterAverage(sem);
                return (
                  <div key={sem.id} className="glass-card rounded-[2rem] p-6 md:p-8 border border-white/5 hover:border-cyan-500/40 transition-all group relative overflow-hidden bg-gradient-to-br from-transparent to-slate-950/60">
                    <div className="flex justify-between items-start mb-6 md:mb-8">
                      <span className="text-[8px] md:text-[9px] text-slate-700 font-black uppercase tracking-[0.2em] bg-slate-950 px-3 py-1 rounded-lg">SEM_{sem.id.toString().padStart(2, '0')}</span>
                      {status === 'complete' && (
                        <div className="text-right">
                          <span className="text-cyan-400 font-black tech-font text-xl md:text-2xl block leading-none">{avg.toFixed(1)}</span>
                          <span className="text-[7px] text-slate-700 font-black uppercase tracking-[0.1em]">AVRG</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 opacity-40 group-hover:opacity-100 transition-all">
                      {status === 'empty' ? (
                        <div className="h-0.5 bg-slate-900 rounded-full w-full"></div>
                      ) : (
                        sem.subjects.map(sub => (
                          <div key={sub.id} className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                            <span className="truncate max-w-[120px]">{sub.name || 'UNNAMED'}</span>
                            <span className="text-white font-black">{sub.score}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
              <div className="glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-10 md:p-12 text-center relative overflow-hidden lg:col-span-1 border-t-8 border-cyan-500 shadow-2xl bg-[#0b1222]">
                <h4 className="text-slate-600 text-[9px] uppercase tracking-[0.4em] mb-4 md:mb-6 font-black">Performance Base</h4>
                <div className="text-7xl md:text-8xl font-black text-white tech-font drop-shadow-2xl mb-6 md:mb-8">{overallAvg.toFixed(1)}</div>
                <div className="flex flex-col gap-2 pt-6 md:pt-10 border-t border-white/5">
                  <span className="text-[8px] text-slate-700 uppercase font-black tracking-[0.4em]">Total Cumulative Score</span>
                  <span className="text-3xl md:text-4xl font-black text-cyan-400 tech-font">{totalScore}</span>
                </div>
              </div>

              <div className="glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-10 md:p-12 flex flex-col justify-center lg:col-span-2 border border-white/10 shadow-2xl bg-gradient-to-br from-[#0a0f1d] to-slate-950 relative overflow-hidden">
                <h4 className="text-slate-600 text-[9px] uppercase tracking-[0.4em] mb-8 md:mb-10 font-black">Strategic Roadmap</h4>
                <div className="flex flex-col sm:flex-row sm:items-center gap-8 md:gap-12 relative z-10">
                  <div className="text-center sm:text-left bg-cyan-500/5 p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border-2 border-cyan-500/10">
                    <div className="text-6xl md:text-7xl font-black text-cyan-400 tech-font tracking-tighter">{neededAvg.toFixed(1)}</div>
                    <p className="text-[8px] text-cyan-500/50 mt-3 uppercase font-black tracking-[0.3em]">Min Semester Goal</p>
                  </div>
                  <div className="flex-grow text-center sm:text-left">
                    <p className="text-sm md:text-base text-slate-300 italic leading-relaxed font-medium border-l-4 border-cyan-500/40 pl-6 md:pl-10">
                      "Untuk mencapai target rata-rata <b className="text-white">{data.targetAvg}</b> di akhir periode (Semester {data.totalSemestersTarget}), anda memerlukan nilai rata-rata minimal <b className="text-cyan-400">{neededAvg.toFixed(1)}</b> pada semester tersisa."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 border-t border-white/5 py-12 md:py-20 bg-slate-950/80 backdrop-blur-3xl relative overflow-hidden text-center md:text-left">
        <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-16">
          <div className="group">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
              <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-black text-[12px] text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]">D</div>
              <p className="text-white font-black tracking-[0.4em] tech-font text-sm uppercase group-hover:text-cyan-400 transition-colors">By Dafid</p>
            </div>
            <p className="text-slate-800 text-[8px] uppercase tracking-[0.6em] font-black">Academic Intel Hub v6.0.0</p>
          </div>
          
          <a 
            href="https://dapidhub.my.id" 
            target="_blank" 
            rel="noopener noreferrer"
            className="group px-10 md:px-14 py-4 md:py-6 bg-slate-900 border border-white/10 rounded-2xl md:rounded-[2rem] font-black text-white transition-all hover:border-cyan-400 hover:text-cyan-400 text-[10px] tracking-[0.4em] shadow-2xl relative overflow-hidden active:scale-95"
          >
            <span className="relative flex items-center gap-3">CONNECT <span className="text-white group-hover:text-cyan-400">Dapidhub</span></span>
          </a>
        </div>
        <div className="text-center mt-12 md:mt-20 text-[7px] uppercase tracking-[1.5em] text-slate-900 font-black opacity-30 px-4">
          HISTORY_ENABLED • ACCURATE • VISIONARY
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.9) translateY(40px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
};

export default App;
