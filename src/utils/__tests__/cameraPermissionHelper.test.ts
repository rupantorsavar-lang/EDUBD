import { describe, it, expect } from 'vitest';
import {
  isAndroidWebView,
  isCameraPermissionError,
  isCameraHardwareBusyError,
  formatCameraStartupErrorMessage,
} from '../cameraPermissionHelper';

describe('cameraPermissionHelper', () => {
  describe('isAndroidWebView', () => {
    it('identifies Android WebView and AppCreator24 user agents accurately', () => {
      expect(
        isAndroidWebView(
          'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36'
        )
      ).toBe(true);
      expect(isAndroidWebView('Mozilla/5.0 AppCreator24 Android Mobile')).toBe(true);
      expect(
        isAndroidWebView(
          'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36'
        )
      ).toBe(true);
    });

    it('returns false for standard Chrome, SamsungBrowser, or Desktop browsers', () => {
      expect(
        isAndroidWebView(
          'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        )
      ).toBe(false);
      expect(
        isAndroidWebView(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        )
      ).toBe(false);
      expect(isAndroidWebView('')).toBe(false);
    });
  });

  describe('isCameraPermissionError', () => {
    it('detects standard DOMException permission errors and strings', () => {
      expect(isCameraPermissionError({ name: 'NotAllowedError', message: 'Permission denied' })).toBe(true);
      expect(isCameraPermissionError({ name: 'PermissionDeniedError' })).toBe(true);
      expect(isCameraPermissionError({ name: 'SecurityError', message: 'The operation is insecure.' })).toBe(true);
      expect(isCameraPermissionError('Permission dismissed by user')).toBe(true);
      expect(isCameraPermissionError(new Error('Request denied by system'))).toBe(true);
      expect(isCameraPermissionError('Camera access not allowed')).toBe(true);
    });

    it('does not misclassify hardware busy or non-permission errors', () => {
      expect(isCameraPermissionError({ name: 'NotReadableError', message: 'Could not start video source' })).toBe(false);
      expect(isCameraPermissionError({ name: 'NotFoundError', message: 'Requested device not found' })).toBe(false);
      expect(isCameraPermissionError(null)).toBe(false);
      expect(isCameraPermissionError(undefined)).toBe(false);
    });
  });

  describe('isCameraHardwareBusyError', () => {
    it('detects busy/in-use/abort camera errors', () => {
      expect(isCameraHardwareBusyError({ name: 'NotReadableError', message: 'Device in use' })).toBe(true);
      expect(isCameraHardwareBusyError({ name: 'TrackStartError', message: 'Could not start video source' })).toBe(true);
      expect(isCameraHardwareBusyError({ name: 'AbortError', message: 'Starting videoinput failed' })).toBe(true);
      expect(isCameraHardwareBusyError('Could not start video source')).toBe(true);
    });

    it('returns false for permission errors or unknown errors', () => {
      expect(isCameraHardwareBusyError({ name: 'NotAllowedError', message: 'Permission denied' })).toBe(false);
      expect(isCameraHardwareBusyError('Unknown error')).toBe(false);
    });
  });

  describe('formatCameraStartupErrorMessage', () => {
    it('returns WebView / unsupported browser message when mediaDevices is missing', () => {
      const bn = formatCameraStartupErrorMessage({
        error: new Error('missing'),
        language: 'bn',
        inIframe: false,
        permissionState: 'unknown',
        hasMediaDevices: false,
      });
      expect(bn.isPermissionBlocked).toBe(true);
      expect(bn.message).toContain('Google Chrome');
      expect(bn.message).toContain('ছবি তুলে স্ক্যান');

      const wvBn = formatCameraStartupErrorMessage({
        error: new Error('missing'),
        language: 'bn',
        inIframe: false,
        permissionState: 'unknown',
        hasMediaDevices: false,
        isWebView: true,
      });
      expect(wvBn.isPermissionBlocked).toBe(true);
      expect(wvBn.message).toContain('AppCreator24');
      expect(wvBn.message).toContain('ক্রোম ব্রাউজারে খুলুন');
      expect(wvBn.message).toContain('ছবি/গ্যালারি স্ক্যান');

      const en = formatCameraStartupErrorMessage({
        error: new Error('missing'),
        language: 'en',
        inIframe: true,
        permissionState: 'unknown',
        hasMediaDevices: false,
      });
      expect(en.isPermissionBlocked).toBe(true);
      expect(en.message).toContain('Chrome');
      expect(en.message).toContain('Photo Scan');
    });

    it('returns AppCreator24/WebView guidance when permission fails inside WebView', () => {
      const bn = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError', message: 'Permission denied' },
        language: 'bn',
        inIframe: false,
        permissionState: 'denied',
        hasMediaDevices: true,
        isWebView: true,
      });
      expect(bn.isPermissionBlocked).toBe(true);
      expect(bn.message).toContain('AppCreator24');
      expect(bn.message).toContain('ক্রোম ব্রাউজারে খুলুন');
      expect(bn.message).toContain('ছবি তুলে স্ক্যান');

      const en = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError' },
        language: 'en',
        inIframe: false,
        permissionState: 'prompt',
        hasMediaDevices: true,
        isWebView: true,
      });
      expect(en.isPermissionBlocked).toBe(true);
      expect(en.message).toContain('AppCreator24');
    });

    it('prioritizes iframe guidance when permission error occurs inside an iframe', () => {
      const bn = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError', message: 'Permission denied' },
        language: 'bn',
        inIframe: true,
        permissionState: 'denied',
        hasMediaDevices: true,
      });
      expect(bn.isPermissionBlocked).toBe(true);
      expect(bn.message).toContain('নতুন ট্যাবে খুলুন');

      const en = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError' },
        language: 'en',
        inIframe: true,
        permissionState: 'prompt',
        hasMediaDevices: true,
      });
      expect(en.isPermissionBlocked).toBe(true);
      expect(en.message).toContain('Open in New Tab');
    });

    it('returns address-bar unlock instructions when browser permissionState is denied outside iframe', () => {
      const bn = formatCameraStartupErrorMessage({
        error: null,
        language: 'bn',
        inIframe: false,
        permissionState: 'denied',
        hasMediaDevices: true,
      });
      expect(bn.isPermissionBlocked).toBe(true);
      expect(bn.message).toContain('Block');
      expect(bn.message).toContain('Allow');

      const en = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError' },
        language: 'en',
        inIframe: false,
        permissionState: 'denied',
        hasMediaDevices: true,
      });
      expect(en.isPermissionBlocked).toBe(true);
      expect(en.message).toContain('blocked in browser settings');
      expect(en.message).toContain('Allow');
    });

    it('returns prompt retry instructions when permission error happens with prompt/unknown state', () => {
      const bn = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError', message: 'Permission dismissed' },
        language: 'bn',
        inIframe: false,
        permissionState: 'prompt',
        hasMediaDevices: true,
      });
      expect(bn.isPermissionBlocked).toBe(true);
      expect(bn.message).toContain('Allow দিন');

      const en = formatCameraStartupErrorMessage({
        error: { name: 'NotAllowedError', message: 'Permission dismissed' },
        language: 'en',
        inIframe: false,
        permissionState: 'unknown',
        hasMediaDevices: true,
      });
      expect(en.isPermissionBlocked).toBe(true);
      expect(en.message).toContain('Start Camera');
    });

    it('handles hardware busy errors with non-blocked flag', () => {
      const bn = formatCameraStartupErrorMessage({
        error: { name: 'NotReadableError', message: 'Could not start video source' },
        language: 'bn',
        inIframe: false,
        permissionState: 'granted',
        hasMediaDevices: true,
      });
      expect(bn.isPermissionBlocked).toBe(false);
      expect(bn.message).toContain('অন্য কোনো অ্যাপ');

      const en = formatCameraStartupErrorMessage({
        error: { name: 'AbortError' },
        language: 'en',
        inIframe: false,
        permissionState: 'granted',
        hasMediaDevices: true,
      });
      expect(en.isPermissionBlocked).toBe(false);
      expect(en.message).toContain('currently busy');
    });

    it('passes through unrecognized error messages cleanly', () => {
      const res = formatCameraStartupErrorMessage({
        error: new Error('Custom camera failure'),
        language: 'en',
        inIframe: false,
        permissionState: 'granted',
        hasMediaDevices: true,
      });
      expect(res.isPermissionBlocked).toBe(false);
      expect(res.message).toBe('Custom camera failure');
    });
  });
});
