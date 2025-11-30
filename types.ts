export interface Ingredient {
  id: string;
  name: string;
  weight: number; // cooked weight in grams
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  addedOilCalories: number; // Specific tracking for added fats/oils
  notes?: string;
}

export interface Meal {
  id: string;
  name: string; // "Breakfast", "Lunch", "Dinner", "Snack"
  timestamp: number;
  items: Ingredient[];
  cookingMethodNote?: string; // For AI to analyze oil
  isSkipped?: boolean;
}

export interface BodyMetrics {
  weight: number | null;
  waist: number | null; // cm
  thigh: number | null; // cm
  calf: number | null; // cm
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  meals: Meal[];
  metrics: BodyMetrics;
  dailyNotes?: string;
}

export interface MacroGoals {
  calories: number;
  protein: number; // grams
  carbsPercentage: number; // % of total cals
  fatPercentage: number; // % of total cals (remainder)
}

export const DEFAULT_GOALS: MacroGoals = {
  calories: 1350, // Average of 1300-1400
  protein: 75, // Target 75g (between 70-80)
  carbsPercentage: 0.55, // > 50%
  fatPercentage: 0.25, // Fill remainder roughly
};

// Fixed Breakfast Data
export const FIXED_BREAKFAST_ITEMS: Ingredient[] = [
  {
    id: 'fixed-egg',
    name: 'Boiled Egg',
    weight: 50,
    calories: 70,
    protein: 6,
    carbs: 0.6,
    fat: 5,
    addedOilCalories: 0,
    notes: 'Standard large egg'
  },
  {
    id: 'fixed-milk',
    name: 'Milk (Whole)',
    weight: 250,
    calories: 150,
    protein: 8,
    carbs: 12,
    fat: 8,
    addedOilCalories: 0,
    notes: '250ml'
  }
];
