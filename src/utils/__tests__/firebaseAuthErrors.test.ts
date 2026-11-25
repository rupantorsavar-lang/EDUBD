import { describe, it, expect } from 'vitest';
import {
  clearFailedOriginValidationCache,
  formatFirebaseAuthErrorMessage,
  isExpectedAuthWarningCode,
} from '../firebaseAuthErrors';

describe('firebaseAuthErrors', () => {
  describe('isExpectedAuthWarningCode', () => {
    it('returns true for expected runtime/network/popup auth errors', () => {
      expect(isExpectedAuthWarningCode('auth/network-request-failed')).toBe(true);
      expect(isExpectedAuthWarningCode('auth/popup-blocked')).toBe(true);
      expect(isExpectedAuthWarningCode('auth/popup-closed-by-user')).toBe(true);
      expect(isExpectedAuthWarningCode('auth/unauthorized-domain')).toBe(true);
    });

    it('returns false for unexpected or empty codes', () => {
      expect(isExpectedAuthWarningCode('auth/internal-unknown')).toBe(false);
      expect(isExpectedAuthWarningCode('')).toBe(false);
      expect(isExpectedAuthWarningCode(undefined)).toBe(false);
    });
  });

  describe('clearFailedOriginValidationCache', () => {
    it('deletes cached originValidationPromises across resolver instances without failing on null entries', () => {
      const resolverA = {
        originValidationPromises: {
          'DEFAULT:https://app.example': Promise.resolve(),
          'SECONDARY:https://app.example': Promise.resolve(),
        },
      };
      const resolverB = {
        originValidationPromises: {
          'DEFAULT:https://other.example': Promise.resolve(),
        },
      };

      const cleared = clearFailedOriginValidationCache([null, undefined, {}, resolverA, resolverB]);
      expect(cleared).toBe(3);
      expect(Object.keys(resolverA.originValidationPromises)).toHaveLength(0);
      expect(Object.keys(resolverB.originValidationPromises)).toHaveLength(0);
    });
  });

  describe('formatFirebaseAuthErrorMessage', () => {
    it('explains offline state clearly when browser is offline', () => {
      const res = formatFirebaseAuthErrorMessage({
        code: 'auth/network-request-failed',
        flow: 'google-popup',
        isOffline: true,
        inIframe: true,
      });
      expect(res.isNetworkError).toBe(true);
      expect(res.message).toContain('ইন্টারনেট সংযোগ বিচ্ছিন্ন');
      expect(res.needsStandaloneTab).toBe(false);
    });

    it('offers standalone tab guidance when Google Sign-In hits network failure inside an iframe', () => {
      const res = formatFirebaseAuthErrorMessage({
        code: 'auth/network-request-failed',
        flow: 'google-popup',
        inIframe: true,
        isOffline: false,
      });
      expect(res.isNetworkError).toBe(true);
      expect(res.needsStandaloneTab).toBe(true);
      expect(res.message).toContain('নতুন ট্যাবে');
      expect(res.message).toContain('Email ও Password');
    });

    it('guides WebView users on network-request-failed during Google Sign-In', () => {
      const res = formatFirebaseAuthErrorMessage({
        code: 'auth/network-request-failed',
        flow: 'google-popup',
        inIframe: false,
        isWebView: true,
        isOffline: false,
      });
      expect(res.isNetworkError).toBe(true);
      expect(res.needsStandaloneTab).toBe(true);
      expect(res.message).toContain('WebView');
      expect(res.message).toContain('Chrome');
    });

    it('guides standalone online browsers on Ad-Blocker/VPN/network failure without raw SDK string', () => {
      const res = formatFirebaseAuthErrorMessage({
        code: 'auth/network-request-failed',
        flow: 'google-popup',
        inIframe: false,
        isOffline: false,
        isWebView: false,
      });
      expect(res.isNetworkError).toBe(true);
      expect(res.needsStandaloneTab).toBe(false);
      expect(res.message).toContain('Ad-Blocker');
      expect(res.message).toContain('Email ও Password');
    });

    it('formats unauthorized-domain with the current hostname', () => {
      const res = formatFirebaseAuthErrorMessage({
        code: 'auth/unauthorized-domain',
        flow: 'google-popup',
        host: 'preview.run.app',
      });
      expect(res.isUnauthorizedDomain).toBe(true);
      expect(res.message).toContain('preview.run.app');
      expect(res.message).toContain('Authorized domains');
    });
  });
});
