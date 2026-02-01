
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppData, Semester, Subject, StatusColor } from './types';
import { 
  calculateSemesterAverage, 
  calculateOverallAverage, 
  saveToStorage, 
  loadFromStorage 
} from './utils';

const generateId = () => Math.random().toString(36).substring(2, 11);

const INITIAL_DATA: AppData = {
  userName: '',
  semesters: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, subjects: [] })),
  targetAvg: 85,
  totalSemestersTarget: 6
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

  // Persistence logic
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

  useEffect(() => {
    if (isLoaded) saveToStorage(data);
  }, [data, isLoaded]);

  // Handle dynamic semester adjustment
  useEffect(() => {
    if (!isLoaded) return;
    const targetCount = Math.max(0, data.totalSemestersTarget);
    
    setData(prev => {
      const currentSems = [...prev.semesters];
      if (currentSems.length < targetCount) {
        const toAdd = targetCount - currentSems.length;
        const newSems = Array.from({ length: toAdd }, (_, i) => ({ 
          id: currentSems.length + i + 1, 
          subjects: currentSems[0]?.subjects.map(s => ({ ...s, score: 0 })) || [] 
        }));
        return { ...prev, semesters: [...currentSems, ...newSems] };
      } else if (currentSems.length > targetCount) {
        return { ...prev, semesters: currentSems.slice(0, targetCount) };
      }
      return prev;
    });
    
    if (activeSemesterId > targetCount && targetCount > 0) {
      setActiveSemesterId(1);
    }
  }, [data.totalSemestersTarget, isLoaded]);

  const activeSemester = useMemo(() => 
    data.semesters.find(s => s.id === activeSemesterId) || null,
    [data.semesters, activeSemesterId]
  );

  const getSemesterStatus = useCallback((semester: Semester) => {
    if (!semester || semester.subjects.length === 0) return 'empty';
    const scoredCount = semester.subjects.filter(s => s.score > 0).length;
    if (scoredCount === 0) return 'empty';
    if (scoredCount < semester.subjects.length) return 'partial';
    return 'complete';
  }, []);

  const completeSemesters = useMemo(() => 
    data.semesters.filter(s => getSemesterStatus(s) === 'complete'), 
  [data.semesters, getSemesterStatus]);

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
  }, [data, completeSemesters, getSemesterStatus]);

  const neededAvg = useMemo(() => {
    const remaining = data.totalSemestersTarget - completeSemesters.length;
    if (remaining <= 0) return 0;
    const targetTotalSum = data.targetAvg * data.totalSemestersTarget;
    const currentSumOfAverages = completeSemesters.reduce((acc, sem) => acc + calculateSemesterAverage(sem), 0);
    const needed = (targetTotalSum - currentSumOfAverages) / remaining;
    return Math.max(0, needed);
  }, [data.targetAvg, data.totalSemestersTarget, completeSemesters]);

  const getStatusClass = (val: number) => {
    if (val >= data.targetAvg) return StatusColor.SAFE;
    if (val >= data.targetAvg - 5) return StatusColor.WARNING;
    return StatusColor.DANGER;
  };

  const handleAddSubject = () => {
    const newId = generateId();
    setData(prev => ({
      ...prev,
      semesters: prev.semesters.map(s => ({
        ...s,
        subjects: [...s.subjects, { id: newId, name: '', score: 0 }]
      }))
    }));
    setShowResults(false);
  };

  const handleUpdateSubject = (subId: string, field: keyof Subject, value: string | number) => {
    setData(prev => ({
      ...prev,
      semesters: prev.semesters.map(s => {
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
      })
    }));
    setShowResults(false);
  };

  const handleDeleteSubject = (subId: string) => {
    setData(prev => ({
      ...prev,
      semesters: prev.semesters.map(s => ({
        ...s,
        subjects: s.subjects.filter(sub => sub.id !== subId)
      }))
    }));
    setShowResults(false);
  };

  const triggerAnalysis = () => {
    if (!validation.canCalculate) return;
    setIsCalculating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setIsCalculating(false);
      setShowSummaryPopup(true);
    }, 1800);
  };

  return (
    <div className="min-h-screen pb-12 transition-all duration-700 bg-[#060b18] text-slate-200 selection:bg-cyan-500/30 overflow-x-hidden">
      
      {/* Welcome Experience */}
      {showWelcome && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-3xl animate-[fadeIn_0.5s_ease-out]">
          <div className="glass-card rounded-[2.5rem] md:rounded-[4rem] p-8 md:p-14 max-w-lg w-full relative shadow-[0_0_80px_rgba(34,211,238,0.2)] border-cyan-500/30 border-2 overflow-hidden animate-[popIn_0.6s_ease-out]">
            <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-[scan_4s_linear_infinite]"></div>
            <div className="text-center">
              <div className="w-14 h-14 md:w-20 md:h-20 bg-cyan-500 rounded-3xl mx-auto mb-6 md:mb-10 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.6)] border border-white/20">
                <span className="text-slate-950 font-black text-2xl md:text-4xl">R</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4 uppercase leading-none">Smart Rapor</h2>
              <p className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-[0.2em] mb-10 leading-relaxed italic opacity-80">
                Next-Gen Academic Analytics Engine. <br/>Tentukan profil Anda untuk memulai.
              </p>
              
              <div className="relative mb-8 md:mb-12">
                <input 
                  type="text" 
                  value={data.userName}
                  onChange={(e) => setData(prev => ({ ...prev, userName: e.target.value }))}
                  className="w-full bg-slate-900/50 border-2 border-white/10 rounded-2xl md:rounded-[2rem] py-4 md:py-7 px-8 md:px-12 text-center text-lg md:text-2xl font-bold tech-font text-white outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-800"
                  placeholder="SIAPA NAMA ANDA?"
                  onKeyDown={(e) => e.key === 'Enter' && data.userName && setShowWelcome(false)}
                />
              </div>

              <button 
                onClick={() => data.userName && setShowWelcome(false)}
                disabled={!data.userName}
                className={`w-full py-4 md:py-7 rounded-2xl md:rounded-[2rem] font-black text-xs md:text-sm uppercase tracking-[0.5em] transition-all relative overflow-hidden ${
                  data.userName 
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_20px_50px_rgba(34,211,238,0.3)] hover:scale-[1.02] border-b-8 border-cyan-700 active:scale-95' 
                    : 'bg-slate-900 text-slate-700 opacity-50 cursor-not-allowed border border-white/5'
                }`}
              >
                Inisialisasi Sistem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Guide */}
      {showGuide && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl animate-[fadeIn_0.3s_ease-out]">
          <div className="glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-14 max-w-2xl w-full relative shadow-2xl border-white/10 border-2 overflow-y-auto max-h-[85vh]">
            <button 
              onClick={() => setShowGuide(false)}
              className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-3xl font-black text-cyan-400 mb-8 uppercase tracking-widest border-l-4 border-cyan-500 pl-6">Operasi Sistem</h2>
            <div className="space-y-6 text-sm md:text-base text-slate-300 leading-relaxed font-medium">
              <div className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-black flex-shrink-0 border border-cyan-500/20 shadow-inner">01</div>
                <p>Konfigurasi <b>Target Rata-rata</b> akhir dan <b>Total Semester</b> yang akan ditempuh (misal 6 untuk jenjang SMA).</p>
              </div>
              <div className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-black flex-shrink-0 border border-cyan-500/20 shadow-inner">02</div>
                <p>Pada <b>Semester 1</b>, definisikan seluruh mata pelajaran. Daftar ini akan disinkronkan otomatis ke semester lain.</p>
              </div>
              <div className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-black flex-shrink-0 border border-cyan-500/20 shadow-inner">03</div>
                <p>Input nilai pada setiap semester yang telah selesai. Pastikan tidak ada kolom yang bernilai 0 jika semester tersebut sudah tuntas.</p>
              </div>
              <div className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-black flex-shrink-0 border border-cyan-500/20 shadow-inner">04</div>
                <p>Gunakan tombol <b>"Analisis Hasil"</b> untuk mendapatkan proyeksi nilai minimal pada semester yang tersisa.</p>
              </div>
            </div>
            <button 
              onClick={() => setShowGuide(false)}
              className="mt-12 w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-[0.3em] text-xs hover:bg-cyan-500 hover:text-slate-950 transition-all shadow-xl active:scale-95"
            >
              System Ready
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="border-b border-white/5 glass-card sticky top-0 z-40 overflow-hidden backdrop-blur-3xl">
        <div className="absolute h-px bg-cyan-500/20 w-full bottom-0 left-0"></div>
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.4)] border border-white/20">
              <span className="text-slate-950 font-black text-xl">R</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white">
              FUTURE <span className="text-cyan-400">RAPOR</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowGuide(true)} 
              className="hidden md:flex items-center gap-2 text-[10px] tech-font text-slate-500 font-bold uppercase tracking-widest hover:text-cyan-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Manual_Book
            </button>
            <div 
              className="flex items-center gap-3 border-l border-white/10 pl-6 cursor-pointer group"
              onClick={() => setShowWelcome(true)}
            >
               <div className="text-right hidden sm:block">
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Active_User</p>
                  <p className="text-xs text-white font-black group-hover:text-cyan-400 transition-colors">{data.userName ? data.userName.toUpperCase() : 'ANON_CORE'}</p>
               </div>
               <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-cyan-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
               </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-10">
        
        {/* Mobile Guide Access */}
        <div className="md:hidden mb-6">
          <button 
            onClick={() => setShowGuide(true)}
            className="w-full py-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center justify-center gap-3 animate-pulse"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            Petunjuk Penggunaan
          </button>
        </div>

        {/* System Settings */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className={`glass-card rounded-3xl p-6 md:p-8 border transition-all relative overflow-hidden group ${!validation.isValidTarget ? 'border-rose-500/40 bg-rose-500/5' : 'border-white/5'}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl -mr-16 -mt-16 rounded-full group-hover:bg-cyan-500/10 transition-all"></div>
            <label className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-[0.3em] mb-4 font-black block">Target Rata-rata Akhir (0-100)</label>
            <div className="flex items-end gap-5">
              <input 
                type="number" 
                value={data.targetAvg || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setData(prev => ({ ...prev, targetAvg: Math.min(100, val) }));
                  setShowResults(false);
                }}
                className={`bg-transparent text-4xl md:text-5xl font-black tech-font outline-none w-full placeholder:text-slate-900 transition-colors ${!validation.isValidTarget ? 'text-rose-500' : 'text-cyan-400 focus:text-cyan-300'}`}
                placeholder="00"
              />
              <span className={`text-xl font-black tech-font mb-2 ${!validation.isValidTarget ? 'text-rose-500/50' : 'text-cyan-500/30'}`}>%</span>
            </div>
          </div>
          
          <div className={`glass-card rounded-3xl p-6 md:p-8 border-t border-r border-b transition-all relative overflow-hidden group border-white/5 border-l-8 border-l-cyan-500`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl -mr-16 -mt-16 rounded-full"></div>
            <label className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-[0.3em] mb-4 font-black block">Total Semester Program</label>
            <div className="flex items-end gap-5">
              <input 
                type="number" 
                value={data.totalSemestersTarget || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setData(prev => ({ ...prev, totalSemestersTarget: val }));
                  setShowResults(false);
                }}
                className={`bg-transparent text-4xl md:text-5xl font-black tech-font outline-none w-full placeholder:text-slate-900 transition-colors ${!validation.isValidSemCount ? 'text-rose-500' : 'text-white focus:text-cyan-400'}`}
                placeholder="00"
              />
              <span className="text-xl font-black tech-font mb-2 text-slate-700">SEM</span>
            </div>
          </div>
        </section>

        {/* Semester Modules */}
        <div className="mb-10 space-y-8">
          <div className="flex overflow-x-auto gap-3 pb-4 no-scrollbar scroll-smooth">
            {data.semesters.map(sem => {
              const status = getSemesterStatus(sem);
              const isActive = activeSemesterId === sem.id;
              return (
                <button
                  key={sem.id}
                  onClick={() => setActiveSemesterId(sem.id)}
                  className={`flex-shrink-0 min-w-[120px] md:min-w-[150px] px-6 py-5 rounded-2xl md:rounded-[1.5rem] transition-all relative border-2 ${
                    isActive 
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-[0_15px_30px_rgba(34,211,238,0.3)] scale-[1.05]' 
                      : 'glass-card border-white/5 text-slate-500 hover:text-white font-bold hover:bg-white/5'
                  }`}
                >
                  <p className={`text-[8px] md:text-[9px] uppercase tracking-widest mb-1 ${isActive ? 'text-slate-900/60' : 'text-slate-600'}`}>Semester</p>
                  <span className="text-xl md:text-2xl tech-font tracking-tighter">{sem.id.toString().padStart(2, '0')}</span>
                  {status === 'partial' && <span className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 border-4 border-[#060b18] rounded-full animate-pulse shadow-xl flex items-center justify-center text-[10px] text-white font-black">!</span>}
                  {status === 'complete' && <span className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 border-4 border-[#060b18] rounded-full shadow-xl flex items-center justify-center text-[12px] text-slate-950">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Data Processing Unit */}
          <section className="glass-card rounded-[2.5rem] md:rounded-[4rem] p-8 md:p-14 border border-white/5 relative overflow-hidden group min-h-[450px] shadow-2xl">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-cyan-500/5 blur-[150px] rounded-full group-hover:bg-cyan-500/10 transition-all duration-1000"></div>
            
            {activeSemester ? (
              <>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 relative z-10 gap-6">
                  <div>
                    <div className="inline-block px-4 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-[9px] font-black tracking-widest mb-3 uppercase">Module_Input_Active</div>
                    <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none">Semester <span className="text-cyan-400">{activeSemesterId}</span></h3>
                  </div>
                  {activeSemesterId === 1 && (
                    <button 
                      onClick={handleAddSubject} 
                      className="w-full md:w-auto bg-cyan-500 text-slate-950 px-8 py-5 rounded-2xl hover:bg-cyan-400 transition-all shadow-2xl active:scale-95 border-b-8 border-cyan-700 font-black flex items-center justify-center gap-4 group/btn"
                    >
                      <svg className="w-6 h-6 group-hover/btn:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      <span className="text-xs uppercase tracking-[0.2em]">Add_Subject</span>
                    </button>
                  )}
                </div>

                <div className="space-y-4 relative z-10">
                  {activeSemester.subjects.length === 0 ? (
                    <div className="py-24 text-center border-4 border-dashed border-white/5 rounded-[3rem] bg-white/5">
                      <div className="w-20 h-20 bg-slate-900/50 rounded-3xl mx-auto mb-6 flex items-center justify-center border border-white/10 opacity-30">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-slate-600 text-sm md:text-base font-black uppercase tracking-[0.3em] italic px-10 leading-relaxed">
                        {activeSemesterId === 1 
                          ? 'Inisialisasi daftar mata pelajaran Anda untuk memulai perhitungan otomatis.' 
                          : 'Struktur mata pelajaran disinkronkan dari Semester 01.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {activeSemester.subjects.map((sub, idx) => (
                        <div key={sub.id} className="flex items-center gap-4 md:gap-8 bg-[#0d1526]/80 p-5 md:p-7 rounded-3xl border border-white/5 hover:border-cyan-500/40 transition-all group/item shadow-inner relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/10 group-hover/item:bg-cyan-500/40 transition-all"></div>
                          <div className="text-xs md:text-sm tech-font text-slate-700 font-black w-10">{(idx + 1).toString().padStart(2, '0')}</div>
                          <input 
                            type="text" 
                            value={sub.name}
                            readOnly={activeSemesterId !== 1}
                            onChange={(e) => handleUpdateSubject(sub.id, 'name', e.target.value)}
                            className={`flex-grow bg-transparent text-white text-sm md:text-xl outline-none font-bold uppercase tracking-tight placeholder:text-slate-900 transition-all ${activeSemesterId !== 1 ? 'opacity-40 cursor-default' : 'focus:text-cyan-400'}`}
                            placeholder="MATA PELAJARAN..."
                          />
                          <div className="flex items-center gap-4 md:gap-8">
                            <div className="relative">
                              <input 
                                type="number" 
                                value={sub.score === 0 ? '' : sub.score}
                                min="0"
                                max="100"
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                  handleUpdateSubject(sub.id, 'score', val);
                                }}
                                className="w-16 md:w-24 bg-slate-950 border-2 border-white/10 rounded-2xl py-3 md:py-4 text-center text-cyan-400 font-black tech-font outline-none focus:border-cyan-500 focus:ring-8 focus:ring-cyan-500/10 transition-all text-sm md:text-2xl shadow-2xl"
                                placeholder="0"
                              />
                            </div>
                            {activeSemesterId === 1 && (
                              <button onClick={() => handleDeleteSubject(sub.id)} className="text-slate-700 hover:text-rose-500 p-2 rounded-2xl bg-white/5 hover:bg-rose-500/10 transition-all border border-white/5 hover:border-rose-500/30">
                                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
               <div className="h-[400px] flex items-center justify-center">
                  <p className="text-slate-700 uppercase font-black tracking-widest tech-font">System_Idle • Select_Semester</p>
               </div>
            )}
          </section>
        </div>

        {/* Calculation Control */}
        <div className="mt-16 text-center px-4 max-w-2xl mx-auto">
          {!validation.canCalculate && (
            <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {validation.hasPartial && <div className="bg-rose-500/10 border border-rose-500/20 py-3 rounded-2xl text-[9px] font-black uppercase text-rose-500 tracking-widest animate-pulse">Err: Partial_Data_Input</div>}
              {!validation.hasComplete && !validation.hasPartial && <div className="bg-slate-900/50 border border-white/5 py-3 rounded-2xl text-[9px] font-black uppercase text-slate-700 tracking-widest">Wait: System_Standby</div>}
              {!validation.isValidTarget && <div className="bg-rose-500/10 border border-rose-500/20 py-3 rounded-2xl text-[9px] font-black uppercase text-rose-500 tracking-widest">Err: Invalid_Target</div>}
              {!validation.isValidSemCount && <div className="bg-rose-500/10 border border-rose-500/20 py-3 rounded-2xl text-[9px] font-black uppercase text-rose-500 tracking-widest">Err: Semester_Range</div>}
            </div>
          )}
          
          <button 
            disabled={!validation.canCalculate || isCalculating}
            onClick={triggerAnalysis}
            className={`w-full group relative py-6 md:py-9 rounded-3xl md:rounded-[3rem] font-black tech-font text-lg md:text-2xl tracking-[0.4em] uppercase transition-all overflow-hidden ${
              validation.canCalculate && !isCalculating
                ? 'bg-cyan-500 text-slate-950 shadow-[0_30px_60px_rgba(34,211,238,0.4)] hover:scale-[1.03] active:scale-[0.98] cursor-pointer border-b-8 border-cyan-700' 
                : 'bg-slate-900/50 text-slate-800 cursor-not-allowed border border-white/5'
            }`}
          >
            {isCalculating ? (
              <span className="flex items-center justify-center gap-6">
                <svg className="animate-spin h-8 w-8 text-slate-950" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              'Analisis Sistem'
            )}
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
          </button>
        </div>

        {/* Results Interface */}
        {showSummaryPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/98 backdrop-blur-3xl animate-[fadeIn_0.3s_ease-out]">
            <div className="glass-card rounded-[4rem] p-10 md:p-16 max-w-xl w-full relative shadow-[0_0_150px_rgba(34,211,238,0.2)] border-cyan-500/40 border-2 overflow-hidden animate-[popIn_0.5s_ease-out]">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-[scan_2s_linear_infinite]"></div>
              
              <button 
                onClick={() => setShowSummaryPopup(false)}
                className="absolute top-12 right-12 text-slate-600 hover:text-white transition-all bg-white/5 p-4 rounded-3xl border border-white/10 hover:border-cyan-500/50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="text-center relative z-10">
                <div className="inline-block px-8 py-2 rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-black tracking-[0.5em] mb-12 uppercase">
                  Grade_Analytics_Successful
                </div>
                
                <h2 className="text-white text-3xl md:text-5xl font-black tracking-tighter mb-2 uppercase truncate">{data.userName}</h2>
                <p className="text-slate-600 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.3em] mb-12 italic">Performance Intelligence Snapshot</p>

                <div className="bg-slate-950/80 p-8 md:p-14 rounded-[3rem] border border-white/5 mb-10 shadow-3xl relative">
                  <div className="text-slate-600 text-[9px] uppercase tracking-[0.4em] mb-2 font-black">Overall Average Index</div>
                  <div className="text-8xl md:text-[10rem] font-black text-white tech-font tracking-tighter drop-shadow-[0_0_40px_rgba(34,211,238,0.4)] leading-none">
                    {overallAvg.toFixed(1)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-12">
                  <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-inner">
                    <span className="text-[8px] md:text-[9px] text-slate-600 uppercase font-black block mb-2">Total Accumulated</span>
                    <span className="text-3xl md:text-4xl font-black text-cyan-400 tech-font">{totalScore}</span>
                  </div>
                  <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 shadow-inner">
                    <span className="text-[8px] md:text-[9px] text-slate-600 uppercase font-black block mb-2">Semesters Analysed</span>
                    <span className="text-3xl md:text-4xl font-black text-slate-200 tech-font">{completeSemesters.length}</span>
                  </div>
                </div>
                
                <div className={`text-xs md:text-sm font-black mb-12 px-10 py-6 rounded-[2.5rem] border-4 ${getStatusClass(overallAvg)} shadow-[0_0_30px_rgba(0,0,0,0.5)] uppercase tracking-[0.4em]`}>
                   {overallAvg >= data.targetAvg ? 'System Status: Target_Accomplished' : 'System Status: Recovery_Plan_Needed'}
                </div>

                <button 
                  onClick={() => { setShowSummaryPopup(false); setShowResults(true); }}
                  className="w-full py-6 md:py-8 bg-cyan-500 text-slate-950 rounded-[2.5rem] md:rounded-[3rem] font-black text-sm uppercase tracking-[0.5em] hover:bg-cyan-400 transition-all shadow-[0_30px_60px_rgba(34,211,238,0.2)] active:scale-95 border-b-8 border-cyan-700"
                >
                  Buka Laporan Penuh
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Report View */}
        {showResults && (
          <div className="mt-32 space-y-24 animate-[fadeIn_0.8s_ease-out] mb-40">
            <div className="text-center relative">
               <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10"></div>
               <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase px-12 bg-[#060b18] inline-block border-x border-white/5">Analytical <span className="text-cyan-400">Roadmap</span></h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {data.semesters.map(sem => {
                const status = getSemesterStatus(sem);
                const avg = calculateSemesterAverage(sem);
                return (
                  <div key={sem.id} className="glass-card rounded-[3rem] p-8 md:p-10 border border-white/5 hover:border-cyan-500/40 transition-all group relative overflow-hidden bg-gradient-to-br from-transparent to-slate-950/80 shadow-2xl">
                    <div className="flex justify-between items-start mb-10">
                      <div className="bg-slate-950 px-5 py-2 rounded-xl border border-white/10">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Module_{sem.id.toString().padStart(2, '0')}</span>
                      </div>
                      {status === 'complete' && (
                        <div className="text-right">
                          <span className="text-cyan-400 font-black tech-font text-3xl md:text-4xl block leading-none">{avg.toFixed(1)}</span>
                          <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest mt-1 block">Semester_Index</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 opacity-30 group-hover:opacity-100 transition-all duration-700">
                      {status === 'empty' ? (
                        <div className="py-10 flex flex-col items-center gap-3">
                           <div className="w-10 h-10 bg-slate-900 rounded-full animate-pulse opacity-20 border border-white/5"></div>
                           <p className="text-[8px] text-slate-800 font-black uppercase tracking-widest">Awaiting_Data</p>
                        </div>
                      ) : (
                        sem.subjects.map(sub => (
                          <div key={sub.id} className="flex justify-between text-[11px] md:text-xs text-slate-500 font-bold uppercase tracking-tight group-hover:text-slate-300 transition-colors">
                            <span className="truncate max-w-[150px]">{sub.name || 'UNLABELED_MAPEL'}</span>
                            <span className="text-white font-black">{sub.score}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="glass-card rounded-[4rem] p-12 md:p-16 text-center relative overflow-hidden lg:col-span-1 border-t-8 border-cyan-500 shadow-3xl bg-[#0a0f1d]">
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/5 blur-[80px] rounded-full"></div>
                <h4 className="text-slate-600 text-[10px] uppercase tracking-[0.5em] mb-8 font-black">Performance_Aggregate</h4>
                <div className="text-8xl md:text-9xl font-black text-white tech-font drop-shadow-2xl mb-12">{overallAvg.toFixed(1)}</div>
                <div className="flex flex-col gap-4 pt-12 border-t border-white/5">
                  <span className="text-[10px] text-slate-700 uppercase font-black tracking-[0.6em]">Points_Inventory</span>
                  <span className="text-4xl md:text-5xl font-black text-cyan-400 tech-font">{totalScore} <span className="text-sm text-slate-800">PTS</span></span>
                </div>
              </div>

              <div className="glass-card rounded-[4rem] p-12 md:p-16 flex flex-col justify-center lg:col-span-2 border border-white/10 shadow-3xl bg-gradient-to-br from-[#0a0f1d] to-slate-950 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-1000 scale-150">
                   <svg className="w-64 h-64" fill="white" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </div>
                <h4 className="text-slate-600 text-[10px] uppercase tracking-[0.5em] mb-12 font-black">Strategic_Projections</h4>
                <div className="flex flex-col sm:flex-row sm:items-center gap-12 relative z-10">
                  <div className="text-center sm:text-left bg-cyan-500/5 p-12 rounded-[3.5rem] border-2 border-cyan-500/10 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                    <div className="text-7xl md:text-8xl font-black text-cyan-400 tech-font tracking-tighter leading-none">{neededAvg.toFixed(1)}</div>
                    <p className="text-[10px] text-cyan-500/40 mt-6 uppercase font-black tracking-[0.5em]">Minimum_Goal_Threshold</p>
                  </div>
                  <div className="flex-grow text-center sm:text-left">
                    <p className="text-lg md:text-2xl text-slate-300 italic leading-relaxed font-medium border-l-4 border-cyan-500/30 pl-10 max-w-sm mx-auto sm:mx-0">
                      "Diperlukan rata-rata kumulatif minimal <b className="text-white underline decoration-cyan-500/50 decoration-4">{neededAvg.toFixed(1)}</b> pada sisa periode operasional untuk mengamankan target <b className="text-cyan-400">{data.targetAvg}%</b>."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer System */}
      <footer className="mt-40 border-t border-white/5 py-24 bg-slate-950/90 backdrop-blur-3xl relative overflow-hidden text-center md:text-left">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent"></div>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-16 md:gap-20">
          <div className="group cursor-default">
            <div className="flex items-center gap-5 justify-center md:justify-start mb-6">
              <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center font-black text-lg text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.5)] border border-white/20">D</div>
              <p className="text-white font-black tracking-[0.6em] tech-font text-lg uppercase group-hover:text-cyan-400 transition-all">By Dafid</p>
            </div>
            <p className="text-slate-800 text-[11px] uppercase tracking-[0.8em] font-black opacity-50">Future Academic Hub v7.0.0_OPT</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-12">
             <a 
              href="https://dapidhub.my.id" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group px-14 py-6 bg-slate-900 border border-white/10 rounded-[2.5rem] font-black text-white transition-all hover:border-cyan-400 hover:text-cyan-400 text-xs tracking-[0.5em] shadow-2xl relative overflow-hidden active:scale-95 hover:shadow-[0_0_60px_rgba(34,211,238,0.2)]"
            >
              <div className="absolute inset-0 bg-cyan-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
              <span className="relative flex items-center gap-5 uppercase">Execute_Hub <span className="text-white group-hover:text-cyan-400">Dapidhub</span></span>
            </a>
            <div className="flex gap-8 opacity-20">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:0.3s]"></div>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:0.6s]"></div>
            </div>
          </div>
        </div>
        <div className="text-center mt-32 text-[9px] uppercase tracking-[2.5em] text-slate-900 font-black opacity-30 px-6 leading-loose">
          PERFORMANCE • PRECISION • PREDICTION • FUTURISM
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(50px); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.85) translateY(80px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #060b18; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;
