/**
 * Quota-safe storage manager and client-side image compression
 * Prevents QuotaExceededError in localStorage (5MB browser limit).
 */

export function cleanupOversizedLocalStorage(): void {
  try {
    // 1. Check and compress students with giant camera base64 photos
    const rawStudents = localStorage.getItem('school_erp_students');
    if (rawStudents && rawStudents.length > 300000) {
      try {
        const students = JSON.parse(rawStudents);
        if (Array.isArray(students)) {
          let modified = false;
          const cleaned = students.map((s: any) => {
            if (s && s.photoUrl && typeof s.photoUrl === 'string' && s.photoUrl.startsWith('data:') && s.photoUrl.length > 40000) {
              modified = true;
              // Remove oversized base64 to free up megabytes of browser storage quota
              return { ...s, photoUrl: '' };
            }
            return s;
          });
          if (modified) {
            localStorage.setItem('school_erp_students', JSON.stringify(cleaned));
          }
        }
      } catch {}
    }

    // 2. Check enquiries with oversized photos
    const rawEnq = localStorage.getItem('school_erp_enquiries');
    if (rawEnq && rawEnq.length > 250000) {
      try {
        const enqs = JSON.parse(rawEnq);
        if (Array.isArray(enqs)) {
          let mod = false;
          const cleaned = enqs.map((e: any) => {
            if (e && e.photoUrl && typeof e.photoUrl === 'string' && e.photoUrl.startsWith('data:') && e.photoUrl.length > 40000) {
              mod = true;
              return { ...e, photoUrl: '' };
            }
            return e;
          });
          if (mod) {
            localStorage.setItem('school_erp_enquiries', JSON.stringify(cleaned));
          }
        }
      } catch {}
    }

    // 3. Trim homework submissions with giant images
    const rawSubs = localStorage.getItem('school_erp_homework_submissions');
    if (rawSubs && rawSubs.length > 400000) {
      try {
        const subs = JSON.parse(rawSubs);
        if (Array.isArray(subs)) {
          const cleaned = subs.map((sub: any) => {
            if (Array.isArray(sub.imageUrls)) {
              return {
                ...sub,
                imageUrls: sub.imageUrls.filter((img: string) => typeof img === 'string' && img.length < 50000),
              };
            }
            return sub;
          });
          localStorage.setItem('school_erp_homework_submissions', JSON.stringify(cleaned));
        }
      } catch {}
    }

    // 4. Trim audit logs to last 20
    const rawAudit = localStorage.getItem('school_erp_attendance_audit');
    if (rawAudit && rawAudit.length > 150000) {
      try {
        const logs = JSON.parse(rawAudit);
        if (Array.isArray(logs) && logs.length > 20) {
          localStorage.setItem('school_erp_attendance_audit', JSON.stringify(logs.slice(0, 20)));
        }
      } catch {}
    }

    // 5. Trim old messages
    const rawMsgs = localStorage.getItem('school_erp_website_messages');
    if (rawMsgs && rawMsgs.length > 150000) {
      try {
        const msgs = JSON.parse(rawMsgs);
        if (Array.isArray(msgs) && msgs.length > 20) {
          localStorage.setItem('school_erp_website_messages', JSON.stringify(msgs.slice(0, 20)));
        }
      } catch {}
    }
  } catch (err) {
    console.warn('cleanupOversizedLocalStorage warning:', err);
  }
}

export function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    try {
      sessionStorage.removeItem(key);
    } catch {}
    return true;
  } catch (e: any) {
    console.warn(`localStorage.setItem failed for key "${key}", running quota cleanup:`, e);
    try {
      cleanupOversizedLocalStorage();
      localStorage.setItem(key, value);
      try {
        sessionStorage.removeItem(key);
      } catch {}
      return true;
    } catch (e2) {
      console.warn(`localStorage quota still exceeded for "${key}", storing in sessionStorage:`, e2);
      try {
        sessionStorage.setItem(key, value);
        try {
          localStorage.removeItem(key);
        } catch {}
        return true;
      } catch {}
      return false;
    }
  }
}

export function safeGetLocalStorage(key: string): string | null {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
    return sessionStorage.getItem(key);
  } catch {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

export function safeRemoveLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

/**
 * Compresses an image file or data URL to passport size (< 40KB)
 */
export async function compressImageToPassportSize(
  imageSource: string | File,
  maxWidth = 240,
  maxHeight = 300,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(typeof imageSource === 'string' ? imageSource : '');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        let q = quality;
        let compressed = canvas.toDataURL('image/jpeg', q);
        while (compressed.length > 38000 && q > 0.35) {
          q = Math.max(0.32, q - 0.12);
          compressed = canvas.toDataURL('image/jpeg', q);
        }
        if (compressed.length > 38000) {
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = Math.max(120, Math.round(width * 0.75));
          smallCanvas.height = Math.max(150, Math.round(height * 0.75));
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            compressed = smallCanvas.toDataURL('image/jpeg', 0.55);
          }
        }
        resolve(compressed);
      };

      img.onerror = () => {
        resolve(typeof imageSource === 'string' ? imageSource : '');
      };

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(imageSource);
      }
    } catch {
      resolve(typeof imageSource === 'string' ? imageSource : '');
    }
  });
}

/**
 * Converts near-white paper backgrounds into clean transparency for scanned/photographed
 * signatures while leaving already-transparent PNGs and dark ink strokes crisp.
 */
export function removeLightBackgroundFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  if (!data || data.length < 4 || width <= 0 || height <= 0) return false;

  const samplePoints = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];

  // If any corner already has transparency, respect the existing transparent PNG alpha
  const hasTransparentCorner = samplePoints.some((idx) => (data[idx + 3] ?? 255) < 230);
  if (hasTransparentCorner) return false;

  // Only strip background if corners look opaque & near-white (e.g. photo/scan on paper)
  const hasLightOpaqueCorner = samplePoints.some((idx) => {
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    const a = data[idx + 3] ?? 0;
    return a >= 230 && r >= 200 && g >= 200 && b >= 200;
  });

  if (!hasLightOpaqueCorner) return false;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const minChannel = Math.min(r, g, b);
    const maxChannel = Math.max(r, g, b);
    const spread = maxChannel - minChannel;

    // Low-saturation bright pixels belong to paper background
    if (minChannel >= 218 && spread <= 42) {
      data[i + 3] = 0;
    } else if (minChannel >= 180 && spread <= 45) {
      // Smooth anti-aliased edge feathering between ink and paper
      const ratio = (218 - minChannel) / (218 - 180);
      data[i + 3] = Math.round(a * Math.max(0, Math.min(1, ratio)));
    }
  }
  return true;
}

/**
 * Compresses a signature image into a compact transparent PNG data URL (< 40KB typical).
 */
export async function compressSignatureImage(
  imageSource: string | File,
  options?: { maxWidth?: number; maxHeight?: number; autoTransparentBg?: boolean }
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 420;
  const maxHeight = options?.maxHeight ?? 140;
  const autoTransparentBg = options?.autoTransparentBg ?? true;

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width || maxWidth;
        let height = img.height || maxHeight;

        const scale = Math.min(1, maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(typeof imageSource === 'string' ? imageSource : '');
          return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        if (autoTransparentBg) {
          try {
            const imgData = ctx.getImageData(0, 0, width, height);
            if (removeLightBackgroundFromRgba(imgData.data, width, height)) {
              ctx.putImageData(imgData, 0, 0);
            }
          } catch {
            // Ignore CORS tainted canvas errors and return drawn canvas
          }
        }

        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => {
        resolve(typeof imageSource === 'string' ? imageSource : '');
      };

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(imageSource);
      }
    } catch {
      resolve(typeof imageSource === 'string' ? imageSource : '');
    }
  });
}

/**
 * Compresses an uploaded screenshot or problem photo for Support Team chat.
 * Targets max 1080px dimension and ~60-180KB JPEG so up to 3 images fit safely in Firestore.
 */
export async function compressSupportScreenshot(
  imageSource: string | File,
  maxDimension = 1080
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width || maxDimension;
        let height = img.height || maxDimension;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let compressed = canvas.toDataURL('image/jpeg', 0.74);
        if (compressed.length > 260_000) {
          compressed = canvas.toDataURL('image/jpeg', 0.56);
        }
        if (compressed.length > 420_000) {
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = Math.max(1, Math.round(width * 0.7));
          smallCanvas.height = Math.max(1, Math.round(height * 0.7));
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, smallCanvas.width, smallCanvas.height);
            sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            compressed = smallCanvas.toDataURL('image/jpeg', 0.55);
          }
        }
        resolve(compressed);
      };

      img.onerror = () => {
        reject(new Error('Could not read selected image file.'));
      };

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = (e.target?.result as string) || '';
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(imageSource);
      }
    } catch (err) {
      reject(err);
    }
  });
}
