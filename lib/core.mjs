// 共用核心：主題解析、文案生成、圖片生成
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
export const TIMEZONE = process.env.TZ || 'Asia/Taipei';

export const config = {
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  openaiImageQuality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
  openaiImageSize: process.env.OPENAI_IMAGE_SIZE || '1024x1024',
  allowedTargetIds: csv(process.env.ALLOWED_LINE_TARGET_IDS),
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function csv(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function readJson(fileName, fallback) {
  try {
    const raw = await fs.readFile(path.join(ROOT, 'data', fileName), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// 解析今日主題：優先用 plan 內 date 相符者，否則 Google News，否則 fallback
export async function resolveDailyTopic() {
  const date = todayKey();
  const plan = await readJson('daily-topic-plan.json', { topics: [] });
  const topics = Array.isArray(plan.topics) ? plan.topics : [];
  const planned = topics.find((t) => t.date === date);

  if (planned) {
    return {
      date,
      title: planned.title,
      summary: planned.summary,
      points: planned.points,
      action: planned.action,
      source: planned.source || 'planned-topic',
      url: planned.url || '',
    };
  }

  const searched = await searchSuccessTopic();
  return { date, title: searched.title, source: searched.source, url: searched.url };
}

async function searchSuccessTopic() {
  const fallback = { title: '成功需要把大目標拆成今天可驗證的小行動', source: 'fallback', url: '' };
  try {
    const url = 'https://news.google.com/rss/search?q=' +
      encodeURIComponent('成功 心態 創業 個人品牌') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant';
    const response = await fetch(url, { headers: { 'user-agent': 'onlinetrigger/1.0' } });
    if (!response.ok) return fallback;
    const xml = await response.text();
    const items = Array.from(xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>/g))
      .map((m) => ({ title: decodeXml(m[1]).replace(/\s+-\s+.*$/, '').trim(), url: decodeXml(m[2]).trim() }))
      .filter((it) => it.title && !it.title.includes('Google News'));
    const selected = items[0];
    if (!selected) return fallback;
    return { ...selected, source: 'google-news-rss' };
  } catch {
    return fallback;
  }
}

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'");
}

function normalizePost(value, fallback) {
  return {
    title: String(value.title || fallback.title).slice(0, 40),
    summary: String(value.summary || fallback.summary).slice(0, 90),
    points: Array.isArray(value.points) && value.points.length >= 3
      ? value.points.slice(0, 3).map((p) => String(p).slice(0, 36))
      : fallback.points,
    action: String(value.action || fallback.action).slice(0, 42),
    sourceTopic: fallback.sourceTopic,
  };
}

export async function generateDailyMindsetPost() {
  const topic = await resolveDailyTopic();
  const fallback = {
    title: topic.title || '成功需要先做出最小可行版本',
    summary: '不要等完美才開始，先用最小可行版本驗證方向，再用回饋把成果放大。',
    points: ['先做出能被看見的版本', '用真實回饋修正方向', '持續迭代比一次完美更重要'],
    action: '今天把一個想法做成可以展示的最小版本。',
    sourceTopic: topic,
  };

  if (!openai) return fallback;

  try {
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.75,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是成功心態與個人影響力教練。',
            '只輸出 JSON，欄位為 title, summary, points, action。',
            'points 必須是 3 個繁體中文短句。',
            '內容要適合 LINE 早晨推播與 OpenAI 圖片生成。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `今日主題：${topic.title}`,
            topic.url ? `參考來源：${topic.url}` : '',
            '請將主題轉成一則成功心態圖文文案，語氣務實、有行動感，避免空泛雞湯。',
          ].filter(Boolean).join('\n'),
        },
      ],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    return normalizePost(parsed, fallback);
  } catch (error) {
    console.error('[daily-content] using fallback:', error.message);
    return fallback;
  }
}

function buildDailyImagePrompt(post) {
  return [
    'Create a square 1024x1024 image for a LINE daily success-mindset post.',
    'Style: fashionable business, premium editorial design, modern Asian executive aesthetic, refined lighting, clean composition, luxury magazine cover energy, confident but calm.',
    'The image should be completely generated by the model. Do not rely on external fonts, local typography, overlays, or post-processing.',
    'Include tasteful integrated Traditional Chinese typography as part of the generated image only, with excellent spacing and high legibility.',
    'Avoid clutter, cartoon style, childish icons, cheap gradients, and excessive text.',
    '',
    `Today's topic: ${post.sourceTopic?.title || post.title}`,
    'Brand/account: PT奶爸 個人影響力IP教練',
    `Main headline: ${post.title}`,
    `Short insight: ${post.summary}`,
    `Three concise points: ${post.points.join(' / ')}`,
    `Call to action: ${post.action}`,
  ].join('\n');
}

export async function createMindsetImage(post, outDir) {
  if (!openai) throw new Error('OPENAI_API_KEY is not configured.');
  const date = todayKey();
  const fileName = `mindset-${date}-${crypto.randomUUID()}.png`;
  const filePath = path.join(outDir, fileName);
  const prompt = buildDailyImagePrompt(post);

  const response = await openai.images.generate({
    model: config.openaiImageModel,
    prompt,
    n: 1,
    size: config.openaiImageSize,
    quality: config.openaiImageQuality,
    output_format: 'png',
  });

  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error('OpenAI image generation did not return image data.');

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from(imageBase64, 'base64'));
  return { fileName, filePath };
}
