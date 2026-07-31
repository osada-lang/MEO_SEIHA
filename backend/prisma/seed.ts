import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing data
  await prisma.reviewLogs.deleteMany({});
  await prisma.replyTemplates.deleteMany({});
  await prisma.shopKeywords.deleteMany({});
  await prisma.shop.deleteMany({});

  console.log('🧹 Cleaned existing database tables.');

  // 1.5. Create Admin User (ADMIN)
  const adminShop = await prisma.shop.create({
    data: {
      id: 'admin-seiha-uuid',
      name: 'MEO SEIHAシステム管理運営本部',
      email: 'admin@meo-seiha.com',
      password: 'password',
      role: 'ADMIN',
      google_location_id: null,
      google_drive_folder_id: null,
      line_user_id: null,
      reply_active: false,
      custom_review_prompt: null,
      gyron_report_url: null,
    },
  });

  // 2. Create Shop: Avenir Hair (美容室)
  const shop1 = await prisma.shop.create({
    data: {
      id: 'avenir-hair-uuid',
      name: 'Avenir Hair 栄店',
      email: 'hair@example.com',
      password: 'password', // For prototype, simple raw password is fine
      role: 'OWNER',
      google_location_id: 'place_id_avenir_hair_123',
      google_drive_folder_id: 'drive_folder_avenir_hair_abc',
      line_user_id: process.env.LINE_USER_ID || 'U205e0595cff6e3882288962525941500',
      reply_active: true,
      custom_review_prompt: '美容室にふさわしい上品で落ち着いた言葉遣いで作成してください。お客様の髪の毛に触れるデリケートな施術を行う立場として、お客様のご不安や残念な気持ちに寄り添ってください。技術力と完全個室リラックス空間を誇るサロンとしての誠実さを持って、接客カウンセリング教育の徹底に努める姿勢をアピールしてください。',
      gyron_report_url: 'https://www.gyro-n.com/meo/sample/hair',
    },
  });

  // 3. Create Shop: 頑固一徹ラーメン (ラーメン店)
  const shop2 = await prisma.shop.create({
    data: {
      id: 'ganko-ramen-uuid',
      name: '頑固一徹ラーメン 駅前店',
      email: 'ramen@example.com',
      password: 'password',
      role: 'OWNER',
      google_location_id: 'place_id_ganko_ramen_456',
      google_drive_folder_id: 'drive_folder_ganko_ramen_def',
      line_user_id: process.env.LINE_USER_ID || 'U205e0595cff6e3882288962525941500',
      reply_active: true,
      custom_review_prompt: '元気で親しみやすく、かつ極めて誠意のある言葉遣いで作成してください。麺のコシ、スープの一滴にまで魂を込めるラーメン店として、味と接客サービスへの妥協なき職人魂を持ち、スープを一口飲んだ時の感動を再び提供できるよう厨房一同で早急に改善に努める熱い姿勢を伝えてください。',
      gyron_report_url: 'https://www.gyro-n.com/meo/sample/ramen',
    },
  });

  // 4. Create Shop: 合同会社THANX CREATE (一般・標準店)
  const shop3 = await prisma.shop.create({
    data: {
      id: 'thanx-create-uuid',
      name: '合同会社THANX CREATE',
      email: 'thanx@example.com',
      password: 'password',
      role: 'OWNER',
      google_location_id: 'place_id_thanx_create_789',
      google_drive_folder_id: 'drive_folder_thanx_create_ghi',
      line_user_id: process.env.LINE_USER_ID || 'U205e0595cff6e3882288962525941500',
      reply_active: true,
      custom_review_prompt: '', // No custom review prompt (Standard default)
      gyron_report_url: 'https://www.gyro-n.com/meo/sample/thanx',
    },
  });

  console.log('🏬 Created 3 Shops.');

  // 5. Create ShopKeywords for Avenir Hair
  await prisma.shopKeywords.create({
    data: {
      shop_id: shop1.id,
      main_keywords: JSON.stringify(['栄 美容室', '髪質改善', '縮毛矯正']),
      sub_keywords: JSON.stringify(['トリートメント', 'ヘアケア', '完全個室', 'プライベートサロン', 'マンツーマン']),
      fixed_footer: '店舗名: Avenir Hair 栄店\n住所: 名古屋市中区錦3丁目\n電話: 052-XXX-XXXX',
      custom_prompt: '上品で落ち着いたトーンで、髪質改善と艶髪へのこだわりを強調してください。',
    },
  });

  // 6. Create ShopKeywords for 頑固一徹ラーメン
  await prisma.shopKeywords.create({
    data: {
      shop_id: shop2.id,
      main_keywords: JSON.stringify(['名古屋 ラーメン', '濃厚豚骨', '自家製麺']),
      sub_keywords: JSON.stringify(['チャーシュー', '深夜営業', '極太麺', 'こだわりスープ', 'ランチ']),
      fixed_footer: '店舗名: 頑固一徹ラーメン 駅前店\n住所: 名古屋市中村区名駅\n営業時間: 11:00〜24:00',
      custom_prompt: '活気があり、食欲をそそるシズル感を重視したトーンで書いてください。',
    },
  });

  // 7. Create ShopKeywords for THANX CREATE
  await prisma.shopKeywords.create({
    data: {
      shop_id: shop3.id,
      main_keywords: JSON.stringify(['名古屋 MEO', 'MEO対策']),
      sub_keywords: JSON.stringify(['口コミ対策', 'GBP運用', 'マップ順位', '集客効果']),
      fixed_footer: '店舗名: 合同会社THANX CREATE\n住所: 名古屋市中区栄1丁目23-29',
      custom_prompt: '丁寧で自然なトーンで、MEO集客サポートの魅力を訴求してください。',
    },
  });

  console.log('🔑 Created ShopKeywords for all shops.');

  // 8. Create ReplyTemplates (5 static templates for star3, star4, star5)
  const defaultStar3 = [
    'ご来店および貴重なご意見をいただきありがとうございます。ご指摘いただいた点を真摯に受け止め、今後のサービス向上に役立ててまいります。',
    'この度はご来店いただきありがとうございました。至らない点があったことをお詫びするとともに、スタッフ一同、よりご満足いただけるお店づくりに努めてまいります。',
    'ご感想をお寄せいただきありがとうございます。いただいたご意見を店舗全体で共有し、改善を重ねてまいります。またのご来店をお待ちしております。',
    'ご来店ありがとうございました。お褒めいただいた点も、ご指摘いただいた点も大変参考になります。今後ともよろしくお願いいたします。',
    'ご意見ありがとうございます。次回ご来店の際には、より良いサービスを提供できるよう、スタッフ教育や設備改善に取り組んでまいります。'
  ];

  const defaultStar4 = [
    'この度はご来店いただき、また高評価をありがとうございます！ご満足いただけて大変嬉しく思います。またのお越しを心よりお待ちしております。',
    'お忙しい中、嬉しい口コミをご投稿いただき誠にありがとうございます。これからも素敵なお時間を提供できるよう、努力を続けてまいります。',
    'ご来店および素晴らしい評価をありがとうございます。お食事やお店の雰囲気を楽しんでいただけて何よりです。次回のご来店もお待ちしております。',
    '大変嬉しいお声をいただき、スタッフ一同の励みになります！次回はさらにご満足いただけるよう、心を込めておもてなしいたします。',
    'ご投稿ありがとうございます！高評価をいただき感謝申し上げます。今後とも変わらぬご愛顧のほど、よろしくお願い申し上げます。'
  ];

  const defaultStar5 = [
    'この度は最高評価をいただき、誠にありがとうございます！本当に嬉しいお言葉を励みに、これからも最上のサービスを追求してまいります。',
    'ご来店いただき、またお褒めの言葉をいただき大変光栄です！また次回も「来てよかった」と思っていただけるよう、全力を尽くします。',
    '素晴らしい評価をありがとうございます！当店での時間が素敵な思い出となったのであれば幸いです。またのご来店を心よりお待ちしております！',
    'スタッフ全員が笑顔になる最高の口コミをありがとうございます！いただいたエネルギーを糧に、次回も完璧な施術・サービスを提供します。',
    'ご来店ありがとうございました！星5つの満点評価をいただき感謝の極みです。これからもお客様に愛され続けるお店を目指して頑張ります！'
  ];

  for (const shopId of [shop1.id, shop2.id, shop3.id]) {
    await prisma.replyTemplates.create({
      data: {
        shop_id: shopId,
        templates_star3: JSON.stringify(defaultStar3),
        templates_star4: JSON.stringify(defaultStar4),
        templates_star5: JSON.stringify(defaultStar5),
      },
    });
  }

  console.log('📝 Seeded default static ReplyTemplates.');

  console.log('🟢 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
