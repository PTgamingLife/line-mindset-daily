// 步驟三：等圖片 commit 上傳後，輪詢 raw 網址直到可讀，再推播到 LINE
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, config } from '../lib/core.mjs';

async function waitForUrl(url, maxMs = 120000, intervalMs = 5000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
      console.log(`[send] 圖片尚未就緒 (HTTP ${res.status})，5 秒後重試...`);
    } catch (e) {
      console.log('[send] 連線失敗，重試...', e.message);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function pushToLine(to, imageUrl) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.lineChannelAccessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed (HTTP ${res.status}): ${body}`);
  }
}

async function main() {
  const msg = JSON.parse(await fs.readFile(path.join(ROOT, 'out', 'message.json'), 'utf8'));
  console.log('[send] 目標圖片:', msg.imageUrl);

  const ready = await waitForUrl(msg.imageUrl);
  if (!ready) throw new Error('圖片網址逾時仍無法存取，放棄推播。');
  console.log('[send] 圖片已就緒，開始推播');

  const results = [];
  for (const to of msg.targets) {
    try {
      await pushToLine(to, msg.imageUrl);
      results.push({ to, ok: true });
      console.log('[send] ✅', to);
    } catch (e) {
      results.push({ to, ok: false, error: e.message });
      console.error('[send] ❌', to, e.message);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  console.log(`[send] 完成，成功 ${sent}/${msg.targets.length}`);
  if (sent === 0) process.exit(1);
}

main().catch((err) => {
  console.error('[send] 失敗:', err.message);
  process.exit(1);
});
