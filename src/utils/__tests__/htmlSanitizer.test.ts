import { describe, expect, it } from 'vitest';
import { escapeHtml, sanitizeSafeMediaUrl } from '../htmlSanitizer';
import { buildPrincipalSignatureHtml, isValidSignatureSrc } from '../signatureHelper';

describe('HTML & Media URL Sanitizer', () => {
  it('escapes HTML meta-characters safely', () => {
    const raw = `<script>alert("xss")</script>'&`;
    expect(escapeHtml(raw)).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&#39;&amp;'
    );
  });

  it('rejects javascript:, data:text/html, svg data URIs, and quote breakouts', () => {
    expect(sanitizeSafeMediaUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeSafeMediaUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(sanitizeSafeMediaUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeSafeMediaUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('');
    expect(sanitizeSafeMediaUrl('https://example.com/a.png" onerror="alert(1)')).toBe('');
    expect(sanitizeSafeMediaUrl('//evil.example.com/payload.png')).toBe('');
  });

  it('allows valid raster base64 images, https/http URLs, and root-relative paths', () => {
    const pngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    expect(sanitizeSafeMediaUrl(pngData)).toBe(pngData);
    expect(sanitizeSafeMediaUrl('https://cdn.example.edu.bd/logo.png')).toBe(
      'https://cdn.example.edu.bd/logo.png'
    );
    expect(sanitizeSafeMediaUrl('/assets/logo.png')).toBe('/assets/logo.png');
    expect(isValidSignatureSrc('javascript:alert(1)')).toBe(false);
    expect(isValidSignatureSrc(pngData)).toBe(true);
  });

  it('does not render unsafe signature URLs in printable principal signature HTML', () => {
    const html = buildPrincipalSignatureHtml({
      principalSignatureUrl: 'javascript:alert(1)',
      principalNameEn: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
