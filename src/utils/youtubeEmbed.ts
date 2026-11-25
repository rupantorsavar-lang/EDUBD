export type SupportVideoCategory =
  | 'getting_started'
  | 'fees'
  | 'attendance'
  | 'exams'
  | 'students'
  | 'settings'
  | 'other';

export type SupportVideoAudience = 'admins' | 'all';

export interface ParsedYouTubeEmbed {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  thumbnailUrl: string;
  startSeconds?: number;
  extractedTitle?: string;
}

export interface BulkParsedYouTubeEntry {
  lineNumber: number;
  rawInput: string;
  title: string;
  category: SupportVideoCategory;
  parsed: ParsedYouTubeEmbed | null;
  error?: string;
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export const SUPPORT_VIDEO_CATEGORY_LABELS: Record<
  SupportVideoCategory,
  { bn: string; en: string }
> = {
  getting_started: { bn: 'শুরু করার নিয়ম', en: 'Getting Started' },
  fees: { bn: 'ফি ও হিসাব', en: 'Fees & Accounts' },
  attendance: { bn: 'হাজিরা ও QR/Face', en: 'Attendance & QR' },
  exams: { bn: 'পরীক্ষা ও রেজাল্ট', en: 'Exams & Results' },
  students: { bn: 'শিক্ষার্থী ও ভর্তি', en: 'Students & Admission' },
  settings: { bn: 'স্কুল সেটিংস ও অ্যাপ', en: 'Settings & Setup' },
  other: { bn: 'অন্যান্য গাইড', en: 'Other Guides' },
};

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function parseStartTimeSeconds(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    const val = Number(trimmed);
    return val > 0 && val <= 86400 ? val : undefined;
  }
  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return undefined;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  const total = h * 3600 + m * 60 + s;
  return total > 0 && total <= 86400 ? total : undefined;
}

function extractAttrFromIframe(html: string, attrName: string): string | null {
  const doubleQuoted = new RegExp(
    `\\b${attrName}\\s*=\\s*"([^"]+)"`,
    'i'
  ).exec(html);
  if (doubleQuoted?.[1]) return decodeBasicHtmlEntities(doubleQuoted[1]);

  const singleQuoted = new RegExp(
    `\\b${attrName}\\s*=\\s*'([^']+)'`,
    'i'
  ).exec(html);
  if (singleQuoted?.[1]) return decodeBasicHtmlEntities(singleQuoted[1]);

  const unquoted = new RegExp(
    `\\b${attrName}\\s*=\\s*([^\\s>"']+)`,
    'i'
  ).exec(html);
  if (unquoted?.[1]) return decodeBasicHtmlEntities(unquoted[1]);

  return null;
}

/**
 * Safely parses a YouTube embed snippet (<iframe ...></iframe>), YouTube URL
 * (watch, youtu.be, shorts, live, embed), or 11-char YouTube video ID.
 * Returns canonical sanitized URLs only—never raw HTML.
 */
export function parseYouTubeEmbedInput(rawInput: string): ParsedYouTubeEmbed | null {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed || trimmed.length > 4000) return null;

  let candidateUrl = trimmed;
  let extractedTitle: string | undefined;

  if (/<iframe\b/i.test(trimmed)) {
    const srcAttr = extractAttrFromIframe(trimmed, 'src');
    if (!srcAttr) return null;
    candidateUrl = srcAttr;

    const titleAttr = extractAttrFromIframe(trimmed, 'title');
    if (
      titleAttr &&
      titleAttr.toLowerCase() !== 'youtube video player' &&
      titleAttr.length <= 180
    ) {
      extractedTitle = titleAttr;
    }
  } else if (YOUTUBE_ID_REGEX.test(trimmed)) {
    const videoId = trimmed;
    return {
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  // Handle protocol-relative URLs like //www.youtube.com/embed/...
  if (candidateUrl.startsWith('//')) {
    candidateUrl = `https:${candidateUrl}`;
  } else if (/^(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(candidateUrl)) {
    candidateUrl = `https://${candidateUrl}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidateUrl);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  let videoId: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = segments[0] || null;
  } else if (segments[0] === 'watch') {
    videoId = parsedUrl.searchParams.get('v');
  } else if (
    segments[0] === 'embed' ||
    segments[0] === 'shorts' ||
    segments[0] === 'live' ||
    segments[0] === 'v'
  ) {
    videoId = segments[1] || null;
  } else if (parsedUrl.searchParams.get('v')) {
    videoId = parsedUrl.searchParams.get('v');
  }

  if (!videoId || !YOUTUBE_ID_REGEX.test(videoId)) {
    return null;
  }

  const startSeconds =
    parseStartTimeSeconds(parsedUrl.searchParams.get('start')) ??
    parseStartTimeSeconds(parsedUrl.searchParams.get('t'));

  const embedParams = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
  });
  if (startSeconds) {
    embedParams.set('start', String(startSeconds));
  }

  return {
    videoId,
    embedUrl: `https://www.youtube.com/embed/${videoId}?${embedParams.toString()}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}${
      startSeconds ? `&t=${startSeconds}s` : ''
    }`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ...(startSeconds ? { startSeconds } : {}),
    ...(extractedTitle ? { extractedTitle } : {}),
  };
}

/**
 * Splits a pasted block containing 1 to 30+ YouTube embed codes or links.
 * Supports optional "Title | <iframe ...>" or "Title | https://youtu.be/..." per entry,
 * as well as multi-line <iframe>...</iframe> blocks.
 */
export function parseBulkYouTubeEntries(
  rawBlock: string,
  defaultCategory: SupportVideoCategory = 'getting_started'
): BulkParsedYouTubeEntry[] {
  const normalizedBlock = String(rawBlock || '')
    .replace(/\r\n/g, '\n')
    // Collapse multi-line <iframe ...>...</iframe> blocks onto a single line
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, (match) =>
      match.replace(/\s*\n\s*/g, ' ').trim()
    );

  const lines = normalizedBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const results: BulkParsedYouTubeEntry[] = [];
  const seenVideoIds = new Set<string>();

  lines.forEach((line, idx) => {
    let customTitle = '';
    let embedSource = line;

    const pipeIdx = line.indexOf('|');
    if (pipeIdx > 0) {
      const left = line.slice(0, pipeIdx).trim();
      const right = line.slice(pipeIdx + 1).trim();
      if (right) {
        customTitle = left;
        embedSource = right;
      }
    } else {
      // Support "Title - https://..." when title precedes a YouTube URL/iframe
      const dashSplit = line.match(/^(.+?)\s+[-–]\s+(https?:\/\/\S+|<iframe\b.+)$/i);
      if (dashSplit) {
        customTitle = dashSplit[1].trim();
        embedSource = dashSplit[2].trim();
      }
    }

    const parsed = parseYouTubeEmbedInput(embedSource);
    if (!parsed) {
      results.push({
        lineNumber: idx + 1,
        rawInput: line,
        title: customTitle || `ভিডিও #${idx + 1}`,
        category: defaultCategory,
        parsed: null,
        error: 'সঠিক YouTube এম্বেড কোড (<iframe>) বা YouTube লিংক পাওয়া যায়নি।',
      });
      return;
    }

    if (seenVideoIds.has(parsed.videoId)) {
      results.push({
        lineNumber: idx + 1,
        rawInput: line,
        title: customTitle || parsed.extractedTitle || `ভিডিও #${idx + 1}`,
        category: defaultCategory,
        parsed: null,
        error: `ডুপ্লিকেট ভিডিও (${parsed.videoId}) — এই তালিকায় ইতিমধ্যে রয়েছে।`,
      });
      return;
    }

    seenVideoIds.add(parsed.videoId);
    results.push({
      lineNumber: idx + 1,
      rawInput: line,
      title: customTitle || parsed.extractedTitle || `টিউটোরিয়াল ভিডিও #${results.length + 1}`,
      category: defaultCategory,
      parsed,
    });
  });

  return results;
}
