// 步驟一：生成今日文案 + 圖片，圖片寫入 images/，並輸出 out/message.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, todayKey, config, generateDailyMindsetPost, createMindsetImage } from '../lib/core.mjs';

const imagesDir = path.join(ROOT, 'images');
const outDir = path.join(ROOT, 'out');

async function main() {
  if (config.allowedTargetIds.length === 0) {
    throw new Error('ALLOWED_LINE_TARGET_IDS is empty.');
  }
  if (!config.lineChannelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured.');
  }

  const post = await generateDailyMindsetPost();
  console.log('[generate] 今日主題:', post.sourceTopic?.title || post.title);

  const image = await createMindsetImage(post, imagesDir);
  console.log('[generate] 圖片已生成:', image.fileName);

  // 組出 raw.githubusercontent.com 公開網址
  const repo = process.env.GITHUB_REPOSITORY || 'PTgamingLife/ONLINETRIGGER';
  const branch = process.env.GITHUB_REF_NAME || 'main';
  const imageUrl = `https://raw.githubusercontent.com/${repo}/${branch}/images/${image.fileName}`;

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'message.json'),
    JSON.stringify({ date: todayKey(), imageUrl, fileName: image.fileName, targets: config.allowedTargetIds }, null, 2),
  );
  console.log('[generate] 完成，圖片網址:', imageUrl);
}

main().catch((err) => {
  console.error('[generate] 失敗:', err.message);
  process.exit(1);
});
