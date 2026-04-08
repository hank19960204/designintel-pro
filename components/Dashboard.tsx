'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, FileDown, User, ShieldCheck, Zap,
  Target, Lightbulb, X, Upload, Sparkles, ChevronRight, Filter, LayoutGrid,
  BarChart3, Maximize2, Minimize2, Trash2, Settings2, GripVertical, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  Tooltip, Legend,
} from 'recharts';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Competitor, AiInsights } from '@/types';

// ── helpers ────────────────────────────────────────────────────────────
const extractNumber = (str: string) => {
  if (!str) return 0;
  const m = str.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
};

const COLORS = ['#06b6d4', '#6366f1', '#f43f5e', '#f59e0b', '#10b981'];

// ── component ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: session, status } = useSession();
  const isAdmin = !!(session?.user as any)?.role;

  // ── data state ──
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [specKeys, setSpecKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── ui state ──
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [hiddenCompIds, setHiddenCompIds] = useState<Set<string>>(new Set());
  const [hiddenSpecKeys, setHiddenSpecKeys] = useState<Set<string>>(new Set());
  const [expandedChart, setExpandedChart] = useState<'radar' | 'scatter' | null>(null);
  const [radarMetrics, setRadarMetrics] = useState(['耐用性', '性能', '續航', '便攜性', '掃描力']);
  const [scatterConfig, setScatterConfig] = useState({ x: '重量', y: '電池容量' });

  // ── form state ──
  const [newComp, setNewComp] = useState({ brand: '', name: '', image: '' });
  const [formSpecs, setFormSpecs] = useState<{ key: string; value: string; unit: string }[]>([]);
  const [lastSavedForm, setLastSavedForm] = useState<{ newComp: any; formSpecs: any } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [rawSpecText, setRawSpecText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ── AI state ──
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  // ── export ref ──
  const dashboardRef = useRef<HTMLDivElement>(null);

  // ── fetch competitors from Notion ──────────────────────────────────
  const fetchCompetitors = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/notion');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Competitor[] = data.competitors || [];
      setCompetitors(list);
      if (list.length > 0 && !selectedProductId) setSelectedProductId(list[0].id);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => { fetchCompetitors(); }, []);

  // ── sync dynamic spec keys ──────────────────────────────────────────
  useEffect(() => {
    const keys = new Set(specKeys);
    let changed = false;
    competitors.forEach(c => {
      Object.keys(c.specs).forEach(k => {
        if (!keys.has(k)) { keys.add(k); changed = true; }
      });
    });
    if (changed) setSpecKeys(Array.from(keys));
  }, [competitors]);

  const visibleSpecKeys = useMemo(
    () => specKeys.filter(k => !hiddenSpecKeys.has(k)),
    [specKeys, hiddenSpecKeys]
  );

  const columnItems = useMemo(
    () => [{ id: 'spec-header', isHeader: true, name: '產品維度', brand: '', image: '', specs: {} }, ...competitors],
    [competitors]
  );

  const handleReorderColumns = (newItems: any[]) => {
    setCompetitors(newItems.filter((item: any) => !item.isHeader));
  };

  const co mmonUnits = useMemo(() => {
    const units: Record<string, string> = {};
    specKeys.forEach(key => {
      const unitCounts: Record<string, number> = {};
      competitors.forEach(comp => {
        const val = comp.specs[key];
        if (val) {
          const match = val.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z%°/]+)/);
          if (match?.[2]) { const u = match[2].trim(); if (u) unitCounts[u] = (unitCounts[u] || 0) + 1; }
        }
      });
      let max = 0, best = '';
      for (const [u, c] of Object.entries(unitCounts)) { if (c > max) { max = c; best = u; } }
      if (best) units[key] = best;
    });
    return units;
  }, [competitors, specKeys]);

  // ── filtered / visible competitors ────────────────────────────────
  const visibleCompetitors = useMemo(
    () => competitors.filter(c => !hiddenCompIds.has(c.id)),
    [competitors, hiddenCompIds]
  );

  const filteredCompetitors = useMemo(
    () => visibleCompetitors.filter(c =>
      (c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.brand.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedBrands.size === 0 || selectedBrands.has(c.brand))
    ),
    [visibleCompetitors, searchQuery, selectedBrands]
  );

  const allBrands = useMemo(() => [...new Set(competitors.map(c => c.brand))], [competitors]);

  // ── AI Insights ────────────────────────────────────────────────────
  const fetchInsights = useCallback(async (targetId?: string) => {
    const id = targetId || selectedProductId;
    const target = competitors.find(c => c.id === id);
    if (!target || competitors.length === 0) return;

    setIsLoadingInsights(true);
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, competitors }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAiInsights(data);
    } catch (e: any) {
      console.error('insights error', e);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [competitors, selectedProductId]);

  // Auto-load insights when competitors are ready
  useEffect(() => {
    if (competitors.length > 0 && selectedProductId && !aiInsights) {
      fetchInsights(selectedProductId);
    }
  }, [competitors, selectedProductId]);

  // ── Chart data ─────────────────────────────────────────────────────
  const radarData = useMemo(() => radarMetrics.map(metric => {
    const entry: any = { subject: metric };
    visibleCompetitors.forEach(comp => {
      const num = extractNumber(comp.specs[metric] || '50');
      entry[comp.name] = Math.min(100, num > 0 ? num : 50);
    });
    return entry;
  }), [visibleCompetitors, radarMetrics]);

  // ── Login / Logout ─────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signIn('credentials', { password, redirect: false });
    if (result?.ok) { setShowLoginModal(false); setPassword(''); setLoginError(false); }
    else setLoginError(true);
  };

  // ── Form helpers ───────────────────────────────────────────────────
  const handleAddField = () => setFormSpecs([...formSpecs, { key: '', value: '', unit: '' }]);
  const handleRemoveField = (i: number) => setFormSpecs(formSpecs.filter((_, idx) => idx !== i));
  const handleUpdateSpecField = (i: number, field: 'key' | 'value' | 'unit', val: string) => {
    const updated = [...formSpecs];
    updated[i][field] = val;
    if (field === 'key' && commonUnits[val] && !updated[i].unit) updated[i].unit = commonUnits[val];
    setFormSpecs(updated);
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormError(null);
    setImageFile(null);
    setImagePreview('');
    setRawSpecText('');
    if (lastSavedForm) {
      setNewComp({ ...lastSavedForm.newComp, name: '' });
      setFormSpecs(lastSavedForm.formSpecs);
    } else {
      setNewComp({ brand: '', name: '', image: '' });
      setFormSpecs(specKeys.map(key => ({ key, value: '', unit: commonUnits[key] || '' })));
    }
    setShowAddModal(true);
  };

  const handleEditCompetitor = (comp: Competitor) => {
    setEditingId(comp.id);
    setFormError(null);
    setImageFile(null);
    setImagePreview(comp.image);
    setRawSpecText('');
    const specs = Object.entries(comp.specs).map(([key, fullVal]) => {
      const m = fullVal.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      return m ? { key, value: m[1], unit: m[2] } : { key, value: fullVal, unit: '' };
    });
    setNewComp({ brand: comp.brand, name: comp.name, image: comp.image });
    setFormSpecs(specs);
    setShowAddModal(true);
  };

  // ── Image upload to Google Drive ───────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImageToDrive = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async ev => {
        const base64 = (ev.target?.result as string).split(',')[1];
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileName: file.name, mimeType: file.type }),
        });
        if (!res.ok) return reject(new Error('圖片上傳失敗'));
        const data = await res.json();
        resolve(data.directUrl);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ── AI Spec Parse ──────────────────────────────────────────────────
  const handleAiAnalyze = async () => {
    if (!rawSpecText.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawSpecText }),
      });
      if (!res.ok) throw new Error('AI 解析失敗');
      const data = await res.json();
      if (data.specs) {
        const parsed = Object.entries(data.specs as Record<string, string>).map(([key, value]) => {
          const m = (value as string).match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
          return m ? { key, value: m[1], unit: m[2] } : { key, value: value as string, unit: '' };
        });
        setFormSpecs(parsed);
      }
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Save competitor (create or update) ────────────────────────────
  const handleSaveCompetitor = async () => {
    if (!newComp.brand || !newComp.name) { setFormError('請填寫品牌與型號'); return; }
    setIsSaving(true);
    setFormError(null);
    try {
      let imageUrl = newComp.image || `https://picsum.photos/seed/${Date.now()}/200/200`;
      if (imageFile) imageUrl = await uploadImageToDrive(imageFile);

      const finalSpecs: Record<string, string> = {};
      formSpecs.forEach(s => {
        if (s.key) finalSpecs[s.key] = s.unit ? `${s.value} ${s.unit}`.trim() : s.value;
      });

      if (editingId) {
        const res = await fetch('/api/notion', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...newComp, image: imageUrl, specs: finalSpecs }),
        });
        if (!res.ok) throw new Error('更新失敗');
      } else {
        const res = await fetch('/api/notion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newComp, image: imageUrl, specs: finalSpecs }),
        });
        if (!res.ok) throw new Error('新增失敗');
      }

      setLastSavedForm({ newComp, formSpecs });
      setShowAddModal(false);
      await fetchCompetitors();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete competitor ──────────────────────────────────────────────
  const handleDeleteCompetitor = async (id: string) => {
    try {
      const res = await fetch('/api/notion', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('刪除失敗');
      setShowDeleteConfirm(null);
      await fetchCompetitors();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── Export PDF ─────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');
    const canvas = await html2canvas(dashboardRef.current, { scale: 1.5, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('DesignIntel-Pro-Report.pdf');
  };

  // ── Export CSV ─────────────────────────────────────────────────────
const handleExportCSV = () => {
    if (competitors.length === 0) return;
    const allKeys = [...new Set(competitors.flatMap(c => Object.keys(c.specs)))];
    const headers = ['品牌', '型號', ...allKeys];
    const rows = competitors.map(c =>
      [c.brand, c.name, ...allKeys.map(k => c.specs[k] || '')].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'DesignIntel-Specs.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
          <p className="text-slate-500 font-medium">正在從 Notion 載入競品資料...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-500 font-bold text-lg">載入失敗：{loadError}</p>
          <p className="text-slate-400 text-sm">請確認 NOTION_API_KEY 與 NOTION_DATABASE_ID 環境變數已正確設定</p>
          <button onClick={fetchCompetitors} className="px-6 py-2 bg-cyan-500 text-white rounded-xl font-bold">
            重新載入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={dashboardRef} className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-cyan-100 selection:text-cyan-900">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyan-400 fill-cyan-400" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              DesignIntel <span className="text-cyan-500">Pro</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-cyan-50 text-cyan-700 text-xs font-bold rounded-full border border-cyan-200">
                <ShieldCheck className="w-3.5 h-3.5" />管理員編輯模式
              </span>
            )}
            <button
              onClick={() => isAdmin ? signOut() : setShowLoginModal(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                isAdmin ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'
              }`}
            >
              <User className="w-4 h-4" />
              {isAdmin ? '登出' : '管理員登入'}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">

        {/* ── Hero & Controls ── */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-4 flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              工業設計競品分析儀表板
            </h1>
            <p className="text-slate-500 max-w-2xl">
              即時追蹤全球工業手持設備、RFID 與掃描器規格，透過 AI 洞察市場真空區，驅動下一代產品設計策略。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜尋型號、品牌或規格關鍵字..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none transition-all shadow-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {/* Brand filter */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterPopover(!showFilterPopover)}
                  className={`flex items-center gap-2 px-4 py-3 border rounded-xl transition-all shadow-sm ${
                    selectedBrands.size > 0 ? 'bg-cyan-50 border-cyan-200 text-cyan-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-4 h-4" />篩選器
                </button>
                <AnimatePresence>
                  {showFilterPopover && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full mt-2 left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 min-w-[200px]"
                    >
                      <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">品牌篩選</p>
                      {allBrands.map(brand => (
                        <label key={brand} className="flex items-center gap-2 py-1.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedBrands.has(brand)}
                            onChange={() => {
                              const next = new Set(selectedBrands);
                              next.has(brand) ? next.delete(brand) : next.add(brand);
                              setSelectedBrands(next);
                            }}
                            className="accent-cyan-500"
                          />
                          <span className="text-sm font-medium text-slate-600 group-hover:text-cyan-600">{brand}</span>
                        </label>
                      ))}
                      {selectedBrands.size > 0 && (
                        <button onClick={() => setSelectedBrands(new Set())} className="mt-3 text-xs text-red-400 font-bold w-full text-left">
                          清除篩選
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-all font-medium shadow-sm"
            >
              <FileDown className="w-4 h-4 text-green-500" />CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-all font-medium shadow-sm"
            >
              <FileDown className="w-4 h-4 text-red-500" />PDF 簡報
            </button>
            {isAdmin && (
              <button
                onClick={openAddModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition-all font-bold shadow-lg shadow-cyan-200"
              >
                <Plus className="w-5 h-5" />新增競品
              </button>
            )}
          </div>
        </section>

        {/* ── Comparison Matrix ── */}
        <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-500 ${
          isExpanded ? 'fixed inset-4 md:inset-10 z-[101] flex flex-col' : 'relative'
        }`}>
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-cyan-500" />規格對比矩陣
              </h2>
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-cyan-500 transition-all flex items-center gap-1.5 text-xs font-bold">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {isExpanded ? '退出展開' : '展開模式'}
              </button>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <GripVertical className="w-3.5 h-3.5" />拖曳欄位可重新排序
              </div>
            )}
          </div>
          <div className={`overflow-auto relative custom-scrollbar flex-1 ${isExpanded ? 'h-full' : 'max-h-[600px]'}`}>
            {filteredCompetitors.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-400 font-medium">
                {isLoading ? '載入中...' : '尚無競品資料，請點選「新增競品」開始'}
              </div>
            ) : (
              <table className="w-full border-collapse text-sm text-left">
                <thead>
                  <Reorder.Group axis="x" values={columnItems} onReorder={handleReorderColumns} as="tr" className="bg-slate-50/50">
                    {columnItems.map((item: any) => (
                      <Reorder.Item
                        key={item.id} value={item} as="th" dragListener={isAdmin && !item.isHeader}
                        className={item.isHeader
                          ? 'sticky left-0 top-0 z-30 bg-slate-50 border-b border-r border-slate-200 p-4 min-w-[240px]'
                          : 'sticky top-0 z-20 bg-slate-50 border-b border-slate-200 p-6 min-w-[300px] group/col'}
                      >
                        {item.isHeader ? (
                          <span className="text-slate-400 font-semibold">產品維度</span>
                        ) : (
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              {isAdmin && <GripVertical className="w-4 h-4 text-slate-300" />}
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <div className="text-xs font-bold text-cyan-600 uppercase tracking-widest">{item.brand}</div>
                                <div className="text-base font-extrabold text-slate-900">{item.name}</div>
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/col:opacity-100 transition-opacity">
                                <button onClick={() => handleEditCompetitor(item)} className="p-1.5 hover:bg-cyan-100 rounded-lg text-cyan-400">
                                  <Settings2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setShowDeleteConfirm(item.id)} className="p-1.5 hover:bg-red-100 rounded-lg text-red-400">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </thead>
                <Reorder.Group axis="y" values={specKeys} onReorder={setSpecKeys} as="tbody">
                  {visibleSpecKeys.map(key => (
                    <Reorder.Item key={key} value={key} as="tr" className="group hover:bg-cyan-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-cyan-50/50 border-b border-r border-slate-100 p-4 font-bold text-slate-600">
                        <div className="flex items-center gap-2">
                          {isAdmin && <GripVertical className="w-4 h-4 text-slate-300" />}
                          {key}
                        </div>
                      </td>
                      {filteredCompetitors.map(comp => (
                        <td key={comp.id} className="border-b border-slate-100 p-6 text-slate-500 leading-relaxed">
                          {comp.specs[key] || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </table>
            )}
          </div>
        </section>

        {/* ── AI Insights ── */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-3 flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-200">
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight italic uppercase">AI Strategic Insights</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  分析對象: {aiInsights?.targetBrand} {aiInsights?.targetName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedProductId}
                onChange={e => { setSelectedProductId(e.target.value); setAiInsights(null); }}
                className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
              >
                {competitors.map(c => (
                  <option key={c.id} value={c.id}>{c.brand} {c.name}</option>
                ))}
              </select>
              <button
                onClick={() => fetchInsights()}
                disabled={isLoadingInsights}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold disabled:opacity-50"
              >
                {isLoadingInsights ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoadingInsights ? '分析中...' : '重新分析'}
              </button>
            </div>
          </div>

          {/* Pros & Cons */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-cyan-500 rounded-full" />優劣勢分析
            </h3>
            {isLoadingInsights ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-xs font-bold text-green-600 uppercase mb-3 flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-green-600" /> 優勢 (Pros)
                  </div>
                  <ul className="space-y-4">
                    {(aiInsights?.pros || []).map((item, i) => (
                      <li key={i} className="text-sm text-slate-600 font-bold flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <div>{item.text}<p className="text-xs text-slate-400 font-normal mt-1">{item.reasoning}</p></div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold text-red-500 uppercase mb-3 flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-red-500" /> 劣勢 (Cons)
                  </div>
                  <ul className="space-y-4">
                    {(aiInsights?.cons || []).map((item, i) => (
                      <li key={i} className="text-sm text-slate-600 font-bold flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>{item.text}<p className="text-xs text-slate-400 font-normal mt-1">{item.reasoning}</p></div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Red Ocean */}
          <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-red-500 rounded-full" />市場稠密區 (紅海標配)
            </h3>
            {isLoadingInsights ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 text-white/40 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {(aiInsights?.redOcean || []).map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-sm text-slate-400">{item.label}</span>
                    <span className="text-sm font-bold text-cyan-400">{item.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Blue Ocean */}
          <div className="bg-cyan-500 p-8 rounded-3xl text-white shadow-xl shadow-cyan-200 relative overflow-hidden">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-white rounded-full" />藍海戰略提案
            </h3>
            {isLoadingInsights ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 text-white/60 animate-spin" /></div>
            ) : (
              <div className="space-y-5">
                {(aiInsights?.blueOcean || []).map((item, i) => (
                  <div key={i} className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/30">
                    <div className="text-sm font-bold">{item.title}</div>
                    <div className="text-xs mt-1 opacity-90">{item.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Charts ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Radar Chart */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm min-h-[450px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-cyan-500" /><h3 className="text-lg font-bold">綜合能力雷達圖</h3></div>
              <button onClick={() => setExpandedChart('radar')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Maximize2 className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                  {visibleCompetitors.map((comp, i) => (
                    <Radar key={comp.id} name={comp.name} dataKey={comp.name}
                      stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
                  ))}
                  <Tooltip /><Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scatter Chart */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm min-h-[450px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><Target className="w-5 h-5 text-cyan-500" /><h3 className="text-lg font-bold">規格散佈圖</h3></div>
              <button onClick={() => setExpandedChart('scatter')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Maximize2 className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-3 mb-4">
              <select value={scatterConfig.x} onChange={e => setScatterConfig(p => ({ ...p, x: e.target.value }))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 outline-none">
                {specKeys.map(k => <option key={k} value={k}>{k} (X軸)</option>)}
              </select>
              <select value={scatterConfig.y} onChange={e => setScatterConfig(p => ({ ...p, y: e.target.value }))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 outline-none">
                {specKeys.map(k => <option key={k} value={k}>{k} (Y軸)</option>)}
              </select>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <XAxis type="number" dataKey="x" name={scatterConfig.x} stroke="#94a3b8" fontSize={12} />
                  <YAxis type="number" dataKey="y" name={scatterConfig.y} stroke="#94a3b8" fontSize={12} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Legend />
                  <Scatter
                    name="產品分佈"
                    data={visibleCompetitors.map(c => ({ name: c.name, x: extractNumber(c.specs[scatterConfig.x] || '0'), y: extractNumber(c.specs[scatterConfig.y] || '0') }))}
                    fill="#06b6d4"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>

      {/* ──────────────────── Modals ──────────────────── */}
      <AnimatePresence>
        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">管理員登入</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="password" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  placeholder="請輸入管理員密碼" value={password} onChange={e => setPassword(e.target.value)} />
                {loginError && <p className="text-xs text-red-500 font-bold">密碼錯誤，請再試一次。</p>}
                <button type="submit" className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl">驗證登入</button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirm */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">確定要刪除嗎？</h3>
              <p className="text-slate-400 text-sm mb-8">此操作將封存 Notion 中的頁面，可至 Notion 還原。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl">取消</button>
                <button onClick={() => handleDeleteCompetitor(showDeleteConfirm)} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl">確認刪除</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add / Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h2 className="text-2xl font-bold">{editingId ? '編輯競品情報' : '新增競品情報'}</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {formError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold">{formError}</div>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    placeholder="品牌 (e.g. Zebra)" value={newComp.brand} onChange={e => setNewComp({ ...newComp, brand: e.target.value })} />
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    placeholder="型號 (e.g. TC9300)" value={newComp.name} onChange={e => setNewComp({ ...newComp, name: e.target.value })} />
                </div>

                {/* Image Upload */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-700">產品圖片</label>
                  <div className="flex items-center gap-4">
                    {imagePreview && (
                      <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200" referrerPolicy="no-referrer" />
                    )}
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-200 transition-all">
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-600">上傳圖片至 Google Drive</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  </div>
                </div>

                {/* AI Spec Parser */}
                <div className="space-y-3 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-500" />AI 規格智慧解析
                  </label>
                  <textarea
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none text-sm resize-none"
                    rows={4}
                    placeholder="貼上官網或說明書的原始規格文字，AI 將自動解析成結構化欄位..."
                    value={rawSpecText}
                    onChange={e => setRawSpecText(e.target.value)}
                  />
                  <button
                    onClick={handleAiAnalyze}
                    disabled={isAnalyzing || !rawSpecText.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 font-bold disabled:opacity-50 transition-all"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? '解析中...' : 'AI 解析規格'}
                  </button>
                </div>

                {/* Spec fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-slate-700">規格編輯區</label>
                    <button onClick={handleAddField} className="text-xs font-bold text-cyan-600 flex items-center gap-1"><Plus className="w-3 h-3" /> 新增欄位</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formSpecs.map((spec, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl group">
                        <input type="text" className="w-1/4 text-[10px] font-bold text-slate-500 bg-transparent outline-none"
                          placeholder="規格名稱" value={spec.key} onChange={e => handleUpdateSpecField(idx, 'key', e.target.value)} />
                        <input type="text" className="flex-1 bg-transparent text-sm outline-none font-medium"
                          placeholder="數值" value={spec.value} onChange={e => handleUpdateSpecField(idx, 'value', e.target.value)} />
                        <input type="text" className="w-1/4 bg-white border border-slate-200 rounded px-2 py-1 text-[10px] outline-none"
                          placeholder="單位" value={spec.unit} onChange={e => handleUpdateSpecField(idx, 'unit', e.target.value)} />
                        <button onClick={() => handleRemoveField(idx)} className="p-1 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 shrink-0">
                <button onClick={() => setShowAddModal(false)} className="px-6 py-2.5 text-slate-600 font-bold">取消</button>
                <button onClick={handleSaveCompetitor} disabled={isSaving}
                  className="px-8 py-2.5 bg-slate-900 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-50">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? '儲存中...' : '儲存情報'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      <footer className="max-w-[1600px] mx-auto px-6 py-12 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 opacity-50">
        <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-slate-900" /><span className="text-sm font-bold uppercase tracking-tight">DesignIntel Pro v2.4.0</span></div>
        <div className="text-sm text-slate-400 font-medium">© 2024 Industrial Intelligence Group.</div>
      </footer>
    </div>
  );
}
