import React from 'react';
import { Trophy, User } from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { Exam, MarksEntry, SchoolProfile, Staff, Student, Subject } from '../../types';
import { SingleExamMeritResult } from '../../utils/examMeritHelper';
import { calculateTotalGPA } from '../../utils/grading';
import { getMarksheetRowBreakdown } from '../../utils/marksheetBreakdown';
import {
  MarksheetLanguageMode,
  formatGroupLabelForMarksheet,
  formatMeritSummaryTexts,
  formatParentDisplayName,
  formatSubjectDisplayName,
  getMarksheetTexts,
} from '../../utils/marksheetLocale';
import { ClassTeacherSignatureDisplay } from '../common/ClassTeacherSignatureDisplay';
import { PrincipalSignatureDisplay } from '../common/PrincipalSignatureDisplay';

export interface OfficialMarksheetSheetProps {
  student: Student;
  school: SchoolProfile;
  exam?: Exam | null;
  classSubjects: Subject[];
  staffList: Staff[];
  langMode: MarksheetLanguageMode;
  getSubjectsForStudent: (student: Student, subjects: Subject[]) => Subject[];
  getStudentMarkForSubject: (studentId: string, subjectId: string) => MarksEntry | undefined;
  meritResult: SingleExamMeritResult;
  isBulkPage?: boolean;
}

export const OfficialMarksheetSheet: React.FC<OfficialMarksheetSheetProps> = ({
  student,
  school,
  exam,
  classSubjects,
  staffList,
  langMode,
  getSubjectsForStudent,
  getStudentMarkForSubject,
  meritResult,
  isBulkPage = false,
}) => {
  const texts = getMarksheetTexts(langMode, exam, school.currentSession || '2026');
  const studentSubjects = getSubjectsForStudent(student, classSubjects);
  const enteredSubjectEntries = studentSubjects
    .map((sub) => ({ sub, mark: getStudentMarkForSubject(student.id, sub.id) }))
    .filter((item): item is { sub: Subject; mark: MarksEntry } => Boolean(item.mark));

  let grandTotal = 0;
  let totalFullMarks = 0;
  const gpas: number[] = [];
  let hasFail = false;

  const rows =
    enteredSubjectEntries.length > 0
      ? enteredSubjectEntries.map(({ sub, mark: m }) => {
          const breakdown = getMarksheetRowBreakdown(m, sub);
          grandTotal += breakdown.total;
          totalFullMarks += breakdown.fullMarks;
          gpas.push(m.gpa);
          if (m.grade === 'F') hasFail = true;
          const subName = formatSubjectDisplayName(sub, langMode);

          return (
            <tr key={sub.id} className="border-b border-slate-300 hover:bg-slate-50/50">
              <td className="py-1 px-2 border-r border-slate-300 font-medium">
                <span className="font-mono text-slate-500 mr-1">{sub.code}</span>
                <span>{subName.primary}</span>
                {subName.secondary && (
                  <span className="text-slate-500 font-normal text-[10px] ml-1">/ {subName.secondary}</span>
                )}
                {sub.group && (
                  <span className="ml-1.5 px-1 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px]">
                    {sub.group}
                  </span>
                )}
              </td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center text-slate-700">{breakdown.fullMarks}</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">
                {breakdown.hasWritten ? breakdown.written : '—'}
              </td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">
                {breakdown.hasMcq ? breakdown.mcq : '—'}
              </td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">
                {breakdown.hasPractical ? breakdown.practical : '—'}
              </td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center font-bold text-slate-900">
                {breakdown.total}
              </td>
              <td
                className={`py-1 px-1.5 border-r border-slate-300 text-center font-black ${
                  m.grade === 'F' ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {m.grade}
              </td>
              <td
                className={`py-1 px-1.5 text-center font-bold ${
                  m.grade === 'F' ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                {m.gpa.toFixed(2)}
              </td>
            </tr>
          );
        })
      : studentSubjects.map((sub) => {
          const subName = formatSubjectDisplayName(sub, langMode);
          return (
            <tr key={sub.id} className="border-b border-slate-300 text-slate-400">
              <td className="py-1 px-2 border-r border-slate-300 font-medium">
                <span className="font-mono mr-1">{sub.code}</span>
                <span>{subName.primary}</span>
                {subName.secondary && <span className="text-[10px] ml-1">/ {subName.secondary}</span>}
              </td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">{sub.fullMarks}</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">—</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">—</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">—</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">—</td>
              <td className="py-1 px-1.5 border-r border-slate-300 text-center">—</td>
              <td className="py-1 px-1.5 text-center">—</td>
            </tr>
          );
        });

  const totalResult = calculateTotalGPA(gpas, hasFail);
  const percentage = totalFullMarks > 0 ? ((grandTotal / totalFullMarks) * 100).toFixed(1) : '0';
  const hasEnteredMarks = enteredSubjectEntries.length > 0;
  const isPassed = hasEnteredMarks && !hasFail && totalResult.status === 'PASSED' && totalResult.overallGrade !== 'F';
  const meritTexts = formatMeritSummaryTexts(meritResult, student.section, langMode);

  const addressLine =
    langMode === 'en'
      ? school.addressEn || school.addressBn
      : langMode === 'bilingual' && school.addressEn && school.addressBn && school.addressEn !== school.addressBn
      ? `${school.addressBn} (${school.addressEn})`
      : school.addressBn || school.addressEn;

  const grandTotalLabel =
    langMode === 'bn'
      ? `${texts.grandTotalPrefix} (${totalFullMarks}) ও সার্বিক ফলাফল:`
      : langMode === 'bilingual'
      ? `${texts.grandTotalPrefix} (${totalFullMarks}):`
      : `${texts.grandTotalPrefix} (${totalFullMarks}) & Overall Result:`;

  return (
    <div
      className={`p-4 md:p-5 border-2 border-slate-800 rounded-xl bg-white text-[11px] text-slate-900 font-sans print:border-2 print:p-3 print:rounded-none ${
        isBulkPage ? 'marksheet-page-break' : ''
      }`}
    >
      {/* Institutional Header */}
      <div className="text-center pb-2.5 border-b-2 border-slate-800">
        <div className="flex items-center justify-center space-x-3 mb-1">
          <img
            src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
            alt="School Logo"
            className="w-12 h-12 object-contain shrink-0"
          />
          <div className="text-left">
            {langMode === 'en' ? (
              <h1 className="text-lg font-black text-slate-900 tracking-wide leading-tight">
                {school.nameEn}
              </h1>
            ) : (
              <>
                <h1 className="text-lg font-black text-slate-900 tracking-wide leading-tight">
                  {school.nameBn || school.nameEn}
                </h1>
                <h2 className="text-xs font-bold text-slate-700 tracking-wider">
                  {school.nameEn.toUpperCase()}
                </h2>
              </>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-600">
          {addressLine} • EIIN: {school.eiin} • {texts.estLabel} {school.establishedYear}
        </p>
        <div className="inline-block mt-1.5 px-3 py-0.5 bg-slate-900 text-white rounded text-[10px] font-black uppercase tracking-wider">
          {texts.examBanner}
        </div>
      </div>

      {/* Student Bio & Photo & Grading Key Grid */}
      <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-3 my-2.5 py-1.5 border-b border-slate-300">
        {/* Official Student Passport Photo */}
        <div className="shrink-0 flex flex-col items-center justify-center">
          <div className="w-20 h-24 sm:w-22 sm:h-26 bg-white border-2 border-slate-400 rounded-md overflow-hidden shadow-xs flex flex-col items-center justify-center relative">
            {student.photoUrl ? (
              <img
                src={student.photoUrl}
                alt={student.nameEn}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-1 text-center">
                <User className="w-8 h-8 text-slate-400 mb-0.5" />
                <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tighter">PHOTO</span>
              </div>
            )}
          </div>
          <span className="text-[8px] text-slate-500 font-bold mt-0.5 tracking-tight">{texts.photoCaption}</span>
        </div>

        {/* Student Bio Details */}
        <div className="flex-1 grid grid-cols-2 gap-x-2.5 gap-y-1 text-[11px] leading-tight">
          <div>
            <span className="text-slate-500">{texts.studentNameLabel} </span>
            <strong className="text-slate-900">
              {langMode === 'en' ? student.nameEn || student.nameBn : student.nameBn || student.nameEn}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.englishNameLabel} </span>
            <strong className="text-slate-900">
              {langMode === 'en' ? student.nameBn || student.nameEn : student.nameEn || student.nameBn}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.studentIdLabel} </span>
            <strong className="text-blue-700 font-mono font-bold">{student.studentId}</strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.rollLabel} </span>
            <strong className="text-slate-900">{student.roll}</strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.classSectionLabel} </span>
            <strong>
              {student.className} ({student.section})
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.groupLabel} </span>
            <strong className={student.group ? 'text-indigo-800 font-bold' : 'text-slate-600'}>
              {formatGroupLabelForMarksheet(student.group, langMode)}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{texts.fatherLabel} </span>
            <span>{formatParentDisplayName(student.fatherNameBn, student.fatherNameEn, langMode)}</span>
          </div>
          <div>
            <span className="text-slate-500">{texts.motherLabel} </span>
            <span>{formatParentDisplayName(student.motherNameBn, student.motherNameEn, langMode)}</span>
          </div>
        </div>

        {/* Compact NCTB Grade Reference */}
        <div className="w-full sm:w-44 shrink-0 border border-slate-300 rounded p-1 text-[9px] bg-slate-50 flex flex-col justify-between">
          <div className="font-bold text-center border-b border-slate-200 pb-0.5 text-slate-800">
            {texts.gradingTitle}
          </div>
          <div className="grid grid-cols-2 gap-x-1 text-center py-0.5 leading-tight">
            <div>
              80-100% : <strong>A+ (5.0)</strong>
            </div>
            <div>
              50-59% : <strong>B (3.0)</strong>
            </div>
            <div>
              70-79% : <strong>A (4.0)</strong>
            </div>
            <div>
              40-49% : <strong>C (2.0)</strong>
            </div>
            <div>
              60-69% : <strong>A- (3.5)</strong>
            </div>
            <div>
              33-39% : <strong>D (1.0)</strong>
            </div>
            <div className="col-span-2 text-rose-700 font-bold">{texts.gradingFailText}</div>
          </div>
        </div>
      </div>

      {/* Subject Marks Breakdown Table */}
      <div className="my-2 overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[540px] print:min-w-0 text-left border-collapse border border-slate-400 text-[11px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-800 text-[10px] uppercase">
              <th className="py-1 px-2 border-r border-slate-400">{texts.colSubject}</th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-14 whitespace-nowrap">
                {texts.colFullMarks}
              </th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-16 whitespace-nowrap">
                {texts.colWritten}
              </th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-16 whitespace-nowrap">
                {texts.colMcq}
                {texts.colMcqSub && (
                  <span className="block text-[8px] font-semibold text-slate-500">{texts.colMcqSub}</span>
                )}
              </th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-16 whitespace-nowrap">
                {texts.colPractical}
                {texts.colPracticalSub && (
                  <span className="block text-[8px] font-semibold text-slate-500">{texts.colPracticalSub}</span>
                )}
              </th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-16 whitespace-nowrap">
                {texts.colTotal}
              </th>
              <th className="py-1 px-1.5 border-r border-slate-400 text-center w-14">{texts.colGrade}</th>
              <th className="py-1 px-1.5 text-center w-14">{texts.colGp}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {rows}
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-800 text-[11px]">
              <td colSpan={5} className="py-1.5 px-2 border-r border-slate-400 text-right">
                {grandTotalLabel}
              </td>
              <td className="py-1.5 px-1.5 border-r border-slate-400 text-center text-xs font-black text-slate-900 tabular-nums">
                {hasEnteredMarks ? (
                  <>
                    {grandTotal} <span className="text-[9px] text-slate-500 block">({percentage}%)</span>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td
                className={`py-1.5 px-1.5 border-r border-slate-400 text-center text-xs font-black ${
                  !hasEnteredMarks ? 'text-slate-500' : isPassed ? 'text-blue-700' : 'text-rose-600'
                }`}
              >
                {hasEnteredMarks ? totalResult.overallGrade : '—'}
              </td>
              <td
                className={`py-1.5 px-1.5 text-center text-xs font-black tabular-nums ${
                  !hasEnteredMarks ? 'text-slate-500' : isPassed ? 'text-blue-700' : 'text-rose-600'
                }`}
              >
                {hasEnteredMarks ? totalResult.totalGPA.toFixed(2) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Overall Summary & Single-Exam Student Merit Position */}
      <div className="my-2 p-2 bg-slate-50 rounded-lg border border-slate-300 space-y-1.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-slate-600">{texts.resultEvaluationLabel} </span>
            {!hasEnteredMarks ? (
              <strong className="text-amber-600 font-bold">{texts.statusPending}</strong>
            ) : isPassed ? (
              <strong className="text-emerald-700 font-bold">{texts.statusPassed}</strong>
            ) : (
              <strong className="text-rose-600 font-bold">{texts.statusFailed}</strong>
            )}
          </div>
          <div>
            <span className="text-slate-600">{texts.attendanceLabel} </span>
            <strong className="tabular-nums">{(student as any).attendanceSummary?.percentage || '94'}%</strong>
          </div>
          <div>
            <span className="text-slate-600">{texts.conductLabel} </span>
            {!hasEnteredMarks ? (
              <strong className="text-slate-600">{texts.conductPending}</strong>
            ) : isPassed ? (
              <strong className="text-blue-700">{texts.conductPassed}</strong>
            ) : (
              <strong className="text-rose-600">{texts.conductFailed}</strong>
            )}
          </div>
        </div>

        {/* Single-Exam Personal Merit Position Strip */}
        <div className="pt-1.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-slate-600 font-semibold">{texts.meritHeading}</span>
            <strong
              className={`font-black tabular-nums ${
                meritResult.status === 'failed'
                  ? 'text-rose-600'
                  : meritResult.status === 'pending'
                  ? 'text-amber-700 font-semibold'
                  : 'text-slate-900'
              }`}
            >
              {meritTexts.rankText}
            </strong>
          </div>

          <div className="text-[10.5px] text-slate-600 tabular-nums flex flex-wrap items-center gap-2">
            {meritTexts.sectionRankText && (
              <>
                <span>
                  {texts.sectionRankLabel}: <strong className="text-slate-900">{meritTexts.sectionRankText}</strong>
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
              </>
            )}
            <span>{meritTexts.passedSummaryText}</span>
          </div>
        </div>
      </div>

      {/* Remarks and Signatures */}
      <div className="mt-6 pt-4 border-t border-slate-300 grid grid-cols-3 items-start gap-2 text-center text-[10px] text-slate-700">
        <div>
          <ClassTeacherSignatureDisplay
            school={school}
            className={student.className}
            section={student.section}
            staffList={staffList}
            fallbackText=""
            heightClass="h-9"
            imgClassName="max-h-full max-w-[140px] object-contain mx-auto"
            textClassName="font-serif italic font-bold text-xs text-slate-900"
          />
          <div className="border-t border-slate-500 pt-1 font-semibold mx-2 sm:mx-4">{texts.classTeacherSig}</div>
        </div>
        <div>
          <div className="h-9 mb-0.5" />
          <div className="border-t border-slate-500 pt-1 font-semibold mx-2 sm:mx-4">{texts.controllerSig}</div>
        </div>
        <div>
          <PrincipalSignatureDisplay
            school={school}
            fallbackText=""
            heightClass="h-9"
            imgClassName="max-h-full max-w-[140px] object-contain mx-auto"
            textClassName="font-serif italic font-bold text-xs text-slate-900"
          />
          <div className="border-t border-slate-500 pt-1 font-bold text-slate-900 mx-2 sm:mx-4">
            {texts.principalSig}
          </div>
        </div>
      </div>
    </div>
  );
};
