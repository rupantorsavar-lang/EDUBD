export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export function sanitizeSafeMediaUrl(url?: string | null): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Reject control characters, quotes, or angle brackets that could break out of attributes
  if (/[\u0000-\u001F\u007F"'<>]/.test(trimmed)) {
    return '';
  }

  if (SAFE_DATA_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Allow safe root-relative paths (reject protocol-relative `//`)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject invalid URLs and dangerous schemes (javascript:, data:text/html, vbscript:, etc.)
  }

  return '';
}
