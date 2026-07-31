import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import stream from 'stream';
import { google } from 'googleapis';
import { prisma } from './services/db';
import { ReviewHandlerService, ReviewEvent } from './services/review-handler';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for frontend on port 5173 (Vite default)
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Helper to get Google Auth Client
function getGoogleAuthClient() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectURI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientID || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, redirectURI);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// In-memory fallback mock drive files for when Google Drive credentials are not set up
interface MockFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
}

let mockDriveFiles: MockFile[] = [
  { id: 'mock-img-001', name: 'shop_exterior_day.jpg', mimeType: 'image/jpeg', size: '2.4 MB', createdTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'mock-img-002', name: 'interior_seating_vibe.jpg', mimeType: 'image/jpeg', size: '1.8 MB', createdTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'mock-img-003', name: 'seasonal_menu_board.png', mimeType: 'image/png', size: '3.1 MB', createdTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'mock-img-004', name: 'premium_cut_beef.jpg', mimeType: 'image/jpeg', size: '4.2 MB', createdTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'mock-img-005', name: 'happy_staff_greeting.jpg', mimeType: 'image/jpeg', size: '2.1 MB', createdTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
];

// Initialize ReviewHandlerService
const reviewHandler = new ReviewHandlerService();

// ==========================================
// 🔑 Auth Endpoints
// ==========================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  try {
    const shop = await prisma.shop.findUnique({
      where: { email },
    });

    if (!shop || shop.password !== password) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません。' });
    }

    // In a real app we would sign a JWT. Here we return a simple simulated token.
    const token = `simulated_token_${shop.id}_${rememberMe ? 'long' : 'short'}`;

    return res.json({
      token,
      shop: {
        id: shop.id,
        name: shop.name,
        email: shop.email,
        role: shop.role,
        google_location_id: shop.google_location_id,
        google_drive_folder_id: shop.google_drive_folder_id,
        line_user_id: shop.line_user_id,
        reply_active: shop.reply_active,
        custom_review_prompt: shop.custom_review_prompt,
        gyron_report_url: shop.gyron_report_url,
      }
    });
  } catch (error: any) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ error: 'サーバー内でエラーが発生しました。' });
  }
});

// GET /api/auth/me (Get profile from token)
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証トークンがありません。' });
  }

  const token = authHeader.split(' ')[1];
  const parts = token.split('_');
  if (parts.length < 3 || parts[0] !== 'simulated' || parts[1] !== 'token') {
    return res.status(401).json({ error: '無効な認証トークンです。' });
  }

  const shopId = parts.slice(2, -1).join('_'); // Reconstruct ID if it contains underscores

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    return res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        email: shop.email,
        role: shop.role,
        google_location_id: shop.google_location_id,
        google_drive_folder_id: shop.google_drive_folder_id,
        line_user_id: shop.line_user_id,
        reply_active: shop.reply_active,
        custom_review_prompt: shop.custom_review_prompt,
        gyron_report_url: shop.gyron_report_url,
      }
    });
  } catch (error) {
    console.error('❌ Auth validation error:', error);
    return res.status(500).json({ error: 'サーバー内でエラーが発生しました。' });
  }
});

// ==========================================
// 📊 Dashboard & Settings Endpoints
// ==========================================

// GET /api/shops/:shopId/dashboard
app.get('/api/shops/:shopId/dashboard', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        keywords: true,
        review_logs: true,
      }
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    // Determine photo stock count
    let imageCount = mockDriveFiles.length;
    const auth = getGoogleAuthClient();
    if (auth) {
      try {
        const drive = google.drive({ version: 'v3', auth });
        const driveRes = await drive.files.list({
          q: `parents in '${shop.google_drive_folder_id || 'root'}' and (mimeType = 'image/jpeg' or mimeType = 'image/png')`,
          fields: 'files(id)',
        });
        if (driveRes.data.files) {
          imageCount = driveRes.data.files.length;
        }
      } catch (e) {
        console.log('⚠️ Failed to fetch live Drive images for dashboard, using fallback count.');
      }
    }

    // Determine Posting Mode
    let postingMode = 'TEXT_ONLY';
    let postingModeLabel = '画像ストック0枚: テキストのみ投稿モード';
    if (imageCount >= 10) {
      postingMode = 'ALWAYS_IMAGE';
      postingModeLabel = '画像ストック10枚以上: 画像連続投稿モード';
    } else if (imageCount >= 1) {
      postingMode = 'ALTERNATING';
      postingModeLabel = `画像ストック${imageCount}枚（1〜9枚）: 交互投稿モード (画像とテキストを日替わり)`;
    }

    // Count pending bad reviews (Requires alert & not replied)
    const pendingReviewsCount = await prisma.reviewLogs.count({
      where: {
        shop_id: shopId,
        star_rating: { lte: 2 },
        is_auto_replied: false,
      }
    });

    // Dummy preview image (use the first mock file or some sample image)
    const previewImage = imageCount > 0 ? '/assets/mock-preview.jpg' : null;

    return res.json({
      shopName: shop.name,
      replyActive: shop.reply_active,
      imageCount,
      postingMode,
      postingModeLabel,
      pendingReviewsCount,
      nextPostTime: '本日 12:00 予定',
      previewImage,
      gyronReportUrl: shop.gyron_report_url,
      googleLocationId: shop.google_location_id,
    });
  } catch (error) {
    console.error('❌ Dashboard fetch error:', error);
    return res.status(500).json({ error: 'ダッシュボードの取得に失敗しました。' });
  }
});

// POST /api/shops/:shopId/toggle-reply
app.post('/api/shops/:shopId/toggle-reply', async (req, res) => {
  const { shopId } = req.params;
  const { active } = req.body;

  try {
    const updated = await prisma.shop.update({
      where: { id: shopId },
      data: { reply_active: active },
    });

    return res.json({ success: true, replyActive: updated.reply_active });
  } catch (error) {
    console.error('❌ Toggle reply error:', error);
    return res.status(500).json({ error: '自動返信の切り替えに失敗しました。' });
  }
});

// GET /api/shops/:shopId/settings
app.get('/api/shops/:shopId/settings', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        keywords: true,
        templates: true,
      }
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    const mainKeywords = shop.keywords ? JSON.parse(shop.keywords.main_keywords) : [];
    const subKeywords = shop.keywords ? JSON.parse(shop.keywords.sub_keywords) : [];

    const star3Templates = shop.templates ? JSON.parse(shop.templates.templates_star3) : [];
    const star4Templates = shop.templates ? JSON.parse(shop.templates.templates_star4) : [];
    const star5Templates = shop.templates ? JSON.parse(shop.templates.templates_star5) : [];

    return res.json({
      shopId: shop.id,
      shopName: shop.name,
      customReviewPrompt: shop.custom_review_prompt || '',
      gyronReportUrl: shop.gyron_report_url || '',
      keywords: {
        mainKeywords,
        subKeywords,
        fixedFooter: shop.keywords?.fixed_footer || '',
        customPrompt: shop.keywords?.custom_prompt || '',
      },
      templates: {
        star3: star3Templates,
        star4: star4Templates,
        star5: star5Templates,
      }
    });
  } catch (error) {
    console.error('❌ Settings fetch error:', error);
    return res.status(500).json({ error: '設定情報の取得に失敗しました。' });
  }
});

// POST /api/shops/:shopId/settings
app.post('/api/shops/:shopId/settings', async (req, res) => {
  const { shopId } = req.params;
  const { customReviewPrompt, gyronReportUrl, keywords, templates } = req.body;

  try {
    // 1. Update Shop Profile details
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        custom_review_prompt: customReviewPrompt,
        gyron_report_url: gyronReportUrl,
      }
    });

    // 2. Update/Upsert Keywords
    if (keywords) {
      const mainKeywordsStr = JSON.stringify(keywords.mainKeywords || []);
      const subKeywordsStr = JSON.stringify(keywords.subKeywords || []);

      await prisma.shopKeywords.upsert({
        where: { shop_id: shopId },
        update: {
          main_keywords: mainKeywordsStr,
          sub_keywords: subKeywordsStr,
          fixed_footer: keywords.fixedFooter,
          custom_prompt: keywords.customPrompt,
        },
        create: {
          shop_id: shopId,
          main_keywords: mainKeywordsStr,
          sub_keywords: subKeywordsStr,
          fixed_footer: keywords.fixedFooter,
          custom_prompt: keywords.customPrompt,
        }
      });
    }

    // 3. Update/Upsert ReplyTemplates
    if (templates) {
      await prisma.replyTemplates.upsert({
        where: { shop_id: shopId },
        update: {
          templates_star3: JSON.stringify(templates.star3 || []),
          templates_star4: JSON.stringify(templates.star4 || []),
          templates_star5: JSON.stringify(templates.star5 || []),
        },
        create: {
          shop_id: shopId,
          templates_star3: JSON.stringify(templates.star3 || []),
          templates_star4: JSON.stringify(templates.star4 || []),
          templates_star5: JSON.stringify(templates.star5 || []),
        }
      });
    }

    return res.json({ success: true, message: '設定を正常に保存しました。' });
  } catch (error) {
    console.error('❌ Settings save error:', error);
    return res.status(500).json({ error: '設定の保存に失敗しました。' });
  }
});

// ==========================================
// 📁 Google Drive API Endpoints
// ==========================================

// GET /api/shops/:shopId/drive-images
app.get('/api/shops/:shopId/drive-images', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    // If Google Drive API is not active, return the mock files list
    if (!auth) {
      console.log('ℹ️ Google Drive Credentials not configured. Returning local mock image list.');
      return res.json({ files: mockDriveFiles, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    const folderId = shop.google_drive_folder_id || 'root';

    console.log(`📂 Scanning Google Drive folder: ${folderId}...`);
    const driveRes = await drive.files.list({
      q: `parents in '${folderId}' and (mimeType = 'image/jpeg' or mimeType = 'image/png') and trashed = false`,
      pageSize: 30,
      fields: 'files(id, name, mimeType, size, createdTime)',
    });

    const files = (driveRes.data.files || []).map((file) => {
      const sizeBytes = parseInt(file.size || '0', 10);
      const sizeMB = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '不明';
      return {
        id: file.id || '',
        name: file.name || '無題の写真',
        mimeType: file.mimeType || 'image/jpeg',
        size: sizeMB,
        createdTime: file.createdTime || new Date().toISOString(),
      };
    });

    return res.json({ files, isMock: false });
  } catch (error: any) {
    console.error('❌ Failed to fetch Google Drive files:', error.message || error);
    // Graceful fallback to mock images so client never crashes
    return res.json({ files: mockDriveFiles, isMock: true, error: 'Google Drive接続エラーのため、モック画像を表示しています。' });
  }
});

// POST /api/shops/:shopId/drive-images/upload (Upload raw base64 photo directly into Google Drive)
app.post('/api/shops/:shopId/drive-images/upload', async (req, res) => {
  const { shopId } = req.params;
  const { fileName, mimeType, base64Data } = req.body;

  if (!fileName || !mimeType || !base64Data) {
    return res.status(400).json({ error: '画像アップロードに必要なデータが不足しています。' });
  }

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    // Safe base64 binary decoding
    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (!auth) {
      // Simulate mock upload
      const newMockFile: MockFile = {
        id: `mock-img-${Date.now()}`,
        name: fileName,
        mimeType: mimeType,
        size: `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB`,
        createdTime: new Date().toISOString(),
      };
      mockDriveFiles.unshift(newMockFile);
      console.log(`🟢 [モックアップロード成功] ${fileName} がストックに追加されました。`);
      return res.json({ success: true, file: newMockFile, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    const folderId = shop.google_drive_folder_id || 'root';

    // Upload Stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    console.log(`🔄 Uploading file ${fileName} directly into Drive folder: ${folderId}...`);
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: bufferStream,
      },
      fields: 'id, name, mimeType, size, createdTime',
    });

    const file = uploadRes.data;
    const sizeBytes = parseInt(file.size || '0', 10);
    const sizeMB = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '不明';

    return res.json({
      success: true,
      isMock: false,
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: sizeMB,
        createdTime: file.createdTime,
      }
    });
  } catch (error: any) {
    console.error('❌ Image upload error:', error.message || error);
    return res.status(500).json({ error: 'Google Driveへの画像アップロードに失敗しました。' });
  }
});

// DELETE /api/shops/:shopId/drive-images/:fileId
app.delete('/api/shops/:shopId/drive-images/:fileId', async (req, res) => {
  const { shopId, fileId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    if (!auth || fileId.startsWith('mock-')) {
      // Simulate mock deletion
      mockDriveFiles = mockDriveFiles.filter((f) => f.id !== fileId);
      console.log(`🟢 [モック削除成功] ID: ${fileId} がストックから削除されました。`);
      return res.json({ success: true, fileId, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    console.log(`🗑️ Deleting file with ID: ${fileId} from Google Drive...`);
    await drive.files.delete({ fileId });

    return res.json({ success: true, fileId, isMock: false });
  } catch (error: any) {
    console.error('❌ Image deletion error:', error.message || error);
    return res.status(500).json({ error: 'Google Driveからの画像削除に失敗しました。' });
  }
});

// ==========================================
// 📬 Review Log & AI Reply Operations
// ==========================================

// GET /api/shops/:shopId/reviews
app.get('/api/shops/:shopId/reviews', async (req, res) => {
  const { shopId } = req.params;

  try {
    const reviews = await prisma.reviewLogs.findMany({
      where: { shop_id: shopId },
      orderBy: { create_time: 'desc' },
    });

    return res.json({ reviews });
  } catch (error) {
    console.error('❌ Review logs fetch error:', error);
    return res.status(500).json({ error: '口コミ履歴の取得に失敗しました。' });
  }
});

// POST /api/shops/:shopId/reviews/:reviewId/reply (Send/Approve Reply)
app.post('/api/shops/:shopId/reviews/:reviewId/reply', async (req, res) => {
  const { shopId, reviewId } = req.params;
  const { replyText } = req.body;

  if (!replyText || replyText.trim() === '') {
    return res.status(400).json({ error: '返信文を入力してください。' });
  }

  try {
    const review = await prisma.reviewLogs.findUnique({ where: { review_id: reviewId } });
    if (!review) {
      return res.status(404).json({ error: '口コミ情報が見つかりませんでした。' });
    }

    // Update DB status to represent reply sent
    const updated = await prisma.reviewLogs.update({
      where: { review_id: reviewId },
      data: {
        reply_text: replyText,
        is_auto_replied: true, // Marked as replied
      }
    });

    console.log(`🟢 [返信送信成功] 口コミ: ${reviewId} に対して、以下の返信を送信しました：`);
    console.log(`"${replyText}"`);

    return res.json({ success: true, review: updated });
  } catch (error) {
    console.error('❌ Reply send error:', error);
    return res.status(500).json({ error: '返信の送信に失敗しました。' });
  }
});

// POST /api/shops/:shopId/reviews/:reviewId/regenerate-reply (Regenerate AI apology with custom directive)
app.post('/api/shops/:shopId/reviews/:reviewId/regenerate-reply', async (req, res) => {
  const { shopId, reviewId } = req.params;
  const { directive } = req.body;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    const review = await prisma.reviewLogs.findUnique({ where: { review_id: reviewId } });
    if (!review) {
      return res.status(404).json({ error: '口コミが見つかりませんでした。' });
    }

    console.log(`🔄 [AIお詫び文再生成] 口コミ: ${reviewId} | 指示: "${directive || '標準指示'}"`);

    // Call Gemini review handler helper
    const newReplyText = await reviewHandler.generateCustomApologyDraft(
      { starRating: review.star_rating, comment: review.comment },
      shop.name,
      shop.custom_review_prompt || undefined,
      directive
    );

    // Save/update in database so it is persistent!
    const updated = await prisma.reviewLogs.update({
      where: { review_id: reviewId },
      data: {
        reply_text: newReplyText,
      }
    });

    return res.json({
      success: true,
      replyText: newReplyText,
      review: updated,
    });
  } catch (error: any) {
    console.error('❌ AI reply regeneration failed:', error);
    return res.status(500).json({ error: error.message || 'AI返信文の再生成に失敗しました。' });
  }
});

// POST /api/shops/:shopId/test-line-alert (LINE Notification Test Simulation)
app.post('/api/shops/:shopId/test-line-alert', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    // Mock low-star review event
    const testReview: ReviewEvent = {
      reviewId: `test-rev-${Date.now()}`,
      reviewerName: 'テスト店主太郎',
      starRating: 1,
      comment: '自動LINE通知の送信テストです。お诧び文が届くか確認してください。',
      createTime: new Date().toISOString(),
    };

    // Use our custom ReviewHandlerService to generate an apology draft with custom review prompt
    console.log(`🤖 Triggering simulated LINE notification alert for shop: ${shop.name}...`);
    const result = await reviewHandler.handleNewReview(testReview, shop.name, shop.custom_review_prompt || undefined);

    // Save this test review to the database so they can edit it in the UI!
    await prisma.reviewLogs.create({
      data: {
        shop_id: shopId,
        review_id: testReview.reviewId,
        reviewer_name: testReview.reviewerName,
        star_rating: testReview.starRating,
        comment: testReview.comment,
        reply_text: result.replyText,
        is_auto_replied: false,
        requires_alert: true,
        escalation_triggered: true,
        create_time: new Date(testReview.createTime),
      }
    });

    return res.json({
      success: true,
      message: '店主のLINEへ緊急アラートテスト通知を送信し、保留中の下書きをデータベースに追加しました！',
      reviewId: testReview.reviewId,
      aiDraft: result.replyText,
    });
  } catch (error: any) {
    console.error('❌ Test LINE alert error:', error);
    return res.status(500).json({ error: error.message || 'LINEテスト通知の送信に失敗しました。' });
  }
});

// Start express server
app.listen(port, () => {
  console.log(`\n================================================================================`);
  console.log(`🚀 MEO SEIHA - Express API Server running on: http://localhost:${port}`);
  console.log(`📅 Started on: ${new Date().toLocaleString()}`);
  console.log(`================================================================================\n`);
});
