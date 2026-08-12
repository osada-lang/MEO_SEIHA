import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Updating database settings for 合同会社THANX CREATE...');

  const shopId = 'thanx-create-uuid';

  // 1. Update Shop general fields (custom_review_prompt, reply_active, google_drive_folder_id, google_location_id, email)
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      email: 'thanxcreate@gmail.com',
      reply_active: true,
      google_drive_folder_id: '1AIgemm9-fvP-eLwP7p2p8Plja1mbOJtX',
      google_location_id: 'locations/3018418038085555463',
      custom_review_prompt: '合同会社THANX CREATEのカスタマーサポートとして、極めて真摯にお詫びしてください。店舗様の売上向上に本気で伴走する企業として、サービス改善へ向けて早急に対応する熱い誠意を伝えてください。',
    },
  });

  // 2. Upsert ShopKeywords
  await prisma.shopKeywords.upsert({
    where: { shop_id: shopId },
    update: {
      main_keywords: JSON.stringify(['名古屋 MEO', 'MEO対策', 'Googleマップ集客', 'ローカルSEO', 'THANX CREATE']),
      sub_keywords: JSON.stringify(['口コミ対策', 'GBP運用', 'マップ順位', '集客効果', '名古屋マーケティング', '店舗集客', '自動投稿', 'SNS連動', '口コミ返信', 'AI作成']),
      fixed_footer: '店舗名: 合同会社THANX CREATE\n住所: 愛知県名古屋市中区栄1-23-29\nWeb: https://thanx-create.com',
      custom_prompt: '親しみやすく誠実なトーンで。中小企業の店舗オーナー様に向けて、Web集客やMEO対策の有益なコツや店舗様の魅力について、専門家としての信頼感を持って発信してください。',
      hp_url: 'https://thanx-create.com',
      tabelog_url: 'https://tabelog.com/aichi/A2301/A230103/23080000/',
      hotpepper_url: 'https://www.hotpepper.jp/strJ000000000/',
      gurunavi_url: 'https://r.gnavi.co.jp/g000000/',
      gbp_action_url: 'https://thanx-create.com/lp-meo',
      draft_posts: null,
    },
    create: {
      shop_id: shopId,
      main_keywords: JSON.stringify(['名古屋 MEO', 'MEO対策', 'Googleマップ集客', 'ローカルSEO', 'THANX CREATE']),
      sub_keywords: JSON.stringify(['口コミ対策', 'GBP運用', 'マップ順位', '集客効果', '名古屋マーケティング', '店舗集客', '自動投稿', 'SNS連動', '口コミ返信', 'AI作成']),
      fixed_footer: '店舗名: 合同会社THANX CREATE\n住所: 愛知県名古屋市中区栄1-23-29\nWeb: https://thanx-create.com',
      custom_prompt: '親しみやすく誠実なトーンで。中小企業の店舗オーナー様に向けて、Web集客やMEO対策の有益なコツや店舗様の魅力について、専門家としての信頼感を持って発信してください。',
      hp_url: 'https://thanx-create.com',
      tabelog_url: 'https://tabelog.com/aichi/A2301/A230103/23080000/',
      hotpepper_url: 'https://www.hotpepper.jp/strJ000000000/',
      gurunavi_url: 'https://r.gnavi.co.jp/g000000/',
      gbp_action_url: 'https://thanx-create.com/lp-meo',
      draft_posts: null,
    },
  });

  console.log('✅ Successfully configured all settings for 合同会社THANX CREATE inside the database!');
}

main()
  .catch((e) => {
    console.error('❌ Failed to update settings:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
