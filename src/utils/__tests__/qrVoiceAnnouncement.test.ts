import { describe, it, expect } from 'vitest';
import { buildSpeechPayload, pickBestVoice } from '../qrVoiceAnnouncement';

const makeVoice = (overrides: Partial<SpeechSynthesisVoice>): SpeechSynthesisVoice => ({
  default: false,
  lang: 'en-US',
  localService: true,
  name: 'English Local',
  voiceURI: 'local-en',
  ...overrides,
});

describe('qrVoiceAnnouncement', () => {
  it('prepares fast English payload for OK [English Name] and switches to Bangla for Bengali names', () => {
    const enPayload = buildSpeechPayload('OK Tanvir Ahmed');
    expect(enPayload.cleanText).toBe('OK Tanvir Ahmed');
    expect(enPayload.prefersBengali).toBe(false);
    expect(enPayload.lang).toBe('en-US');

    const bnPayload = buildSpeechPayload('OK হিয়া আক্তার');
    expect(bnPayload.cleanText).toBe('ওকে হিয়া আক্তার');
    expect(bnPayload.prefersBengali).toBe(true);
    expect(bnPayload.lang).toBe('bn-BD');
  });

  it('strips noisy scanner symbols before speaking', () => {
    const payload = buildSpeechPayload('✓   হাজিরা   সম্পন্ন  ⚠️');
    expect(payload.cleanText).toBe('হাজিরা সম্পন্ন');
    expect(payload.prefersBengali).toBe(true);
  });

  it('strictly prioritizes local offline English voices over slow network voices', () => {
    const networkEn = makeVoice({
      name: 'Google US English Network',
      lang: 'en-US',
      localService: false,
    });
    const localEn = makeVoice({
      name: 'Android Offline English',
      lang: 'en-US',
      localService: true,
    });

    const chosen = pickBestVoice([networkEn, localEn], false);
    expect(chosen?.name).toBe('Android Offline English');
  });

  it('strictly prioritizes local offline Bangla voices over remote Bangla voices', () => {
    const remoteBn = makeVoice({
      name: 'Google বাংলা',
      lang: 'bn-BD',
      localService: false,
    });
    const localBn = makeVoice({
      name: 'Bangla Offline Voice',
      lang: 'bn-BD',
      localService: true,
    });
    const localEn = makeVoice({
      name: 'English Offline',
      lang: 'en-US',
      localService: true,
    });

    const chosen = pickBestVoice([localEn, remoteBn, localBn], true);
    expect(chosen?.name).toBe('Bangla Offline Voice');
  });
});
