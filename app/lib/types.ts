export type MealType = "breakfast" | "lunch" | "dinner";
export type AnalysisStatus = "pending" | "analyzing" | "draft" | "confirmed" | "failed";

export type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
  authProvider: "demo" | "guest" | "wechat";
};

export type AuthCapabilities = {
  guestEnabled: true;
  demoEnabled: boolean;
  wechatEnabled: boolean;
};

export type NutritionItem = {
  name: string;
  estimatedGrams: number;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: "high" | "medium" | "low";
};

export type NutritionResult = {
  items: NutritionItem[];
  totals: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
  };
  comment: string;
  caveat: string;
};

export type Meal = {
  id: string;
  mealDate: string;
  mealType: MealType;
  note: string;
  imageUrl: string;
  analysisStatus: AnalysisStatus;
  createdAt: string;
  author: User;
  analysis: (NutritionResult & { source: "openai" | "demo"; confirmed: boolean }) | null;
  canEdit: boolean;
};

export type Group = {
  id: string;
  name: string;
  role: "owner" | "member";
  inviteCode: string | null;
  inviteUrl?: string | null;
};

export type AppState = {
  user: User | null;
  group: Group | null;
  members: User[];
  meals: Meal[];
};
