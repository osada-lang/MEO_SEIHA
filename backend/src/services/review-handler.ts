import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@line/bot-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface ReviewEvent {
  reviewId: string;
  reviewerName: string;
  starRating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  createTime: string;
}

export interface ReviewResponseResult {
  reviewId: string;
  isAutoReplied: boolean;
  replyText: string;
  requiresAlert: boolean;
  escalationTriggered: boolean;
  reason: string;
}

export class ReviewHandlerService {
  private lineClient: Client | null = null;
  private genAI: GoogleGenerativeAI | null = null;

  // 星3〜5用の5パターンの自動返信定型文（AIコスト0円で高評価にランダム返信）
  private static staticTemplates = [
    '温かいお言葉をいただき、誠にありがとうございます！スタッフ一同、大変励みになります。またのご来店を心よりお待ちしております。',
    'ご来店と嬉しいご感想、ありがとうございます。当店のサービスにご満足いただけて大変嬉しく思います。今後ともよろしくお願いいたします！',
    'この度はご評価いただきありがとうございます。お客様に快適な時間を過ごしていただけるよう、これからもサービス向上に努めてまいります。',
    '嬉しいお声をいただきありがとうございます！今後もお客様に愛される店舗を目指してまいります。またのお越しを楽しみにしております。',
    '素敵なレビューを投稿していただき、感謝いたします。お客様のまたのご来店を、スタッフ一同心よりお待ち申し上げております。'
  ];

  constructor() {
    // Initialize LINE Client if key exists
    const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineSecret = process.env.LINE_CHANNEL_SECRET;
    if (lineAccessToken && lineSecret) {
      this.lineClient = new Client({
        channelAccessToken: lineAccessToken,
        channelSecret: lineSecret,
      });
    }

    // Initialize Gemini (using gemini-3.5-flash which we verified as active in 2026)
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(geminiApiKey);
    }
  }

  /**
   * 新着の口コミをハンドリングし、星の数に応じて自動返信またはAI下書き生成＆LINE通知を実行します。
   */
  public async handleNewReview(review: ReviewEvent, storeName: string, customPrompt?: string): Promise<ReviewResponseResult> {
    console.log(`\n📬 [新着口コミ検知] 店舗: 「${storeName}」 | 投稿者: ${review.reviewerName} | 星数: ★${review.starRating}`);
    console.log(`💬 コメント: "${review.comment || '(本文なし)'}"`);

    // --- 星3〜5（中・高評価）: ランダム定型文で即座に自動返信 ---
    if (review.starRating >= 3) {
      const randomIndex = Math.floor(Math.random() * ReviewHandlerService.staticTemplates.length);
      const replyText = ReviewHandlerService.staticTemplates[randomIndex];

      console.log(`🟢 星${review.starRating}判定: 事前登録済みの定型文[${randomIndex}]を自動選択しました（AIコスト0円）。`);
      console.log(`🤖 返信内容: "${replyText}"`);

      return {
        reviewId: review.reviewId,
        isAutoReplied: true,
        replyText,
        requiresAlert: false,
        escalationTriggered: false,
        reason: '高評価（★3〜5）のため、テンプレートから自動返信を即座に行いました。'
      };
    }

    // --- 星1〜2（低評価）: 自動返信は行わず、Geminiで謝罪文下書きを作成しLINEアラート送信 ---
    console.log(`⚠️ 星${review.starRating}判定（低評価）: 即時自動返信を「保留」にし、AI謝罪文下書きの生成を開始します。`);

    if (!this.genAI) {
      throw new Error('❌ Gemini API is not initialized. Check GEMINI_API_KEY in .env');
    }

    // 1. Geminiを使って不満に寄り添う丁寧な謝罪下書き文を自動生成
    const aiDraft = await this.generateApologyDraft(review, storeName, customPrompt);
    console.log(`🤖 AI謝罪下書き作成成功:\n------------------\n${aiDraft}\n------------------`);

    // 2. 店舗オーナーのLINEへ緊急プッシュアラートを送信
    const userId = process.env.LINE_USER_ID;
    if (this.lineClient && userId) {
      await this.sendLineAlert(userId, storeName, review, aiDraft);
    } else {
      console.log('ℹ️ LINE_USER_IDが未設定、またはLINEクライアントが未初期化のため、LINEアラート送信をスキップしました（ログのみ出力）。');
    }

    // 3. 多重バックアップ（運営・営業へのエスカレーションとメール送信）
    this.triggerBackupEscalations(storeName, review, aiDraft);

    return {
      reviewId: review.reviewId,
      isAutoReplied: false,
      replyText: aiDraft, // 謝罪文の下書きを結果として格納
      requiresAlert: true,
      escalationTriggered: true,
      reason: `低評価（★${review.starRating}）を検知。AI謝罪文の下書き作成、および店舗オーナーへの緊急LINE通知、メールバックアップ、放置アラート監視（12h）をセットしました。`
    };
  }

  /**
   * Geminiを使用して、丁寧で真摯な謝罪下書き文を自動生成します（制約事項遵守）
   */
  private async generateApologyDraft(review: ReviewEvent, storeName: string, customPrompt?: string): Promise<string> {
    const model = this.genAI!.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `
      あなたは店舗「${storeName}」のオーナー代理として、お客様から届いたGoogleマップ上の低評価口コミ（★${review.starRating}）に対して、返信用のお詫びメッセージ下書きを作成してください。

      【お客様からの口コミ内容】
      「${review.comment || '本文なし・低評価評価のみ'}」

      【お詫び文の生成ルール（厳守事項）】
      1. まず不快な思いをさせてしまったことを、オーナーとして深く、真摯に謝罪してください。
      2. お客様の不満点（口コミに書かれている内容）に具体的に触れ、共感し寄り添ってください。
      3. 今後の改善に向けた誠実な姿勢を述べてください。
      4. 記号（「！」や「？」など）や絵文字は、真面目な謝罪の場にそぐわないため、一切使用しないでください。すべて丁寧な日本語の句読点（「。」「、」）のみで文章を構成してください。
      5. 文字数は200文字以内に収めてください。
      6. 「${storeName} 店主」などの署名はシステムが自動で付与するため、生成文の最後には署名や店名を入れず、本文のみを作成してください。

      ${customPrompt ? `【店舗別の個別お詫び・返信指示】\n${customPrompt}\n上記の店舗個別指示（店舗特性、こだわり、返信でのアピール事項等）を十分に踏まえ、文脈に沿って謝罪文を作成してください。` : ''}
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error: any) {
      console.error('❌ Failed to generate apology draft with Gemini:', error);
      return 'この度は当店のご利用に際し、ご満足のいくサービスを提供できず、不快な思いをさせてしまいましたことを深くお詫び申し上げます。今後、このようなことがないようスタッフへの指導とサービスの改善に努めてまいります。';
    }
  }

  /**
   * 店舗オーナー宛てに、マジックリンクと下書き文付きの緊急LINEアラートをプッシュ送信します
   */
  private async sendLineAlert(userId: string, storeName: string, review: ReviewEvent, aiDraft: string): Promise<void> {
    if (!this.lineClient) return;

    // 店舗ごとに個別の確認・編集画面へジャンプする一時トークン（マジックリンク）の生成を模擬
    const magicLink = `http://localhost:3000/api/auth/magic-login?token=temp-mock-token-for-${review.reviewId}`;

    const messageText = `🔔【低評価口コミの緊急検知アラート】

「${storeName}」に★${review.starRating}の低評価口コミが投稿されました。お客様の不満を和らげるため、24時間以内の返信を推奨します。

👤 投稿者: ${review.reviewerName}様
💬 本文: "${review.comment || 'コメントなし'}"

━━━━━━━━━━━━━━━━
🤖 AIが自動作成した「お詫び文下書き」
━━━━━━━━━━━━━━━━
${aiDraft}

━━━━━━━━━━━━━━━━
👇 このまま送信、または編集して送信
━━━━━━━━━━━━━━━━
パスワードなしで管理画面に直行し、送信できるマジックリンクはこちら：
${magicLink}`;

    console.log(`✉️ Sending LINE alert to Owner [ID: ${userId}]...`);
    try {
      await this.lineClient.pushMessage(userId, {
        type: 'text',
        text: messageText
      });
      console.log('🟢 LINE alert sent successfully!');
    } catch (error) {
      console.error('❌ Failed to send LINE alert:', error);
    }
  }

  /**
   * 多重バックアップシステム（並行メール通知、および12時間放置時の自動アラート監視をモック再現）
   */
  private triggerBackupEscalations(storeName: string, review: ReviewEvent, aiDraft: string): void {
    console.log('\n🛡️ [多重バックアップ発動]');
    console.log(`  📧 【並行メール送信】: 運営宛てに「低評価口コミ検知＆対応お願いメール」を送信しました。`);
    console.log(`  ⏳ 【放置アラート監視】: 12時間対応タイマーを起動しました。12時間以内に返信が送信されない場合、担当営業宛てに緊急リマインドが自動配信されます。\n`);
  }
}
