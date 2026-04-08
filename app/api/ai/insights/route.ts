import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Competitor, AiInsights } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { target, competitors }: { target: Competitor; competitors: Competitor[] } =
      await req.json();

    if (!target || !competitors?.length) {
      return NextResponse.json({ error: '缺少 target 或 competitors' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const competitorsSummary = competitors
      .map(c => `【${c.brand} ${c.name}】\n${JSON.stringify(c.specs, null, 2)}`)
      .join('\n\n');

    const prompt = `
你是一位資深的工業設計策略顧問，專精 B2B 硬體設備市場分析。
請針對以下目標產品，與同市場競品進行深度分析，並嚴格以 JSON 格式輸出。

【分析目標】
品牌: ${target.brand}
型號: ${target.name}
規格: ${JSON.stringify(target.specs, null, 2)}

【市場競品資料】
${competitorsSummary}

【輸出格式規則】
1. 嚴格只回傳 JSON，不得有任何前言、後記或 Markdown 包裹
2. 嚴格按照以下結構：
{
  "pros": [
    { "text": "優勢標題", "reasoning": "具體分析說明", "source": "分析依據" }
  ],
  "cons": [
    { "text": "劣勢標題", "reasoning": "具體分析說明", "source": "分析依據" }
  ],
  "redOcean": [
    { "label": "規格維度名稱", "val": "市場標配描述" }
  ],
  "blueOcean": [
    { "title": "藍海機會標題", "desc": "具體策略描述" }
  ]
}
3. pros/cons 各提供 2~4 條，redOcean 提供 3~5 條，blueOcean 提供 2~3 條
4. 使用繁體中文，分析需具體且有洞察力，避免空泛說明
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const insights = JSON.parse(cleaned) as Omit<AiInsights, 'targetName' | 'targetBrand'>;

    return NextResponse.json({
      targetName: target.name,
      targetBrand: target.brand,
      ...insights,
    } as AiInsights);
  } catch (error: any) {
    console.error('[ai/insights]', error);
    return NextResponse.json(
      { error: 'AI 洞察生成失敗，請確認 GEMINI_API_KEY 及資料格式' },
      { status: 500 }
    );
  }
}
