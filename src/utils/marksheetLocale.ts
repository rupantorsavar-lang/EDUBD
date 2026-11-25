import { Exam, MarksEntry, SchoolProfile, Staff, Student, Subject } from '../types';
import { SingleExamMeritResult, formatBnOrdinal, formatEnOrdinal } from './examMeritHelper';
import { calculateTotalGPA } from './grading';
import { getMarksheetRowBreakdown } from './marksheetBreakdown';
import { buildClassTeacherSignatureHtml, buildPrincipalSignatureHtml } from './signatureHelper';
import { toEnNumber } from './i18n';

export type MarksheetLanguageMode = 'bn' | 'bilingual' | 'en';

export interface MarksheetTextPack {
  estLabel: string;
  examBanner: string;
  photoCaption: string;
  studentNameLabel: string;
  englishNameLabel: string;
  studentIdLabel: string;
  rollLabel: string;
  classSectionLabel: string;
  groupLabel: string;
  fatherLabel: string;
  motherLabel: string;
  gradingTitle: string;
  gradingFailText: string;
  colSubject: string;
  colFullMarks: string;
  colWritten: string;
  colMcq: string;
  colMcqSub: string;
  colPractical: string;
  colPracticalSub: string;
  colTotal: string;
  colGrade: string;
  colGp: string;
  grandTotalPrefix: string;
  resultEvaluationLabel: string;
  statusPending: string;
  statusPassed: string;
  statusFailed: string;
  attendanceLabel: string;
  conductLabel: string;
  conductPending: string;
  conductPassed: string;
  conductFailed: string;
  meritHeading: string;
  meritPending: string;
  sectionRankLabel: string;
  classTeacherSig: string;
  controllerSig: string;
  principalSig: string;
}

export function getMarksheetTexts(
  mode: MarksheetLanguageMode,
  exam?: Exam | null,
  sessionYear = '2026'
): MarksheetTextPack {
  const examNameEn = exam?.nameEn || 'Term Examination';
  const examNameBn = exam?.nameBn || examNameEn;
  const session = exam?.session || sessionYear;

  if (mode === 'en') {
    return {
      estLabel: 'Est.',
      examBanner: `ACADEMIC TRANSCRIPT • ${examNameEn.toUpperCase()} ${session}`,
      photoCaption: 'STUDENT PHOTO',
      studentNameLabel: 'Student Name:',
      englishNameLabel: 'Bangla Name:',
      studentIdLabel: 'Student ID:',
      rollLabel: 'Roll No:',
      classSectionLabel: 'Class & Section:',
      groupLabel: 'Group / Stream:',
      fatherLabel: "Father's Name:",
      motherLabel: "Mother's Name:",
      gradingTitle: 'NCTB Grading Scale',
      gradingFailText: '00-32% : F (0.0) Fail',
      colSubject: 'Subject',
      colFullMarks: 'Full Marks',
      colWritten: 'Written',
      colMcq: 'MCQ',
      colMcqSub: '',
      colPractical: 'Practical',
      colPracticalSub: '',
      colTotal: 'Total',
      colGrade: 'Letter Grade',
      colGp: 'Grade Point',
      grandTotalPrefix: 'Grand Total Marks',
      resultEvaluationLabel: 'Result Status:',
      statusPending: 'Pending Marks Entry',
      statusPassed: 'PASSED',
      statusFailed: 'FAILED',
      attendanceLabel: 'Attendance:',
      conductLabel: 'Conduct & Discipline:',
      conductPending: 'Evaluation In Progress',
      conductPassed: 'Excellent',
      conductFailed: 'Needs Improvement',
      meritHeading: `Exam Merit Position (${examNameEn}):`,
      meritPending: 'Pending marks entry',
      sectionRankLabel: 'Section Rank',
      classTeacherSig: 'Class Teacher Signature',
      controllerSig: 'Controller of Examinations',
      principalSig: 'Principal Signature & Seal',
    };
  }

  if (mode === 'bilingual') {
    const dualExamTitle =
      examNameBn && examNameBn !== examNameEn
        ? `${examNameEn.toUpperCase()} (${examNameBn})`
        : examNameEn.toUpperCase();
    return {
      estLabel: 'স্থাপিত / Est.',
      examBanner: `ACADEMIC TRANSCRIPT (একাডেমিক ট্রান্সক্রিপ্ট) • ${dualExamTitle} ${session}`,
      photoCaption: 'ছবি / PHOTO',
      studentNameLabel: 'শিক্ষার্থীর নাম (বাংলা):',
      englishNameLabel: 'Student Name (English):',
      studentIdLabel: 'আইডি (Student ID):',
      rollLabel: 'রোল নং (Roll No):',
      classSectionLabel: 'শ্রেণি ও শাখা (Class):',
      groupLabel: 'বিভাগ (Group):',
      fatherLabel: 'পিতা (Father):',
      motherLabel: 'মাতা (Mother):',
      gradingTitle: 'NCTB গ্রেডিং স্কেল / Grading Scale',
      gradingFailText: '00-32% : F (0.0) ফেল / Fail',
      colSubject: 'বিষয় / Subject',
      colFullMarks: 'পূর্ণমান / Full',
      colWritten: 'সৃজনশীল / Written',
      colMcq: 'নৈর্ব্যক্তিক',
      colMcqSub: '(MCQ)',
      colPractical: 'ব্যবহারিক',
      colPracticalSub: '(Practical)',
      colTotal: 'মোট / Total',
      colGrade: 'গ্রেড / Grade',
      colGp: 'জিপিএ / GP',
      grandTotalPrefix: 'সর্বমোট নম্বর / Grand Total',
      resultEvaluationLabel: 'ফলাফল (Result):',
      statusPending: 'নম্বর এন্ট্রি হয়নি (Pending)',
      statusPassed: 'উত্তীর্ণ (PASSED)',
      statusFailed: 'অনুত্তীর্ণ (FAILED)',
      attendanceLabel: 'উপস্থিতি (Attendance):',
      conductLabel: 'আচরণ (Conduct):',
      conductPending: 'মূল্যায়ন চলমান (In Progress)',
      conductPassed: 'চমৎকার (Excellent)',
      conductFailed: 'মনোযোগ প্রয়োজন (Needs Improvement)',
      meritHeading: `মেধা স্থান / Merit Rank (${examNameEn}):`,
      meritPending: 'অপেক্ষমাণ (Pending marks entry)',
      sectionRankLabel: 'শাখায় অবস্থান / Section Rank',
      classTeacherSig: 'শ্রেণি শিক্ষকের স্বাক্ষর / Class Teacher',
      controllerSig: 'পরীক্ষা নিয়ন্ত্রক / Controller of Exams',
      principalSig: 'প্রধান শিক্ষকের স্বাক্ষর ও সিল / Principal & Seal',
    };
  }

  return {
    estLabel: 'স্থাপিত:',
    examBanner: `একাডেমিক ট্রান্সক্রিপ্ট • ${examNameBn} ${session}`,
    photoCaption: 'শিক্ষার্থীর ছবি',
    studentNameLabel: 'শিক্ষার্থীর নাম:',
    englishNameLabel: 'Student Name:',
    studentIdLabel: 'আইডি (ID):',
    rollLabel: 'রোল নং (Roll):',
    classSectionLabel: 'শ্রেণি ও শাখা:',
    groupLabel: 'বিভাগ/গ্রুপ:',
    fatherLabel: 'পিতা:',
    motherLabel: 'মাতা:',
    gradingTitle: 'NCTB গ্রেডিং স্কেল',
    gradingFailText: '00-32% : F (0.0) ফেল',
    colSubject: 'বিষয় (Subject)',
    colFullMarks: 'পূর্ণমান',
    colWritten: 'সৃজনশীল',
    colMcq: 'নৈর্ব্যক্তিক',
    colMcqSub: '(MCQ)',
    colPractical: 'ব্যবহারিক',
    colPracticalSub: '(Practical)',
    colTotal: 'মোট প্রাপ্ত',
    colGrade: 'লেটার গ্রেড',
    colGp: 'গ্রেড পয়েন্ট',
    grandTotalPrefix: 'সর্বমোট নম্বর',
    resultEvaluationLabel: 'ফলাফল মূল্যায়ন:',
    statusPending: 'নম্বর এন্ট্রি হয়নি (Pending)',
    statusPassed: 'উত্তীর্ণ (PASSED)',
    statusFailed: 'অনুত্তীর্ণ (FAILED)',
    attendanceLabel: 'উপস্থিতি:',
    conductLabel: 'আচরণ ও শৃঙ্খলা:',
    conductPending: 'মূল্যায়ন চলমান',
    conductPassed: 'চমৎকার (Excellent)',
    conductFailed: 'মনোযোগ ও পুনঃপরীক্ষা প্রয়োজন',
    meritHeading: `একক পরীক্ষার মেধা স্থান (${examNameBn}):`,
    meritPending: 'অপেক্ষমাণ (ফলাফল এন্ট্রি চলছে)',
    sectionRankLabel: 'শাখায় অবস্থান',
    classTeacherSig: 'শ্রেণি শিক্ষকের স্বাক্ষর',
    controllerSig: 'পরীক্ষা নিয়ন্ত্রকের স্বাক্ষর',
    principalSig: 'প্রধান শিক্ষকের স্বাক্ষর ও সিল',
  };
}

export function formatSubjectDisplayName(sub: Subject, mode: MarksheetLanguageMode): { primary: string; secondary?: string } {
  const bn = (sub.nameBn || '').trim();
  const en = (sub.nameEn || '').trim();
  if (mode === 'en') {
    return { primary: en || bn };
  }
  if (mode === 'bilingual') {
    if (bn && en && bn !== en) {
      return { primary: bn, secondary: en };
    }
    return { primary: bn || en };
  }
  return { primary: bn || en };
}

export function formatParentDisplayName(
  bnName: string | undefined,
  enName: string | undefined,
  mode: MarksheetLanguageMode
): string {
  const bn = (bnName || '').trim();
  const en = (enName || '').trim();
  if (mode === 'en') return en || bn || '—';
  if (mode === 'bilingual') {
    if (bn && en && bn !== en) return `${bn} (${en})`;
    return bn || en || '—';
  }
  return bn || en || '—';
}

export function formatGroupLabelForMarksheet(group: string | undefined, mode: MarksheetLanguageMode): string {
  const g = (group || '').trim();
  if (!g || g === 'General') {
    if (mode === 'en') return 'General';
    if (mode === 'bilingual') return 'সাধারণ (General)';
    return 'সাধারণ (General)';
  }
  if (mode === 'en') return g;
  const bnMap: Record<string, string> = {
    Science: 'বিজ্ঞান (Science)',
    Commerce: 'ব্যবসায় শিক্ষা (Commerce)',
    'Business Studies': 'ব্যবসায় শিক্ষা (Business Studies)',
    Humanities: 'মানবিক (Humanities)',
    Arts: 'মানবিক (Arts)',
    Vocational: 'ভোকেশনাল (Vocational)',
  };
  return bnMap[g] || g;
}

export function formatMeritSummaryTexts(
  merit: SingleExamMeritResult,
  section: string,
  mode: MarksheetLanguageMode
): {
  rankText: string;
  sectionRankText: string | null;
  passedSummaryText: string;
} {
  let rankText = '';
  if (merit.status === 'passed' && merit.classRank !== null) {
    if (mode === 'en') {
      rankText = `${formatEnOrdinal(merit.classRank)} in Class`;
    } else if (mode === 'bilingual') {
      rankText = `${formatEnOrdinal(merit.classRank)} in Class (${formatBnOrdinal(merit.classRank)} স্থান)`;
    } else {
      rankText = `${formatBnOrdinal(merit.classRank)} স্থান (শ্রেণিতে)`;
    }
  } else if (merit.status === 'failed') {
    if (mode === 'en') {
      rankText = `Unranked (${merit.failedCount} subject${merit.failedCount === 1 ? '' : 's'} failed)`;
    } else if (mode === 'bilingual') {
      rankText = `অনুত্তীর্ণ / Unranked (${toEnNumber(merit.failedCount)} বিষয়ে F)`;
    } else {
      rankText = `অপ্রযোজ্য / অনুত্তীর্ণ (${toEnNumber(merit.failedCount)} বিষয়ে অকৃতকার্য)`;
    }
  } else {
    rankText =
      mode === 'en'
        ? 'Pending marks entry'
        : mode === 'bilingual'
        ? 'অপেক্ষমাণ (Pending marks entry)'
        : 'অপেক্ষমাণ (ফলাফল এন্ট্রি চলছে)';
  }

  let sectionRankText: string | null = null;
  if (merit.status === 'passed' && merit.sectionRank !== null) {
    if (mode === 'en') {
      sectionRankText = `${formatEnOrdinal(merit.sectionRank)} (Sec ${section})`;
    } else if (mode === 'bilingual') {
      sectionRankText = `${formatEnOrdinal(merit.sectionRank)} / ${formatBnOrdinal(merit.sectionRank)} (Sec ${section})`;
    } else {
      sectionRankText = `${formatBnOrdinal(merit.sectionRank)} (Sec ${section})`;
    }
  }

  const passedSummaryText =
    mode === 'en'
      ? `Passed: ${merit.classPassedCount} / Examinees: ${merit.classTotalStudents}`
      : mode === 'bilingual'
      ? `উত্তীর্ণ / Passed: ${toEnNumber(merit.classPassedCount)} / ${toEnNumber(merit.classTotalStudents)}`
      : `উত্তীর্ণ: ${toEnNumber(merit.classPassedCount)} জন / মোট পরীক্ষার্থী: ${toEnNumber(merit.classTotalStudents)} জন`;

  return { rankText, sectionRankText, passedSummaryText };
}

function escapeHtml(val: string | number | undefined | null): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BuildMarksheetsHtmlParams {
  studentsToRender: Student[];
  school: SchoolProfile;
  defaultLogoUrl: string;
  exam?: Exam | null;
  classSubjects: Subject[];
  staffList: Staff[];
  langMode: MarksheetLanguageMode;
  getSubjectsForStudent: (student: Student, subjects: Subject[]) => Subject[];
  getStudentMarkForSubject: (studentId: string, subjectId: string) => MarksEntry | undefined;
  meritMap: Map<string, SingleExamMeritResult>;
  title?: string;
}

export function buildMarksheetsPrintableHtml({
  studentsToRender,
  school,
  defaultLogoUrl,
  exam,
  classSubjects,
  staffList,
  langMode,
  getSubjectsForStudent,
  getStudentMarkForSubject,
  meritMap,
  title,
}: BuildMarksheetsHtmlParams): string {
  const texts = getMarksheetTexts(langMode, exam, school.currentSession || '2026');
  const logoSrc = escapeHtml(school.logoUrl || defaultLogoUrl);

  const sheetsHtml = studentsToRender
    .map((std, index) => {
      const studentSubjects = getSubjectsForStudent(std, classSubjects);
      const enteredEntries = studentSubjects
        .map((sub) => ({ sub, mark: getStudentMarkForSubject(std.id, sub.id) }))
        .filter((item): item is { sub: Subject; mark: MarksEntry } => Boolean(item.mark));

      let grandTotal = 0;
      let totalFullMarks = 0;
      const gpas: number[] = [];
      let hasFail = false;

      const rowsHtml =
        enteredEntries.length > 0
          ? enteredEntries
              .map(({ sub, mark }) => {
                const breakdown = getMarksheetRowBreakdown(mark, sub);
                grandTotal += breakdown.total;
                totalFullMarks += breakdown.fullMarks;
                gpas.push(mark.gpa);
                if (mark.grade === 'F') hasFail = true;
                const subName = formatSubjectDisplayName(sub, langMode);

                return `<tr>
                  <td style="text-align:left;font-weight:600;">
                    <span style="font-family:monospace;color:#64748b;margin-right:4px;">${escapeHtml(sub.code)}</span>
                    ${escapeHtml(subName.primary)}${
                      subName.secondary
                        ? ` <span style="color:#64748b;font-weight:500;font-size:9.5px;">/ ${escapeHtml(subName.secondary)}</span>`
                        : ''
                    }
                  </td>
                  <td>${breakdown.fullMarks}</td>
                  <td>${breakdown.hasWritten ? breakdown.written : '—'}</td>
                  <td>${breakdown.hasMcq ? breakdown.mcq : '—'}</td>
                  <td>${breakdown.hasPractical ? breakdown.practical : '—'}</td>
                  <td style="font-weight:800;color:#0f172a;">${breakdown.total}</td>
                  <td style="font-weight:800;color:${mark.grade === 'F' ? '#e11d48' : '#047857'};">${escapeHtml(mark.grade)}</td>
                  <td style="font-weight:700;color:${mark.grade === 'F' ? '#e11d48' : '#1e293b'};">${mark.gpa.toFixed(2)}</td>
                </tr>`;
              })
              .join('')
          : studentSubjects
              .map((sub) => {
                const subName = formatSubjectDisplayName(sub, langMode);
                return `<tr style="color:#94a3b8;">
                  <td style="text-align:left;font-weight:500;">
                    <span style="font-family:monospace;margin-right:4px;">${escapeHtml(sub.code)}</span>
                    ${escapeHtml(subName.primary)}${
                      subName.secondary ? ` / ${escapeHtml(subName.secondary)}` : ''
                    }
                  </td>
                  <td>${sub.fullMarks}</td>
                  <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                </tr>`;
              })
              .join('');

      const totalResult = calculateTotalGPA(gpas, hasFail);
      const hasEnteredMarks = enteredEntries.length > 0;
      const percentage = totalFullMarks > 0 ? ((grandTotal / totalFullMarks) * 100).toFixed(1) : '0';
      const isPassed = hasEnteredMarks && !hasFail && totalResult.status === 'PASSED' && totalResult.overallGrade !== 'F';

      const merit = meritMap.get(std.id) || {
        status: 'pending' as const,
        classRank: null,
        classPassedCount: 0,
        classTotalStudents: studentsToRender.length,
        sectionRank: null,
        sectionPassedCount: 0,
        sectionTotalStudents: 0,
        totalObtained: grandTotal,
        totalFullMarks,
        gpa: totalResult.totalGPA,
        overallGrade: totalResult.overallGrade,
        failedCount: 0,
      };
      const meritTexts = formatMeritSummaryTexts(merit, std.section, langMode);

      const addressLine =
        langMode === 'en'
          ? school.addressEn || school.addressBn
          : langMode === 'bilingual' && school.addressEn && school.addressBn && school.addressEn !== school.addressBn
          ? `${school.addressBn} (${school.addressEn})`
          : school.addressBn || school.addressEn;

      const photoHtml = std.photoUrl
        ? `<img src="${escapeHtml(std.photoUrl)}" alt="${escapeHtml(std.nameEn)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div style="font-size:8px;font-weight:700;color:#64748b;">PHOTO</div>`;

      const grandTotalLabel =
        langMode === 'bn'
          ? `${texts.grandTotalPrefix} (${totalFullMarks}) ও সার্বিক ফলাফল:`
          : langMode === 'bilingual'
          ? `${texts.grandTotalPrefix} (${totalFullMarks}):`
          : `${texts.grandTotalPrefix} (${totalFullMarks}) & Overall Result:`;

      const statusText = !hasEnteredMarks
        ? texts.statusPending
        : isPassed
        ? texts.statusPassed
        : texts.statusFailed;
      const statusColor = !hasEnteredMarks ? '#d97706' : isPassed ? '#047857' : '#e11d48';
      const conductText = !hasEnteredMarks
        ? texts.conductPending
        : isPassed
        ? texts.conductPassed
        : texts.conductFailed;

      const classTeacherSigHtml = buildClassTeacherSignatureHtml(school, std.className, std.section, staffList);
      const principalSigHtml = buildPrincipalSignatureHtml(school);

      return `<div class="sheet${index < studentsToRender.length - 1 ? ' page-break' : ''}">
        <div class="header">
          <div class="header-top">
            <img src="${logoSrc}" alt="Logo" />
            <div style="text-align:left;">
              ${
                langMode === 'en'
                  ? `<h1>${escapeHtml(school.nameEn)}</h1>`
                  : `<h1>${escapeHtml(school.nameBn || school.nameEn)}</h1>
                     <h2>${escapeHtml(school.nameEn.toUpperCase())}</h2>`
              }
            </div>
          </div>
          <p>${escapeHtml(addressLine)} • EIIN: ${escapeHtml(school.eiin)} • ${escapeHtml(texts.estLabel)} ${escapeHtml(school.establishedYear)}</p>
          <div class="badge">${escapeHtml(texts.examBanner)}</div>
        </div>

        <div class="bio-row">
          <div class="photo-col">
            <div class="photo-box">${photoHtml}</div>
            <div class="photo-cap">${escapeHtml(texts.photoCaption)}</div>
          </div>

          <div class="bio-grid">
            <div><span class="lbl">${escapeHtml(texts.studentNameLabel)}</span> <strong>${escapeHtml(
              langMode === 'en' ? std.nameEn || std.nameBn : std.nameBn || std.nameEn
            )}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.englishNameLabel)}</span> <strong>${escapeHtml(
              langMode === 'en' ? std.nameBn || std.nameEn : std.nameEn || std.nameBn
            )}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.studentIdLabel)}</span> <strong style="color:#1d4ed8;font-family:monospace;">${escapeHtml(std.studentId)}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.rollLabel)}</span> <strong>${escapeHtml(std.roll)}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.classSectionLabel)}</span> <strong>${escapeHtml(std.className)} (${escapeHtml(std.section)})</strong></div>
            <div><span class="lbl">${escapeHtml(texts.groupLabel)}</span> <strong style="color:#3730a3;">${escapeHtml(
              formatGroupLabelForMarksheet(std.group, langMode)
            )}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.fatherLabel)}</span> <span>${escapeHtml(
              formatParentDisplayName(std.fatherNameBn, std.fatherNameEn, langMode)
            )}</span></div>
            <div><span class="lbl">${escapeHtml(texts.motherLabel)}</span> <span>${escapeHtml(
              formatParentDisplayName(std.motherNameBn, std.motherNameEn, langMode)
            )}</span></div>
          </div>

          <div class="grade-box">
            <div class="grade-title">${escapeHtml(texts.gradingTitle)}</div>
            <div class="grade-grid">
              <div>80-100% : <strong>A+ (5.0)</strong></div>
              <div>50-59% : <strong>B (3.0)</strong></div>
              <div>70-79% : <strong>A (4.0)</strong></div>
              <div>40-49% : <strong>C (2.0)</strong></div>
              <div>60-69% : <strong>A- (3.5)</strong></div>
              <div>33-39% : <strong>D (1.0)</strong></div>
              <div style="grid-column:span 2;color:#be123c;font-weight:700;">${escapeHtml(texts.gradingFailText)}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align:left;">${escapeHtml(texts.colSubject)}</th>
              <th style="width:52px;">${escapeHtml(texts.colFullMarks)}</th>
              <th style="width:58px;">${escapeHtml(texts.colWritten)}</th>
              <th style="width:58px;">${escapeHtml(texts.colMcq)}${texts.colMcqSub ? `<br/><span style="font-size:8px;color:#64748b;">${escapeHtml(texts.colMcqSub)}</span>` : ''}</th>
              <th style="width:58px;">${escapeHtml(texts.colPractical)}${texts.colPracticalSub ? `<br/><span style="font-size:8px;color:#64748b;">${escapeHtml(texts.colPracticalSub)}</span>` : ''}</th>
              <th style="width:58px;">${escapeHtml(texts.colTotal)}</th>
              <th style="width:54px;">${escapeHtml(texts.colGrade)}</th>
              <th style="width:54px;">${escapeHtml(texts.colGp)}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9;font-weight:800;border-top:2px solid #1e293b;">
              <td colspan="5" style="text-align:right;">${escapeHtml(grandTotalLabel)}</td>
              <td style="font-size:11.5px;">${
                hasEnteredMarks ? `${grandTotal}<span style="display:block;font-size:8.5px;color:#64748b;">(${percentage}%)</span>` : '—'
              }</td>
              <td style="font-size:11.5px;color:${!hasEnteredMarks ? '#64748b' : isPassed ? '#1d4ed8' : '#e11d48'};">${
                hasEnteredMarks ? escapeHtml(totalResult.overallGrade) : '—'
              }</td>
              <td style="font-size:11.5px;color:${!hasEnteredMarks ? '#64748b' : isPassed ? '#1d4ed8' : '#e11d48'};">${
                hasEnteredMarks ? totalResult.totalGPA.toFixed(2) : '—'
              }</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <div><span class="lbl">${escapeHtml(texts.resultEvaluationLabel)}</span> <strong style="color:${statusColor};">${escapeHtml(statusText)}</strong></div>
            <div><span class="lbl">${escapeHtml(texts.attendanceLabel)}</span> <strong>${escapeHtml(String((std as any).attendanceSummary?.percentage || '94'))}%</strong></div>
            <div><span class="lbl">${escapeHtml(texts.conductLabel)}</span> <strong>${escapeHtml(conductText)}</strong></div>
          </div>
          <div class="merit-row">
            <div><span class="lbl" style="font-weight:600;">${escapeHtml(texts.meritHeading)}</span> <strong>${escapeHtml(meritTexts.rankText)}</strong></div>
            <div style="font-size:10px;color:#475569;">${
              meritTexts.sectionRankText
                ? `${escapeHtml(texts.sectionRankLabel)}: <strong style="color:#0f172a;">${escapeHtml(meritTexts.sectionRankText)}</strong> · `
                : ''
            }${escapeHtml(meritTexts.passedSummaryText)}</div>
          </div>
        </div>

        <div class="sigs">
          <div class="sig-col">
            <div class="sig-slot">${classTeacherSigHtml}</div>
            <div class="sig-line">${escapeHtml(texts.classTeacherSig)}</div>
          </div>
          <div class="sig-col">
            <div class="sig-slot"></div>
            <div class="sig-line">${escapeHtml(texts.controllerSig)}</div>
          </div>
          <div class="sig-col">
            <div class="sig-slot">${principalSigHtml}</div>
            <div class="sig-line">${escapeHtml(texts.principalSig)}</div>
          </div>
        </div>
      </div>`;
    })
    .join('\n');

  const safeTitle = escapeHtml(title || 'Official Marksheets');

  return `<!DOCTYPE html>
<html lang="${langMode === 'en' ? 'en' : 'bn'}">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', 'Hind Siliguri', sans-serif; color: #0f172a; margin: 0; padding: 14px; background: #f8fafc; font-size: 11px; }
    .print-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; max-width: 794px; margin: 0 auto 12px auto; padding: 10px 14px; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; }
    .btn-print { padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; }
    .sheet { max-width: 794px; margin: 0 auto 18px auto; background: #fff; border: 2px solid #1e293b; border-radius: 10px; padding: 14px 16px; }
    .page-break { page-break-after: always; break-after: page; }
    .header { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 8px; }
    .header-top { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 2px; }
    .header-top img { width: 46px; height: 46px; object-fit: contain; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 900; line-height: 1.2; }
    .header h2 { margin: 1px 0 0; font-size: 11px; font-weight: 700; color: #334155; letter-spacing: 0.04em; }
    .header p { margin: 3px 0 0; font-size: 10px; color: #475569; }
    .badge { display: inline-block; margin-top: 5px; padding: 3px 10px; background: #0f172a; color: #fff; border-radius: 4px; font-size: 9.5px; font-weight: 900; letter-spacing: 0.06em; }
    .bio-row { display: flex; align-items: stretch; gap: 10px; margin: 9px 0; padding: 6px 0; border-bottom: 1px solid #cbd5e1; }
    .photo-col { width: 74px; flex-shrink: 0; text-align: center; }
    .photo-box { width: 72px; height: 86px; border: 1.5px solid #94a3b8; border-radius: 5px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f8fafc; margin: 0 auto; }
    .photo-cap { font-size: 8px; font-weight: 700; color: #64748b; margin-top: 2px; }
    .bio-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; font-size: 10.5px; align-content: center; }
    .lbl { color: #64748b; }
    .grade-box { width: 168px; flex-shrink: 0; border: 1px solid #cbd5e1; border-radius: 5px; padding: 4px 6px; background: #f8fafc; font-size: 8.8px; }
    .grade-title { font-weight: 800; text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 3px; }
    .grade-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 4px; text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 6px 0; }
    th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: center; }
    th { background: #f1f5f9; font-weight: 800; font-size: 9.5px; text-transform: uppercase; border-color: #64748b; }
    .summary-box { margin: 8px 0; padding: 7px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 10.5px; }
    .summary-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .merit-row { margin-top: 5px; padding-top: 5px; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .sigs { margin-top: 22px; padding-top: 10px; border-top: 1px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 9.8px; }
    .sig-slot { height: 42px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 2px; }
    .sig-line { border-top: 1px solid #64748b; padding-top: 3px; font-weight: 700; }
    @media print {
      body { background: #fff; padding: 0; }
      .print-bar { display: none !important; }
      .sheet { max-width: none; width: 100%; margin: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span style="font-weight:700;font-size:12px;">${safeTitle} (${studentsToRender.length})</span>
    <button class="btn-print" onclick="window.print()">Print All / Save as PDF</button>
  </div>
  ${sheetsHtml}
</body>
</html>`;
}
