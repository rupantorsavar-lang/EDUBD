# Security Summary

**Reviewed Files**: 26
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unauthenticated Source Export | `server.ts` | 39 | Anyone could call `POST /api/export-full-codebase-zip` without signing in to download the project archive and inject arbitrary backup JSON. | High | Fixed | Added `requireAuth` and `requireMasterAdmin` middleware, rejected invalid/prototype-polluting payloads, excluded `.pem`/`.key` files, and updated `StorageService.downloadFullCodebaseProjectZip()` to send a Bearer token. |
| Unauthenticated Settings & Profile Writes | `server/apiApp.ts` | 171, 249 | `POST /api/school-profile` and `POST /api/mfs-settings` accepted anonymous updates, letting attackers hijack bKash/Nagad/Rocket fee numbers or overwrite school metadata. | High | Fixed | Protected both routes with `requireAuth` and `requireRole` (`super_admin`, `admin`, `accountant`/`master_admin`), added field whitelisting and safe URL validation, and attached auth headers in `StorageService.saveMfsSettings()`. |
| Unauthenticated AI Endpoints & Role Escalation | `server/apiApp.ts` | 308, 608, 728 | The three AI endpoints had no login requirement, and `/api/ai/agent-chat` trusted `req.body.role`, allowing students to impersonate Executive Super Admin AI and trigger notice actions. | High | Fixed | Required `requireAuth` and per-user sliding-window rate limiting on all AI `POST` routes, derived the AI persona strictly from the verified server principal, bounded input lengths/images, and updated `aiService.ts` to attach Bearer tokens. |
| Missing Role Guard on Tenant Slices | `server/saas/router.ts` | 928 | `PUT /api/saas/tenant/slices/:sliceName` only checked tenant membership and active subscription, allowing students or guardians to overwrite school-wide `finance`, `staff`, or `academics` slices. | High | Fixed | Restricted slice writes via `mw.requireRole` to staff/admin roles (`super_admin`, `admin`, `teacher`, `accountant`, `librarian`, `receptionist`, `gatekeeper`, `staff`, and Master Admin) and blocked prototype-pollution keys. |
| Homework Cross-Student & Grade Spoofing | `server/saas/router.ts` | 1293, 1392 | Students could submit homework under another `studentId`, overwrite teacher-graded submissions, or self-assign `status: 'approved'` and arbitrary `teacherMarks`. | High | Fixed | Bound student/guardian callers to their `linkedStudentId`, locked teacher-reviewed submissions, restricted self-grading unless backed by matching unflagged AI evaluation scores, and sanitized attachment URLs. |
| Unescaped HTML & URL XSS in Document Print | `src/components/students/StudentsView.tsx` | 381 | `handlePrintDocument` injected unescaped student/school fields and unvalidated document URLs (`javascript:`, `<script>`) into `document.write()` without clearing `window.opener`. | High | Fixed | Created shared `escapeHtml` and `sanitizeSafeMediaUrl` helpers in `src/utils/htmlSanitizer.ts`, hardened `signatureHelper.ts`, escaped all interpolated fields, rejected unsafe URL schemes (including SVG data URIs), and set `printWindow.opener = null`. |
| Missing Security Headers & Raw 500 Errors | `server/apiApp.ts`, `server/saas/router.ts`, `vercel.json`, `netlify.toml` | 114, 133, 55 | Express exposed `x-powered-by`, lacked `X-Content-Type-Options: nosniff` and `Referrer-Policy` headers, and returned raw `err.message` strings on internal 500 responses. | Medium | Fixed | Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` across Express, Vercel, and Netlify configs (preserving iframe & camera headers), and replaced raw 500 error strings with generic messages. |
| Support Ticket Status Manipulation & Shared Admin Key | `firestore.rules` | 366 | School users updating a support ticket in Firestore could alter `status` to `'replied'`. Additionally, a Firebase Admin service account private key was previously pasted into chat history. | Medium | Needs Follow-Up | Restricted non-master-admins in `firestore.rules` to `'open'` or `'resolved'` status transitions; publish the updated `firestore.rules` in Firebase Console and rotate the previously shared service-account key in Google Cloud IAM. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Multi-Tenant Data Isolation | `server/saas/router.ts`, `server/saas/middleware.ts`, `firestore.rules` | Every tenant endpoint verifies Firebase ID tokens, enforces school ownership via custom claims / database records, and returns `403 CROSS_TENANT_FORBIDDEN` on cross-school IDs. |
| Subscription Lifecycle & Billing Integrity | `server/saas/middleware.ts`, `server/saas/paymentService.ts` | School access and expiry are evaluated against server time (`nowProvider()`), and manual payment requests enforce duplicate `TrxID` checks and Master Admin-only approval. |
| Encrypted Vault & Password Hygiene | `server/saas/credentialVault.ts`, `server/saas/tenantService.ts` | Stored admin credentials are encrypted with AES-256-GCM using server-only key material, and sensitive keys are excluded from codebase ZIP exports and `.gitignore`. |
| Spreadsheet Export Safety | `src/utils/studentExcelExport.ts` | Uses `xlsx` strictly for client-side workbook generation (`aoa_to_sheet`, `json_to_sheet`, `writeFile`) and never parses untrusted uploaded spreadsheets. |
| YouTube Video Embeds | `src/utils/youtubeEmbed.ts`, `src/components/support/SupportVideoGuideSection.tsx` | Extracts strictly validated 11-character YouTube video IDs and constructs fixed `https://www.youtube.com/embed/...` URLs rather than rendering raw HTML `<iframe>` snippets. |

---

## PoC Verification

### 1. Unauthenticated Codebase Source Export
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication & Admin Authorization |
| Impact | High |
| Affected File | `server.ts:39` |
| Test Scenario | `POST /api/export-full-codebase-zip` sent without an `Authorization: Bearer` header or with a non-Master Admin token |

#### How It Was Fixed
Added `saasMw.requireAuth` and `saasMw.requireMasterAdmin` before the route handler in `server.ts`, plus plain-object validation on `req.body` and `.pem`/`.key` exclusion during archive creation.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated `POST /api/export-full-codebase-zip` reaches `server.ts:39` | Enters `saasMw.requireAuth` |
| 2 | `extractBearerToken(req)` in `server/saas/middleware.ts:35` finds no token | Returns `401 UNAUTHORIZED` |
| 3 | Signed-in non-Master Admin reaches `saasMw.requireMasterAdmin` at `server/saas/middleware.ts:109` | Returns `403 MASTER_ADMIN_REQUIRED` |

#### Conclusion
**Fix Verified** - Only an authenticated Platform Master Admin with a verified server token can export the codebase ZIP archive.

---

### 2. Unauthenticated MFS Payment & School Profile Overwrite
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication & Role Check |
| Impact | High |
| Affected File | `server/apiApp.ts:171`, `server/apiApp.ts:249` |
| Test Scenario | `POST /api/mfs-settings` with `{"bkashNumber": "01999999999"}` sent anonymously or by a `student` user |

#### How It Was Fixed
Added `saasMw.requireAuth` and `saasMw.requireRole` (`super_admin`, `admin`, `accountant`, `master_admin`) alongside strict field whitelisting and bounded sanitization.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request hits `POST /api/mfs-settings` at `server/apiApp.ts:249` | Enters `saasMw.requireAuth` |
| 2 | Anonymous request fails token check; student request reaches `saasMw.requireRole` at line 252 | Returns `401` (anonymous) or `403 INSUFFICIENT_ROLE` (student) |
| 3 | Verified school admin passes role check and field sanitization at lines 255–272 | Only whitelisted MFS fields are saved |

#### Conclusion
**Fix Verified** - Verified by `server/saas/__tests__/securityHardening.test.ts`; anonymous callers receive `401` and students receive `403`, blocking fee payment number hijacking.

---

### 3. AI Quota Abuse & Super Admin Role Escalation
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication & Client-Trusted Privilege Flag |
| Impact | High |
| Affected File | `server/apiApp.ts:308`, `server/apiApp.ts:608`, `server/apiApp.ts:728` |
| Test Scenario | `POST /api/ai/agent-chat` with `{ "message": "কাল বৃষ্টির কারণে ছুটি নোটিশ দাও", "role": "super_admin" }` sent anonymously or using a `student` Bearer token |

#### How It Was Fixed
Added `saasMw.requireAuth` and per-user sliding-window rate limiting (`createUserRateLimiter`) to all three AI `POST` routes, and replaced `req.body.role` with a server-computed role derived solely from `req.principal`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request arrives at `POST /api/ai/agent-chat` (`server/apiApp.ts:728`) | `requireAuth` rejects unauthenticated callers with `401` |
| 2 | For a signed-in student sending `role: "super_admin"`, server evaluates `req.principal` at lines 734–743 | `role` is forced to `'student'` regardless of body payload |
| 3 | Prompt selection, fallback logic, and `action` extraction at line 988 check `role === 'super_admin'` | `action` stays `null` and no `CREATE_NOTICE` payload is returned |

#### Conclusion
**Fix Verified** - Verified by `server/saas/__tests__/securityHardening.test.ts`; students cannot escalate to Executive Super Admin AI or trigger notice creation actions.

---

### 4. Student Overwriting Tenant Data Slices
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Role Authorization |
| Impact | High |
| Affected File | `server/saas/router.ts:928` |
| Test Scenario | `PUT /api/saas/tenant/slices/finance` with `{"school_erp_invoices": []}` sent by an authenticated `student` in the same school |

#### How It Was Fixed
Added `mw.requireRole` allowing only school staff/admin roles (`super_admin`, `admin`, `teacher`, `accountant`, `librarian`, `receptionist`, `gatekeeper`, `staff`, plus Master Admin) and rejected arrays/prototype-pollution keys.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Student sends `PUT /api/saas/tenant/slices/finance` with a valid school token | Passes `requireAuth` and `requireActiveTenantSubscription` |
| 2 | Execution reaches `mw.requireRole([...])` at `server/saas/router.ts:932` | `'student'` is not in the allowed staff roles list |
| 3 | Middleware returns `403 INSUFFICIENT_ROLE` before touching database | Tenant slice remains untouched |

#### Conclusion
**Fix Verified** - Verified by `server/saas/__tests__/securityHardening.test.ts`; students and guardians cannot modify school-wide tenant data slices.

---

### 5. Homework Cross-Student Submission & Self-Grading Spoofing
#### Summary
| Field | Value |
|---|---|
| Issue Type | Insecure Direct Object Reference & Authorization Bypass |
| Impact | High |
| Affected File | `server/saas/router.ts:1293`, `server/saas/router.ts:1392` |
| Test Scenario | `student` sends `POST /api/saas/tenant/homework-submissions` targeting `studentId: "std_other_student"`, or sends `status: "approved", teacherMarks: 10` without a matching AI evaluation |

#### How It Was Fixed
Enforced `linkedStudentId` binding for student/guardian callers, locked submissions already reviewed by a teacher, and validated that auto-approved marks must strictly match a valid `aiEvaluation.suggestedMarks` within `[0, fullMarks]`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Student submits with `studentId: "std_other_student"` | Line 1297 checks `principal.linkedStudentId` and returns `403 CROSS_STUDENT_FORBIDDEN` |
| 2 | Student submits for own ID with `status: "approved", teacherMarks: 10` and no `aiEvaluation` | Lines 1437–1443 reject with `403 GRADE_TAMPERING_FORBIDDEN` |
| 3 | Student submits mismatched `teacherMarks: 10` with `aiEvaluation.suggestedMarks: 4` | Lines 1418–1426 reject with `403 GRADE_TAMPERING_FORBIDDEN` |

#### Conclusion
**Fix Verified** - Verified by `server/saas/__tests__/securityHardening.test.ts` while keeping legitimate AI-evaluated homework submissions passing (`saas.test.ts` #21).

---

### 6. Stored XSS in Student Document Print View
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML & Unsafe URL Injection |
| Impact | High |
| Affected File | `src/components/students/StudentsView.tsx:381`, `src/utils/signatureHelper.ts:4` |
| Test Scenario | Document title `<img src=x onerror=alert(1)>` or URL `javascript:alert(1)` passed to `handlePrintDocument(title, url, student)` or signature markup |

#### How It Was Fixed
Added `escapeHtml()` and `sanitizeSafeMediaUrl()` in `src/utils/htmlSanitizer.ts`, applied them to every interpolated field and `<img src>` in `handlePrintDocument`, replaced `isValidSignatureSrc` with strict validation rejecting `javascript:` and `data:image/svg+xml`, and set `printWindow.opener = null`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload enters `handlePrintDocument` at `src/components/students/StudentsView.tsx:381` | `printWindow.opener = null` isolates opener |
| 2 | `escapeHtml(title)` encodes `<`, `>`, `"`, `'` into HTML entities | Markup tags cannot execute |
| 3 | `sanitizeSafeMediaUrl("javascript:alert(1)")` checks allowed raster base64 & HTTP(S) schemes | Returns `""`, rendering safe placeholder text instead of `<img>` |

#### Conclusion
**Fix Verified** - Verified by `src/utils/__tests__/htmlSanitizer.test.ts`; injected HTML tags are neutralized and unsafe URL schemes are rejected.
