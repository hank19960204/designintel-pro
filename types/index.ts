export interface Competitor {
  id: string;       // Notion Page ID
  name: string;     // 型號
  brand: string;    // 品牌
  image: string;    // 圖片 URL
  specs: Record<string, string>;
}

export interface AiInsights {
  targetName: string;
  targetBrand: string;
  pros: { text: string; reasoning: string; source: string }[];
  cons: { text: string; reasoning: string; source: string }[];
  redOcean: { label: string; val: string }[];
  blueOcean: { title: string; desc: string }[];
}
