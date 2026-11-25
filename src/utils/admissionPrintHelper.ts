import { SchoolProfile, Staff, Student } from '../types';
import { escapeHtml, sanitizeSafeMediaUrl } from './htmlSanitizer';
import { formatSchoolScopedId } from './schoolIdFormatter';
import { buildPrincipalSignatureHtml } from './signatureHelper';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BN_MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBnNumStr(value: string | number): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function formatRecordDate(dateStr?: string | null, language: 'bn' | 'en' = 'bn'): string {
  const raw = (dateStr || '').trim();
  if (!raw) {
    return language === 'bn' ? 'উল্লেখ নেই' : 'Not specified';
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIndex = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (monthIndex >= 0 && monthIndex < 12 && day >= 1 && day <= 31) {
      if (language === 'bn') {
        return `${toBnNumStr(String(day).padStart(2, '0'))} ${BN_MONTHS[monthIndex]} ${toBnNumStr(year)}`;
      }
      return `${String(day).padStart(2, '0')} ${EN_MONTHS[monthIndex]} ${year}`;
    }
  }
  return raw;
}

export interface PrintStudentAdmissionParams {
  student: Student;
  school?: Partial<SchoolProfile> | null;
  schoolCode?: string;
  language?: 'bn' | 'en';
}

export function buildStudentAdmissionPrintHtml({
  student,
  school,
  schoolCode,
  language = 'bn',
}: PrintStudentAdmissionParams): string {
  const scopedStudentId = formatSchoolScopedId(student.studentId || student.admissionNo, schoolCode);
  const safeSchoolNameBn = escapeHtml(school?.nameBn || school?.nameEn || 'Smart School');
  const safeSchoolNameEn = escapeHtml(school?.nameEn || school?.nameBn || '');
  const safeEiin = escapeHtml(school?.eiin || 'N/A');
  const safeSchoolAddress = escapeHtml(school?.addressBn || school?.addressEn || '');
  const safeSchoolPhone = escapeHtml(school?.phone || '');
  const safeLogoUrl = sanitizeSafeMediaUrl(school?.logoUrl);
  const safePhotoUrl = sanitizeSafeMediaUrl(student.photoUrl);

  const safeNameEn = escapeHtml(student.nameEn || '-');
  const safeNameBn = escapeHtml(student.nameBn || student.nameEn || '-');
  const safeStudentId = escapeHtml(scopedStudentId || student.studentId || '-');
  const safeAdmissionDate = escapeHtml(formatRecordDate(student.admissionDate, language));
  const safeSession = escapeHtml(student.session || school?.currentSession || '2026');
  const safeClass = escapeHtml(student.className || '-');
  const safeSection = escapeHtml(student.section || 'A');
  const safeShift = escapeHtml(student.shift || 'Day');
  const safeGroup = escapeHtml(student.group || (language === 'bn' ? 'সাধারণ' : 'General'));
  const safeRoll = escapeHtml(language === 'bn' ? toBnNumStr(student.roll || '-') : student.roll || '-');
  const safeGender = escapeHtml(student.gender || '-');
  const safeDob = escapeHtml(formatRecordDate(student.dob, language));
  const safeBloodGroup = escapeHtml(student.bloodGroup || 'Unknown');
  const safeReligion = escapeHtml(student.religion || '-');
  const safeBirthCertNo = escapeHtml(student.birthCertificateNo || (language === 'bn' ? 'দেওয়া হয়নি' : 'Not provided'));
  const safePreviousSchool = escapeHtml(student.previousSchool || (language === 'bn' ? 'প্রযোজ্য নয় / দেওয়া হয়নি' : 'N/A'));
  const safeFatherName = escapeHtml(student.fatherNameBn || student.fatherNameEn || '-');
  const safeFatherNid = escapeHtml(student.fatherNid || (language === 'bn' ? 'দেওয়া হয়নি' : 'Not provided'));
  const safeMotherName = escapeHtml(student.motherNameBn || student.motherNameEn || '-');
  const safeMotherNid = escapeHtml(student.motherNid || (language === 'bn' ? 'দেওয়া হয়নি' : 'Not provided'));
  const safeGuardianName = escapeHtml(student.guardianName || '-');
  const safeGuardianRelation = escapeHtml(student.guardianRelation || 'Guardian');
  const safeGuardianPhone = escapeHtml(student.guardianPhone || '-');
  const safePresentAddr = escapeHtml(student.presentAddress || '-');
  const safePermanentAddr = escapeHtml(student.permanentAddress || student.presentAddress || '-');
  const safeStatus = escapeHtml((student.status || 'active').toUpperCase());
  const safePrintDate = escapeHtml(formatRecordDate(new Date().toISOString().split('T')[0], language));

  const docs: string[] = [];
  if (student.photoUrl) docs.push(language === 'bn' ? 'শিক্ষার্থীর ছবি' : 'Student Photo');
  if (student.birthCertificateUrl || student.birthCertificateNo) docs.push(language === 'bn' ? 'জন্ম নিবন্ধন' : 'Birth Certificate');
  if (student.fatherNidUrl || student.fatherNid) docs.push(language === 'bn' ? 'পিতার এনআইডি' : 'Father NID');
  if (student.motherNidUrl || student.motherNid) docs.push(language === 'bn' ? 'মাতার এনআইডি' : 'Mother NID');
  if (student.transferCertificateUrl) docs.push(language === 'bn' ? 'ছাড়পত্র (TC)' : 'Transfer Certificate (TC)');
  if (Array.isArray(student.documents)) {
    student.documents.forEach((doc) => {
      const title = (doc.title || '').trim();
      if (title && !docs.includes(title)) docs.push(title);
    });
  }
  const safeDocsSummary = escapeHtml(
    docs.length > 0 ? docs.join(' • ') : language === 'bn' ? 'কোনো নথি সংযুক্ত নেই' : 'No documents attached'
  );

  const logoHtml = safeLogoUrl
    ? `<img src="${escapeHtml(safeLogoUrl)}" alt="School Logo" style="width:62px;height:62px;object-fit:contain;border-radius:8px;border:1px solid #cbd5e1;padding:2px;background:#fff;" />`
    : `<div style="width:62px;height:62px;border-radius:8px;background:#1e3a8a;color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;">${escapeHtml((school?.nameEn || 'S').charAt(0))}</div>`;

  const photoHtml = safePhotoUrl
    ? `<img src="${escapeHtml(safePhotoUrl)}" alt="${safeNameEn}" style="width:94px;height:112px;object-fit:cover;border-radius:8px;border:2px solid #1e3a8a;background:#fff;" />`
    : `<div style="width:94px;height:112px;border-radius:8px;border:1.5px dashed #94a3b8;background:#f8fafc;color:#64748b;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;padding:6px;">Passport<br/>Photo</div>`;

  return `<!DOCTYPE html>
<html lang="${language === 'bn' ? 'bn' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <title>${language === 'bn' ? 'শিক্ষার্থী ভর্তি ফরম ও স্লিপ' : 'Student Admission Form'} - ${safeNameEn} (${safeStudentId})</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: 'Hind Siliguri', Arial, sans-serif; margin: 0; padding: 18px; color: #0f172a; background: #fff; font-size: 12px; line-height: 1.45; }
      .sheet { max-width: 780px; margin: 0 auto; border: 1.5px solid #1e293b; border-radius: 10px; padding: 18px 22px; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; gap: 14px; }
      .header-center { flex: 1; text-align: center; }
      .school-bn { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
      .school-en { margin: 2px 0 0 0; font-size: 13px; font-weight: 700; color: #1e3a8a; }
      .school-meta { font-size: 11px; color: #475569; margin-top: 3px; }
      .doc-badge { display: inline-block; margin-top: 7px; padding: 4px 14px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 700; border-radius: 999px; letter-spacing: 0.4px; }
      .highlight-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
      .hl-item { border-right: 1px solid #e2e8f0; padding-right: 8px; }
      .hl-item:last-child { border-right: none; padding-right: 0; }
      .hl-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
      .hl-val { font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px; }
      .section-title { font-size: 12px; font-weight: 800; color: #1e3a8a; background: #eff6ff; border-left: 4px solid #1d4ed8; padding: 5px 10px; margin: 12px 0 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      td { border: 1px solid #cbd5e1; padding: 6px 9px; vertical-align: top; }
      .lbl { width: 22%; background: #f8fafc; font-weight: 700; color: #334155; }
      .val { width: 28%; color: #0f172a; font-weight: 500; }
      .docs-box { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 10px; font-size: 11.5px; }
      .declaration { margin-top: 12px; font-size: 11px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
      .footer { margin-top: 34px; display: flex; justify-content: space-between; align-items: flex-end; text-align: center; font-size: 11px; }
      .sig-col { width: 185px; }
      .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; margin-top: 4px; font-weight: 700; color: #1e293b; }
      .print-meta { margin-top: 14px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }
      @media print { body { padding: 0; } .sheet { border: 1px solid #334155; } }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>${logoHtml}</div>
        <div class="header-center">
          <h1 class="school-bn">${safeSchoolNameBn}</h1>
          ${safeSchoolNameEn && safeSchoolNameEn !== safeSchoolNameBn ? `<div class="school-en">${safeSchoolNameEn}</div>` : ''}
          <div class="school-meta">
            ${safeSchoolAddress}${safeSchoolPhone ? ` • Phone: ${safeSchoolPhone}` : ''} • EIIN: ${safeEiin}
          </div>
          <div class="doc-badge">STUDENT ADMISSION FORM &amp; CONFIRMATION SLIP / শিক্ষার্থী ভর্তি ফরম</div>
        </div>
        <div>${photoHtml}</div>
      </div>

      <div class="highlight-grid">
        <div class="hl-item">
          <div class="hl-label">Student / Admission ID</div>
          <div class="hl-val" style="font-family: monospace; color: #1d4ed8;">${safeStudentId}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">ভর্তির তারিখ (Admission Date)</div>
          <div class="hl-val" style="color: #047857;">${safeAdmissionDate}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">শ্রেণি ও রোল (Class &amp; Roll)</div>
          <div class="hl-val">${safeClass} (${safeSection}) • Roll ${safeRoll}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">শিক্ষাবর্ষ ও অবস্থা</div>
          <div class="hl-val">${safeSession} • ${safeStatus}</div>
        </div>
      </div>

      <div class="section-title">১. শিক্ষার্থীর ব্যক্তিগত ও একাডেমিক তথ্য (Student &amp; Academic Details)</div>
      <table>
        <tr>
          <td class="lbl">শিক্ষার্থীর নাম (বাংলা)</td>
          <td class="val"><strong>${safeNameBn}</strong></td>
          <td class="lbl">Student Name (English)</td>
          <td class="val"><strong>${safeNameEn}</strong></td>
        </tr>
        <tr>
          <td class="lbl">জন্মতারিখ (Date of Birth)</td>
          <td class="val">${safeDob}</td>
          <td class="lbl">লিঙ্গ ও রক্তের গ্রুপ</td>
          <td class="val">${safeGender} • ${safeBloodGroup}</td>
        </tr>
        <tr>
          <td class="lbl">ধর্ম (Religion)</td>
          <td class="val">${safeReligion}</td>
          <td class="lbl">শিফট ও বিভাগ (Shift/Group)</td>
          <td class="val">${safeShift} Shift • ${safeGroup}</td>
        </tr>
        <tr>
          <td class="lbl">জন্ম নিবন্ধন নম্বর</td>
          <td class="val" style="font-family: monospace;">${safeBirthCertNo}</td>
          <td class="lbl">পূর্ববর্তী বিদ্যালয় (যদি থাকে)</td>
          <td class="val">${safePreviousSchool}</td>
        </tr>
      </table>

      <div class="section-title">২. পিতা-মাতা ও অভিভাবকের তথ্য (Parents &amp; Guardian Details)</div>
      <table>
        <tr>
          <td class="lbl">পিতার নাম (Father)</td>
          <td class="val">${safeFatherName}</td>
          <td class="lbl">পিতার NID নম্বর</td>
          <td class="val" style="font-family: monospace;">${safeFatherNid}</td>
        </tr>
        <tr>
          <td class="lbl">মাতার নাম (Mother)</td>
          <td class="val">${safeMotherName}</td>
          <td class="lbl">মাতার NID নম্বর</td>
          <td class="val" style="font-family: monospace;">${safeMotherNid}</td>
        </tr>
        <tr>
          <td class="lbl">অভিভাবক ও সম্পর্ক</td>
          <td class="val">${safeGuardianName} (${safeGuardianRelation})</td>
          <td class="lbl">অভিভাবক মোবাইল</td>
          <td class="val" style="font-family: monospace;"><strong>${safeGuardianPhone}</strong></td>
        </tr>
        <tr>
          <td class="lbl">বর্তমান ঠিকানা</td>
          <td class="val">${safePresentAddr}</td>
          <td class="lbl">স্থায়ী ঠিকানা</td>
          <td class="val">${safePermanentAddr}</td>
        </tr>
      </table>

      <div class="section-title">৩. দাখিলকৃত কাগজপত্র (Submitted Documents)</div>
      <div class="docs-box">${safeDocsSummary}</div>

      <div class="declaration">
        অঙ্গীকারনামা: উপরে প্রদত্ত সকল তথ্য সঠিক এবং আমি প্রতিষ্ঠানের নিয়ম-শৃঙ্খলা মেনে চলতে অঙ্গীকারবদ্ধ।
      </div>

      <div class="footer">
        <div class="sig-col">
          <div style="height: 44px;"></div>
          <div class="sig-line">অভিভাবক / শিক্ষার্থীর স্বাক্ষর</div>
        </div>
        <div class="sig-col">
          <div style="height: 44px;"></div>
          <div class="sig-line">ভর্তি কর্মকর্তা / অফিস সহকারী</div>
        </div>
        <div class="sig-col">
          ${buildPrincipalSignatureHtml(school)}
          <div class="sig-line">অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর</div>
        </div>
      </div>

      <div class="print-meta">
        <span>Admission Form Record • ${safeStudentId}</span>
        <span>মুদ্রণের তারিখ (Printed): ${safePrintDate}</span>
      </div>
    </div>
    <script>
      window.onload = function() { window.print(); };
    </script>
  </body>
</html>`;
}

export function printStudentAdmissionForm(params: PrintStudentAdmissionParams): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.opener = null;
  printWindow.document.write(buildStudentAdmissionPrintHtml(params));
  printWindow.document.close();
}

export interface PrintStaffJoiningParams {
  staff: Staff;
  school?: Partial<SchoolProfile> | null;
  schoolCode?: string;
  language?: 'bn' | 'en';
}

export function buildStaffJoiningPrintHtml({
  staff,
  school,
  schoolCode,
  language = 'bn',
}: PrintStaffJoiningParams): string {
  const scopedEmployeeId = formatSchoolScopedId(staff.employeeId, schoolCode);
  const safeSchoolNameBn = escapeHtml(school?.nameBn || school?.nameEn || 'Smart School');
  const safeSchoolNameEn = escapeHtml(school?.nameEn || school?.nameBn || '');
  const safeEiin = escapeHtml(school?.eiin || 'N/A');
  const safeSchoolAddress = escapeHtml(school?.addressBn || school?.addressEn || '');
  const safeSchoolPhone = escapeHtml(school?.phone || '');
  const safeLogoUrl = sanitizeSafeMediaUrl(school?.logoUrl);
  const safePhotoUrl = sanitizeSafeMediaUrl(staff.photoUrl);

  const safeNameEn = escapeHtml(staff.nameEn || '-');
  const safeNameBn = escapeHtml(staff.nameBn || staff.nameEn || '-');
  const safeEmpId = escapeHtml(scopedEmployeeId || staff.employeeId || '-');
  const safeJoiningDate = escapeHtml(formatRecordDate(staff.joiningDate, language));
  const safeDesignation = escapeHtml(staff.designation || '-');
  const safeDepartment = escapeHtml(staff.department || '-');
  const safeRole = escapeHtml((staff.role || 'teacher').toUpperCase());
  const safePhone = escapeHtml(staff.phone || '-');
  const safeEmail = escapeHtml(staff.email || '-');
  const safeBloodGroup = escapeHtml(staff.bloodGroup || '-');
  const safeGender = escapeHtml(staff.gender || '-');
  const safeQualification = escapeHtml(staff.qualification || '-');
  const safeSubject = escapeHtml(staff.subject || (language === 'bn' ? 'সকল / সাধারণ' : 'General'));
  const safeEmergency = escapeHtml(staff.emergencyContact || '-');
  const safeAddress = escapeHtml(staff.permanentAddress || '-');
  const safeStatus = escapeHtml((staff.status || 'active').toUpperCase());
  const safeClasses = escapeHtml(
    Array.isArray(staff.assignedClasses) && staff.assignedClasses.length > 0
      ? staff.assignedClasses.join(', ')
      : language === 'bn'
      ? 'নির্ধারিত নয়'
      : 'Not assigned'
  );
  const safePrintDate = escapeHtml(formatRecordDate(new Date().toISOString().split('T')[0], language));

  const logoHtml = safeLogoUrl
    ? `<img src="${escapeHtml(safeLogoUrl)}" alt="School Logo" style="width:62px;height:62px;object-fit:contain;border-radius:8px;border:1px solid #cbd5e1;padding:2px;background:#fff;" />`
    : `<div style="width:62px;height:62px;border-radius:8px;background:#1e3a8a;color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;">${escapeHtml((school?.nameEn || 'S').charAt(0))}</div>`;

  const photoHtml = safePhotoUrl
    ? `<img src="${escapeHtml(safePhotoUrl)}" alt="${safeNameEn}" style="width:94px;height:112px;object-fit:cover;border-radius:8px;border:2px solid #047857;background:#fff;" />`
    : `<div style="width:94px;height:112px;border-radius:8px;border:1.5px dashed #94a3b8;background:#f8fafc;color:#64748b;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;padding:6px;">Staff<br/>Photo</div>`;

  return `<!DOCTYPE html>
<html lang="${language === 'bn' ? 'bn' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <title>${language === 'bn' ? 'শিক্ষক ও কর্মচারী যোগদান ও প্রোফাইল কপি' : 'Staff Joining & Profile Record'} - ${safeNameEn} (${safeEmpId})</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: 'Hind Siliguri', Arial, sans-serif; margin: 0; padding: 18px; color: #0f172a; background: #fff; font-size: 12px; line-height: 1.45; }
      .sheet { max-width: 780px; margin: 0 auto; border: 1.5px solid #1e293b; border-radius: 10px; padding: 20px 24px; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; gap: 14px; }
      .header-center { flex: 1; text-align: center; }
      .school-bn { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
      .school-en { margin: 2px 0 0 0; font-size: 13px; font-weight: 700; color: #1e3a8a; }
      .school-meta { font-size: 11px; color: #475569; margin-top: 3px; }
      .doc-badge { display: inline-block; margin-top: 7px; padding: 4px 14px; background: #047857; color: #fff; font-size: 11px; font-weight: 700; border-radius: 999px; letter-spacing: 0.4px; }
      .highlight-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
      .hl-item { border-right: 1px solid #e2e8f0; padding-right: 8px; }
      .hl-item:last-child { border-right: none; padding-right: 0; }
      .hl-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
      .hl-val { font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px; }
      .section-title { font-size: 12px; font-weight: 800; color: #065f46; background: #ecfdf5; border-left: 4px solid #059669; padding: 5px 10px; margin: 12px 0 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      td { border: 1px solid #cbd5e1; padding: 7px 10px; vertical-align: top; }
      .lbl { width: 22%; background: #f8fafc; font-weight: 700; color: #334155; }
      .val { width: 28%; color: #0f172a; font-weight: 500; }
      .note-box { margin-top: 12px; padding: 10px 12px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; font-size: 11.5px; color: #334155; }
      .footer { margin-top: 42px; display: flex; justify-content: space-between; align-items: flex-end; text-align: center; font-size: 11px; }
      .sig-col { width: 210px; }
      .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; margin-top: 4px; font-weight: 700; color: #1e293b; }
      .print-meta { margin-top: 14px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }
      @media print { body { padding: 0; } .sheet { border: 1px solid #334155; } }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>${logoHtml}</div>
        <div class="header-center">
          <h1 class="school-bn">${safeSchoolNameBn}</h1>
          ${safeSchoolNameEn && safeSchoolNameEn !== safeSchoolNameBn ? `<div class="school-en">${safeSchoolNameEn}</div>` : ''}
          <div class="school-meta">
            ${safeSchoolAddress}${safeSchoolPhone ? ` • Phone: ${safeSchoolPhone}` : ''} • EIIN: ${safeEiin}
          </div>
          <div class="doc-badge">TEACHER / STAFF JOINING &amp; PROFILE RECORD / যোগদান ও প্রোফাইল কপি</div>
        </div>
        <div>${photoHtml}</div>
      </div>

      <div class="highlight-grid">
        <div class="hl-item">
          <div class="hl-label">Employee ID</div>
          <div class="hl-val" style="font-family: monospace; color: #1d4ed8;">${safeEmpId}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">যোগদানের তারিখ (Joining Date)</div>
          <div class="hl-val" style="color: #047857;">${safeJoiningDate}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">পদবি ও বিভাগ (Designation)</div>
          <div class="hl-val">${safeDesignation}</div>
        </div>
        <div class="hl-item">
          <div class="hl-label">অবস্থা ও ভূমিকা (Status)</div>
          <div class="hl-val">${safeStatus} • ${safeRole}</div>
        </div>
      </div>

      <div class="section-title">১. শিক্ষক / কর্মচারীর বিস্তারিত তথ্য (Personal &amp; Appointment Details)</div>
      <table>
        <tr>
          <td class="lbl">নাম (বাংলায়)</td>
          <td class="val"><strong>${safeNameBn}</strong></td>
          <td class="lbl">Full Name (English)</td>
          <td class="val"><strong>${safeNameEn}</strong></td>
        </tr>
        <tr>
          <td class="lbl">পদবি (Designation)</td>
          <td class="val">${safeDesignation}</td>
          <td class="lbl">বিভাগ (Department)</td>
          <td class="val">${safeDepartment}</td>
        </tr>
        <tr>
          <td class="lbl">শিক্ষাগত যোগ্যতা</td>
          <td class="val">${safeQualification}</td>
          <td class="lbl">পাঠদানের বিষয়</td>
          <td class="val">${safeSubject}</td>
        </tr>
        <tr>
          <td class="lbl">দায়িত্বপ্রাপ্ত শ্রেণি</td>
          <td class="val">${safeClasses}</td>
          <td class="lbl">লিঙ্গ ও রক্তের গ্রুপ</td>
          <td class="val">${safeGender} • ${safeBloodGroup}</td>
        </tr>
        <tr>
          <td class="lbl">মোবাইল নম্বর</td>
          <td class="val" style="font-family: monospace;"><strong>${safePhone}</strong></td>
          <td class="lbl">জরুরি যোগাযোগ</td>
          <td class="val" style="font-family: monospace;">${safeEmergency}</td>
        </tr>
        <tr>
          <td class="lbl">ইমেইল / লগইন আইডি</td>
          <td class="val">${safeEmail}</td>
          <td class="lbl">স্থায়ী ঠিকানা</td>
          <td class="val">${safeAddress}</td>
        </tr>
      </table>

      <div class="note-box">
        প্রত্যয়ন / নোট: উপরোক্ত শিক্ষক/কর্মচারী <strong>${safeJoiningDate}</strong> তারিখে অত্র প্রতিষ্ঠানে <strong>${safeDesignation}</strong> পদে যোগদান করেছেন এবং প্রতিষ্ঠানের ডিজিটাল রেজিস্টারে নিবন্ধিত রয়েছেন।
      </div>

      <div class="footer">
        <div class="sig-col">
          <div style="height: 44px;"></div>
          <div class="sig-line">শিক্ষক / কর্মচারীর স্বাক্ষর</div>
        </div>
        <div class="sig-col">
          ${buildPrincipalSignatureHtml(school)}
          <div class="sig-line">অধ্যক্ষ / প্রধান শিক্ষকের স্বাক্ষর ও সিল</div>
        </div>
      </div>

      <div class="print-meta">
        <span>Staff Joining &amp; Service Record • ${safeEmpId}</span>
        <span>মুদ্রণের তারিখ (Printed): ${safePrintDate}</span>
      </div>
    </div>
    <script>
      window.onload = function() { window.print(); };
    </script>
  </body>
</html>`;
}

export function printStaffJoiningRecord(params: PrintStaffJoiningParams): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.opener = null;
  printWindow.document.write(buildStaffJoiningPrintHtml(params));
  printWindow.document.close();
}
