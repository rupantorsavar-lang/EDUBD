export interface FaceCandidateInput<T = any> {
  person: T;
  vec?: number[];
  vecs?: number[][];
}

export interface FacePresenceAnalysis {
  hasContrast: boolean;
  hasSkinPresence: boolean;
  skinRatio: number;
  mean: number;
  stdDev: number;
}

export interface FaceMatchOptions {
  isSilentAuto: boolean;
  hasDetectedBox?: boolean;
}

export interface FaceMatchResult<T = any> {
  matched: boolean;
  isAmbiguous: boolean;
  threshold: number;
  bestCandidate: { person: T; similarity: number } | null;
  secondCandidate: { person: T; similarity: number } | null;
  displayConfidence: number;
}

const GRID_SIZE = 16;
const GRID_PIXELS = GRID_SIZE * GRID_SIZE; // 256

// Precompute smooth elliptical center-focus mask (1.0 in center face, 0.10 at outer background corners)
const OVAL_WEIGHTS: Float32Array = (() => {
  const weights = new Float32Array(GRID_PIXELS);
  const cx = (GRID_SIZE - 1) / 2;
  const cy = (GRID_SIZE - 1) / 2;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const nx = (x - cx) / 6.4;
      const ny = (y - cy) / 7.2;
      const rSq = nx * nx + ny * ny;
      // Smoothly taper off corners/background so shirt/wall changes don't dominate face geometry
      const w = rSq <= 1.0 ? 1.0 : Math.max(0.10, 1.0 - (rSq - 1.0) * 0.78);
      weights[y * GRID_SIZE + x] = w;
    }
  }
  return weights;
})();

function normalizeWeightedSection(arr: Float32Array, scaleWeight: number): Float32Array {
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < arr.length; i++) {
    const w = arr.length === GRID_PIXELS ? OVAL_WEIGHTS[i] : 1;
    sum += arr[i] * w;
    weightSum += w;
  }
  const mean = weightSum > 0 ? sum / weightSum : 0;

  let normSq = 0;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const w = arr.length === GRID_PIXELS ? OVAL_WEIGHTS[i] : 1;
    const val = (arr[i] - mean) * w;
    out[i] = val;
    normSq += val * val;
  }
  const norm = Math.sqrt(normSq) || 1;
  for (let i = 0; i < arr.length; i++) {
    out[i] = (out[i] / norm) * scaleWeight;
  }
  return out;
}

/**
 * Partially removes linear 2D directional lighting gradients (e.g. window light from one side)
 * while preserving true facial structure across the oval.
 */
function detrendIlluminationPlane(rawLum: Float32Array, strength = 0.6): Float32Array {
  const cx = (GRID_SIZE - 1) / 2;
  const cy = (GRID_SIZE - 1) / 2;
  let wSum = 0;
  let lumSum = 0;
  for (let i = 0; i < GRID_PIXELS; i++) {
    const w = OVAL_WEIGHTS[i];
    wSum += w;
    lumSum += rawLum[i] * w;
  }
  const mean = wSum > 0 ? lumSum / wSum : 0;

  let numX = 0;
  let denX = 0;
  let numY = 0;
  let denY = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    const dy = y - cy;
    for (let x = 0; x < GRID_SIZE; x++) {
      const dx = x - cx;
      const idx = y * GRID_SIZE + x;
      const w = OVAL_WEIGHTS[idx];
      const centered = rawLum[idx] - mean;
      numX += w * dx * centered;
      denX += w * dx * dx;
      numY += w * dy * centered;
      denY += w * dy * dy;
    }
  }

  const slopeX = denX > 0 ? numX / denX : 0;
  const slopeY = denY > 0 ? numY / denY : 0;

  const out = new Float32Array(GRID_PIXELS);
  for (let y = 0; y < GRID_SIZE; y++) {
    const dy = y - cy;
    for (let x = 0; x < GRID_SIZE; x++) {
      const dx = x - cx;
      const idx = y * GRID_SIZE + x;
      out[idx] = rawLum[idx] - strength * (slopeX * dx + slopeY * dy);
    }
  }
  return out;
}

/**
 * Separable [0.25, 0.50, 0.25] spatial smoothing so minor 1-pixel alignment shifts
 * between admission photo and live camera keep strong gradient overlap.
 */
function smoothLumGrid(lum: Float32Array): Float32Array {
  const temp = new Float32Array(GRID_PIXELS);
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(GRID_SIZE - 1, x + 1);
      temp[y * GRID_SIZE + x] =
        0.25 * lum[y * GRID_SIZE + xl] +
        0.5 * lum[y * GRID_SIZE + x] +
        0.25 * lum[y * GRID_SIZE + xr];
    }
  }
  const out = new Float32Array(GRID_PIXELS);
  for (let y = 0; y < GRID_SIZE; y++) {
    const yu = Math.max(0, y - 1);
    const yd = Math.min(GRID_SIZE - 1, y + 1);
    for (let x = 0; x < GRID_SIZE; x++) {
      out[y * GRID_SIZE + x] =
        0.25 * temp[yu * GRID_SIZE + x] +
        0.5 * temp[y * GRID_SIZE + x] +
        0.25 * temp[yd * GRID_SIZE + x];
    }
  }
  return out;
}

/**
 * Builds an illumination-invariant facial descriptor vector from a 16x16 RGBA face crop
 * and an optional 8x8 RGBA crop:
 *  - 256 dims: oval-weighted lighting-detrended luminance (macro shading)
 *  - 256 dims: oval-weighted smoothed horizontal gradient (eye/nose/face contour geometry)
 *  - 256 dims: oval-weighted smoothed vertical gradient (brow/eye/lip/chin geometry)
 *  - 192 dims (optional): normalized 8x8 RGB profile (low weight so ambient tint/clothes don't overpower)
 */
export function extractFaceDescriptorFromImageData(
  lumData16x16: ArrayLike<number>,
  rgbData8x8?: ArrayLike<number> | null
): number[] | null {
  if (!lumData16x16 || lumData16x16.length < GRID_PIXELS * 4) return null;

  const rawLum = new Float32Array(GRID_PIXELS);
  for (let i = 0, p = 0; p < GRID_PIXELS; i += 4, p++) {
    rawLum[p] = 0.299 * lumData16x16[i] + 0.587 * lumData16x16[i + 1] + 0.114 * lumData16x16[i + 2];
  }

  const detrendedLum = detrendIlluminationPlane(rawLum, 0.58);
  const smoothed = smoothLumGrid(detrendedLum);

  const gradX = new Float32Array(GRID_PIXELS);
  const gradY = new Float32Array(GRID_PIXELS);
  for (let y = 0; y < GRID_SIZE; y++) {
    const yUp = Math.max(0, y - 1);
    const yDown = Math.min(GRID_SIZE - 1, y + 1);
    for (let x = 0; x < GRID_SIZE; x++) {
      const xLeft = Math.max(0, x - 1);
      const xRight = Math.min(GRID_SIZE - 1, x + 1);
      const idx = y * GRID_SIZE + x;
      gradX[idx] = smoothed[y * GRID_SIZE + xRight] - smoothed[y * GRID_SIZE + xLeft];
      gradY[idx] = smoothed[yDown * GRID_SIZE + x] - smoothed[yUp * GRID_SIZE + x];
    }
  }

  const hasRgb = Boolean(rgbData8x8 && rgbData8x8.length >= 64 * 4);
  const normLum = normalizeWeightedSection(detrendedLum, hasRgb ? 0.36 : 0.40);
  const normGx = normalizeWeightedSection(gradX, hasRgb ? 0.28 : 0.31);
  const normGy = normalizeWeightedSection(gradY, hasRgb ? 0.26 : 0.29);

  const outLen = hasRgb ? GRID_PIXELS * 3 + 192 : GRID_PIXELS * 3;
  const finalVec: number[] = new Array(outLen);
  for (let i = 0; i < GRID_PIXELS; i++) {
    finalVec[i] = normLum[i];
    finalVec[GRID_PIXELS + i] = normGx[i];
    finalVec[GRID_PIXELS * 2 + i] = normGy[i];
  }

  if (hasRgb && rgbData8x8) {
    const rgbRaw = new Float32Array(192);
    for (let i = 0, p = 0; p < 192; i += 4, p += 3) {
      rgbRaw[p] = rgbData8x8[i];
      rgbRaw[p + 1] = rgbData8x8[i + 1];
      rgbRaw[p + 2] = rgbData8x8[i + 2];
    }
    const normRgb = normalizeWeightedSection(rgbRaw, 0.10);
    for (let i = 0; i < 192; i++) {
      finalVec[GRID_PIXELS * 3 + i] = normRgb[i];
    }
  }

  return finalVec;
}

/**
 * Checks whether a 16x16 center ROI contains real contrast AND human skin chrominance
 * (used when browser lacks native window.FaceDetector so blank walls/QR cards don't false-trigger).
 */
export function analyzeCenterFacePresence(rgba16x16: ArrayLike<number>): FacePresenceAnalysis {
  if (!rgba16x16 || rgba16x16.length < GRID_PIXELS * 4) {
    return { hasContrast: false, hasSkinPresence: false, skinRatio: 0, mean: 0, stdDev: 0 };
  }

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < GRID_PIXELS * 4; i += 4) {
    const lum = 0.299 * rgba16x16[i] + 0.587 * rgba16x16[i + 1] + 0.114 * rgba16x16[i + 2];
    sum += lum;
    sumSq += lum * lum;
  }

  const mean = sum / GRID_PIXELS;
  const stdDev = Math.sqrt(Math.max(0, sumSq / GRID_PIXELS - mean * mean));
  const hasContrast = stdDev >= 10 && mean >= 16 && mean <= 246;

  // Check inner face core (rows 1..14, cols 2..13) using YCbCr skin chrominance tuned for varied lighting
  let corePixels = 0;
  let skinPixels = 0;
  for (let y = 1; y <= 14; y++) {
    for (let x = 2; x <= 13; x++) {
      corePixels++;
      const idx = (y * GRID_SIZE + x) * 4;
      const r = rgba16x16[idx];
      const g = rgba16x16[idx + 1];
      const b = rgba16x16[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      if (
        luma >= 22 &&
        luma <= 248 &&
        r > 32 &&
        g > 20 &&
        b > 10 &&
        r - Math.min(g, b) >= 6 &&
        r >= g * 0.90 &&
        r >= b * 0.90 &&
        cb >= 68 &&
        cb <= 142 &&
        cr >= 126 &&
        cr <= 186
      ) {
        skinPixels++;
      }
    }
  }

  const skinRatio = corePixels > 0 ? skinPixels / corePixels : 0;
  return {
    hasContrast,
    hasSkinPresence: hasContrast && skinRatio >= 0.06,
    skinRatio,
    mean,
    stdDev,
  };
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export function matchFaceDescriptor<T>(
  liveVectors: number[][],
  candidates: FaceCandidateInput<T>[],
  options: FaceMatchOptions
): FaceMatchResult<T> {
  // Aggregate best score per distinct person so multi-crop/mirror candidate banks never self-collide
  const perPersonBest = new Map<any, { person: T; similarity: number }>();

  if (liveVectors.length > 0 && candidates.length > 0) {
    for (const c of candidates) {
      const candidateVecs =
        c.vecs && c.vecs.length > 0 ? c.vecs : c.vec ? [c.vec] : [];
      if (candidateVecs.length === 0) continue;

      let maxSim = -1;
      for (let cv = 0; cv < candidateVecs.length; cv++) {
        const enrolledVec = candidateVecs[cv];
        for (let lv = 0; lv < liveVectors.length; lv++) {
          const sim = cosineSimilarity(liveVectors[lv], enrolledVec);
          if (sim > maxSim) maxSim = sim;
        }
      }

      const personKey = (c.person as any)?.id ?? c.person;
      const existing = perPersonBest.get(personKey);
      if (!existing || maxSim > existing.similarity) {
        perPersonBest.set(personKey, { person: c.person, similarity: maxSim });
      }
    }
  }

  const ranked = Array.from(perPersonBest.values()).sort((a, b) => b.similarity - a.similarity);
  const bestCandidate = ranked[0] ?? null;
  const secondCandidate = ranked[1] ?? null;

  const count = ranked.length;
  const threshold = options.isSilentAuto
    ? options.hasDetectedBox
      ? count === 1
        ? 0.62
        : 0.66
      : count === 1
      ? 0.64
      : 0.68
    : count === 1
    ? 0.52
    : 0.58;

  const isAmbiguous = Boolean(
    bestCandidate &&
      secondCandidate &&
      count >= 2 &&
      (options.isSilentAuto
        ? bestCandidate.similarity < 0.82 && bestCandidate.similarity - secondCandidate.similarity < 0.035
        : bestCandidate.similarity < 0.76 && bestCandidate.similarity - secondCandidate.similarity < 0.025)
  );

  const matched = Boolean(bestCandidate && bestCandidate.similarity >= threshold && !isAmbiguous);
  const rawSim = bestCandidate ? bestCandidate.similarity : 0;
  const displayConfidence = Number(Math.min(99.4, Math.max(50, 62 + rawSim * 36)).toFixed(1));

  return {
    matched,
    isAmbiguous,
    threshold,
    bestCandidate,
    secondCandidate,
    displayConfidence,
  };
}
