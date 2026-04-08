import { NextRequest, NextResponse } from 'next/server';
import { notion, DATABASE_ID } from '@/lib/notion';
import { Competitor } from '@/types';

// ── GET: 讀取所有競品 ──────────────────────────────────────────────────
export async function GET() {
  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    });

    const competitors: Competitor[] = response.results.map((page: any) => {
      const props = page.properties;

      // 取出固定欄位
      const brand =
        props['Brand']?.rich_text?.[0]?.plain_text ||
        props['品牌']?.rich_text?.[0]?.plain_text || '';
      const name =
        props['Name']?.title?.[0]?.plain_text ||
        props['型號']?.title?.[0]?.plain_text || '';
      const image =
        props['Image']?.url ||
        props['圖片']?.url ||
        `https://picsum.photos/seed/${page.id}/200/200`;

      // 動態收集所有其他欄位作為 specs
      const FIXED_KEYS = new Set(['Brand', '品牌', 'Name', '型號', 'Image', '圖片']);
      const specs: Record<string, string> = {};

      Object.entries(props).forEach(([key, value]: [string, any]) => {
        if (FIXED_KEYS.has(key)) return;
        let text = '';
        if (value?.rich_text?.[0]?.plain_text) text = value.rich_text[0].plain_text;
        else if (value?.title?.[0]?.plain_text) text = value.title[0].plain_text;
        else if (value?.number !== undefined && value.number !== null)
          text = String(value.number);
        else if (value?.select?.name) text = value.select.name;
        if (text) specs[key] = text;
      });

      return { id: page.id, brand, name, image, specs };
    });

    return NextResponse.json({ competitors });
  } catch (error: any) {
    console.error('[notion GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: 新增競品 ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, name, image, specs } = body as Omit<Competitor, 'id'>;

    if (!brand || !name) {
      return NextResponse.json({ error: '品牌與型號為必填' }, { status: 400 });
    }

    const properties: any = {
      '型號': { title: [{ text: { content: name } }] },
      '品牌': { rich_text: [{ text: { content: brand } }] },
      '圖片': { url: image || null },
    };

    // 動態寫入規格欄位
    Object.entries(specs || {}).forEach(([key, value]) => {
      properties[key] = { rich_text: [{ text: { content: value } }] };
    });

    const page = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties,
    });

    return NextResponse.json({ id: page.id }, { status: 201 });
  } catch (error: any) {
    console.error('[notion POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── PATCH: 更新競品 ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, brand, name, image, specs } = body as Competitor;

    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    const properties: any = {};
    if (name) properties['型號'] = { title: [{ text: { content: name } }] };
    if (brand) properties['品牌'] = { rich_text: [{ text: { content: brand } }] };
    if (image) properties['圖片'] = { url: image };

    Object.entries(specs || {}).forEach(([key, value]) => {
      properties[key] = { rich_text: [{ text: { content: value } }] };
    });

    await notion.pages.update({ page_id: id, properties });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[notion PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── DELETE: 封存競品 ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    // Notion 不支援真正刪除，改為封存 (archived)
    await notion.pages.update({ page_id: id, archived: true });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[notion DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
