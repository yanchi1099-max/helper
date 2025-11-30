import React, { useState } from 'react';
import { DailyLog, MacroGoals } from '../types';
import { getMealRecommendation } from '../services/geminiService';

interface Props {
  currentLog: DailyLog;
  goals: MacroGoals;
}

const DecisionMaker: React.FC<Props> = ({ currentLog, goals }) => {
  const [optionsInput, setOptionsInput] = useState('');
  const [mealType, setMealType] = useState('午餐'); // Default Chinese
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ recommendation: string; reasoning: string; suggestedPortions: string } | null>(null);

  const handleDecide = async () => {
    if (!optionsInput.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const options = optionsInput.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
      const res = await getMealRecommendation(options, currentLog, goals, mealType);
      setResult(res);
    } catch (e) {
      alert("获取推荐失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-100 mb-8">
      <h3 className="text-lg font-bold text-indigo-900 mb-2 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0 1 1 0 002 0zm-1 8a1 1 0 01-1-1v-2a1 1 0 011-1h.01a1 1 0 011 1v2a1 1 0 01-1 1H10z" clipRule="evenodd" />
        </svg>
        纠结症拯救者 (AI 推荐)
      </h3>
      <p className="text-sm text-indigo-700 mb-4">
        输入 3-4 个选项（例如：牛肉饭，冷面，粉丝汤），AI 将计算完美分量以达成您的今日目标。
      </p>
      
      <div className="flex gap-2 mb-3">
         <select 
          value={mealType} 
          onChange={(e) => setMealType(e.target.value)}
          className="p-2 rounded border border-indigo-200 text-sm bg-white"
        >
          <option value="早餐">早餐</option>
          <option value="午餐">午餐</option>
          <option value="晚餐">晚餐</option>
          <option value="加餐">加餐</option>
        </select>
        <input 
          type="text" 
          value={optionsInput}
          onChange={(e) => setOptionsInput(e.target.value)}
          placeholder="选项A, 选项B, 选项C..."
          className="flex-1 p-2 rounded border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      
      <button 
        onClick={handleDecide}
        disabled={loading}
        className="w-full py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {loading ? '正在分析...' : '帮我选'}
      </button>

      {result && (
        <div className="mt-4 bg-white p-4 rounded-lg shadow-sm border border-indigo-100 animate-fade-in">
          <div className="flex items-start">
            <div className="bg-green-100 text-green-800 p-2 rounded-full mr-3 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-lg text-slate-800">{result.recommendation}</h4>
              <p className="text-indigo-600 font-medium my-1">{result.suggestedPortions}</p>
              <p className="text-sm text-slate-500 italic">"{result.reasoning}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DecisionMaker;