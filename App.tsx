import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DailyLog, 
  Meal, 
  Ingredient, 
  FIXED_BREAKFAST_ITEMS, 
  BodyMetrics, 
  DEFAULT_GOALS 
} from './types';
import { parseFoodEntry, generateWeeklyReport, generateDailyReport } from './services/geminiService';
import MacroProgress from './components/MacroProgress';
import DecisionMaker from './components/DecisionMaker';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

const STORAGE_KEY = 'smart_diet_logs_v2';

const getTodayString = () => new Date().toISOString().split('T')[0];

const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' }
];

const App: React.FC = () => {
  // 1. Robust Initialization: Load from localStorage immediately during state initialization
  // This prevents any "flash" of empty data and ensures persistence across refreshes.
  const [logs, setLogs] = useState<Record<string, DailyLog>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Failed to load logs:", e);
      return {};
    }
  });

  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [view, setView] = useState<'dashboard' | 'calendar' | 'report'>('dashboard');
  
  // UI States for adding food
  const [activeMealInput, setActiveMealInput] = useState<string | null>(null);
  const [inputState, setInputState] = useState<{text: string, image: string | null}>({ text: '', image: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // UI States for editing
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  
  // Report State
  const [reportContent, setReportContent] = useState<string>('');
  const [reportTitle, setReportTitle] = useState<string>('');
  const [generatingReport, setGeneratingReport] = useState(false);

  // Save Data Effect: triggered whenever logs change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error("Failed to save logs:", e);
    }
  }, [logs]);

  // Helper to get log for a specific date (or create default)
  const getDailyLog = useCallback((date: string): DailyLog => {
    if (logs[date]) return logs[date];
    
    // Create new log with default meals
    const newLog: DailyLog = {
      date,
      meals: [
        {
          id: `breakfast-${date}`,
          name: '早餐',
          timestamp: Date.now(),
          items: [...FIXED_BREAKFAST_ITEMS], // Defaults
          cookingMethodNote: '水煮/生鲜'
        },
        {
          id: `lunch-${date}`,
          name: '午餐',
          timestamp: Date.now(),
          items: []
        },
        {
          id: `dinner-${date}`,
          name: '晚餐',
          timestamp: Date.now(),
          items: []
        },
        {
          id: `snack-${date}`,
          name: '加餐',
          timestamp: Date.now(),
          items: []
        }
      ],
      metrics: { weight: null, waist: null, thigh: null, calf: null }
    };
    return newLog;
  }, [logs]);

  const currentLog = getDailyLog(selectedDate);

  const updateLog = (newLog: DailyLog) => {
    setLogs(prev => ({ ...prev, [newLog.date]: newLog }));
  };

  // Date Navigation Helper
  const changeDate = (offset: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    const newDate = date.toISOString().split('T')[0];
    if (newDate <= getTodayString()) {
      setSelectedDate(newDate);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputState(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddFood = async (mealTypeKey: string, mealId: string) => {
    if (!inputState.text.trim() && !inputState.image) return;
    setIsProcessing(true);
    try {
      const { items, cookingAnalysis } = await parseFoodEntry(inputState.text, inputState.image || undefined);
      
      const updatedMeals = currentLog.meals.map(m => {
        if (m.id === mealId) {
          // Append new items to existing items
          return {
            ...m,
            items: [...m.items, ...items],
            cookingMethodNote: m.cookingMethodNote ? `${m.cookingMethodNote}; ${cookingAnalysis}` : cookingAnalysis
          };
        }
        return m;
      });

      updateLog({ ...currentLog, meals: updatedMeals });
      
      // Reset input
      setInputState({ text: '', image: null });
      setActiveMealInput(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      alert(`无法识别食物: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Granular Item Updates
  const handleUpdateItemDetails = (mealId: string, itemId: string, field: keyof Ingredient, value: string | number) => {
    const updatedMeals = currentLog.meals.map(meal => {
      if (meal.id !== mealId) return meal;
      
      const updatedItems = meal.items.map(item => {
        if (item.id !== itemId) return item;

        // If weight changes, auto-scale macros
        if (field === 'weight') {
          const newWeight = Number(value);
          const ratio = item.weight > 0 ? newWeight / item.weight : 1;
          // Prevent division by zero
          if (item.weight === 0) return { ...item, weight: newWeight };

          return {
            ...item,
            weight: newWeight,
            calories: item.calories * ratio,
            protein: item.protein * ratio,
            carbs: item.carbs * ratio,
            fat: item.fat * ratio,
            addedOilCalories: item.addedOilCalories * ratio 
          };
        }

        // If name changes
        if (field === 'name') {
           return { ...item, name: String(value) };
        }

        return item;
      });
      return { ...meal, items: updatedItems };
    });
    
    updateLog({ ...currentLog, meals: updatedMeals });
  };

  const handleDeleteItem = (mealId: string, itemId: string) => {
    const updatedMeals = currentLog.meals.map(meal => {
      if (meal.id !== mealId) return meal;
      return {
        ...meal,
        items: meal.items.filter(i => i.id !== itemId)
      };
    });
    updateLog({ ...currentLog, meals: updatedMeals });
  };

  const handleUpdateMetrics = (key: keyof BodyMetrics, value: string) => {
    const num = parseFloat(value);
    updateLog({
      ...currentLog,
      metrics: { ...currentLog.metrics, [key]: isNaN(num) ? null : num }
    });
  };

  const handleGenerateReport = async (type: 'daily' | 'nutrition' | 'fat_loss') => {
    setGeneratingReport(true);
    setView('report');
    setReportContent('');
    
    if (type === 'daily') {
      setReportTitle('今日营养分析');
      const report = await generateDailyReport(currentLog);
      setReportContent(report);
    } else {
      setReportTitle(type === 'nutrition' ? '本周营养分析' : '本周减脂总结');
      const dates = Object.keys(logs).sort().slice(-7);
      const recentLogs = dates.map(d => logs[d]);
      const report = await generateWeeklyReport(recentLogs, type);
      setReportContent(report);
    }
    
    setGeneratingReport(false);
  };

  // ---------------- Render Helpers ----------------

  const renderMealCard = (type: { key: string, label: string }, meal: Meal | undefined) => {
    const safeMeal = meal || { id: 'temp', name: type.label, items: [], timestamp: 0 };
    const isEditing = editingMealId === safeMeal.id;
    const isAdding = activeMealInput === type.key;

    return (
      <div key={type.key} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-lg text-slate-800">{type.label}</h4>
            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
              {Math.round(safeMeal.items.reduce((acc, i) => acc + i.calories, 0))} kcal
            </span>
          </div>
          <div className="flex gap-2">
             {!isAdding && safeMeal.items.length > 0 && (
              <button 
                onClick={() => setEditingMealId(isEditing ? null : safeMeal.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded transition ${isEditing ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                {isEditing ? '完成' : '修改'}
              </button>
            )}
            {!isAdding && !isEditing && (
               <button 
                onClick={() => {
                  setActiveMealInput(type.key);
                  setEditingMealId(null);
                  setInputState({ text: '', image: null });
                }}
                className="text-xs font-medium px-3 py-1.5 bg-primary text-white rounded hover:bg-emerald-600 transition flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                记录
              </button>
            )}
          </div>
        </div>

        {/* List Items */}
        {safeMeal.items.length > 0 ? (
          <div className="space-y-3 mb-3">
            {safeMeal.items.map(item => (
              <div key={item.id} className="flex flex-col border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                <div className="flex justify-between items-start">
                   <div className="flex-1">
                      {isEditing ? (
                        <input 
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItemDetails(safeMeal.id, item.id, 'name', e.target.value)}
                          className="w-full font-medium text-slate-700 border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent"
                        />
                      ) : (
                        <div className="flex items-center flex-wrap">
                          <span className="text-slate-700 font-medium">{item.name}</span>
                          {/* Distinct Added Oil Display */}
                          {item.addedOilCalories > 5 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-500 border border-red-100 flex items-center">
                              <span className="mr-0.5">💧</span>额外油 {Math.round(item.addedOilCalories)} kcal
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="text-[10px] text-slate-400 mt-0.5 flex gap-2">
                         <span>P: {Math.round(item.protein)}g</span>
                         <span>C: {Math.round(item.carbs)}g</span>
                         <span>F: {Math.round(item.fat)}g</span>
                      </div>
                   </div>

                   <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                           <div className="flex items-center bg-slate-50 rounded border border-slate-200 px-1">
                            <input 
                              type="number" 
                              value={Math.round(item.weight)}
                              onChange={(e) => handleUpdateItemDetails(safeMeal.id, item.id, 'weight', parseFloat(e.target.value))}
                              className="w-12 text-right p-1 bg-transparent focus:outline-none text-xs"
                            />
                            <span className="text-xs text-slate-400 mr-1">g</span>
                          </div>
                          <button 
                            onClick={() => handleDeleteItem(safeMeal.id, item.id)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="删除"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-800">{Math.round(item.calories)} <span className="text-xs font-normal text-slate-400">kcal</span></div>
                          <div className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded inline-block">{Math.round(item.weight)}g</div>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isAdding && <div className="text-sm text-slate-400 italic py-2">暂无记录</div>
        )}

        {/* Add Interface */}
        {isAdding && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 animate-fade-in">
             <textarea 
              className="w-full p-2 bg-white rounded border border-slate-200 text-sm focus:ring-2 focus:ring-primary focus:outline-none mb-3"
              rows={2}
              placeholder={`输入${type.label}内容，例如："牛肉饭" 或 "把鸡蛋换成玉米"...`}
              value={inputState.text}
              onChange={(e) => setInputState(prev => ({ ...prev, text: e.target.value }))}
            />
            
             <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-white text-slate-600 rounded border border-slate-200 hover:bg-slate-100 flex items-center gap-1 text-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  {inputState.image ? '已选图片' : '拍照/上传'}
                </button>
                {inputState.image && (
                  <div className="relative w-8 h-8 rounded overflow-hidden border">
                    <img src={inputState.image} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => { 
                         setInputState(prev => ({ ...prev, image: null })); 
                         if(fileInputRef.current) fileInputRef.current.value = ''; 
                      }}
                      className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveMealInput(null)}
                  className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-700"
                >
                  取消
                </button>
                <button 
                  onClick={() => handleAddFood(type.key, safeMeal.id)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded shadow-sm hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                  {isProcessing ? '分析中' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="max-w-md mx-auto pb-24">
      {/* Hidden Global File Input */}
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleImageUpload}
      />

      {/* Date Navigation Header */}
      <header className="flex justify-between items-center mb-6 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
        <button 
          onClick={() => changeDate(-1)} 
          className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-full transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 relative group cursor-pointer">
             <h1 className="text-lg font-bold text-slate-900">
               {selectedDate === getTodayString() ? "今天" : selectedDate}
             </h1>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-primary transition" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
             </svg>
             <input 
               type="date" 
               className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
               value={selectedDate}
               max={getTodayString()}
               onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
             />
          </div>
          <span className="text-[10px] text-slate-400 tracking-wide font-medium uppercase">Date Selector</span>
        </div>

        <div className="flex gap-1">
          <button 
            onClick={() => {
              const date = new Date(selectedDate);
              date.setDate(date.getDate() + 1);
              const newDate = date.toISOString().split('T')[0];
              if (newDate <= getTodayString()) setSelectedDate(newDate);
            }} 
            className={`p-2 rounded-full transition ${selectedDate === getTodayString() ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-primary hover:bg-slate-50'}`}
            disabled={selectedDate === getTodayString()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          <div className="w-px h-8 bg-slate-100 mx-1 self-center"></div>

          <button 
            onClick={() => setView('calendar')} 
            className="p-2 text-slate-400 hover:text-secondary hover:bg-slate-50 rounded-full transition"
            title="历史与趋势"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      </header>

      <MacroProgress log={currentLog} />

      <DecisionMaker currentLog={currentLog} goals={DEFAULT_GOALS} />

      {/* Meal Lists - Iterating through fixed types */}
      <div className="space-y-4">
        {MEAL_TYPES.map(type => {
          const meal = currentLog.meals.find(m => m.name === type.label) 
                       || currentLog.meals.find(m => m.id.startsWith(type.key));
          return renderMealCard(type, meal);
        })}
      </div>

      {/* Body Metrics Input */}
      <div className="mt-8 bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          今日身体数据
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 font-medium">体重 (kg)</label>
            <input 
              type="number" 
              value={currentLog.metrics.weight || ''}
              onChange={(e) => handleUpdateMetrics('weight', e.target.value)}
              className="w-full p-2 border border-slate-200 rounded mt-1 bg-slate-50 focus:bg-white transition"
              placeholder="0.0"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">腰围 (cm)</label>
            <input 
              type="number" 
              value={currentLog.metrics.waist || ''}
              onChange={(e) => handleUpdateMetrics('waist', e.target.value)}
              className="w-full p-2 border border-slate-200 rounded mt-1 bg-slate-50 focus:bg-white transition"
              placeholder="0.0"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">大腿围 (cm)</label>
            <input 
              type="number" 
              value={currentLog.metrics.thigh || ''}
              onChange={(e) => handleUpdateMetrics('thigh', e.target.value)}
              className="w-full p-2 border border-slate-200 rounded mt-1 bg-slate-50 focus:bg-white transition"
              placeholder="0.0"
            />
          </div>
           <div>
            <label className="text-xs text-slate-500 font-medium">小腿围 (cm)</label>
            <input 
              type="number" 
              value={currentLog.metrics.calf || ''}
              onChange={(e) => handleUpdateMetrics('calf', e.target.value)}
              className="w-full p-2 border border-slate-200 rounded mt-1 bg-slate-50 focus:bg-white transition"
              placeholder="0.0"
            />
          </div>
        </div>
      </div>

      {/* Generate Daily Report Button */}
      <div className="mt-8 mb-4">
        <button 
          onClick={() => handleGenerateReport('daily')}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition transform hover:scale-[1.01] flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          生成今日营养报告
        </button>
      </div>
    </div>
  );

  const renderCalendar = () => (
    <div className="max-w-md mx-auto">
      <header className="flex items-center mb-6">
        <button onClick={() => setView('dashboard')} className="mr-4 text-slate-500 flex items-center hover:text-slate-800">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          返回记录
        </button>
        <h1 className="text-xl font-bold">历史与趋势</h1>
      </header>

      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-slate-100">
        <h3 className="font-bold mb-3 text-slate-800">跳转到特定日期</h3>
        <input 
          type="date" 
          value={selectedDate}
          max={getTodayString()}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setView('dashboard');
          }}
          className="w-full p-3 border rounded-lg bg-slate-50 text-slate-800 focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 h-64 border border-slate-100">
        <h3 className="font-bold mb-3 text-slate-800">体重趋势 (近7条记录)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={Object.keys(logs).sort().slice(-7).map(d => ({ date: d.slice(5), weight: logs[d].metrics.weight }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{fontSize: 12}} />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
            <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => handleGenerateReport('nutrition')}
          className="py-4 bg-indigo-500 text-white rounded-xl font-bold shadow-md hover:bg-indigo-600 transition flex flex-col items-center justify-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <span className="text-sm">每周营养分析</span>
        </button>
        <button 
          onClick={() => handleGenerateReport('fat_loss')}
          className="py-4 bg-rose-500 text-white rounded-xl font-bold shadow-md hover:bg-rose-600 transition flex flex-col items-center justify-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-sm">减脂进度总结</span>
        </button>
      </div>
    </div>
  );

  const renderReport = () => (
    <div className="max-w-md mx-auto pb-8">
       <header className="flex items-center mb-6">
        <button onClick={() => setView('dashboard')} className="mr-4 text-slate-500 flex items-center hover:text-slate-800">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          返回
        </button>
        <h1 className="text-xl font-bold">{reportTitle}</h1>
      </header>
      
      {generatingReport ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
           <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
           <p>AI 正在分析您的数据...</p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 prose prose-slate prose-sm max-w-none">
           {reportContent ? (
             <div className="whitespace-pre-wrap leading-relaxed text-slate-700">
              {reportContent}
             </div>
           ) : (
             <p className="text-center text-slate-400">暂无报告内容</p>
           )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100 p-4 md:p-8">
       {view === 'dashboard' && renderDashboard()}
       {view === 'calendar' && renderCalendar()}
       {view === 'report' && renderReport()}
    </div>
  );
};

export default App;