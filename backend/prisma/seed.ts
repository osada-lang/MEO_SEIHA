import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding (safe mode)...');

  // Check if admin shop exists
  const adminExists = await prisma.shop.findUnique({
    where: { id: 'admin-seiha-uuid' }
  });

  if (!adminExists) {
    await prisma.shop.create({
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
        post_active: false,
        custom_review_prompt: null,
      },
    });
    console.log('👮 Created Admin User.');
  }



  // 🛡️ Safe Onboarding for 7 New Stores starting on October 1st, 2026.
  // Auto-post and auto-reply are initialized to false (OFF).
  // Created_at date is set to 2026-10-01 to automatically treat all pre-Oct 1 reviews as pre-integration.
  const newShops = [
    {
      id: 'shop-popcorn-kobe-uuid',
      name: 'POPCORN KOBE',
      email: 'wpk.bridalheart@gmail.com',
      password: 'Tt7bjXvj',
      google_location_id: 'locations/1219616691544149006',
      google_drive_folder_id: '1Ci6uryEE4gdorOETHZhZuJWl58etKGnT',
      agency_name: 'アンビション',
      fixed_footer: '店舗名: POPCORN KOBE\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/85Ab5SVeyPrUquxc9',
      custom_prompt: 'POPCORN KOBEの魅力（ブライダル、特別な思い出、真心の込もったサービス）を温かくアピールしてください。',
      main_keywords: ['神戸 ブライダル', 'POPCORN KOBE', 'ウェディングドレス 神戸'],
      sub_keywords: ['オーダーメイドドレス', 'ブライダルヘアメイク', '神戸フォトウェディング']
    },
    {
      id: 'shop-meister-nisshin-uuid',
      name: '住宅のマイスター 日進・名東店',
      email: 's.miya0204@gmail.com',
      password: 'TLdfm69u',
      google_location_id: 'locations/5050499115385309928',
      google_drive_folder_id: '13UtM5tjITiG9ZXBT9lZ2myHbxcntLIuW',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: 住宅のマイスター 日進・名東店\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/9VB2U8rCcBBReia79',
      custom_prompt: '住宅のマイスター 日進・名東店の魅力（住宅購入、リフォーム、親身な相談対応、専門的なアドバイス）を誠実にお伝えください。',
      main_keywords: ['日進 注文住宅', '名東区 リフォーム', '住宅のマイスター'],
      sub_keywords: ['マイホーム相談', '日進市工務店', '名東区リノベーション']
    },
    {
      id: 'shop-ohashi-boxing-uuid',
      name: '名古屋 大橋ボクシングジム',
      email: 'hiromasa0084@gmail.com',
      password: 'b8b2xQ69',
      google_location_id: 'locations/8807503763015787818',
      google_drive_folder_id: '15K3AxvdBGdAb5MUSFwrJDQCfpHmn3V0v',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: 名古屋 大橋ボクシングジム\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/s8ahCpGjsgxpRGjp6',
      custom_prompt: '名古屋 大橋ボクシングジム of the hood, 魅力（本格ボクシング指導、フィットネス、ダイエット、初心者歓迎、プロ育成、楽しいトレーニング環境）を情熱的かつ誠実にお伝えください。',
      main_keywords: ['名古屋 ボクシングジム', '大橋ボクシングジム', '名古屋 フィットネス'],
      sub_keywords: ['ボクササイズ 名古屋', '初心者ボクシング', '大橋ジム']
    },
    {
      id: 'shop-temomi-syokunin-uuid',
      name: '手もみ職人',
      email: 'temomisyokunin@gmail.com',
      password: 'r5WRXqv5',
      google_location_id: 'locations/12580023881507801184',
      google_drive_folder_id: '1ip77vkBF7KHW_bmko0JPKSso6SOqRDKQ',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: 手もみ職人\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/q3AmYsw1rgnXfy689',
      custom_prompt: '手もみ職人の魅力（丁寧な全身もみほぐし、疲労回復、リラックス、熟練の技術）を心地よいトーンでアピールしてください。',
      main_keywords: ['もみほぐし マッサージ', '手もみ職人', '肩こり 腰痛改善'],
      sub_keywords: ['全身マッサージ', 'リラクゼーションサロン', '足つぼマッサージ']
    },
    {
      id: 'shop-temomi-tai-uuid',
      name: 'タイ古式マッサージ 手もみ職人',
      email: 'temomisyokunin.tai@gmail.com',
      password: 'Hu9ANEda',
      google_location_id: 'locations/6177300236073184531',
      google_drive_folder_id: '1EBwp-bfweG1WdPnBb34TLzUfJ7O7C898',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: タイ古式マッサージ 手もみ職人\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/b8YmkZGzVAZsbALm6',
      custom_prompt: 'タイ古式マッサージ 手もみ職人の魅力（本格タイ古式、ストレッチ、全身のエネルギー調整、極上のリラクゼーション）を温かく紹介してください。',
      main_keywords: ['タイ古式マッサージ', '手もみ職人 タイ古式', 'ストレッチ マッサージ'],
      sub_keywords: ['アロママッサージ', 'タイマッサージおすすめ', 'ヘッドスパ']
    },
    {
      id: 'shop-nekonote-uuid',
      name: '骨格矯正サロン猫の手',
      email: 'nekonotekyousei@gmail.com',
      password: 'dV4C77nN',
      google_location_id: 'locations/12923198125578533565',
      google_drive_folder_id: '1CbQV70WX-qCSk8VAvK71SJE421THvsPz',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: 骨格矯正サロン猫の手\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/XoeqfycNzpVJS56q6',
      custom_prompt: '骨格矯正サロン猫の手の魅力（骨盤矯正、猫背改善、姿勢矯正、丁寧なカウンセリング、痛みの少ない安心な骨格調整）を上品かつ優しくアピールしてください。',
      main_keywords: ['骨格矯正 骨盤矯正', 'サロン猫の手', '猫背 姿勢改善'],
      sub_keywords: ['小顔矯正', '肩幅矯正', '産後骨盤調整']
    },
    {
      id: 'shop-isshin-uuid',
      name: '姿勢矯正処 一心 いっしん',
      email: 'biwayoshihumi@gmail.com',
      password: 'x72HxG4A',
      google_location_id: 'locations/13417193665189155817',
      google_drive_folder_id: '1s3Z80Do1rLg2TUwkMTUCAjMqpX3WpKkc',
      agency_name: 'THANXCREATE',
      fixed_footer: '店舗名: 姿勢矯正処 一心 いっしん\nご予約・お問い合わせはお気軽にどうぞ！',
      map_url: 'https://maps.app.goo.gl/nrUQ4zpQwBtWKKJ59',
      custom_prompt: '姿勢矯正処 一心 いっしんの魅力（本格姿勢矯正、脊椎調整、根本からの体質改善、独自の技術アプローチ）を伝統と格式のある誠実なトーンでお伝えください。',
      main_keywords: ['姿勢矯正 整体', '一心 いっしん', '腰痛 肩こり根本改善'],
      sub_keywords: ['骨格調整 整体処', '頭痛眼精疲労', '姿勢バランス矯正']
    }
  ];

  // Default Templates for New Shops Onboarding
  const defaultStar3 = [
    'ご来店および貴重なご意見をいただきありがとうございます。ご指摘いただいた点を真摯に受け止め、今後のサービス向上に役立ててまいります。',
    'この度はご来店いただきありがとうございました。至らない点があったことをお詫びするとともに、スタッフ一同、よりご満足いただけるお店づくりに努めてまいります。',
    'ご感想をお寄せいただきありがとうございます。いただいたご意見を店舗全体で共有し、改善を重ね要領よく対応してまいります。またのご来店をお待ちしております。',
    'ご来店ありがとうございました。お褒めいただいた点も、ご指摘いただいた点も大変参考になります。今後ともよろしくお願いいたします。',
    'ご意見ありがとうございます。次回ご来店の際には、より良いサービスを提供できるよう、スタッフ教育や設備改善に取り組んでまいります。'
  ];
  const defaultStar4 = [
    'この度はご来店いただき、また高評価をありがとうございます！ご満足いただけて大変嬉しく思います。またのお越しを心よりお待ちしております。',
    'お忙しい中、嬉しい口コミをご投稿いただき誠にありがとうございます。これからも素敵なお時間を提供できるよう、努力を続けてまいります。',
    'ご来店および素晴らしい評価をありがとうございます。お食事やお店の雰囲いを楽しんでいただけて何よりです。次回のご来店もお待ちしております。',
    '大変嬉しいお声をいただき、スタッフ一同の励みになります！次回はさらにご満足いただけるよう、心を込めておもてなしいたします。',
    'ご投稿ありがとうございます！高評価をいただき感謝申し上げます。今後とも変わらぬご愛顧 of the hood, よろしくお願い申し上げます。'
  ];
  const defaultStar5 = [
    'この度は最高評価をいただき、誠にありがとうございます！本当に嬉しいお言葉を励みに、これからも最上のサービスを追求してまいります。',
    'ご来店いただき、またお褒めの言葉をいただき大変光栄です！また次回も「来てよかった」と思っていただけるよう、全力を尽くします。',
    '素晴らしい評価をありがとうございます！当店での時間が素敵な思い出となったのであれば幸いです。またのご来店を心よりお待ちしております！',
    'スタッフ全員が笑顔になる最高の口コミをありがとうございます！いただいたエネルギーを糧に, 次回も完璧な施術・サービスを提供します。',
    'ご来店ありがとうございました！星5つの満点評価をいただき感謝の極みです。これからもお客様に愛され続けるお店を目指して頑張ります！'
  ];

  for (const ns of newShops) {
    const shopExists = await prisma.shop.findUnique({ where: { email: ns.email } });
    if (!shopExists) {
      console.log(`✨ Seeding live "${ns.name}" OWNER account for the first time...`);
      await prisma.shop.create({
        data: {
          id: ns.id,
          name: ns.name,
          email: ns.email,
          password: ns.password,
          role: 'OWNER',
          agency_name: ns.agency_name,
          google_location_id: ns.google_location_id,
          google_drive_folder_id: ns.google_drive_folder_id,
          line_user_id: null,
          reply_active: false,
          post_active: false,
          custom_review_prompt: ns.custom_prompt + ' 不満のお言葉には真摯にお詫びし、迅速にサービスや運営の改善へ取り組む誠意を伝えてください。',
          created_at: new Date('2026-10-01T00:00:00+09:00'), // Treated as Oct 1, 2026!
        }
      });

      await prisma.shopKeywords.create({
        data: {
          shop_id: ns.id,
          main_keywords: JSON.stringify(ns.main_keywords),
          sub_keywords: JSON.stringify(ns.sub_keywords),
          fixed_footer: ns.fixed_footer,
          custom_prompt: ns.custom_prompt,
          hp_url: ns.map_url,
          tabelog_url: '',
          hotpepper_url: '',
          gurunavi_url: '',
          gbp_action_url: ns.map_url,
          post_time_hour: 12,
        }
      });

      await prisma.replyTemplates.create({
        data: {
          shop_id: ns.id,
          templates_star3: JSON.stringify(defaultStar3),
          templates_star4: JSON.stringify(defaultStar4),
          templates_star5: JSON.stringify(defaultStar5),
        }
      });
      console.log(`✅ Live "${ns.name}" has been successfully seeded!`);
    }
  }

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
