import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { rawText } = await req.json();
    if (!rawText) {
      return NextResponse.json({ error: '缺少 rawText' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
你是一位工業設備規格解析專家。請從以下非結構化規格文字中，萃取出所有規格參數。

【規格原文】
${rawText}

【輸出規則】
1. 嚴格只回傳 JSON，不得有任何前言、後記或 Markdown 包裹
2. 格式必須為：{"specs": {"規格名稱": "數值+單位"}}
3. 規格名稱用繁體中文，數值保留原始單位
4. 若有多個選項，用 " / " 分隔

範例輸出：
{"specs":{"處理器":"Snapdragon 660 2.2GHz","電池容量":"7000 mAh","防護等級":"IP67 / 1.8m"}}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // 移除可能的 markdown code fence
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('[ai/analyze]', error);
    return NextResponse.json(
      { error: 'AI 解析失敗，請確認 GEMINI_API_KEY 及輸入格式' },
      { status: 500 }
    );
  }
}
