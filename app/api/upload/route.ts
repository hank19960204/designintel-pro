import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
  try {
    const { fileBase64, fileName, mimeType } = await req.json();

    if (!fileBase64 || !fileName) {
      return NextResponse.json({ error: '缺少 fileBase64 或 fileName' }, { status: 400 });
    }

    // 解析 Service Account JSON
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      return NextResponse.json({ error: '未設定 GOOGLE_SERVICE_ACCOUNT_JSON' }, { status: 500 });
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // base64 → Buffer → Readable Stream
    const buffer = Buffer.from(fileBase64, 'base64');
    const stream = Readable.from(buffer);

    const uploadedFile = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.DRIVE_FOLDER_ID as string],
      },
      media: {
        mimeType: mimeType || 'image/jpeg',
        body: stream,
      },
      fields: 'id,webViewLink,webContentLink',
    });

    const fileId = uploadedFile.data.id!;

    // 設定公開讀取權限，讓圖片可在前端 <img> 直接顯示
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    // 使用可直接嵌入的縮圖 URL
    const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

    return NextResponse.json({
      fileId,
      directUrl,
      webViewLink: uploadedFile.data.webViewLink,
    });
  } catch (error: any) {
    console.error('[upload]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
