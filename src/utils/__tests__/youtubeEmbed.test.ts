import { describe, expect, it } from 'vitest';
import {
  parseBulkYouTubeEntries,
  parseYouTubeEmbedInput,
} from '../youtubeEmbed';

describe('youtubeEmbed parser & bulk batch helper', () => {
  it('parses standard YouTube iframe embed codes safely without keeping raw HTML', () => {
    const rawIframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=test123&start=45" title="Fee Collection Guide" frameborder="0" allowfullscreen></iframe>`;
    const parsed = parseYouTubeEmbedInput(rawIframe);
    expect(parsed).not.toBeNull();
    expect(parsed?.videoId).toBe('dQw4w9WgXcQ');
    expect(parsed?.embedUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&start=45'
    );
    expect(parsed?.watchUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s');
    expect(parsed?.thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
    expect(parsed?.extractedTitle).toBe('Fee Collection Guide');
  });

  it('parses watch, youtu.be, shorts, live, and youtube-nocookie URLs', () => {
    expect(
      parseYouTubeEmbedInput('https://www.youtube.com/watch?v=abcDEF12345&t=1m30s')
    ).toMatchObject({
      videoId: 'abcDEF12345',
      startSeconds: 90,
      embedUrl: 'https://www.youtube.com/embed/abcDEF12345?rel=0&modestbranding=1&start=90',
    });

    expect(parseYouTubeEmbedInput('https://youtu.be/xyz98765432')).toMatchObject({
      videoId: 'xyz98765432',
    });

    expect(
      parseYouTubeEmbedInput('https://www.youtube.com/shorts/shortVid123')
    ).toMatchObject({
      videoId: 'shortVid123',
    });

    const nocookieParsed = parseYouTubeEmbedInput(
      `<iframe src='https://www.youtube-nocookie.com/embed/liveVid_999' title='YouTube video player'></iframe>`
    );
    expect(nocookieParsed?.videoId).toBe('liveVid_999');
    expect(nocookieParsed?.extractedTitle).toBeUndefined();
  });

  it('rejects XSS payloads, non-YouTube domains, and javascript/data URLs', () => {
    expect(parseYouTubeEmbedInput('<script>alert(1)</script>')).toBeNull();
    expect(
      parseYouTubeEmbedInput('<iframe src="javascript:alert(1)"></iframe>')
    ).toBeNull();
    expect(
      parseYouTubeEmbedInput('<iframe src="https://evil.example.com/embed/dQw4w9WgXcQ"></iframe>')
    ).toBeNull();
    expect(parseYouTubeEmbedInput('https://vimeo.com/123456789')).toBeNull();
    expect(parseYouTubeEmbedInput('not-a-valid-id')).toBeNull();
  });

  it('parses 12 YouTube embeds & URLs in one bulk batch and flags duplicates/invalid lines', () => {
    const lines = Array.from({ length: 12 }, (_, idx) => {
      const id = `Vid_${String(idx + 1).padStart(2, '0')}AbCdE`.slice(0, 11);
      return idx % 2 === 0
        ? `গাইড ${idx + 1} | <iframe src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe>`
        : `গাইড ${idx + 1} | https://youtu.be/${id}`;
    });
    // Add duplicate & invalid line
    lines.push('Duplicate | https://youtu.be/Vid_01AbCdE');
    lines.push('Bad Line | https://example.com/video.mp4');

    const entries = parseBulkYouTubeEntries(lines.join('\n'), 'fees');
    expect(entries).toHaveLength(14);
    const valid = entries.filter((e) => e.parsed);
    expect(valid).toHaveLength(12);
    expect(valid[0].title).toBe('গাইড 1');
    expect(valid[0].category).toBe('fees');
    expect(entries[12].parsed).toBeNull();
    expect(entries[12].error).toContain('ডুপ্লিকেট');
    expect(entries[13].parsed).toBeNull();
  });
});
