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

// Enable robust CORS middleware for frontend deployments (Vercel, localhost, etc.)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

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
  dataUrl?: string;
}

let mockDriveFiles: MockFile[] = [];

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

    // Determine 3-day drafts
    let draftPostsArr = [];
    if (shop.keywords) {
      if (shop.keywords.draft_posts) {
        try {
          draftPostsArr = JSON.parse(shop.keywords.draft_posts);
        } catch (pErr) {
          console.error('❌ Failed to parse draft_posts JSON:', pErr);
        }
      }
      
      // If empty, auto-generate 3-day drafts using Gemini AI
      if (draftPostsArr.length === 0) {
        console.log(`🤖 First-time auto-generating 3-day drafts for shop: ${shop.name}`);
        try {
          const day0 = await generateSingleDraft(shop, 0);
          const day1 = await generateSingleDraft(shop, 1);
          const day2 = await generateSingleDraft(shop, 2);

          draftPostsArr = [
            { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords },
            { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords },
            { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords },
          ];

          // Save to database
          await prisma.shopKeywords.update({
            where: { shop_id: shopId },
            data: { draft_posts: JSON.stringify(draftPostsArr) },
          });
        } catch (genError) {
          console.error('❌ Failed to first-time generate drafts:', genError);
          // Fallback static drafts to avoid crashing Dashboard load
          draftPostsArr = [
            { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: `${shop.name}の本日のおしらせ下書きです。`, subKeywords: [] },
            { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: `${shop.name}の明日のおしらせ下書きです。`, subKeywords: [] },
            { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: `${shop.name}の明後日のおしらせ下書きです。`, subKeywords: [] },
          ];
        }
      }
    }

    // Dummy preview image (use the first mock file or some sample image)
    const previewImage = imageCount > 0 ? '/assets/mock-preview.jpg' : null;

    return res.json({
      shopName: shop.name,
      replyActive: shop.reply_active,
      imageCount,
      postingMode,
      postingModeLabel,
      pendingReviewsCount,
      nextPostTime: `本日 ${shop.keywords?.post_time_hour ?? 12}:00 予定`,
      previewImage,
      googleLocationId: shop.google_location_id,
      draftPosts: draftPostsArr,
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
      replyActive: shop.reply_active,
      customReviewPrompt: shop.custom_review_prompt || '',
      keywords: {
        mainKeywords,
        subKeywords,
        fixedFooter: shop.keywords?.fixed_footer || '',
        customPrompt: shop.keywords?.custom_prompt || '',
        hpUrl: shop.keywords?.hp_url || '',
        tabelogUrl: shop.keywords?.tabelog_url || '',
        hotpepperUrl: shop.keywords?.hotpepper_url || '',
        gurunaviUrl: shop.keywords?.gurunavi_url || '',
        gbpActionUrl: shop.keywords?.gbp_action_url || '',
        postTimeHour: shop.keywords?.post_time_hour ?? 12,
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
  const { replyActive, customReviewPrompt, keywords, templates } = req.body;

  try {
    // 1. Update Shop Profile details
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        custom_review_prompt: customReviewPrompt,
        reply_active: typeof replyActive === 'boolean' ? replyActive : true,
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
          hp_url: keywords.hpUrl,
          tabelog_url: keywords.tabelogUrl,
          hotpepper_url: keywords.hotpepperUrl,
          gurunavi_url: keywords.gurunaviUrl,
          gbp_action_url: keywords.gbpActionUrl,
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 12,
        },
        create: {
          shop_id: shopId,
          main_keywords: mainKeywordsStr,
          sub_keywords: subKeywordsStr,
          fixed_footer: keywords.fixedFooter,
          custom_prompt: keywords.customPrompt,
          hp_url: keywords.hpUrl,
          tabelog_url: keywords.tabelogUrl,
          hotpepper_url: keywords.hotpepperUrl,
          gurunavi_url: keywords.gurunaviUrl,
          gbp_action_url: keywords.gbpActionUrl,
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 12,
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
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const newMockFile: MockFile = {
        id: `mock-img-${Date.now()}`,
        name: fileName,
        mimeType: mimeType,
        size: `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB`,
        createdTime: new Date().toISOString(),
        dataUrl,
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
    // Graceful fallback to mock upload if Google Drive credentials or folder is invalid
    try {
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const newMockFile: MockFile = {
        id: `mock-img-${Date.now()}`,
        name: fileName,
        mimeType: mimeType,
        size: `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB`,
        createdTime: new Date().toISOString(),
        dataUrl,
      };
      mockDriveFiles.unshift(newMockFile);
      console.log(`🟢 [モックアップロード成功（フォールバック）] ${fileName} がストックに追加されました。`);
      return res.json({
        success: true,
        file: newMockFile,
        isMock: true,
        warning: 'Google DriveのフォルダIDまたは認証が無効なため、代わりにローカルストレージ（モック）に保存しました。'
      });
    } catch (fallbackError: any) {
      return res.status(500).json({ error: '画像のアップロードおよびフォールバック処理に失敗しました。' });
    }
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

    // If Google API credentials are set and reviewId starts with accounts/ (is a real Google review resource),
    // post the reply back to the real Google Business Profile platform!
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (clientID && clientSecret && refreshToken && reviewId.startsWith('accounts/')) {
      console.log(`📡 Sending manual review reply to Google Business Profile API for: ${reviewId}`);
      try {
        const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        await oauth2Client.request({
          url: `https://mybusiness.googleapis.com/v4/${reviewId}/reply`,
          method: 'PUT',
          data: {
            comment: replyText
          }
        });
        console.log(`✅ Successfully published reply to Google Business Profile API!`);
      } catch (gmbErr: any) {
        console.error(`⚠️ Failed to publish reply to Google Business Profile API:`, gmbErr.message || gmbErr);
      }
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

// Helper to generate a single day's MEO draft post using Gemini AI
async function generateSingleDraft(shop: any, dayIndex: number): Promise<{ text: string, subKeywords: string[] }> {
  const mainKeywords: string[] = JSON.parse(shop.keywords?.main_keywords || '[]');
  const subKeywords: string[] = JSON.parse(shop.keywords?.sub_keywords || '[]');
  const customPrompt = shop.keywords?.custom_prompt || '';
  const hpUrl = shop.keywords?.hp_url || '';

  // Choose 2 to 3 randomized sub-keywords from the pool to balance frequency and ensure randomness
  const selectedSubKeywords: string[] = [];
  if (subKeywords.length > 0) {
    const shuffled = [...subKeywords].sort(() => 0.5 - Math.random());
    const count = Math.floor(Math.random() * 2) + 2; // Randomly choose 2 or 3
    selectedSubKeywords.push(...shuffled.slice(0, Math.min(count, shuffled.length)));
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  // Get current date context in Japanese to naturally incorporate seasonal topics
  const todayJp = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const prompt = `
    あなたは店舗「${shop.name}」のオーナー代理として、Googleマップ（MEO）用の日替わり投稿テキスト（おしらせ/最新情報）を自動作成してください。

    【店舗情報】
    - 店舗名: ${shop.name}
    - ターゲット層へのアピール・トーンマナー: ${customPrompt || '親しみやすく誠実なトーン。'}
    - 今日の日付: ${todayJp}

    【作成の絶対ルール（厳守してください）】
    1. 毎回異なる構成・書き出し:
       直近の投稿や前後の下書きと、内容・書き出し（例：「こんにちは」「実は〜」など）・全体の構成が重複しないようにしてください。毎回バリエーション豊かでユニークな構成にしてください。
    2. メインキーワードの完全含有:
       指定されたメインキーワード [ ${mainKeywords.join(', ')} ] を、文章全体の自然な文脈にそって【すべて必ず】本文中に含めてください。単なるキーワードの羅列や強引な詰め込みは厳禁です。
    3. 本日のサブキーワード:
       本日の日替わりサブキーワード [ ${selectedSubKeywords.join(', ')} ] を、文章の中に自然に盛り込んでください。
    4. 宣伝的な「事実文」を必ず1文挿入:
       「誰が、どこで、何を提供しているか」を示す客観的・具体的な宣伝的事実文を、必ず本文の中に1文だけ織り込んでください。この事実文の言い回しやアプローチは毎回変えてください。
    5. 文字数と文章の質:
       本文は【150文字〜250文字程度】に収め、一般客が読んで「行ってみたい」「相談してみたい」と思える、親しみやすく自然な日本語で仕上げてください。
    6. 連絡先や署名情報の完全排除:
       本文の中には、ホームページURL、電話番号、アクションボタンの文言（「詳細はこちら」「今すぐ予約」など）、住所、会社名や店舗名のフッター署名などは【絶対に】含めないでください。（これらはシステム側でボタンとして登録されるため、テキスト内に記載すると重複して見苦しくなります）
    7. 記号・装飾の完全排除:
       絵文字、マークダウン（**、#、*など）、見出し、箇条書き、目立つ記号（■、★、◆、▲、【】など）は【一切】使わないでください。純粋な文章テキストのみで出力してください。
    8. 季節・時期の話題の自然な織り込み:
       今日の日付（${todayJp}）を踏まえ、現在の季節や時期に合う話題（夏、お盆、暑さ対策など）を自然に入れられる場合は織り込んでください（無理に詰め込む必要はありません）。

    返される内容は自動作成した完成本文のみとし、説明、挨拶、マークダウン装飾（\`\`\`など）は一切含めないでください。`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const generatedText = response.text().trim().replace(/```/g, '');

  return {
    text: generatedText,
    subKeywords: selectedSubKeywords,
  };
}

// POST /api/shops/:shopId/draft-posts
// Save edited drafts back to database
app.post('/api/shops/:shopId/draft-posts', async (req, res) => {
  const { shopId } = req.params;
  const { drafts } = req.body; // Expect array of 3 draft objects

  try {
    await prisma.shopKeywords.update({
      where: { shop_id: shopId },
      data: {
        draft_posts: JSON.stringify(drafts),
      }
    });

    return res.json({ success: true, message: '下書きを保存しました。' });
  } catch (error: any) {
    console.error('❌ Draft posts save error:', error);
    return res.status(500).json({ error: error.message || '下書きの保存に失敗しました。' });
  }
});

// POST /api/shops/:shopId/draft-posts/regenerate
// Regenerate specific day's draft or all three drafts using Gemini AI
app.post('/api/shops/:shopId/draft-posts/regenerate', async (req, res) => {
  const { shopId } = req.params;
  const { dayIndex, all } = req.body; // Expect dayIndex (0,1,2) or all (boolean)

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { keywords: true }
    });

    if (!shop || !shop.keywords) {
      return res.status(404).json({ error: '店舗情報、またはキーワード設定が見つかりませんでした。' });
    }

    let draftPostsArr = [];
    if (shop.keywords.draft_posts) {
      draftPostsArr = JSON.parse(shop.keywords.draft_posts);
    }

    if (all) {
      // Regenerate all 3 days
      const day0 = await generateSingleDraft(shop, 0);
      const day1 = await generateSingleDraft(shop, 1);
      const day2 = await generateSingleDraft(shop, 2);

      draftPostsArr = [
        { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords },
        { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords },
        { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords },
      ];
    } else {
      // Regenerate single day's draft
      const targetIndex = typeof dayIndex === 'number' ? dayIndex : 0;
      const regenerated = await generateSingleDraft(shop, targetIndex);

      const defaultTitles = [
        '今日投稿予定の下書き (Day 0)',
        '明日投稿予定の下書き (Day 1)',
        '明後日投稿予定の下書き (Day 2)'
      ];

      // Replace or insert
      const existingIdx = draftPostsArr.findIndex((d: any) => d.dayIndex === targetIndex);
      const draftObj = {
        dayIndex: targetIndex,
        title: defaultTitles[targetIndex] || `下書き (Day ${targetIndex})`,
        text: regenerated.text,
        subKeywords: regenerated.subKeywords,
      };

      if (existingIdx !== -1) {
        draftPostsArr[existingIdx] = draftObj;
      } else {
        draftPostsArr.push(draftObj);
      }
    }

    // Sort to ensure correct order
    draftPostsArr.sort((a: any, b: any) => a.dayIndex - b.dayIndex);

    // Save to database
    await prisma.shopKeywords.update({
      where: { shop_id: shopId },
      data: {
        draft_posts: JSON.stringify(draftPostsArr),
      }
    });

    return res.json({ success: true, drafts: draftPostsArr });
  } catch (error: any) {
    console.error('❌ Draft regenerate error:', error);
    return res.status(500).json({ error: error.message || 'AI下書きの再生成に失敗しました。' });
  }
});

// Helper to run daily post publication and draft sliding / generation
async function executeDailyPostRollover(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { keywords: true },
  });

  if (!shop) {
    throw new Error('店舗が見つかりませんでした。');
  }

  let draftPostsArr = [];
  if (shop.keywords && shop.keywords.draft_posts) {
    try {
      draftPostsArr = JSON.parse(shop.keywords.draft_posts);
    } catch (err) {
      console.error('❌ Failed to parse drafts:', err);
    }
  }

  if (draftPostsArr.length === 0) {
    throw new Error('下書きが存在しないため、自動生成処理を実行できません。先にダッシュボードで初期下書きを作成してください。');
  }

  // 1. The post being published today (Day 0)
  const publishedPost = draftPostsArr[0];

  // Perform actual posting to Google Business Profile API if location is set and token is set
  let gbpPublished = false;
  let gbpResponse = null;

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const locationId = shop.google_location_id || (shop.keywords && shop.keywords.gbp_action_url);

  if (clientID && clientSecret && refreshToken && locationId && locationId.startsWith('accounts/')) {
    console.log(`📡 Attempting real GBP post creation for location: ${locationId}`);
    try {
      const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      // Post to GMB v4 LocalPosts API
      const response = await oauth2Client.request({
        url: `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
        method: 'POST',
        data: {
          languageCode: 'ja-JP',
          summary: publishedPost.text,
          topicType: 'STANDARD',
        }
      });

      gbpPublished = true;
      gbpResponse = response.data;
      console.log('✅ Successfully published real post to Google Business Profile!');
    } catch (gbpError: any) {
      console.error('⚠️ Real GBP publishing failed:', gbpError.message || gbpError);
    }
  }

  // 2. Perform the roll-over (Slide)
  const nextDay0 = {
    dayIndex: 0,
    title: '今日投稿予定の下書き (Day 0)',
    text: draftPostsArr[1].text,
    subKeywords: draftPostsArr[1].subKeywords,
  };

  const nextDay1 = {
    dayIndex: 1,
    title: '明日投稿予定の下書き (Day 1)',
    text: draftPostsArr[2].text,
    subKeywords: draftPostsArr[2].subKeywords,
  };

  // 3. Generate a brand new Day 2 draft using Gemini AI!
  const newDay2Raw = await generateSingleDraft(shop, 2);
  const nextDay2 = {
    dayIndex: 2,
    title: '明後日投稿予定の下書き (Day 2)',
    text: newDay2Raw.text,
    subKeywords: newDay2Raw.subKeywords,
  };

  const newDrafts = [nextDay0, nextDay1, nextDay2];

  // Save back to database
  await prisma.shopKeywords.update({
    where: { shop_id: shopId },
    data: {
      draft_posts: JSON.stringify(newDrafts)
    }
  });

  return {
    publishedPost,
    gbpPublished,
    gbpResponse,
    newDrafts,
  };
}

// POST /api/shops/:shopId/batch/run-daily-post
// Simulates or runs the daily batch rollover:
// 1. Publishes Day 0 draft (mocked/simulated or real GBP if connected)
// 2. Slides drafts: Day 1 -> Day 0, Day 2 -> Day 1
// 3. Generates a new Day 2 draft using Gemini AI
app.post('/api/shops/:shopId/batch/run-daily-post', async (req, res) => {
  const { shopId } = req.params;

  try {
    const result = await executeDailyPostRollover(shopId);

    return res.json({
      success: true,
      message: '自動投稿およびスライド生成処理が正常に完了しました！',
      publishedPost: {
        text: result.publishedPost.text,
        subKeywords: result.publishedPost.subKeywords,
        simulated: !result.gbpPublished,
        gbpResponse: result.gbpResponse,
      },
      newDrafts: result.newDrafts,
    });

  } catch (error: any) {
    console.error('❌ Daily post rollover error:', error);
    return res.status(500).json({ error: error.message || '自動生成バッチ処理の実行に失敗しました。' });
  }
});

// In-memory set to prevent double posting in the same hour
const alreadyPostedToday = new Set<string>();

// ==============================================================================
// ⏱️ Background Automated Scheduler (Hourly execution check)
// ==============================================================================
async function runBackgroundScheduler() {
  console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Running MEO SEIHA background scheduler cycle...`);

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const googleAuthAvailable = !!(clientID && clientSecret && refreshToken);

  try {
    const shops = await prisma.shop.findMany({
      include: { keywords: true, templates: true },
    });

    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split('T')[0]; // e.g. "2026-08-11"

    for (const shop of shops) {
      // 1. Check for Daily Automated Posting
      if (shop.keywords) {
        const postTimeHour = shop.keywords.post_time_hour ?? 12; // Default is 12 (Noon)

        // If current hour matches the store's configured posting hour
        if (currentHour === postTimeHour) {
          const memoryKey = `${shop.id}_${todayStr}`;
          if (!alreadyPostedToday.has(memoryKey)) {
            console.log(`⏱️ Daily post triggered for store: "${shop.name}" at ${postTimeHour}:00 (Current Hour: ${currentHour})`);
            alreadyPostedToday.add(memoryKey);

            try {
              await executeDailyPostRollover(shop.id);
              console.log(`✅ Automatically completed daily post & slide for store: "${shop.name}"`);
            } catch (postErr: any) {
              console.error(`❌ Background daily post failed for store "${shop.name}":`, postErr.message || postErr);
            }
          }
        }
      }

      // 2. Check and Fetch New Google Reviews for Auto-Replies
      if (googleAuthAvailable && shop.google_location_id && shop.google_location_id.startsWith('accounts/')) {
        console.log(`📡 Background fetching new GBP reviews for store: "${shop.name}"...`);
        try {
          const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
          oauth2Client.setCredentials({ refresh_token: refreshToken });

          // Fetch latest 10 reviews from Google My Business API
          const reviewsRes = await oauth2Client.request({
            url: `https://mybusiness.googleapis.com/v4/${shop.google_location_id}/reviews`,
            method: 'GET'
          });

          const gbpReviews = (reviewsRes.data as any).reviews || [];
          for (const gReview of gbpReviews) {
            const reviewId = gReview.name; // Full resource name e.g. "accounts/X/locations/Y/reviews/Z"
            const reviewerName = gReview.reviewer?.displayName || '匿名ユーザー';

            // Map GMB star rating string to number
            let starRating: 1 | 2 | 3 | 4 | 5 = 3;
            if (gReview.starRating === 'ONE') starRating = 1;
            else if (gReview.starRating === 'TWO') starRating = 2;
            else if (gReview.starRating === 'THREE') starRating = 3;
            else if (gReview.starRating === 'FOUR') starRating = 4;
            else if (gReview.starRating === 'FIVE') starRating = 5;

            const comment = gReview.comment || '';
            const createTime = gReview.createTime || new Date().toISOString();

            // Check if this review is already saved in our database
            const existing = await prisma.reviewLogs.findUnique({
              where: { review_id: reviewId }
            });

            if (!existing) {
              console.log(`🆕 Detected brand NEW review from Google for "${shop.name}": Rating=${starRating} | Reviewer="${reviewerName}"`);

              // Handle new review using ReviewHandlerService
              const handleResult = await reviewHandler.handleNewReview(
                {
                  reviewId,
                  reviewerName,
                  starRating: starRating as any,
                  comment,
                  createTime
                },
                shop.name,
                shop.custom_review_prompt || undefined
              );

              // Check if auto-reply toggle is active
              let finalReplyText = handleResult.replyText;
              let isAutoReplied = false;

              // If shop has reply_active enabled, we can automatically reply to Google
              if (shop.reply_active) {
                // If High Rating (3-5 stars), we automatically post the reply back to Google My Business API!
                if (starRating >= 3) {
                  console.log(`🤖 Auto-replying to high-rating review ${reviewId} with template...`);
                  try {
                    // Post reply to Google Business Profile API
                    await oauth2Client.request({
                      url: `https://mybusiness.googleapis.com/v4/${reviewId}/reply`,
                      method: 'PUT',
                      data: {
                        comment: finalReplyText
                      }
                    });
                    isAutoReplied = true;
                    console.log(`✅ Successfully published auto-reply to Google for review ${reviewId}`);
                  } catch (replyGmbErr: any) {
                    console.error(`⚠️ Failed to publish auto-reply to Google for review ${reviewId}:`, replyGmbErr.message || replyGmbErr);
                  }
                } else {
                  // Low Rating (1-2 stars) - Leave it as a draft for store owner's manual approval (with LINE alert already triggered)
                  console.log(`⚠️ Low-rating review ${reviewId} requires manual review & approval. Apology draft created & LINE alert sent.`);
                }
              }

              // Save the review to our local database
              await prisma.reviewLogs.create({
                data: {
                  shop_id: shop.id,
                  review_id: reviewId,
                  reviewer_name: reviewerName,
                  star_rating: starRating,
                  comment,
                  reply_text: finalReplyText,
                  is_auto_replied: isAutoReplied,
                  create_time: createTime,
                }
              });
            }
          }
        } catch (scErr: any) {
          console.error(`❌ Background review fetch failed for "${shop.name}":`, scErr.message || scErr);
        }
      }
    }
  } catch (err) {
    console.error('❌ Scheduler error:', err);
  }
}

// Clear memory cache of already posted shops at midnight
setInterval(() => {
  const currentHour = new Date().getHours();
  if (currentHour === 0) {
    alreadyPostedToday.clear();
    console.log('🧹 Cleared scheduler memory set for the new day.');
  }
}, 60 * 60 * 1000); // Check every hour

// Run background scheduler cycle every 15 minutes
const FIFTEEN_MINUTES = 15 * 60 * 1000;
setInterval(runBackgroundScheduler, FIFTEEN_MINUTES);

// Start express server
app.listen(port, () => {
  console.log(`\n================================================================================`);
  console.log(`🚀 MEO SEIHA - Express API Server running on: http://localhost:${port}`);
  console.log(`📅 Started on: ${new Date().toLocaleString()}`);
  console.log(`================================================================================\n`);

  // Run initial scheduler check immediately upon server startup
  setTimeout(() => {
    runBackgroundScheduler().catch(err => console.error('❌ Startup scheduler run failed:', err));
  }, 5000); // Wait 5 seconds after startup to let initialization settle
});
