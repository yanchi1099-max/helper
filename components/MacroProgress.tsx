import React from 'react';
import { DailyLog, DEFAULT_GOALS, MacroGoals } from '../types';

interface Props {
  log: DailyLog;
  goals?: MacroGoals;
}

const MacroProgress: React.FC<Props> = ({ log, goals = DEFAULT_GOALS }) => {
  // 1. Calculate Totals
  const total = log.meals.reduce((acc, meal) => {
    meal.items.forEach(item => {
      acc.calories += item.calories;
      acc.protein += item.protein;
      acc.carbs += item.carbs;
      acc.fat += item.fat;
      acc.oil += item.addedOilCalories;
    });
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, oil: 0 });

  // 2. Calculate Targets in Grams
  const targetCalories = goals.calories;
  const targetProtein = goals.protein; // ~75g
  // Calculate Gram targets based on Percentage Goals
  const targetCarbs = Math.round((targetCalories * goals.carbsPercentage) / 4);
  const targetFat = Math.round((targetCalories * goals.fatPercentage) / 9);

  // 3. Carb Energy Ratio Calculation
  const currentCarbCalories = total.carbs * 4;
  const currentCarbRatio = total.calories > 0 ? (currentCarbCalories / total.calories) * 100 : 0;
  const isCarbRatioGood = currentCarbRatio >= 50;

  // Helper for progress bar width
  const getPercent = (val: number, target: number) => Math.min(100, Math.max(0, (val / target) * 100));

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-6">
      {/* Header with separate Carb Ratio display */}
      <div className="flex justify-between items-end mb-5">
        <h2 className="text-lg font-bold text-slate-800">今日营养达标度</h2>
        <div className="text-right">
           <span className="text-xs font-medium text-slate-500 block mb-1">碳水供能比</span>
           <div className={`text-xl font-bold leading-none ${isCarbRatioGood ? 'text-emerald-600' : 'text-amber-500'}`}>
             {Math.round(currentCarbRatio)}%
             <span className="text-xs font-normal text-slate-400 ml-1">/ 目标 &gt;50%</span>
           </div>
        </div>
      </div>
      
      <div className="space-y-5">
        {/* Calories */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-slate-700">总热量 (kcal)</span>
            <span className="text-slate-900 font-bold">{Math.round(total.calories)} <span className="text-slate-400 font-normal">/ {targetCalories}</span></span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${total.calories > targetCalories ? 'bg-red-500' : 'bg-emerald-500'}`} 
              style={{ width: `${getPercent(total.calories, targetCalories)}%` }}
            />
          </div>
        </div>

        {/* Protein */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-slate-700">蛋白质 (g)</span>
            <span className="text-slate-900 font-bold">{Math.round(total.protein)} <span className="text-slate-400 font-normal">/ {targetProtein}g</span></span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            {/* Blue for Protein */}
            <div 
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${getPercent(total.protein, targetProtein)}%` }}
            />
          </div>
        </div>

        {/* Carbs */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-slate-700">碳水化合物 (g)</span>
            <span className="text-slate-900 font-bold">{Math.round(total.carbs)} <span className="text-slate-400 font-normal">/ {targetCarbs}g</span></span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
             {/* Amber for Carbs */}
            <div 
              className="h-full rounded-full bg-amber-400 transition-all duration-500"
              style={{ width: `${getPercent(total.carbs, targetCarbs)}%` }}
            />
          </div>
        </div>

        {/* Fat */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-slate-700 flex items-center gap-2">
              脂肪 (g) 
              {total.oil > 0 && (
                <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                  额外油 {Math.round(total.oil)} kcal
                </span>
              )}
            </span>
            <span className="text-slate-900 font-bold">{Math.round(total.fat)} <span className="text-slate-400 font-normal">/ {targetFat}g</span></span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
             {/* Indigo for Fat */}
            <div 
              className="h-full rounded-full bg-indigo-400 transition-all duration-500"
              style={{ width: `${getPercent(total.fat, targetFat)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MacroProgress;