import { GoogleGenAI, Type } from "@google/genai";
import { DailyLog, MacroGoals, Ingredient, Meal } from "../types";

// Helper to safely get AI client
const getAIClient = () => {
  let apiKey = '';

  // 1. Try standard process.env (Node.js / Webpack / CRA)
  try {
    if (typeof process !== 'undefined' && process.env) {
      apiKey = process.env.API_KEY || process.env.REACT_APP_API_KEY || '';
    }
  } catch (e) {}

  // 2. Try Vite / Modern ES Build (import.meta.env)
  if (!apiKey) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        apiKey = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || '';
      }
    } catch (e) {}
  }
  
  if (!apiKey) {
    throw new Error(
      "未检测到 API Key。\n\n" +
      "1. **本地运行**: 请在 .env 文件中添加 `API_KEY=您的密钥` (或 `VITE_API_KEY=...` 如果使用 Vite)。\n" +
      "2. **Vercel/Netlify 部署**: 请在项目设置 (Settings) > Environment Variables 中添加变量 `API_KEY` (或 `VITE_API_KEY`)。"
    );
  }
  return new GoogleGenAI({ apiKey });
};

// Parse natural language food entry (text + optional image) into structured data
export const parseFoodEntry = async (
  description: string,
  imageBase64?: string
): Promise<{ items: Ingredient[]; cookingAnalysis: string }> => {
  try {
    const ai = getAIClient();
    const parts: any[] = [];
    
    // Add Image part if exists
    if (imageBase64) {
      // Remove data URL prefix if present to get raw base64
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      });
    }

    // Add Text Prompt
    const promptText = `
      请分析这份食物记录（${description ? `描述: "${description}"` : '仅图片'}）。
      将其拆解为具体的食材清单。请务必使用**熟重**（Cooked Weight）估算。
      关键点：
      1. 请根据烹饪方式（如炒、炸会增加油，蒸、煮则不会）单独估算“addedOilCalories”（额外添加的油脂热量）。
      2. 如果肉类自带脂肪，计入 'fat'，但 'addedOilCalories' 仅用于烹饪用的油/脂。
      3. 如果用户说"把A换成B"，请只返回B的食材信息，忽略A。
      
      请以 JSON 格式返回，所有名称（name）和分析（cookingAnalysis）必须使用**简体中文**。
    `;
    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "食材名称 (中文)" },
                  weight: { type: Type.NUMBER, description: "预估熟重 (克)" },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fat: { type: Type.NUMBER },
                  addedOilCalories: { type: Type.NUMBER, description: "仅计算额外烹饪用油的热量" },
                  notes: { type: Type.STRING }
                },
                required: ["name", "weight", "calories", "protein", "carbs", "fat", "addedOilCalories"]
              }
            },
            cookingAnalysis: { type: Type.STRING, description: "简短的油脂估算说明 (中文)" }
          },
          required: ["items", "cookingAnalysis"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    // Add IDs
    const itemsWithIds = result.items?.map((item: any) => ({
      ...item,
      id: Math.random().toString(36).substr(2, 9)
    })) || [];

    return { items: itemsWithIds, cookingAnalysis: result.cookingAnalysis || "无额外烹饪说明" };
  } catch (error: any) {
    console.error("Error parsing food:", error);
    // Propagate the specific error message (e.g. "Missing API Key")
    throw new Error(error.message || "分析食物失败，请重试。");
  }
};

// Decision Helper
export const getMealRecommendation = async (
  options: string[],
  currentLog: DailyLog,
  goals: MacroGoals,
  mealType: string
): Promise<{ recommendation: string; reasoning: string; suggestedPortions: string }> => {
  const currentCals = currentLog.meals.reduce((acc, m) => acc + m.items.reduce((iAcc, i) => iAcc + i.calories, 0), 0);
  const currentProtein = currentLog.meals.reduce((acc, m) => acc + m.items.reduce((iAcc, i) => iAcc + i.protein, 0), 0);
  
  const remainingCals = goals.calories - currentCals;
  const remainingProtein = goals.protein - currentProtein;

  const prompt = `
    用户背景:
    - 每日目标: ${goals.calories} kcal, ${goals.protein}g 蛋白质。
    - 目前已摄入: ${Math.round(currentCals)} kcal, ${Math.round(currentProtein)}g 蛋白质。
    - 剩余预算: ${Math.round(remainingCals)} kcal, ${Math.round(remainingProtein)}g 蛋白质。
    - 待选餐别: ${mealType}。
    
    用户非常纠结，提供了以下选项: ${options.join(", ")}。
    
    任务:
    1. 选择**最适合**达成剩余目标（特别是蛋白质上限控制在80g左右，碳水供能 > 50%）的选项。
    2. 提供所选餐食的**精确克重建议**（熟重），以完美填补剩余热量缺口。
    3. 如果用户已经吃了晚餐但还不够，或者午餐吃多了晚餐需要少吃，请据此调整。
    
    请用**简体中文**回答。
  `;

  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Use Pro for better reasoning
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { type: Type.STRING, description: "推荐的菜品名称" },
            suggestedPortions: { type: Type.STRING, description: "例如：'牛肉 80g, 米饭 200g'" },
            reasoning: { type: Type.STRING, description: "推荐理由及营养分析" }
          }
        }
      }
    });
    
    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    console.error("Error recommending meal:", error);
    throw new Error(error.message || "获取推荐失败");
  }
};

// Generate Daily Report
export const generateDailyReport = async (log: DailyLog): Promise<string> => {
  const summary = {
    date: log.date,
    meals: log.meals.map(m => ({
      name: m.name,
      items: m.items.map(i => `${i.name} (${i.weight}g, 油脂: ${i.addedOilCalories})`).join(', ')
    })),
    totalCals: log.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.calories, 0), 0),
    totalOil: log.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.addedOilCalories, 0), 0),
  };

  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `基于今日摄入生成一份简短犀利的营养点评: ${JSON.stringify(summary)}。
      
      请包含:
      1. **达标情况**: 热量是否超标？蛋白质够吗？
      2. **油脂侦探**: 指出哪些菜“偷偷加了油”，今日额外油脂摄入是否过多？
      3. **明日建议**: 基于今天的表现，明天应该注意什么？
      
      格式：Markdown，简体中文。`,
    });
    return response.text || "生成报告失败";
  } catch (error: any) {
    return `生成报告失败: ${error.message}`;
  }
};

// Generate Weekly Report (Supports Type: 'nutrition' | 'fat_loss')
export const generateWeeklyReport = async (logs: DailyLog[], type: 'nutrition' | 'fat_loss'): Promise<string> => {
  const dataSummary = logs.map(l => ({
    date: l.date,
    calories: l.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.calories, 0), 0),
    protein: l.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.protein, 0), 0),
    carbs: l.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.carbs, 0), 0),
    fat: l.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.fat, 0), 0),
    addedOil: l.meals.reduce((acc, m) => acc + m.items.reduce((s, i) => s + i.addedOilCalories, 0), 0),
    weight: l.metrics.weight,
    waist: l.metrics.waist,
    foodList: l.meals.flatMap(m => m.items.map(i => i.name)).slice(0, 5) // Sample foods
  }));

  const promptMap = {
    nutrition: `基于过去一周的数据生成一份**营养均衡分析报告**。
      重点分析: 
      1. 三大营养素比例趋势（碳水是否>50%？）。
      2. 食物多样性（根据菜名判断）。
      3. 隐形油脂摄入警告。
      4. 饮食规律性。`,
    fat_loss: `基于过去一周的数据生成一份**减脂进度报告**。
      重点分析:
      1. 热量缺口与体重/腰围变化的关联。
      2. 找出“破功日”：哪天热量炸了？是因为吃了什么（如高油外卖）？
      3. 蛋白质是否足以在大热量缺口下保护肌肉？
      4. 下周减脂策略调整。`
  };

  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `${promptMap[type]}
      数据 JSON: ${JSON.stringify(dataSummary)}。
      
      请使用 Markdown 格式，语气专业且贴心，使用简体中文。`,
    });
    return response.text || "无法生成报告。";
  } catch (error: any) {
    return `生成报告失败: ${error.message}`;
  }
};