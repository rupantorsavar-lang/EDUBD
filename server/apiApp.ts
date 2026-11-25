import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { GoogleGenAI, Type } from '@google/genai';
import { createSaasRouter } from './saas/router';
import { AuthenticatedRequest, createSaaSMiddleware } from './saas/middleware';
import { AuthProviderInterface, DatabaseProviderInterface } from './saas/types';
import {
  FirebaseAuthProvider,
  FirebaseDatabaseProvider,
  getFirebaseAdminDiagnostics,
  isFirebaseAdminConfigured,
} from './saas/providers/firebaseProvider';

export interface CreateApiAppOptions {
  dataDir?: string;
  saasAuthProvider?: AuthProviderInterface;
  saasDbProvider?: DatabaseProviderInterface;
}

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function isPlainRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) return false;
  }
  return true;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeOptionalMediaUrl(value: unknown, maxLength = 2_000_000): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return '';
  if (/[\u0000-\u001F\u007F"'<>]/.test(trimmed)) return '';
  if (SAFE_DATA_IMAGE_REGEX.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function createUserRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const key = req.principal?.uid || req.ip || 'anonymous';
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = buckets.get(key) || [];
    const recent = prev.filter((ts) => ts > cutoff);
    if (recent.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: 'অনেক দ্রুত অনুরোধ পাঠানো হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      });
    }
    recent.push(now);
    buckets.set(key, recent);
    if (buckets.size > 5000) {
      for (const [bucketKey, timestamps] of buckets.entries()) {
        if (!timestamps.some((ts) => ts > cutoff)) {
          buckets.delete(bucketKey);
        }
      }
    }
    return next();
  };
}

function resolveWritableDataDir(explicitDir?: string): string {
  const isServerless =
    process.env.NETLIFY === 'true' ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT);
  const targetDir = explicitDir && !isServerless
    ? explicitDir
    : path.join(os.tmpdir(), 'smartschool_data_storage');

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
  } catch {
    const fallbackDir = path.join(os.tmpdir(), 'smartschool_data_storage');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch {
      // ignore if read-only
    }
    return fallbackDir;
  }
}

export function createApiApp(options: CreateApiAppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  const dataDir = resolveWritableDataDir(options.dataDir);
  const schoolProfileFile = path.join(dataDir, 'school-profile.json');
  const mfsSettingsFile = path.join(dataDir, 'mfs-settings.json');

  // Normalize Netlify Function prefix (`/.netlify/functions/api/...` -> `/api/...`)
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      const rest = req.url.slice('/.netlify/functions/api'.length);
      req.url = `/api${rest.startsWith('/') || rest === '' ? rest : `/${rest}`}`;
    }
    next();
  });

  // Middleware for parsing JSON with bounded payload support for homework images
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Security headers compatible with Firebase Auth popups and AppCreator24/AI Studio iframes
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
    next();
  });

  // Mount Multi-Tenant SaaS REST API (Repository/Provider Pattern)
  const saasAuthProvider = options.saasAuthProvider ?? new FirebaseAuthProvider();
  const saasDbProvider = options.saasDbProvider ?? new FirebaseDatabaseProvider();
  const saasMw = createSaaSMiddleware(saasAuthProvider, saasDbProvider);
  app.locals.saasMw = saasMw;

  app.use(
    '/api/saas',
    createSaasRouter({
      auth: saasAuthProvider,
      db: saasDbProvider,
      adminSdkReady: isFirebaseAdminConfigured(),
      getHealthDiagnostics: getFirebaseAdminDiagnostics,
    })
  );

  // API: School Profile (Syncs across all devices & domains)
  app.get('/api/school-profile', (_req: Request, res: Response) => {
    try {
      if (fs.existsSync(schoolProfileFile)) {
        const data = JSON.parse(fs.readFileSync(schoolProfileFile, 'utf-8'));
        return res.json({ success: true, profile: data });
      }
      return res.json({ success: true, profile: null });
    } catch (err) {
      console.error('Failed to read school profile:', err);
      return res.status(500).json({ success: false, error: 'Failed to load school profile.' });
    }
  });

  app.post(
    '/api/school-profile',
    saasMw.requireAuth,
    saasMw.requireRole(['super_admin', 'admin', 'master_admin']),
    (req: Request, res: Response) => {
      try {
        if (!isPlainRecord(req.body)) {
          return res.status(400).json({ success: false, error: 'Invalid profile data' });
        }
        const raw = req.body;
        const sanitizedProfile = {
          nameEn: sanitizeText(raw.nameEn, 200),
          nameBn: sanitizeText(raw.nameBn, 200),
          eiin: sanitizeText(raw.eiin, 40),
          code: sanitizeText(raw.code, 40),
          addressEn: sanitizeText(raw.addressEn, 300),
          addressBn: sanitizeText(raw.addressBn, 300),
          phone: sanitizeText(raw.phone, 40),
          email: sanitizeText(raw.email, 160),
          website: sanitizeOptionalMediaUrl(raw.website, 300),
          establishedYear: sanitizeText(raw.establishedYear, 20),
          motto: sanitizeText(raw.motto, 300),
          logoUrl: sanitizeOptionalMediaUrl(raw.logoUrl),
          principalNameEn: sanitizeText(raw.principalNameEn, 150),
          principalNameBn: sanitizeText(raw.principalNameBn, 150),
          principalSignatureUrl: sanitizeOptionalMediaUrl(raw.principalSignatureUrl),
          classTeacherName: sanitizeText(raw.classTeacherName, 150),
          classTeacherSignatureUrl: sanitizeOptionalMediaUrl(raw.classTeacherSignatureUrl),
        };
        fs.writeFileSync(schoolProfileFile, JSON.stringify(sanitizedProfile, null, 2), 'utf-8');
        return res.json({ success: true, profile: sanitizedProfile });
      } catch (err) {
        console.error('Failed to save school profile:', err);
        return res.status(500).json({ success: false, error: 'Failed to save school profile.' });
      }
    }
  );

  // API: MFS Payment Settings (bKash, Nagad & Rocket number and type)
  app.get('/api/mfs-settings', (_req: Request, res: Response) => {
    try {
      const defaultMfs = {
        bkashNumber: '01711234567',
        bkashType: 'Personal',
        nagadNumber: '01911234567',
        nagadType: 'Personal',
        rocketNumber: '01811234567',
        rocketType: 'Personal',
        instructionsBn:
          'বিকাশ, নগদ অথবা রকেট নম্বরে সেন্ড মানি বা পেমেন্ট করে নিচের ফর্মে TrxID ও প্রেরকের নম্বর দিন।',
        instructionsEn:
          'Send money to our bKash, Nagad, or Rocket number, then submit your TrxID and phone number.',
      };
      if (fs.existsSync(mfsSettingsFile)) {
        const data = JSON.parse(fs.readFileSync(mfsSettingsFile, 'utf-8'));
        if (isPlainRecord(data)) {
          return res.json({
            success: true,
            settings: {
              bkashNumber: sanitizeText(data.bkashNumber, 30) || defaultMfs.bkashNumber,
              bkashType: sanitizeText(data.bkashType, 30) || defaultMfs.bkashType,
              nagadNumber: sanitizeText(data.nagadNumber, 30) || defaultMfs.nagadNumber,
              nagadType: sanitizeText(data.nagadType, 30) || defaultMfs.nagadType,
              rocketNumber: sanitizeText(data.rocketNumber, 30) || defaultMfs.rocketNumber,
              rocketType: sanitizeText(data.rocketType, 30) || defaultMfs.rocketType,
              instructionsBn: sanitizeText(data.instructionsBn, 600) || defaultMfs.instructionsBn,
              instructionsEn: sanitizeText(data.instructionsEn, 600) || defaultMfs.instructionsEn,
            },
          });
        }
      }
      return res.json({ success: true, settings: defaultMfs });
    } catch (err) {
      console.error('Failed to read MFS settings:', err);
      return res.status(500).json({ success: false, error: 'Failed to load MFS settings.' });
    }
  });

  app.post(
    '/api/mfs-settings',
    saasMw.requireAuth,
    saasMw.requireRole(['super_admin', 'admin', 'accountant', 'master_admin']),
    (req: Request, res: Response) => {
      try {
        if (!isPlainRecord(req.body)) {
          return res.status(400).json({ success: false, error: 'Invalid MFS settings' });
        }
        const allowedTypes = new Set(['Personal', 'Merchant', 'Agent']);
        const sanitizeType = (val: unknown) => {
          const clean = sanitizeText(val, 20);
          return allowedTypes.has(clean) ? clean : 'Personal';
        };
        const sanitizedSettings = {
          bkashNumber: sanitizeText(req.body.bkashNumber, 30),
          bkashType: sanitizeType(req.body.bkashType),
          nagadNumber: sanitizeText(req.body.nagadNumber, 30),
          nagadType: sanitizeType(req.body.nagadType),
          rocketNumber: sanitizeText(req.body.rocketNumber, 30),
          rocketType: sanitizeType(req.body.rocketType),
          instructionsBn: sanitizeText(req.body.instructionsBn, 600),
          instructionsEn: sanitizeText(req.body.instructionsEn, 600),
        };
        fs.writeFileSync(mfsSettingsFile, JSON.stringify(sanitizedSettings, null, 2), 'utf-8');
        return res.json({ success: true, settings: sanitizedSettings });
      } catch (err) {
        console.error('Failed to save MFS settings:', err);
        return res.status(500).json({ success: false, error: 'Failed to save MFS settings.' });
      }
    }
  );

  // Helper to check API Key availability
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // API: Health & AI Status
  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
    res.json({
      status: 'ok',
      aiEnabled: hasKey,
      model: 'gemini-4-hydrogen',
      message: hasKey
        ? 'Gemini AI Multimodal Engine is active and ready.'
        : 'GEMINI_API_KEY is not configured in environment. Please add it to .env or environment secrets.',
    });
  });

  const aiRateLimiter = createUserRateLimiter(40, 60_000);

  // API: Multimodal AI Smart Homework Evaluation
  app.post('/api/ai/evaluate-homework', saasMw.requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isPlainRecord(req.body)) {
        return res.status(400).json({ success: false, error: 'Invalid request payload.' });
      }
      const homeworkTitle = sanitizeText(req.body.homeworkTitle, 240);
      const subjectName = sanitizeText(req.body.subjectName, 120);
      const description = sanitizeText(req.body.description, 6000);
      const referenceAnswer = sanitizeText(req.body.referenceAnswer, 8000);
      const referenceAnswerAttachment =
        typeof req.body.referenceAnswerAttachment === 'string' && SAFE_DATA_IMAGE_REGEX.test(req.body.referenceAnswerAttachment)
          ? req.body.referenceAnswerAttachment
          : '';
      const optionalInstructions = sanitizeText(req.body.optionalInstructions, 2000);
      const questionAttachment =
        typeof req.body.questionAttachment === 'string' && SAFE_DATA_IMAGE_REGEX.test(req.body.questionAttachment)
          ? req.body.questionAttachment
          : '';
      const questionImages = Array.isArray(req.body.questionImages)
        ? req.body.questionImages.filter((q: unknown): q is string => typeof q === 'string' && SAFE_DATA_IMAGE_REGEX.test(q)).slice(0, 5)
        : [];
      const studentName = sanitizeText(req.body.studentName, 120);
      const className = sanitizeText(req.body.className, 60);
      const section = sanitizeText(req.body.section, 30);
      const textAnswer = sanitizeText(req.body.textAnswer, 12000);
      const images = Array.isArray(req.body.images)
        ? req.body.images.filter((img: unknown): img is string => typeof img === 'string' && SAFE_DATA_IMAGE_REGEX.test(img)).slice(0, 5)
        : [];

      const numericFullMarks = Math.min(1000, Math.max(1, Number(req.body.fullMarks) || 10));

      const ai = getGeminiClient();
      if (!ai) {
        const unconfiguredEvaluation = {
          status: 'review_required' as const,
          suggestedMarks: 0,
          fullMarks: numericFullMarks,
          confidence: 0,
          correctAnswers: 0,
          partialAnswers: 0,
          incorrectAnswers: 0,
          missingAnswers: 0,
          mathematicalAccuracy: 'এআই API Key কনফিগার করা নেই; স্বয়ংক্রিয় যাচাই সম্ভব হয়নি।',
          spellingQuality: 'শিক্ষকের সরাসরি মূল্যায়ন প্রয়োজন।',
          feedback:
            'সার্ভারে এআই API Key কনফিগার না থাকায় স্বয়ংক্রিয় মূল্যায়ন করা যায়নি। আপনার খাতা জমা হয়েছে; শিক্ষকের রিভিউয়ের পর নম্বর প্রকাশ করা হবে।',
          requiresTeacherReview: true,
          reviewReason: 'GEMINI_API_KEY is not configured on the server.',
          alternativeAnswerAccepted: false,
          evaluatedAt: new Date().toISOString(),
        };
        return res.json({
          success: true,
          evaluation: unconfiguredEvaluation,
        });
      }

      const contents: any[] = [];

      const promptText = `
You are an expert Bangladeshi school curriculum evaluator and strict, fair examiner reviewing a student's homework submission.
School Subject: "${subjectName || 'General'}"
Class: "${className || 'Class 10'}", Section: "${section || 'A'}"
Student Name: "${studentName || 'Student'}"
Homework Title: "${homeworkTitle}"
Homework Instructions: "${description || 'None'}"
Teacher's Special Guidelines: "${optionalInstructions || 'None'}"
Full Marks: ${numericFullMarks}

TEACHER'S REFERENCE ANSWER / SOLUTION:
"""
${referenceAnswer || 'No specific reference answer provided. Evaluate strictly against the Homework Instructions and standard NCTB textbook curriculum.'}
"""

STUDENT'S SUBMITTED TEXT (if any):
"""
${textAnswer || 'See attached handwritten images/pages.'}
"""

CRITICAL EVALUATION & GRADING RULES (FOLLOW STRICTLY):
1. ITEM-BY-ITEM VERIFICATION:
   - Carefully inspect BOTH the student's text answer AND every attached handwritten page image(s).
   - Break the assignment down into every individual item, number, word, calculation step, or sub-question expected from the Homework Instructions and Reference Answer.
   - Example: If the homework asks to write numbers "1-10" (10 items total) and Full Marks is 10, each number carries 1 mark. Verify EVERY SINGLE number from 1 to 10 individually.
   - If 7 items are correct and 3 items are wrong or missing (for example, writing 77, 88, 99 instead of 7, 8, 9), then correctAnswers = 7, incorrectAnswers = 3 (or missingAnswers), and suggestedMarks MUST be 7 out of 10!
2. STRICT PROPORTIONAL DEDUCTION (NO INFLATED SCORES):
   - Deduct marks proportionally for EVERY wrong value, calculation error, grammatical/factual error, or omitted item.
   - NEVER award 9/10 or full/near-full marks when multiple items or steps are incorrect or missing.
   - If the student submits nothing meaningful or off-topic text/image, award 0 marks.
   - suggestedMarks MUST be mathematically consistent with correctAnswers, partialAnswers, incorrectAnswers, missingAnswers, and ${numericFullMarks}.
   - suggestedMarks MUST be between 0 and ${numericFullMarks}.
3. SUBSTANCE OVER EXACT WORDING:
   - For descriptive/conceptual questions, accept valid alternative explanations, synonyms, or mathematically equivalent valid steps in Bangla or English.
4. UNCLEAR HANDWRITING:
   - If handwritten images are genuinely illegible or too blurry to read, set "requiresTeacherReview": true, "status": "review_required", confidence <= 0.6, and explain the exact issue in "reviewReason". Otherwise set "status": "evaluated" and "requiresTeacherReview": false.
5. SPECIFIC ITEMIZED FEEDBACK IN BENGALI:
   - In "feedback", clearly write in Bengali:
     (a) মোট কয়টি সঠিক ও কয়টি ভুল/বাকি হয়েছে,
     (b) সুনির্দিষ্টভাবে কোন কোন নম্বর/ধাপ/উত্তর ভুল বা বাদ পড়েছে (list the exact wrong/missing items so the student sees why marks were deducted),
     (c) সংক্ষিপ্ত সংশোধন নির্দেশনা।
`;

      contents.push({ text: promptText });

      if (typeof questionAttachment === 'string' && questionAttachment.startsWith('data:')) {
        const matchQ = questionAttachment.match(/^data:([^;]+);base64,(.+)$/);
        if (matchQ) {
          contents.push({
            text: "TEACHER'S ATTACHED QUESTION PAPER / TEXTBOOK PROBLEM IMAGE (The assignment questions to be answered):",
          });
          contents.push({
            inlineData: {
              mimeType: matchQ[1],
              data: matchQ[2],
            },
          });
        }
      }
      if (Array.isArray(questionImages) && questionImages.length > 0) {
        for (const qImg of questionImages) {
          if (typeof qImg === 'string' && qImg.startsWith('data:') && qImg !== questionAttachment) {
            const matchQ = qImg.match(/^data:([^;]+);base64,(.+)$/);
            if (matchQ) {
              contents.push({ text: 'ADDITIONAL QUESTION PAGE / DIAGRAM:' });
              contents.push({
                inlineData: {
                  mimeType: matchQ[1],
                  data: matchQ[2],
                },
              });
            }
          }
        }
      }

      if (typeof referenceAnswerAttachment === 'string' && referenceAnswerAttachment.startsWith('data:')) {
        const matchRef = referenceAnswerAttachment.match(/^data:([^;]+);base64,(.+)$/);
        if (matchRef) {
          contents.push({
            text: "TEACHER'S ATTACHED REFERENCE ANSWER / SOLUTION IMAGE (Compare student's work to this):",
          });
          contents.push({
            inlineData: {
              mimeType: matchRef[1],
              data: matchRef[2],
            },
          });
        }
      }

      if (Array.isArray(images) && images.length > 0) {
        contents.push({ text: "STUDENT'S SUBMITTED HANDWRITTEN PAGES / WORK:" });
        for (const imgItem of images) {
          if (typeof imgItem === 'string' && imgItem.startsWith('data:')) {
            const match = imgItem.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              contents.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          }
        }
      }

      const evaluationSchema = {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ['evaluated', 'review_required', 'failed'] },
          suggestedMarks: { type: Type.NUMBER },
          fullMarks: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
          correctAnswers: { type: Type.INTEGER },
          partialAnswers: { type: Type.INTEGER },
          incorrectAnswers: { type: Type.INTEGER },
          missingAnswers: { type: Type.INTEGER },
          mathematicalAccuracy: { type: Type.STRING },
          spellingQuality: { type: Type.STRING },
          feedback: { type: Type.STRING },
          requiresTeacherReview: { type: Type.BOOLEAN },
          reviewReason: { type: Type.STRING },
          alternativeAnswerAccepted: { type: Type.BOOLEAN },
        },
        required: [
          'status',
          'suggestedMarks',
          'fullMarks',
          'confidence',
          'correctAnswers',
          'partialAnswers',
          'incorrectAnswers',
          'missingAnswers',
          'mathematicalAccuracy',
          'spellingQuality',
          'feedback',
          'requiresTeacherReview',
          'alternativeAnswerAccepted',
        ],
      };

      const callModelWithTimeout = async (modelName: string, timeoutMs: number) => {
        const apiCall = ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: evaluationSchema,
          },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs)
        );
        return (await Promise.race([apiCall, timeoutPromise])) as any;
      };

      const callAIWithTimeout = async () => {
        const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
        let lastErr: any;
        for (const modelName of candidateModels) {
          try {
            return await callModelWithTimeout(modelName, 18000);
          } catch (err: any) {
            lastErr = err;
            const msg = String(err?.message || err || '');
            const isTransient =
              msg.includes('503') ||
              msg.includes('429') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('AI_TIMEOUT');
            if (!isTransient) {
              throw err;
            }
            console.warn(`[AI Evaluate] Model ${modelName} unavailable (${msg.slice(0, 120)}), trying next model...`);
          }
        }
        throw lastErr;
      };

      let parsedResult: any;

      try {
        const response = await callAIWithTimeout();
        const responseText = response.text || '{}';
        try {
          parsedResult = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          parsedResult = JSON.parse(cleaned);
        }
      } catch (llmErr: any) {
        console.warn('Gemini homework evaluation failed or timed out:', llmErr?.message || llmErr);
        parsedResult = {
          status: 'review_required',
          suggestedMarks: 0,
          fullMarks: numericFullMarks,
          confidence: 0,
          correctAnswers: 0,
          partialAnswers: 0,
          incorrectAnswers: 0,
          missingAnswers: 0,
          mathematicalAccuracy: 'এআই মূল্যায়ন সার্ভার থেকে সময়মতো উত্তর পাওয়া যায়নি।',
          spellingQuality: 'শিক্ষকের সরাসরি যাচাই প্রয়োজন।',
          feedback:
            'এই মুহূর্তে স্বয়ংক্রিয় এআই মূল্যায়ন সম্পন্ন করা যায়নি। আপনার উত্তর জমা হয়েছে এবং শিক্ষকের যাচাইয়ের জন্য অপেক্ষমাণ রয়েছে।',
          requiresTeacherReview: true,
          reviewReason: llmErr?.message || 'AI evaluation failed or timed out on server.',
          alternativeAnswerAccepted: false,
        };
      }

      parsedResult.fullMarks = numericFullMarks;
      const rawSuggested = Number(parsedResult.suggestedMarks);
      const boundedSuggested = Number.isFinite(rawSuggested)
        ? Math.min(numericFullMarks, Math.max(0, Math.round(rawSuggested * 2) / 2))
        : 0;
      parsedResult.suggestedMarks = boundedSuggested;
      parsedResult.evaluatedAt = new Date().toISOString();

      return res.json({
        success: true,
        evaluation: parsedResult,
      });
    } catch (error: any) {
      console.error('Gemini AI Evaluation Error:', error);
      return res.status(500).json({
        success: false,
        error: 'AI_EVALUATION_ERROR',
        message: 'Error occurred during AI homework evaluation.',
      });
    }
  });

  // API: AI Student Performance Analytics
  app.post('/api/ai/student-analytics', saasMw.requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isPlainRecord(req.body)) {
        return res.status(400).json({ success: false, error: 'ANALYTICS_ERROR', message: 'Invalid request payload.' });
      }
      const studentName = sanitizeText(req.body.studentName, 120) || 'Student';
      const className = sanitizeText(req.body.className, 60) || 'Class 10';
      const attendancePercentage = Math.min(100, Math.max(0, Number(req.body.attendancePercentage) || 0));
      const homeworkSubmissionRate = Math.min(100, Math.max(0, Number(req.body.homeworkSubmissionRate) || 0));
      const homeworkAverageMarks = Math.min(100, Math.max(0, Number(req.body.homeworkAverageMarks) || 0));
      const examAverageMarks = Math.min(100, Math.max(0, Number(req.body.examAverageMarks) || 0));
      const subjectPerformance = Array.isArray(req.body.subjectPerformance)
        ? req.body.subjectPerformance.slice(0, 20)
        : [];
      const weakSubjects = Array.isArray(req.body.weakSubjects)
        ? req.body.weakSubjects.map((s: unknown) => sanitizeText(s, 80)).filter(Boolean).slice(0, 15)
        : [];
      const strongSubjects = Array.isArray(req.body.strongSubjects)
        ? req.body.strongSubjects.map((s: unknown) => sanitizeText(s, 80)).filter(Boolean).slice(0, 15)
        : [];
      const missingHomeworkCount = Math.min(1000, Math.max(0, Number(req.body.missingHomeworkCount) || 0));
      const attendanceWarning = Boolean(req.body.attendanceWarning);

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'AI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY পাওয়া যায়নি।',
          configured: false,
        });
      }

      const promptText = `
You are an expert educational counselor and academic dean at a Bangladeshi High School analyzing a student's holistic academic profile.

STUDENT ACADEMIC PROFILE:
- Student Name: ${studentName}
- Class: ${className}
- Attendance Rate: ${attendancePercentage}% (Warning flagged: ${attendanceWarning ? 'YES' : 'NO'})
- Homework Submission Rate: ${homeworkSubmissionRate}% (Missing Homeworks: ${missingHomeworkCount})
- Homework Average Score: ${homeworkAverageMarks}%
- Exam Average Score: ${examAverageMarks}%
- Strong Subjects: ${strongSubjects.join(', ') || 'Consistent across subjects'}
- Weak Subjects: ${weakSubjects.join(', ') || 'None identified'}
- Subject Performance Breakdown: ${JSON.stringify(subjectPerformance)}

TASK:
Generate a high-value, realistic, pedagogical performance analysis in Bengali with English key terms.
Provide:
1. "aiSummary": A concise 2-3 sentence overview of academic performance, attendance compliance, and learning trends.
2. "aiRecommendations": An array of 4-5 concrete, actionable study guidelines tailored to this student's specific weak subjects and habits (e.g., extra math problem-solving drills, weekly teacher check-ins, study timetable, parent guidance).
3. "predictedGrowth": Estimated percentage improvement (e.g. "+5% to +8%") if recommendations are followed.

OUTPUT FORMAT: Return ONLY valid JSON:
{
  "aiSummary": "string in Bengali",
  "aiRecommendations": ["string 1", "string 2", "string 3", "string 4"],
  "predictedGrowth": "string"
}
`;

      let parsed: any;
      try {
        const apiCall = ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
          },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), 20000)
        );
        const response = (await Promise.race([apiCall, timeoutPromise])) as any;
        const responseText = response.text || '{}';
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }
      } catch (err) {
        console.warn('Student analytics LLM call timed out, generating pedagogical assessment:', err);
        const weakList =
          Array.isArray(weakSubjects) && weakSubjects.length > 0
            ? weakSubjects
            : ['গণিত (General Mathematics)'];
        const recs: string[] = [
          `${weakList.join(' ও ')}-এ দুর্বলতা কাটাতে দৈনিক অন্তত ৪৫ মিনিট অতিরিক্ত অধ্যায়ভিত্তিক অনুশীলন নিশ্চিত করুন।`,
          'প্রতি সপ্তাহে শিক্ষক কর্তৃক প্রদত্ত হোমওয়ার্ক নিয়মিত জমা দিয়ে তাত্ক্ষণিক এআই ফিডব্যাক যাচাই করুন।',
          attendanceWarning
            ? 'উপস্থিতির হার ৮০%-এর নিচে থাকায় ক্লাসে উপস্থিতি শতভাগ নিশ্চিত করতে হবে।'
            : 'উপস্থিতির চমৎকার হার বজায় রেখে বোর্ড মডেল টেস্ট প্রশ্ন সমাধানের চর্চা অব্যাহত রাখুন।',
          'অভিভাবক-শিক্ষক মাসিক সভায় শিক্ষার্থীর অগ্রগতি আলোচনা করে যৌথ ফলো-আপ বজায় রাখুন।',
        ];
        parsed = {
          aiSummary: `${studentName}-এর গড় উপস্থিতি ${attendancePercentage}% এবং হোমওয়ার্ক জমাদান হার ${homeworkSubmissionRate}%। ${weakList.join(', ')}-এ বিশেষ মনোযোগ প্রয়োজন।`,
          aiRecommendations: recs,
          predictedGrowth: '+7% to +10% সম্ভাব্য ফলাফল বৃদ্ধি',
        };
      }

      return res.json({
        success: true,
        analytics: parsed,
      });
    } catch (error: any) {
      console.error('Gemini AI Student Analytics Error:', error);
      return res.status(500).json({
        success: false,
        error: 'ANALYTICS_ERROR',
        message: 'Error generating AI student analytics.',
      });
    }
  });

  // API: ROLE-GOVERNED AMARSCHOOL AI AGENT (স্মার্ট এআই সহকারী)
  app.post('/api/ai/agent-chat', saasMw.requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isPlainRecord(req.body)) {
        return res.status(400).json({ success: false, error: 'Invalid request payload.' });
      }
      const principal = req.principal!;
      // Derive AI persona strictly from verified server-side role/claims (never trust client-supplied req.body.role)
      const role: 'super_admin' | 'teacher' | 'student' =
        principal.isMasterAdmin ||
        principal.schoolRole === 'super_admin' ||
        principal.schoolRole === 'admin'
          ? 'super_admin'
          : ['teacher', 'accountant', 'staff', 'librarian', 'receptionist', 'gatekeeper'].includes(
              principal.schoolRole || ''
            )
          ? 'teacher'
          : 'student';

      const message = sanitizeText(req.body.message, 4000);
      const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
      const userName = sanitizeText(principal.displayName || req.body.userName, 100) || 'User';
      const studentContext = isPlainRecord(req.body.studentContext) ? req.body.studentContext : null;
      const schoolContext =
        role !== 'student' && isPlainRecord(req.body.schoolContext) ? req.body.schoolContext : null;

      if (!message) {
        return res.status(400).json({ success: false, error: 'Empty message' });
      }

      let systemInstruction = '';
      let contextSummary = '';

      if (role === 'student') {
        const safeStudent = studentContext || {};
        contextSummary = `
STUDENT'S OWN PROFILE (Only information about this specific student):
- Name: ${userName}
- Class: ${safeStudent.className || 'Class 10'}
- Section: ${safeStudent.section || 'A'}
- Roll: ${safeStudent.roll || 'N/A'}
- Today's Attendance: ${safeStudent.todayAttendance || 'Present'}
- My Pending Homeworks: ${JSON.stringify(safeStudent.pendingHomeworks || [])}
- My Exam Routine / Dates: ${JSON.stringify(safeStudent.upcomingExams || [])}
`;

        systemInstruction = `
You are "অমরস্কুল এআই শিক্ষা সহকারী (AmarSchool AI Student Assistant)", a polite, encouraging, and highly knowledgeable Bangladeshi academic tutor and mentor assisting student ${userName}.

CRITICAL PRIVACY & SECURITY DIRECTIVE (NON-NEGOTIABLE):
1. You are assisting a STUDENT. You must NEVER reveal or discuss:
   - Administrative passwords, login credentials, superadmin controls, or database keys.
   - School finances, fee collection totals, school account balance, or teacher salaries.
   - Any other student's personal information, marks, roll, attendance, or home phone numbers.
2. If the user asks for passwords, admin permissions, school balance, or another student's details, you MUST strictly and politely refuse in Bengali:
   "দুঃখিত, প্রাতিষ্ঠানিক গোপনীয়তা ও নিরাপত্তা নীতিমালার কারণে এই তথ্য প্রকাশ করা সম্ভব নয়। এটি শুধুমাত্র প্রধান শিক্ষক ও সুপারঅ্যাডমিনের জন্য সংরক্ষিত।"
3. Your core purpose:
   - Help the student understand homework questions, mathematics solutions, science concepts, English grammar, and Bangla literature step-by-step.
   - Answer queries about the student's OWN upcoming homework and exam dates using the provided Student Profile.
   - Give exam study tips, motivation, and time management advice.
   - Always respond respectfully in clear, natural Bengali (with English subject terms where helpful).
`;
      } else if (role === 'teacher') {
        contextSummary = `
TEACHER'S PROFILE & CONTEXT:
- Teacher Name: ${userName}
- Context Data: ${JSON.stringify(schoolContext || {})}
`;
        systemInstruction = `
You are "অমরস্কুল শিক্ষক এআই সহকারী (AmarSchool AI Teacher Assistant)", an expert pedagogical advisor and curriculum specialist for Bangladeshi schools following NCTB curriculum.

Capabilities:
1. Help teacher ${userName} formulate structured Lesson Plans (পাঠ পরিকল্পনা) for standard classes.
2. Generate creative questions (সৃজনশীল প্রশ্ন - ক, খ, গ, ঘ), multiple choice questions (MCQ) with answer explanations.
3. Suggest interactive teaching methodologies, homework topics, and student engagement strategies.
4. Assist in marking criteria and academic rubric design.
5. Never disclose administrative passwords or confidential school accounting.
Respond cordially and professionally in Bengali.
`;
      } else {
        const safeSchool = schoolContext || {};
        contextSummary = `
INSTITUTIONAL METRICS (Super Admin Executive View):
- Institution: ${safeSchool.schoolName || 'Smart School BD ERP'}
- Total Students: ${safeSchool.totalStudents || 50}
- Total Teachers: ${safeSchool.totalTeachers || 12}
- Today's Attendance Rate: ${safeSchool.attendanceRate || '96%'}
- Total Collected Fees: ৳${safeSchool.totalCollected || '0'}
- Total Fee Due: ৳${safeSchool.totalDue || '0'}
- Active Notice Count: ${safeSchool.noticeCount || 0}
`;
        systemInstruction = `
You are "অমরস্কুল সুপারএডমিন এক্সিকিউটিভ এআই (AmarSchool Executive AI Agent)", the chief executive AI assistant to the Principal/Super Administrator of the school.

Capabilities:
1. Executive Management: Provide instant operational updates on school attendance, fee recovery, admission, and academic progress.
2. Autonomous Action Drafting:
   - When the Super Admin commands you to draft or publish a notice (e.g. "কাল বৃষ্টির কারণে স্কুল ছুটির নোটিশ দাও", "ফি পরিশোধের জন্য অভিভাবক নোটিশ জারি করো", "পরীক্ষার নোটিশ দাও"), draft the formal institutional announcement in Bengali.
   - CRITICAL: In addition to your polite Bengali response, ALWAYS append an actionable structured JSON block at the bottom wrapped in \`\`\`action ... \`\`\` so the frontend system can publish it with 1 click:
   \`\`\`action
   {
     "actionType": "CREATE_NOTICE",
     "title": "নোটিশের শিরোনাম",
     "content": "নোটিশের পূর্ণাঙ্গ বিবরণ ও নির্দেশাবলী...",
     "category": "Holiday" | "Academic" | "Emergency" | "Fee" | "General"
   }
   \`\`\`
3. Always maintain an authoritative, supportive, executive tone in Bengali.
`;
      }

      const ai = getGeminiClient();

      const getFallbackResponse = (userMsg: string, uRole: string) => {
        const q = userMsg.toLowerCase();

        if (uRole === 'student') {
          if (
            q.includes('password') ||
            q.includes('পাসওয়ার্ড') ||
            q.includes('টাকা') ||
            q.includes('হিসাব') ||
            q.includes('ব্যাংক') ||
            q.includes('admin') ||
            q.includes('merit') ||
            q.includes('অন্যদের')
          ) {
            return {
              text: `🔒 **নিরাপত্তা বার্তা:**\n\nদুঃখিত ${userName}, প্রাতিষ্ঠানিক গোপনীয়তা ও সুরক্ষা বিধিমালার কারণে বিদ্যালয়ের প্রশাসনিক পাসওয়ার্ড, আর্থিক হিসাব কিংবা অন্য সহপাঠীর ব্যক্তিগত ফলাফল প্রকাশ করা নিষিদ্ধ। এটি শুধুমাত্র প্রধান শিক্ষক ও সুপারঅ্যাডমিনের জন্য সংরক্ষিত।\n\nতোমার নিজের পড়ালেখা, হোমওয়ার্ক বা পরীক্ষার রুটিন সম্পর্কে কোনো সাহায্য লাগলে বলো, আমি আনন্দের সাথে বুঝিয়ে দেব! 😊`,
            };
          }
          if (q.includes('রুটিন') || q.includes('routine') || q.includes('পরীক্ষা') || q.includes('exam')) {
            return {
              text: `📚 **${userName}, তোমার পরীক্ষার প্রস্তুতি নির্দেশিকা:**\n\nতোমার শ্রেণি: **${studentContext?.className || 'Class 10'}**।\n• এনসিটিবি সিলেবাস অনুযায়ী রুটিনে থাকা প্রতিটি বিষয়ের অধ্যায়ভিত্তিক রিভিশন সম্পন্ন করো।\n• প্রতিদিন অন্তত ২ ঘণ্টা সৃজনশীল লিখিত প্রশ্ন সমাধানের চর্চা করো।\n• প্রবেশপত্র (Admit Card) পরীক্ষা শুরু হওয়ার পূর্বেই প্রিন্ট করে প্রস্তুত রাখো।\n\nকোনো বিষয়ের নির্দিষ্ট অধ্যায় বুঝতে চাইলে আমাকে সরাসরি প্রশ্ন করো!`,
            };
          }
          if (q.includes('গণিত') || q.includes('math') || q.includes('formula') || q.includes('সূত্র')) {
            return {
              text: `📐 **গণিত সমাধান ও সূত্রের সহজ টিপস:**\n\nবীজগণিতীয় গুরুত্বপূর্ণ সূত্রাবলী:\n1. $(a + b)^2 = a^2 + 2ab + b^2$\n2. $(a - b)^2 = a^2 - 2ab + b^2$\n3. $a^2 - b^2 = (a + b)(a - b)$\n4. $(a + b + c)^2 = a^2 + b^2 + c^2 + 2(ab + bc + ca)$\n\nকোনো নির্দিষ্ট অঙ্কের সমাধান চাইলে প্রশ্নটি এখানে লিখে দাও, আমি ধাপে ধাপে বুঝিয়ে দিচ্ছি!`,
            };
          }
          return {
            text: `নমস্কার / আসসালামু আলাইকুম ${userName}! আমি তোমার **অমরস্কুল এআই শিক্ষা সহকারী**। 🎓\n\nআমি তোমাকে যেভাবে সাহায্য করতে পারি:\n• যেকোনো বিষয়ের হোমওয়ার্ক বা কঠিন টপিক সহজ ভাষায় বুঝিয়ে দেওয়া\n• পরীক্ষার রুটিন অনুযায়ী পড়ার সময়সূচী তৈরি করা\n• ব্যাকরণ, বিজ্ঞান বা গণিতের সূত্র সমাধান করা\n\nতোমার কী জানার আছে বলো, আমি সাথে সাথে সাহায্য করছি!`,
          };
        }

        if (uRole === 'teacher') {
          return {
            text: `শ্রদ্ধেয় ${userName} শিক্ষক মহোদয়,\n\nআমি আপনার **অমরস্কুল শিক্ষক এআই সহকারী**। 📝\n\nআমি আপনাকে যেভাবে সহায়তা করতে পারি:\n1. **সৃজনশীল প্রশ্ন তৈরি:** NCTB কারিকুলাম অনুসারে জ্ঞান, অনুধাবন, প্রয়োগ ও উচ্চতর দক্ষতার প্রশ্ন প্রণয়ন।\n2. **পাঠ পরিকল্পনা (Lesson Plan):** ৪০-৫০ মিনিটের কার্যকর ক্লাস পরিচালনা কাঠামো।\n3. **কুইজ ও মডেল টেস্ট:** বহুনিবার্চনী প্রশ্ন ও উত্তরমালা তৈরি।\n\nআপনি কোন বিষয় এবং শ্রেণির জন্য উপকরণ তৈরি করতে চান তা জানালে এখনই ড্রাফট প্রস্তুত করে দেব।`,
          };
        }

        if (
          q.includes('math') ||
          q.includes('গণিত') ||
          q.includes('posno') ||
          q.includes('প্রশ্ন') ||
          q.includes('nine') ||
          q.includes('৯ম') ||
          q.includes('সমস্যা')
        ) {
          return {
            text: `📐 **৯ম শ্রেণির সাধারণ গণিত সৃজনশীল প্রশ্ন ও সমাধান (অধ্যায়: ৩ - বীজগণিতীয় রাশি):**\n\n**উদ্দীপক:**\nএকটি বাস্তব সংখ্যা $x$, যেখানে $x^2 - 3x + 1 = 0$ এবং $x > 0$।\n\n**প্রশ্নাবলী:**\n**(ক)** $x + \\frac{1}{x}$-এর মান কত? *(মান: ২)*\n**(খ)** প্রমাণ করো যে, $x^4 + \\frac{1}{x^4} = ৪৭$। *(মান: ৪)*\n**(গ)** $x^5 - \\frac{1}{x^5}$-এর মান নির্ণয় করো। *(মান: ৪)*`,
          };
        }

        if (
          q.includes('ছুটি') ||
          q.includes('holiday') ||
          q.includes('নোটিশ') ||
          q.includes('notice') ||
          q.includes('বৃষ্টি') ||
          q.includes('বন্ধ')
        ) {
          const title = q.includes('বৃষ্টি')
            ? 'ভারী বর্ষণের কারণে বিদ্যালয় ছুটি সংক্রান্ত জরুরি নোটিশ'
            : 'বিদ্যালয় সাধারণ ছুটি সংক্রান্ত বিজ্ঞপ্তি';
          const content =
            'এতদ্বারা বিদ্যালয়ের সকল শিক্ষক, শিক্ষার্থী ও অভিভাবকদের জানানো যাচ্ছে যে, অনিবার্য কারণবশত আগামী কার্যদিবসে বিদ্যালয়ের সকল শ্রেণি কার্যক্রম স্থগিত থাকবে। পরবর্তী নোটিশ অনুযায়ী যথারীতি ক্লাস চলবে।';
          return {
            text: `মহোদয়, আপনার নির্দেশ অনুযায়ী নোটিশটি প্রস্তুত করা হয়েছে। নিচে ১-ক্লিক প্রকাশ বাটনে চাপ দিয়ে সরাসরি স্কুল নোটিশ বোর্ডে প্রকাশ করতে পারেন।\n\n\`\`\`action\n{\n  "actionType": "CREATE_NOTICE",\n  "title": "${title}",\n  "content": "${content}",\n  "category": "Holiday"\n}\n\`\`\``,
            action: {
              actionType: 'CREATE_NOTICE',
              title,
              content,
              category: 'Holiday',
            },
          };
        }

        return {
          text: `সম্মানিত সুপারঅ্যাডমিন মহোদয়,\n\nআমি আপনার **অমরস্কুল এক্সিকিউটিভ এআই এজেন্ট**। 🏫\n\nবিদ্যালয়ের সার্বিক তথ্য:\n• মোট শিক্ষার্থী: ${schoolContext?.totalStudents || 50} জন\n• দৈনিক গড় উপস্থিতি: ${schoolContext?.attendanceRate || '৯৬%'}\n• সক্রিয় নোটিশ: ${schoolContext?.noticeCount || 2}টি\n\nআপনি আমাকে যেকোনো প্রশাসনিক নির্দেশ দিতে পারেন (যেমন: নোটিশ জারি করা, ছুটির বিজ্ঞপ্তি প্রকাশ, ফি রিমাইন্ডার তৈরি, বা রুটিন পরিকল্পনা)। আমি তাৎক্ষণিক বাস্তবায়ন করে দেব।`,
        };
      };

      if (!ai) {
        const fallback = getFallbackResponse(message, role);
        return res.json({
          success: true,
          text: fallback.text,
          action: fallback.action || null,
          mode: 'grounded_offline',
        });
      }

      try {
        const chatContents: any[] = [];

        chatContents.push({
          role: 'user',
          parts: [
            {
              text: `${systemInstruction}\n\n${contextSummary}\n\nPlease acknowledge your role and readiness.`,
            },
          ],
        });
        chatContents.push({
          role: 'model',
          parts: [
            {
              text: 'আমি প্রস্তুত। আমি অমরস্কুল এআই সহকারী হিসেবে আমার নির্ধারিত ভূমিকা ও সর্বোচ্চ নিরাপত্তা ও গোপনীয়তা নীতি মেনে উত্তর প্রদান করব।',
            },
          ],
        });

        if (Array.isArray(history) && history.length > 0) {
          history.slice(-6).forEach((h: any) => {
            if (h && Array.isArray(h.parts)) {
              const sanitizedParts = h.parts
                .map((p: any) => sanitizeText(p?.text, 2000))
                .filter(Boolean)
                .map((text: string) => ({ text }));
              if (sanitizedParts.length > 0) {
                chatContents.push({
                  role: h.role === 'model' ? 'model' : 'user',
                  parts: sanitizedParts,
                });
              }
            }
          });
        }

        chatContents.push({
          role: 'user',
          parts: [{ text: message }],
        });

        const apiCall = ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: chatContents,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), 20000)
        );

        const response = (await Promise.race([apiCall, timeoutPromise])) as any;
        const rawText = response.text || '';

        let extractedAction: any = null;
        if (role === 'super_admin') {
          const actionMatch = rawText.match(/```action\s*([\s\S]*?)\s*```/);
          if (actionMatch && actionMatch[1]) {
            try {
              const candidateAction = JSON.parse(actionMatch[1]);
              if (isPlainRecord(candidateAction) && candidateAction.actionType === 'CREATE_NOTICE') {
                extractedAction = candidateAction;
              }
            } catch {
              // ignore parse error if action block wasn't strict JSON
            }
          }
        }

        return res.json({
          success: true,
          text: rawText,
          action: extractedAction,
          mode: 'online_gemini',
        });
      } catch (llmErr) {
        console.warn('Gemini chat error, returning grounded fallback:', llmErr);
        const fallback = getFallbackResponse(message, role);
        return res.json({
          success: true,
          text: fallback.text,
          action: role === 'super_admin' ? fallback.action || null : null,
          mode: 'grounded_fallback',
        });
      }
    } catch (err) {
      console.error('Agent chat endpoint error:', err);
      return res.status(500).json({ success: false, error: 'Failed to process AI chat request.' });
    }
  });

  return app;
}
