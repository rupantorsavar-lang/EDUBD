import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { ClassInfo, Student, StudentDocument, ClassLevel, ShiftType, GroupType } from '../../types';
import { formatClassOptionLabel, getManagedClassList, getManagedClassNames } from '../../utils/academicClasses';
import { DEFAULT_SCHOOL_LOGO } from '../../data/schoolLogo';
import { formatGroupName, toEnNumber } from '../../utils/i18n';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import { compareStudentsByClassAndRoll } from '../../utils/studentSort';
import { exportStudentsAdmissionExcel } from '../../utils/studentExcelExport';
import {
  computeStudentDemographics,
  computeClassWiseDemographics,
  normalizeStudentGender,
  normalizeStudentReligion,
  formatGenderLabel,
  formatReligionLabel,
  NormalizedGender,
  NormalizedReligion,
} from '../../utils/studentDemographics';
import { LiveCameraModal } from '../common/LiveCameraModal';
import { buildPrincipalSignatureHtml } from '../../utils/signatureHelper';
import { escapeHtml, sanitizeSafeMediaUrl } from '../../utils/htmlSanitizer';
import { printStudentAdmissionForm } from '../../utils/admissionPrintHelper';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import {
  Search,
  Users,
  Sun,
  Moon,
  Filter,
  Plus,
  Download,
  Upload,
  Eye,
  Edit2,
  Trash2,
  CreditCard,
  Printer,
  CheckCircle,
  AlertTriangle,
  X,
  Phone,
  User,
  GraduationCap,
  FileSpreadsheet,
  Camera,
  Building,
  Award,
  RefreshCw,
  Calendar,
  KeyRound,
  QrCode,
  Layers,
  Lock,
  FileText,
  FolderOpen,
  ZoomIn,
  ExternalLink,
  ShieldCheck,
  FileCheck,
  FolderArchive,
  CheckCircle2,
  Files,
  Image as ImageIcon,
  Wifi,
  Mail,
  BarChart3,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import QRCode from 'qrcode';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import {
  SaaSApi,
  isSaaSBackendUnavailableError,
  isSaaSIamPermissionError,
  isNetlifyHostingEnvironment,
} from '../../services/saasApi';
import { formatDisplayLoginId, isSyntheticAuthEmail, validateLoginIdentifier } from '../../utils/loginIdentifier';
import {
  ModernStudentIDCardFront,
  ModernStudentIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';

interface StudentsViewProps {
  onPrintCertificate?: (student: Student, type: 'id_card' | 'admit_card' | 'testimonial' | 'transfer' | 'character' | 'bonafide') => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({ onPrintCertificate }) => {
  const { activeRole, saasSession } = useAuth();
  const { t, language, toBnNumber, formatDate } = useLanguage();
  const { schoolProfile: school } = useSchool();
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, school);
  const [academicClasses, setAcademicClasses] = useState<ClassInfo[]>(() => StorageService.getClasses());
  const managedClassList = React.useMemo(() => getManagedClassList(academicClasses), [academicClasses]);
  const managedClassNames = React.useMemo(() => getManagedClassNames(academicClasses), [academicClasses]);
  const [students, setStudents] = useState<Student[]>(() => StorageService.getStudents());
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<'all' | '2026' | '2027' | '2028'>('all');
  const [selectedGender, setSelectedGender] = useState<'all' | NormalizedGender>('all');
  const [selectedReligion, setSelectedReligion] = useState<'all' | NormalizedReligion>('all');
  const [showClassBreakdown, setShowClassBreakdown] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showViewModal, setShowViewModal] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentDetailTab, setStudentDetailTab] = useState<'info' | 'vault'>('info');
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null);
  const [previewDocumentTitle, setPreviewDocumentTitle] = useState<string>('');

  // In-app Delete Confirmation Modal State
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState<boolean>(false);
  const [actionToast, setActionToast] = useState<string>('');

  // Keep student list in sync in real-time when another device or tab adds a student
  React.useEffect(() => {
    const handleSync = () => {
      setAcademicClasses(StorageService.getClasses());
      setStudents(StorageService.getStudents());
    };
    const handleClassesUpdated = () => {
      setAcademicClasses(StorageService.getClasses());
    };
    handleSync();
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_classes_updated', handleClassesUpdated);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_classes_updated', handleClassesUpdated);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // ID Card Modal & 3-Template Customization
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [idCardStudent, setIdCardStudent] = useState<Student | null>(null);
  const [idCardTemplate, setIdCardTemplate] = useState<IDCardTheme>('classic_academic');
  const [idCardViewMode, setIdCardViewMode] = useState<'both' | 'front' | 'back'>('both');
  const [singleStudentQrUrl, setSingleStudentQrUrl] = useState<string>('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const printAdmissionAfterSaveRef = useRef<boolean>(false);

  // Student ID Customizer state
  const [showIdCustomizer, setShowIdCustomizer] = useState<boolean>(false);
  const [customIdPrefix, setCustomIdPrefix] = useState<string>('S-');

  // Admin Student Firebase Auth Credentials Management
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [targetPasswordStudent, setTargetPasswordStudent] = useState<Student | null>(null);
  const [studentAuthEmail, setStudentAuthEmail] = useState<string>('');
  const [newStudentPassword, setNewStudentPassword] = useState<string>('');
  const [showStudentPassText, setShowStudentPassText] = useState<boolean>(false);
  const [savingStudentPassword, setSavingStudentPassword] = useState<boolean>(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string>('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string>('');

  const handleOpenIdCardModal = async (s: Student) => {
    setIdCardStudent(s);
    setShowIdCardModal(true);
    try {
      const qrData = StorageService.generateStudentQRData(s);
      // Generate pure black on white high-contrast QR code for instant camera scanning
      const url = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 400,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setSingleStudentQrUrl(url);
    } catch (e) {
      console.error('Error generating QR code:', e);
    }
  };

  const handleDownloadSingleStudentQR = () => {
    if (!singleStudentQrUrl || !idCardStudent) return;
    const scopedId = formatSchoolScopedId(idCardStudent.studentId, activeSchoolCode);
    const a = document.createElement('a');
    a.href = singleStudentQrUrl;
    a.download = `Student_Attendance_QR_${scopedId}_${idCardStudent.nameEn.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handleSaveStudentPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPasswordStudent) return;
    setPasswordChangeError('');
    setPasswordChangeSuccess('');

    const parsedLogin = validateLoginIdentifier(studentAuthEmail);
    const cleanPass = newStudentPassword.trim();

    if (!parsedLogin.valid) {
      setPasswordChangeError(
        (language === 'bn' ? parsedLogin.errorBn : parsedLogin.error) ||
          'Please enter a valid email, mobile number, or username.'
      );
      return;
    }

    if (!targetPasswordStudent.authUid && cleanPass.length < 6) {
      setPasswordChangeError(
        language === 'bn'
          ? 'প্রথমবার একাউন্ট তৈরি করতে কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।'
          : 'Password must be at least 6 characters when creating a student login.'
      );
      return;
    }

    if (cleanPass.length > 0 && cleanPass.length < 6) {
      setPasswordChangeError(
        language === 'bn'
          ? 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
          : 'New password must be at least 6 characters.'
      );
      return;
    }

    setSavingStudentPassword(true);
    try {
      let resolvedUid = targetPasswordStudent.authUid || '';
      let savedEmail = parsedLogin.displayValue;
      let savedUsername: string | undefined = parsedLogin.kind !== 'email' ? parsedLogin.displayValue : undefined;

      if (targetPasswordStudent.authUid) {
        const res = await SaaSApi.updateUserCredentials(targetPasswordStudent.authUid, {
          displayName: targetPasswordStudent.nameEn || targetPasswordStudent.nameBn,
          email: parsedLogin.displayValue,
          phone: targetPasswordStudent.guardianPhone || targetPasswordStudent.phone,
          ...(cleanPass ? { password: cleanPass } : {}),
        });
        resolvedUid = res.user.uid;
        savedEmail = res.user.email;
        savedUsername = res.user.username;
      } else {
        const res = await SaaSApi.provisionUser({
          email: parsedLogin.displayValue,
          ...(parsedLogin.kind !== 'email' ? { username: parsedLogin.displayValue } : {}),
          password: cleanPass,
          displayName: targetPasswordStudent.nameEn || targetPasswordStudent.nameBn,
          schoolRole: 'student',
          schoolId: saasSession?.school?.schoolId,
          linkedStudentId: targetPasswordStudent.id,
          phone: parsedLogin.normalizedPhone || targetPasswordStudent.guardianPhone || targetPasswordStudent.phone,
        });
        resolvedUid = res.user.uid;
        savedEmail = res.user.email;
        savedUsername = res.user.username;
      }

      const updatedStudent: Student = {
        ...targetPasswordStudent,
        email: savedEmail,
        username: savedUsername,
        authUid: resolvedUid,
      };
      delete updatedStudent.password;
      StorageService.updateStudent(updatedStudent);
      setTargetPasswordStudent(updatedStudent);
      setStudents(StorageService.getStudents());
      setNewStudentPassword('');
      const displayLogin = formatDisplayLoginId({ username: savedUsername, email: savedEmail });
      setPasswordChangeSuccess(
        language === 'bn'
          ? `শিক্ষার্থী ${updatedStudent.nameBn || updatedStudent.nameEn}-এর লগইন (${displayLogin}) সফলভাবে আপডেট হয়েছে!`
          : `Student login (${displayLogin}) saved successfully!`
      );
    } catch (err: any) {
      if (isSaaSIamPermissionError(err)) {
        setPasswordChangeError(
          language === 'bn'
            ? 'Firebase প্রজেক্টে সার্ভারের IAM অনুমোদন (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) এখনো যুক্ত বা সক্রিয় হয়নি। Google Cloud IAM-এ অনুমোদন দেওয়ার পর আবার চেষ্টা করুন।'
            : 'Firebase Admin IAM permissions (Cloud Datastore User, Firebase Authentication Admin, Service Usage Consumer) are not yet granted on this Firebase project.'
        );
      } else if (isSaaSBackendUnavailableError(err)) {
        setPasswordChangeError(
          language === 'bn'
            ? isNetlifyHostingEnvironment()
              ? `${err?.message || 'সার্ভারে Firebase Admin SDK কনফিগার করা নেই।'} (Netlify-তে চালালে Environment variables-এ FIREBASE_SERVICE_ACCOUNT_JSON বা FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY যোগ করে Scopes: All scopes দিয়ে Clear cache and deploy site করুন।)`
              : 'ব্যাকএন্ড সার্ভার সাময়িকভাবে পাওয়া যাচ্ছে না অথবা Firebase Admin সংযোগ প্রস্তুত নয়। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
            : isNetlifyHostingEnvironment()
            ? `${err?.message || 'Firebase Admin SDK is not configured on the server.'} (On Netlify, add FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in Environment variables with All scopes, then redeploy.)`
            : 'The backend server is temporarily unavailable or restarting. Please try again in a moment.'
        );
      } else {
        setPasswordChangeError(err?.message || 'Failed to update student login credentials.');
      }
    } finally {
      setSavingStudentPassword(false);
    }
  };

  // Document Vault Modal & Handlers
  const [showDocVaultModal, setShowDocVaultModal] = useState<boolean>(false);
  const [docVaultStudent, setDocVaultStudent] = useState<Student | null>(null);
  const [docVaultNotice, setDocVaultNotice] = useState<string>('');
  const [customDocTitle, setCustomDocTitle] = useState<string>('');

  const handleOpenDocVaultModal = (s: Student) => {
    setDocVaultStudent(s);
    setDocVaultNotice('');
    setShowDocVaultModal(true);
  };

  const handleVaultUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'birthCertificateUrl' | 'fatherNidUrl' | 'motherNidUrl' | 'transferCertificateUrl' | 'other',
    docTitle?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file || !docVaultStudent) return;

    const saveBase64 = (base64: string) => {
      const updated: Student = { ...docVaultStudent };
      if (field === 'birthCertificateUrl') updated.birthCertificateUrl = base64;
      else if (field === 'fatherNidUrl') updated.fatherNidUrl = base64;
      else if (field === 'motherNidUrl') updated.motherNidUrl = base64;
      else if (field === 'transferCertificateUrl') updated.transferCertificateUrl = base64;
      else if (field === 'other') {
        const newDoc: StudentDocument = {
          id: `doc_${Date.now()}`,
          title: docTitle || customDocTitle || 'নথিপত্র',
          type: 'other',
          category: 'other',
          fileUrl: base64,
          fileName: file.name,
          uploadedAt: new Date().toISOString().split('T')[0],
        };
        updated.documents = [...(updated.documents || []), newDoc];
      }

      StorageService.updateStudent(updated);
      setDocVaultStudent(updated);
      setStudents(StorageService.getStudents());
      setDocVaultNotice('ডকুমেন্ট সফলভাবে আপলোড ও সংরক্ষণ করা হয়েছে!');
      setTimeout(() => setDocVaultNotice(''), 3000);
    };

    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageToPassportSize(file, 900, 1200, 0.72);
        if (compressed) {
          saveBase64(compressed);
          return;
        }
      } catch {}
    }

    const reader = new FileReader();
    reader.onload = (ev) => saveBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleVaultDeleteDoc = (field: 'birthCertificateUrl' | 'fatherNidUrl' | 'motherNidUrl' | 'transferCertificateUrl' | string) => {
    if (!docVaultStudent) return;
    const updated: Student = { ...docVaultStudent };
    if (field === 'birthCertificateUrl') updated.birthCertificateUrl = undefined;
    else if (field === 'fatherNidUrl') updated.fatherNidUrl = undefined;
    else if (field === 'motherNidUrl') updated.motherNidUrl = undefined;
    else if (field === 'transferCertificateUrl') updated.transferCertificateUrl = undefined;
    else {
      updated.documents = (updated.documents || []).filter((d) => d.id !== field);
    }
    StorageService.updateStudent(updated);
    setDocVaultStudent(updated);
    setStudents(StorageService.getStudents());
    setDocVaultNotice('ডকুমেন্ট মুছে ফেলা হয়েছে!');
    setTimeout(() => setDocVaultNotice(''), 3000);
  };

  const handlePrintDocument = (title: string, url: string, student: Student) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.opener = null;
    const safeTitle = escapeHtml(title);
    const safeSchoolName = escapeHtml(school.nameBn || school.nameEn || 'School');
    const safeEiin = escapeHtml(school.eiin || 'N/A');
    const safeAddress = escapeHtml(school.addressBn || '');
    const safeStudentDisplayName = escapeHtml(student.nameBn || student.nameEn);
    const safeStudentNameEn = escapeHtml(student.nameEn);
    const safeStudentId = escapeHtml(student.studentId);
    const safeClassName = escapeHtml(student.className);
    const safeSection = escapeHtml(student.section || 'A');
    const safeRoll = escapeHtml(student.roll);
    const safePhone = escapeHtml(student.guardianPhone);
    const safeFatherName = escapeHtml(student.fatherNameEn || '');
    const safeMotherName = escapeHtml(student.motherNameEn || '');
    const safeDocUrl = sanitizeSafeMediaUrl(url);
    const safePrintDate = escapeHtml(new Date().toLocaleDateString('bn-BD'));
    const docBodyHtml = safeDocUrl
      ? `<img src="${escapeHtml(safeDocUrl)}" class="doc-image" alt="${safeTitle}" />`
      : `<div style="padding:24px;color:#64748b;font-size:13px;">ডকুমেন্ট প্রিভিউ পাওয়া যায়নি বা অনুমোদিত ফরম্যাটে নেই।</div>`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle} - ${safeStudentNameEn} (${safeStudentId})</title>
          <style>
            body { font-family: 'Hind Siliguri', Arial, sans-serif; margin: 20px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; margin: 5px 0; color: #0f172a; }
            .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
            .info-table td { padding: 6px; border: 1px solid #cbd5e1; }
            .doc-container { text-align: center; margin: 20px 0; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; }
            .doc-image { max-width: 100%; max-height: 700px; object-fit: contain; }
            .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin:0; font-size: 20px;">${safeSchoolName}</h2>
            <div style="font-size: 12px; color: #64748b;">EIIN: ${safeEiin} • ${safeAddress}</div>
            <div class="title">${safeTitle}</div>
          </div>
          <table class="info-table">
            <tr>
              <td><strong>শিক্ষার্থীর নাম:</strong> ${safeStudentDisplayName} (${safeStudentNameEn})</td>
              <td><strong>Student ID:</strong> ${safeStudentId}</td>
            </tr>
            <tr>
              <td><strong>শ্রেণি ও রোল:</strong> ${safeClassName} (শাখা: ${safeSection}, রোল: ${safeRoll})</td>
              <td><strong>অভিভাবক মোবাইল:</strong> ${safePhone}</td>
            </tr>
            <tr>
              <td><strong>পিতার নাম:</strong> ${safeFatherName}</td>
              <td><strong>মাতার নাম:</strong> ${safeMotherName}</td>
            </tr>
          </table>
          <div class="doc-container">
            ${docBodyHtml}
          </div>
          <div class="footer">
            <div>যাচাইকৃত ডিজিটাল কপি • মুদ্রণের তারিখ: ${safePrintDate}</div>
            <div style="text-align: center;">
              ${buildPrincipalSignatureHtml(school)}
              <div style="border-top: 1px solid #000; width: 180px; text-align: center; padding-top: 5px;">অধ্যক্ষের স্বাক্ষর ও সিল</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Form State for Add / Edit
  const [formData, setFormData] = useState<Partial<Student>>({
    nameEn: '',
    nameBn: '',
    gender: 'Male',
    dob: '2012-05-10',
    bloodGroup: 'Unknown',
    religion: 'Islam',
    className: 'Class 10',
    section: 'A',
    shift: 'Day',
    group: 'Science',
    roll: '',
    session: '2026',
    admissionDate: new Date().toISOString().split('T')[0],
    fatherNameEn: '',
    fatherNameBn: '',
    fatherPhone: '',
    motherNameEn: '',
    motherNameBn: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'Father',
    presentAddress: '',
    permanentAddress: '',
    photoUrl: '',
    status: 'active',
  });

  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string>('');
  const [showPhotoCamera, setShowPhotoCamera] = useState<boolean>(false);
  const canEdit = activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'receptionist' || activeRole === 'master_admin';

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToPassportSize(file, 240, 300, 0.75);
      setFormData((prev) => ({ ...prev, photoUrl: compressed }));
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormData((prev) => ({ ...prev, photoUrl: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdmissionDocUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'birthCertificateUrl' | 'fatherNidUrl' | 'motherNidUrl' | 'transferCertificateUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageToPassportSize(file, 900, 1200, 0.72);
        if (compressed) {
          setFormData((prev) => ({ ...prev, [field]: compressed }));
          return;
        }
      } catch {}
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFormData((prev) => ({ ...prev, [field]: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Base scope for class-wise breakdown (respects session, section, shift, group, search)
  const classBreakdownScope = students.filter((s) => {
    if (selectedSessionFilter !== 'all' && (s.session || '2026') !== selectedSessionFilter) return false;
    if (selectedSection !== 'all' && s.section !== selectedSection) return false;
    if (selectedShift !== 'all' && s.shift !== selectedShift) return false;
    if (selectedGroup !== 'all') {
      const normalizedSelected = selectedGroup === 'Commerce' ? 'Business Studies' : selectedGroup === 'Arts' ? 'Humanities' : selectedGroup;
      const normalizedStudent = s.group === 'Commerce' ? 'Business Studies' : s.group === 'Arts' ? 'Humanities' : s.group;
      if (normalizedStudent !== normalizedSelected) return false;
    }
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      const matchName = s.nameEn.toLowerCase().includes(q) || s.nameBn.includes(q);
      const scopedId = formatSchoolScopedId(s.studentId, activeSchoolCode).toLowerCase();
      const matchId =
        (s.studentId || s.admissionNo || '').toLowerCase().includes(q) || scopedId.includes(q);
      const matchRoll = s.roll.includes(q);
      const matchPhone = s.guardianPhone.includes(q);
      return matchName || matchId || matchRoll || matchPhone;
    }
    return true;
  });

  // Filters
  const filteredStudents = classBreakdownScope
    .filter((s) => {
      if (selectedClass !== 'all' && s.className !== selectedClass) return false;
      if (selectedGender !== 'all' && normalizeStudentGender(s.gender) !== selectedGender) return false;
      if (selectedReligion !== 'all' && normalizeStudentReligion(s.religion) !== selectedReligion) return false;
      return true;
    })
    .sort(compareStudentsByClassAndRoll);

  const filteredDemographics = computeStudentDemographics(filteredStudents);
  const classBreakdown = computeClassWiseDemographics(classBreakdownScope);
  const hasOtherDemographics =
    classBreakdown.totals.otherGender > 0 || classBreakdown.totals.otherReligion > 0;

  const hasActiveFilters =
    selectedClass !== 'all' ||
    selectedSection !== 'all' ||
    selectedShift !== 'all' ||
    selectedGroup !== 'all' ||
    selectedSessionFilter !== 'all' ||
    selectedGender !== 'all' ||
    selectedReligion !== 'all' ||
    searchTerm.trim() !== '';

  const handleResetFilters = () => {
    setSelectedClass('all');
    setSelectedSection('all');
    setSelectedShift('all');
    setSelectedGroup('all');
    setSelectedSessionFilter('all');
    setSelectedGender('all');
    setSelectedReligion('all');
    setSearchTerm('');
  };

  const handlePrintDemographicReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.opener = null;

    const formatNum = (val: number) => (language === 'bn' ? toBnNumber(val) : String(val));
    const showOtherCol = hasOtherDemographics;
    const rowsHtml = classBreakdown.rows
      .map(
        (row, idx) => `
          <tr>
            <td style="text-align:center;">${formatNum(idx + 1)}</td>
            <td style="font-weight:600;">${escapeHtml(row.className)}</td>
            <td style="text-align:center;font-weight:700;">${formatNum(row.total)}</td>
            <td style="text-align:center;">${formatNum(row.male)}</td>
            <td style="text-align:center;">${formatNum(row.female)}</td>
            <td style="text-align:center;">${formatNum(row.islam)}</td>
            <td style="text-align:center;">${formatNum(row.hinduism)}</td>
            <td style="text-align:center;">${formatNum(row.christianity)}</td>
            <td style="text-align:center;">${formatNum(row.buddhism)}</td>
            ${showOtherCol ? `<td style="text-align:center;">${formatNum(row.otherReligion)}</td>` : ''}
          </tr>
        `
      )
      .join('');

    const tTotals = classBreakdown.totals;
    const schoolTitle = escapeHtml(school.nameBn || school.nameEn || 'School');
    const schoolMeta = escapeHtml(
      `EIIN: ${school.eiin || 'N/A'} • ${school.addressBn || school.addressEn || ''}`
    );
    const scopeParts = [
      selectedSessionFilter === 'all' ? 'সকল শিক্ষাবর্ষ' : `শিক্ষাবর্ষ ${selectedSessionFilter}`,
      selectedShift === 'all' ? 'সকল শিফট' : `${selectedShift} Shift`,
      selectedSection === 'all' ? 'সকল শাখা' : `শাখা ${selectedSection}`,
      selectedGroup === 'all' ? 'সকল বিভাগ' : selectedGroup,
    ];

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>শ্রেণিভিত্তিক শিক্ষার্থী ও ধর্মীয় পরিসংখ্যান</title>
          <style>
            body { font-family: 'Hind Siliguri', Arial, sans-serif; margin: 24px; color: #0f172a; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
            .title { font-size: 16px; font-weight: 700; margin-top: 6px; }
            .meta { font-size: 12px; color: #475569; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
            th { background: #f1f5f9; font-weight: 700; text-align: center; }
            tfoot td { background: #f8fafc; font-weight: 800; border-top: 2px solid #334155; }
            .footer { margin-top: 32px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2 style="margin:0;font-size:20px;">${schoolTitle}</h2>
            <div class="meta">${schoolMeta}</div>
            <div class="title">শ্রেণিভিত্তিক ছাত্র-ছাত্রী ও ধর্মীয় পরিসংখ্যান রিপোর্ট</div>
            <div class="meta">${escapeHtml(scopeParts.join(' • '))}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>ক্রমিক</th>
                <th style="text-align:left;">শ্রেণি (Class)</th>
                <th>মোট (Total)</th>
                <th>ছাত্র (Boy)</th>
                <th>ছাত্রী (Girl)</th>
                <th>মুসলিম (Muslim)</th>
                <th>হিন্দু (Hindu)</th>
                <th>খ্রিস্টান (Christian)</th>
                <th>বৌদ্ধ (Buddhist)</th>
                ${showOtherCol ? '<th>অন্যান্য (Other)</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="${showOtherCol ? 10 : 9}" style="text-align:center;">কোনো তথ্য পাওয়া যায়নি</td></tr>`}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="text-align:left;">সর্বমোট (TOTAL)</td>
                <td style="text-align:center;">${formatNum(tTotals.total)}</td>
                <td style="text-align:center;">${formatNum(tTotals.male)}</td>
                <td style="text-align:center;">${formatNum(tTotals.female)}</td>
                <td style="text-align:center;">${formatNum(tTotals.islam)}</td>
                <td style="text-align:center;">${formatNum(tTotals.hinduism)}</td>
                <td style="text-align:center;">${formatNum(tTotals.christianity)}</td>
                <td style="text-align:center;">${formatNum(tTotals.buddhism)}</td>
                ${showOtherCol ? `<td style="text-align:center;">${formatNum(tTotals.otherReligion)}</td>` : ''}
              </tr>
            </tfoot>
          </table>
          <div class="footer">
            <div>মুদ্রণের তারিখ: ${escapeHtml(new Date().toLocaleDateString('bn-BD'))}</div>
            <div style="text-align:center;">
              ${buildPrincipalSignatureHtml(school)}
              <div style="border-top:1px solid #0f172a;width:180px;padding-top:4px;margin-top:4px;">অধ্যক্ষের স্বাক্ষর ও সিল</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleUploadHardCopy = async (e: React.ChangeEvent<HTMLInputElement>, category: string, defaultTitle?: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudent) return;

    const saveHardCopy = (base64: string) => {
      const updated: Student = { ...selectedStudent };
      if (category === 'birth_certificate') {
        updated.birthCertificateUrl = base64;
      } else if (category === 'father_nid') {
        updated.fatherNidUrl = base64;
      } else if (category === 'mother_nid') {
        updated.motherNidUrl = base64;
      } else if (category === 'guardian_nid') {
        updated.guardianNidUrl = base64;
      } else if (category === 'transfer_certificate') {
        updated.transferCertificateUrl = base64;
      }

      const newDoc: StudentDocument = {
        id: `doc_${Date.now()}`,
        title: defaultTitle || (category === 'birth_certificate' ? 'জন্ম নিবন্ধন সনদ' : category === 'father_nid' ? 'পিতার জাতীয় পরিচয়পত্র' : category === 'mother_nid' ? 'মাতার জাতীয় পরিচয়পত্র' : category === 'transfer_certificate' ? 'ছাড়পত্র / টিসি' : 'হার্ডকপি নথি'),
        type: category as any,
        category: category as any,
        fileUrl: base64,
        fileName: file.name,
        uploadedAt: new Date().toISOString().split('T')[0],
        uploadDate: new Date().toISOString().split('T')[0],
      };
      updated.documents = [...(updated.documents || []), newDoc];
      StorageService.updateStudent(updated);
      setSelectedStudent(updated);
      setStudents(StorageService.getStudents());
      setActionToast('ডকুমেন্ট সফলভাবে সংরক্ষণ করা হয়েছে!');
      setTimeout(() => setActionToast(''), 3000);
    };

    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageToPassportSize(file, 900, 1200, 0.72);
        if (compressed) {
          saveHardCopy(compressed);
          return;
        }
      } catch {}
    }

    const reader = new FileReader();
    reader.onload = (ev) => saveHardCopy(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleOpenAdd = () => {
    const curSession = school.currentSession || '2026';
    const autoId = StorageService.generateNextStudentId(curSession, activeSchoolCode);
    const nextRoll = String(students.filter((s) => s.className === 'Class 10').length + 1).padStart(2, '0');
    setFormData({
      studentId: autoId,
      admissionNo: autoId,
      photoUrl: '',
      nameEn: '',
      nameBn: '',
      gender: 'Male',
      dob: '2012-05-10',
      bloodGroup: 'Unknown',
      religion: 'Islam',
      className: 'Class 10',
      section: 'A',
      shift: 'Day',
      group: 'Science',
      roll: nextRoll,
      session: curSession,
      admissionDate: new Date().toISOString().split('T')[0],
      fatherNameEn: '',
      fatherNameBn: '',
      fatherPhone: '',
      motherNameEn: '',
      motherNameBn: '',
      guardianName: '',
      guardianPhone: '',
      guardianRelation: 'Father',
      presentAddress: 'Mirpur, Dhaka',
      permanentAddress: 'Mirpur, Dhaka',
      status: 'active',
    });
    printAdmissionAfterSaveRef.current = false;
    setFormError('');
    setFormSuccess('');
    setShowAddModal(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameEn || !formData.nameBn || !formData.roll || !formData.guardianPhone) {
      setFormError(language === 'bn' ? 'সকল প্রয়োজনীয় ঘর পূরণ করুন' : 'Please fill all required fields.');
      return;
    }

    // Duplicate check for Roll in same class & section
    const isDuplicate = students.some(
      (s) =>
        s.id !== formData.id &&
        s.className === formData.className &&
        s.section === formData.section &&
        s.roll === formData.roll
    );

    if (isDuplicate) {
      setFormError(
        language === 'bn'
          ? `এই শ্রেণির শাখা ${formData.section}-এ রোল ${formData.roll} ইতোমধ্যে বিদ্যমান!`
          : `Roll No ${formData.roll} already exists in ${formData.className} Section ${formData.section}!`
      );
      return;
    }

    const resolvedAdmissionDate =
      (formData.admissionDate || '').trim() || new Date().toISOString().split('T')[0];

    if (formData.id) {
      // Update
      const updated: Student = {
        ...(formData as Student),
        admissionDate: resolvedAdmissionDate,
      };
      StorageService.updateStudent(updated);
      setStudents(StorageService.getStudents());
      if (printAdmissionAfterSaveRef.current) {
        printAdmissionAfterSaveRef.current = false;
        printStudentAdmissionForm({
          student: updated,
          school,
          schoolCode: activeSchoolCode,
          language,
        });
      }
      setFormSuccess(language === 'bn' ? 'সফলভাবে হালনাগাদ করা হয়েছে' : 'Student updated successfully.');
      setTimeout(() => {
        setShowAddModal(false);
        setFormSuccess('');
      }, 1000);
    } else {
      // Create New Admission
      const curSes = formData.session || school.currentSession || '2026';
      const autoId = formData.studentId || StorageService.generateNextStudentId(curSes, activeSchoolCode);
      const newStudent: Student = {
        ...(formData as Student),
        id: `std_${Date.now()}`,
        studentId: autoId,
        admissionNo: autoId,
        admissionDate: resolvedAdmissionDate,
      };
      StorageService.addStudent(newStudent);
      setStudents(StorageService.getStudents());
      setShowAddModal(false);
      setActionToast(
        language === 'bn'
          ? `নতুন শিক্ষার্থী ${newStudent.nameBn || newStudent.nameEn} (${formatDate(resolvedAdmissionDate)}) ভর্তি সম্পন্ন হয়েছে!`
          : `New admission saved for ${newStudent.nameEn} (${formatDate(resolvedAdmissionDate)})!`
      );
      setTimeout(() => setActionToast(''), 4500);
      if (printAdmissionAfterSaveRef.current) {
        printAdmissionAfterSaveRef.current = false;
        printStudentAdmissionForm({
          student: newStudent,
          school,
          schoolCode: activeSchoolCode,
          language,
        });
      }
      // Immediately open newly admitted student's ID Card with generated QR code
      handleOpenIdCardModal(newStudent);
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      StorageService.deleteStudent(studentToDelete.id);
      const updated = StorageService.getStudents();
      setStudents(updated);
      const name = studentToDelete.nameBn || studentToDelete.nameEn;
      setActionToast(
        language === 'bn'
          ? `শিক্ষার্থী ${name} (${studentToDelete.studentId}) এর তথ্য সফলভাবে মুছে ফেলা হয়েছে!`
          : `Student ${studentToDelete.nameEn} (${studentToDelete.studentId}) deleted successfully!`
      );
      setTimeout(() => setActionToast(''), 4500);
      setStudentToDelete(null);
    } catch (err) {
      console.error('Failed to delete student:', err);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'studentId,nameEn,nameBn,gender,dob,bloodGroup,religion,className,section,shift,group,roll,session,guardianName,guardianPhone,address\n' +
      'S-2026-9001,Arman Hossain,আরমান হোসেন,Male,2011-03-12,A+,Islam,Class 9,A,Day,Science,05,2026,Kabir Hossain,+880 1711-445522,Mirpur Dhaka\n' +
      'S-2026-9002,Farzana Yasmin,ফারজানা ইয়াসমিন,Female,2011-07-22,O+,Islam,Class 9,A,Day,Science,06,2026,Nurul Islam,+880 1819-332211,Mirpur Dhaka';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'student_bulk_import_template_bangladesh.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllStudentsExcel = () => {
    if (students.length === 0) {
      setActionToast(
        language === 'bn'
          ? 'ডাউনলোড করার মতো কোনো শিক্ষার্থী পাওয়া যায়নি!'
          : 'No student records available to export.'
      );
      setTimeout(() => setActionToast(''), 3500);
      return;
    }
    exportStudentsAdmissionExcel({
      allStudents: students,
      filteredStudents,
      schoolName: school?.nameEn,
      schoolCode: activeSchoolCode,
    });
    setActionToast(
      language === 'bn'
        ? `মোট ${toBnNumber(students.length)} জন শিক্ষার্থীর সম্পূর্ণ ভর্তি তথ্য Excel (.xlsx) ডাউনলোড সম্পন্ন হয়েছে!`
        : `Downloaded Excel (.xlsx) admission info for all ${students.length} students!`
    );
    setTimeout(() => setActionToast(''), 4000);
  };

  const studentLauncherItems: LauncherTileItem[] = [
    {
      id: 'all',
      label: language === 'bn' ? 'সকল শিক্ষার্থী' : 'All Students',
      icon: Users,
      color: 'blue',
      active: selectedShift === 'all',
      badge: students.length,
      onClick: () => setSelectedShift('all'),
    },
    {
      id: 'morning',
      label: language === 'bn' ? 'প্রভাতি শিফট' : 'Morning Shift',
      icon: Sun,
      color: 'amber',
      active: selectedShift === 'Morning',
      badge: students.filter((s) => s.shift === 'Morning').length || undefined,
      onClick: () => setSelectedShift('Morning'),
    },
    {
      id: 'day',
      label: language === 'bn' ? 'দিবা শিফট' : 'Day Shift',
      icon: Moon,
      color: 'indigo',
      active: selectedShift === 'Day',
      badge: students.filter((s) => s.shift === 'Day').length || undefined,
      onClick: () => setSelectedShift('Day'),
    },
    {
      id: 'excel_export',
      label: language === 'bn' ? 'Excel ডাউনলোড' : 'Excel Export',
      icon: FileSpreadsheet,
      color: 'green',
      badge: students.length || undefined,
      onClick: handleDownloadAllStudentsExcel,
    },
    {
      id: 'csv',
      label: language === 'bn' ? 'CSV টেমপ্লেট' : 'CSV Template',
      icon: Download,
      color: 'teal',
      onClick: handleDownloadCsvTemplate,
    },
    ...(canEdit
      ? [
          {
            id: 'add',
            label: language === 'bn' ? 'নতুন ভর্তি' : 'New Admission',
            icon: Plus,
            color: 'sky' as const,
            onClick: handleOpenAdd,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* App-Launcher Icon Tile Grid */}
      <LauncherIconGrid items={studentLauncherItems} columns={5} compact />

      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            {language === 'bn' ? 'শিক্ষার্থী তালিকা ও ভর্তি রেজিস্টার' : 'Student Directory & Admissions'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? `মোট ${toBnNumber(students.length)} জন শিক্ষার্থী ${managedClassList[0]?.nameBn || managedClassNames[0] || 'প্লে'} থেকে ${managedClassList[managedClassList.length - 1]?.nameBn || managedClassNames[managedClassNames.length - 1] || 'দশম'} শ্রেণিতে ভর্তি রয়েছে`
              : `Total ${students.length} students enrolled from ${managedClassNames[0] || 'Play'} to ${managedClassNames[managedClassNames.length - 1] || 'Class 10'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadAllStudentsExcel}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {language === 'bn'
                ? 'সকল তথ্য Excel ডাউনলোড'
                : 'Download All Excel (.xlsx)'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCsvTemplate}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>{language === 'bn' ? 'CSV টেমপ্লেট' : 'CSV Template'}</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'নতুন শিক্ষার্থী ভর্তি' : 'New Admission'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Demographic Summary Strip (Boy / Girl / Religion Counts for Active Filter) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-600 shrink-0" />
            <h3 className="text-xs font-bold text-slate-800">
              {language === 'bn'
                ? selectedClass === 'all'
                  ? 'ছাত্র-ছাত্রী ও ধর্মীয় পরিসংখ্যান (ফিল্টার অনুযায়ী)'
                  : `${selectedClass} — ছাত্র-ছাত্রী ও ধর্মীয় পরিসংখ্যান`
                : selectedClass === 'all'
                ? 'Student Gender & Religion Summary'
                : `${selectedClass} — Gender & Religion Summary`}
            </h3>
            <span className="text-[11px] text-slate-500">
              {selectedShift !== 'all' ? `· ${selectedShift}` : ''}
              {selectedSection !== 'all' ? ` · Sec ${selectedSection}` : ''}
              {selectedSessionFilter !== 'all' ? ` · ${selectedSessionFilter}` : ''}
            </span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{language === 'bn' ? 'ফিল্টার রিসেট' : 'Reset Filters'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {/* Total */}
          <button
            type="button"
            onClick={() => {
              setSelectedGender('all');
              setSelectedReligion('all');
            }}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedGender === 'all' && selectedReligion === 'all'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800'
            }`}
          >
            <div className={`text-[11px] font-medium ${selectedGender === 'all' && selectedReligion === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
              {language === 'bn' ? 'মোট শিক্ষার্থী' : 'Total'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.total) : filteredDemographics.total}
            </div>
          </button>

          {/* Boy / Male */}
          <button
            type="button"
            onClick={() => setSelectedGender((prev) => (prev === 'male' ? 'all' : 'male'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedGender === 'male'
                ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-blue-700">
              {language === 'bn' ? 'ছাত্র (Boy)' : 'Boy (Male)'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.male) : filteredDemographics.male}
            </div>
          </button>

          {/* Girl / Female */}
          <button
            type="button"
            onClick={() => setSelectedGender((prev) => (prev === 'female' ? 'all' : 'female'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedGender === 'female'
                ? 'border-rose-600 bg-rose-50 text-rose-900 ring-1 ring-rose-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-rose-700">
              {language === 'bn' ? 'ছাত্রী (Girl)' : 'Girl (Female)'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.female) : filteredDemographics.female}
            </div>
          </button>

          {/* Muslim / Islam */}
          <button
            type="button"
            onClick={() => setSelectedReligion((prev) => (prev === 'islam' ? 'all' : 'islam'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedReligion === 'islam'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-emerald-700">
              {language === 'bn' ? 'মুসলিম (Islam)' : 'Muslim'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.islam) : filteredDemographics.islam}
            </div>
          </button>

          {/* Hindu / Hinduism */}
          <button
            type="button"
            onClick={() => setSelectedReligion((prev) => (prev === 'hinduism' ? 'all' : 'hinduism'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedReligion === 'hinduism'
                ? 'border-amber-600 bg-amber-50 text-amber-900 ring-1 ring-amber-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-amber-700">
              {language === 'bn' ? 'হিন্দু (Hindu)' : 'Hindu'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.hinduism) : filteredDemographics.hinduism}
            </div>
          </button>

          {/* Christian / Christianity */}
          <button
            type="button"
            onClick={() => setSelectedReligion((prev) => (prev === 'christianity' ? 'all' : 'christianity'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedReligion === 'christianity'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-indigo-700">
              {language === 'bn' ? 'খ্রিস্টান (Christian)' : 'Christian'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.christianity) : filteredDemographics.christianity}
            </div>
          </button>

          {/* Buddhist / Buddhism */}
          <button
            type="button"
            onClick={() => setSelectedReligion((prev) => (prev === 'buddhism' ? 'all' : 'buddhism'))}
            className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
              selectedReligion === 'buddhism'
                ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-500'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[11px] font-medium text-teal-700">
              {language === 'bn' ? 'বৌদ্ধ (Buddhist)' : 'Buddhist'}
            </div>
            <div className="text-lg font-extrabold tabular-nums mt-0.5">
              {language === 'bn' ? toBnNumber(filteredDemographics.buddhism) : filteredDemographics.buddhism}
            </div>
          </button>
        </div>
      </div>

      {/* Class-wise Demographic Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
          <div className="flex items-start space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                {language === 'bn'
                  ? 'শ্রেণিভিত্তিক ছাত্র-ছাত্রী ও ধর্মীয় পরিসংখ্যান'
                  : 'Class-wise Gender & Religion Breakdown'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? 'যেকোনো শ্রেণির সারিতে ক্লিক করে ঐ শ্রেণির শিক্ষার্থী ফিল্টার করুন'
                  : 'Click any class row to filter students for that class'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintDemographicReport}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>{language === 'bn' ? 'রিপোর্ট প্রিন্ট' : 'Print Report'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowClassBreakdown((prev) => !prev)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200/70 text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showClassBreakdown ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'লুকান' : 'Hide'}</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'দেখান' : 'Show'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {showClassBreakdown && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3.5 whitespace-nowrap">
                    {language === 'bn' ? 'শ্রেণি (Class)' : 'Class'}
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">
                    {language === 'bn' ? 'মোট' : 'Total'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-blue-700 whitespace-nowrap">
                    {language === 'bn' ? 'ছাত্র (Boy)' : 'Boy'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-rose-700 whitespace-nowrap">
                    {language === 'bn' ? 'ছাত্রী (Girl)' : 'Girl'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-emerald-700 whitespace-nowrap">
                    {language === 'bn' ? 'মুসলিম' : 'Muslim'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-amber-700 whitespace-nowrap">
                    {language === 'bn' ? 'হিন্দু' : 'Hindu'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-indigo-700 whitespace-nowrap">
                    {language === 'bn' ? 'খ্রিস্টান' : 'Christian'}
                  </th>
                  <th className="py-2.5 px-3 text-center text-teal-700 whitespace-nowrap">
                    {language === 'bn' ? 'বৌদ্ধ' : 'Buddhist'}
                  </th>
                  {hasOtherDemographics && (
                    <th className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">
                      {language === 'bn' ? 'অন্যান্য' : 'Other'}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classBreakdown.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasOtherDemographics ? 9 : 8}
                      className="py-6 text-center text-slate-500 text-xs"
                    >
                      {language === 'bn'
                        ? 'বর্তমান ফিল্টারে শ্রেণিভিত্তিক কোনো শিক্ষার্থী নেই'
                        : 'No student records match the current scope'}
                    </td>
                  </tr>
                ) : (
                  classBreakdown.rows.map((row) => {
                    const isSelectedRow = selectedClass === row.className;
                    const fmt = (val: number) => (language === 'bn' ? toBnNumber(val) : val);
                    return (
                      <tr
                        key={row.className}
                        onClick={() =>
                          setSelectedClass((prev) => (prev === row.className ? 'all' : row.className))
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelectedRow
                            ? 'bg-blue-50/80 font-semibold text-blue-950'
                            : 'hover:bg-slate-50/80 text-slate-700'
                        }`}
                      >
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{row.className}</span>
                          {row.sections.length > 0 && (
                            <span className="ml-1.5 text-[11px] text-slate-500">
                              ({row.sections.join(', ')})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-extrabold text-slate-900 tabular-nums">
                          {fmt(row.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-blue-700 tabular-nums">
                          {fmt(row.male)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-rose-700 tabular-nums">
                          {fmt(row.female)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-emerald-700 tabular-nums">
                          {fmt(row.islam)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-amber-700 tabular-nums">
                          {fmt(row.hinduism)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-indigo-700 tabular-nums">
                          {fmt(row.christianity)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-teal-700 tabular-nums">
                          {fmt(row.buddhism)}
                        </td>
                        {hasOtherDemographics && (
                          <td className="py-2.5 px-3 text-center text-slate-600 tabular-nums">
                            {fmt(row.otherReligion)}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {classBreakdown.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-slate-900">
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {language === 'bn' ? 'সর্বমোট (TOTAL)' : 'TOTAL'}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.total) : classBreakdown.totals.total}
                    </td>
                    <td className="py-2.5 px-3 text-center text-blue-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.male) : classBreakdown.totals.male}
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.female) : classBreakdown.totals.female}
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.islam) : classBreakdown.totals.islam}
                    </td>
                    <td className="py-2.5 px-3 text-center text-amber-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.hinduism) : classBreakdown.totals.hinduism}
                    </td>
                    <td className="py-2.5 px-3 text-center text-indigo-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.christianity) : classBreakdown.totals.christianity}
                    </td>
                    <td className="py-2.5 px-3 text-center text-teal-700 tabular-nums">
                      {language === 'bn' ? toBnNumber(classBreakdown.totals.buddhism) : classBreakdown.totals.buddhism}
                    </td>
                    {hasOtherDemographics && (
                      <td className="py-2.5 px-3 text-center text-slate-700 tabular-nums">
                        {language === 'bn' ? toBnNumber(classBreakdown.totals.otherReligion) : classBreakdown.totals.otherReligion}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Filter and Search Controls */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={language === 'bn' ? 'নাম, আইডি, রোল অথবা ফোন নম্বর দিয়ে খুঁজুন...' : 'Search by name, ID, roll, guardian phone...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Session Filter */}
          <div>
            <select
              aria-label="Filter by session"
              value={selectedSessionFilter}
              onChange={(e) => setSelectedSessionFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-blue-900"
            >
              <option value="all">{language === 'bn' ? 'সকল শিক্ষাবর্ষ (All Sessions)' : 'All Sessions'}</option>
              <option value="2026">শিক্ষাবর্ষ ২০২৬ (রানিং)</option>
              <option value="2027">শিক্ষাবর্ষ ২০২৭ (অগ্রিম ভর্তি)</option>
              <option value="2028">শিক্ষাবর্ষ ২০২৮</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Class Filter */}
          <div>
            <select
              aria-label="Filter by class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল শ্রেণি (All Classes)' : 'All Classes'}</option>
              {managedClassList.map((cls) => (
                <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <select
              aria-label="Filter by section"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল শাখা (A, B, C)' : 'All Sections'}</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
            </select>
          </div>

          {/* Shift Filter */}
          <div>
            <select
              aria-label="Filter by shift"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল শিফট' : 'All Shifts'}</option>
              <option value="Morning">Morning (প্রভাতি)</option>
              <option value="Day">Day (দিবা)</option>
            </select>
          </div>

          {/* Group Filter */}
          <div>
            <select
              aria-label="Filter by group"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল বিভাগ (Group)' : 'All Groups'}</option>
              <option value="Science">Science (বিজ্ঞান)</option>
              <option value="Business Studies">Business Studies (ব্যবসায় শিক্ষা)</option>
              <option value="Humanities">Humanities (মানবিক)</option>
              <option value="Vocational">Vocational (ভোকেশনাল)</option>
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <select
              aria-label="Filter by gender"
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value as 'all' | NormalizedGender)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল লিঙ্গ (Boy / Girl)' : 'All Genders (Boy / Girl)'}</option>
              <option value="male">{language === 'bn' ? 'ছাত্র (Boy / Male)' : 'Boy (Male)'}</option>
              <option value="female">{language === 'bn' ? 'ছাত্রী (Girl / Female)' : 'Girl (Female)'}</option>
              <option value="other">{language === 'bn' ? 'অন্যান্য (Other)' : 'Other'}</option>
            </select>
          </div>

          {/* Religion Filter */}
          <div>
            <select
              aria-label="Filter by religion"
              value={selectedReligion}
              onChange={(e) => setSelectedReligion(e.target.value as 'all' | NormalizedReligion)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">{language === 'bn' ? 'সকল ধর্ম (All Religions)' : 'All Religions'}</option>
              <option value="islam">{language === 'bn' ? 'মুসলিম (Islam)' : 'Muslim (Islam)'}</option>
              <option value="hinduism">{language === 'bn' ? 'হিন্দু (Hindu)' : 'Hindu (Hinduism)'}</option>
              <option value="christianity">{language === 'bn' ? 'খ্রিস্টান (Christian)' : 'Christian (Christianity)'}</option>
              <option value="buddhism">{language === 'bn' ? 'বৌদ্ধ (Buddhist)' : 'Buddhist (Buddhism)'}</option>
              <option value="other">{language === 'bn' ? 'অন্যান্য (Other)' : 'Other'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">ID & Roll</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Class & Section</th>
                <th className="py-3 px-4">Shift & Group</th>
                <th className="py-3 px-4">Guardian Contact</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto text-slate-500">
                      <GraduationCap className="w-12 h-12 text-blue-200 mb-3" />
                      <p className="font-bold text-slate-700 text-base">
                        {students.length === 0
                          ? (language === 'bn' ? 'বিদ্যালয়ে এখনও কোনো শিক্ষার্থী ভর্তি করা হয়নি' : 'No students enrolled yet')
                          : (language === 'bn' ? 'ফিল্টারে কোনো শিক্ষার্থী পাওয়া যায়নি' : 'No students found matching filters')}
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {students.length === 0
                          ? (language === 'bn' ? 'সিস্টেমে নতুন শিক্ষার্থী যুক্ত করতে ওপরের "+ নতুন শিক্ষার্থী যোগ করুন" বাটনে ক্লিক করুন অথবা এক্সেলে বাল্ক ইমপোর্ট করুন।' : 'Click "+ Add New Student" above to enroll your school students or import via CSV/Excel.')
                          : (language === 'bn' ? 'অনুগ্রহ করে শ্রেণি, শাখা বা সার্চ কি-ওয়ার্ড পরিবর্তন করে দেখুন।' : 'Try clearing filters or changing search keywords.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold font-mono text-blue-700">
                        {formatSchoolScopedId(s.studentId, activeSchoolCode)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Roll: {language === 'bn' ? toBnNumber(s.roll) : s.roll}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold mt-0.5 flex items-center space-x-1">
                        <Calendar className="w-2.5 h-2.5 shrink-0" />
                        <span>
                          {language === 'bn' ? 'ভর্তি:' : 'Admitted:'}{' '}
                          {s.admissionDate ? formatDate(s.admissionDate) : language === 'bn' ? 'উল্লেখ নেই' : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2.5">
                        {s.photoUrl ? (
                          <img
                            src={s.photoUrl}
                            alt={s.nameEn}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                            {(s.nameEn || s.nameBn || 'S').charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{s.nameEn}</div>
                          <div className="text-[11px] text-slate-500">{s.nameBn}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {formatGenderLabel(s.gender, language)} · {formatReligionLabel(s.religion, language)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">{s.className}</span>
                      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-slate-100 border border-slate-200 rounded font-bold text-slate-600">
                        Sec {s.section}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700 font-medium">{s.shift} Shift</div>
                      {s.group && (
                        <div
                          className={`text-[10px] font-bold mt-0.5 px-2 py-0.5 inline-block rounded border ${
                            s.group === 'Vocational'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : s.group === 'Science'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : s.group === 'Commerce' || s.group === 'Business Studies'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {formatGroupName(s.group, 'en')} Group
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{s.guardianName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{s.guardianPhone}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {/* View Profile */}
                        <button
                          onClick={() => {
                            setSelectedStudent(s);
                            setShowViewModal(true);
                          }}
                          title="View Profile"
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* ID Card Print Trigger (Dual Cards: General & Smart QR) */}
                        <button
                          onClick={() => handleOpenIdCardModal(s)}
                          title="আইডি কার্ডসমূহ (১. প্রাতিষ্ঠানিক + ২. স্মার্ট কিউআর)"
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>

                        {/* Print Admission Form / Confirmation Slip */}
                        <button
                          type="button"
                          onClick={() =>
                            printStudentAdmissionForm({
                              student: s,
                              school,
                              schoolCode: activeSchoolCode,
                              language,
                            })
                          }
                          title={language === 'bn' ? 'ভর্তি ফরম ও নিশ্চিতকরণ স্লিপ প্রিন্ট' : 'Print Admission Form'}
                          className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
                        >
                          <Printer className="w-4 h-4 text-teal-600" />
                        </button>

                        {/* Student Documents Vault (Birth Certificate, Father/Mother NID, TC) */}
                        <button
                          onClick={() => handleOpenDocVaultModal(s)}
                          title="শিক্ষার্থীর নথিপত্র ও হার্ডকপি ভল্ট (জন্ম নিবন্ধন, এনআইডি, ছাড়পত্র)"
                          className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded relative group transition-colors"
                        >
                          <FolderArchive className="w-4 h-4 text-emerald-600" />
                          {(s.birthCertificateUrl || s.fatherNidUrl || s.motherNidUrl || s.transferCertificateUrl || (s.documents?.length || 0) > 0) && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" title="নথিপত্র সংরক্ষিত রয়েছে" />
                          )}
                        </button>

                        {/* Student Login Password Management */}
                        {canEdit && (
                          <button
                            onClick={() => {
                              const schoolSlug = (activeSchoolCode || 'sch').toLowerCase().replace(/[^a-z0-9]/g, '');
                              const stuSlug = (s.studentId || s.id).toLowerCase().replace(/[^a-z0-9]/g, '');
                              const suggested = s.username
                                ? s.username
                                : s.email && s.email.includes('@') && !isSyntheticAuthEmail(s.email)
                                ? s.email
                                : s.authUid
                                ? formatDisplayLoginId(s)
                                : `${stuSlug}@${schoolSlug}.smartschool.bd`;
                              setTargetPasswordStudent(s);
                              setStudentAuthEmail(suggested);
                              setNewStudentPassword('');
                              setShowStudentPassText(false);
                              setPasswordChangeError('');
                              setPasswordChangeSuccess('');
                              setShowPasswordModal(true);
                            }}
                            title="লগইন আইডি (ইমেইল/মোবাইল/নাম) ও পাসওয়ার্ড পরিবর্তন"
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded"
                          >
                            <KeyRound className="w-4 h-4 text-indigo-600" />
                          </button>
                        )}

                        {/* Edit */}
                        {canEdit && (
                          <button
                            onClick={() => {
                              setFormData({
                                ...s,
                                admissionDate: s.admissionDate || new Date().toISOString().split('T')[0],
                              });
                              printAdmissionAfterSaveRef.current = false;
                              setFormError('');
                              setFormSuccess('');
                              setShowAddModal(true);
                            }}
                            title="Edit Record"
                            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-slate-100 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete */}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(s)}
                            title={language === 'bn' ? 'শিক্ষার্থী মুছে ফেলুন' : 'Delete Student'}
                            aria-label={language === 'bn' ? 'শিক্ষার্থী মুছে ফেলুন' : 'Delete Student'}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 active:bg-rose-100 rounded-lg border border-rose-100/70 min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {formData.id
                  ? language === 'bn' ? 'শিক্ষার্থী তথ্য পরিবর্তন' : 'Edit Student Details'
                  : language === 'bn' ? 'নতুন শিক্ষার্থী ভর্তি ফরম' : 'New Student Admission Form'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveStudent} className="mt-4 space-y-4 text-xs">
              {/* Section 1: Basic Info */}
              <div className="font-bold text-slate-700 pb-1 border-b border-slate-100">
                {language === 'bn' ? '১. শিক্ষার্থীর মৌলিক তথ্য' : '1. Student Basic Information'}
              </div>

              {/* Photo Upload & Student ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                {/* Photo Upload */}
                <div className="flex items-center space-x-3">
                  <div className="relative shrink-0">
                    {formData.photoUrl ? (
                      <img
                        src={formData.photoUrl}
                        alt="Student"
                        className="w-16 h-16 rounded-xl object-cover border-2 border-blue-500 shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-200 text-slate-400 flex flex-col items-center justify-center border border-slate-300">
                        <Camera className="w-5 h-5 mb-0.5" />
                        <span className="text-[8px] font-semibold">{language === 'bn' ? 'ছবি নেই' : 'No Photo'}</span>
                      </div>
                    )}
                    {formData.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, photoUrl: '' })}
                        className="absolute -top-1.5 -right-1.5 p-0.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-[11px] block">
                      {language === 'bn' ? 'শিক্ষার্থীর ছবি আপলোড' : 'Upload Student Photo'}
                    </span>
                    <input
                      type="file"
                      ref={photoInputRef}
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-semibold flex items-center space-x-1 shadow-xs"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{formData.photoUrl ? (language === 'bn' ? 'পরিবর্তন' : 'Change') : (language === 'bn' ? 'বাছাই করুন' : 'Choose')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPhotoCamera(true)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold flex items-center space-x-1 shadow-xs"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{language === 'bn' ? 'ক্যামেরা দিয়ে তুলুন' : 'Take Photo'}</span>
                      </button>
                      {!formData.photoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              photoUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&auto=format&fit=crop&q=80',
                            })
                          }
                          className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px]"
                        >
                          {language === 'bn' ? 'ডেমো ছবি' : 'Sample'}
                        </button>
                      )}
                    </div>
                  </div>
                  <LiveCameraModal
                    isOpen={showPhotoCamera}
                    title={language === 'bn' ? 'শিক্ষার্থীর ফেস ছবি তুলুন' : 'Capture Student Face Photo'}
                    defaultFacing="user"
                    onCapture={(dataUrl) => setFormData((prev) => ({ ...prev, photoUrl: dataUrl }))}
                    onClose={() => setShowPhotoCamera(false)}
                  />
                </div>

                {/* Auto Student ID with Customizer */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-800 text-[11px]">
                      {language === 'bn' ? 'স্টুডেন্ট / ভর্তি আইডি' : 'Student / Admission ID'}
                    </label>
                    <div className="flex items-center space-x-1">
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                        অটো
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowIdCustomizer(!showIdCustomizer)}
                        className="text-[9px] text-blue-600 hover:text-blue-800 font-bold underline"
                      >
                        {showIdCustomizer ? 'লুকান' : '⚙️ কাস্টমাইজ'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      required
                      value={formData.studentId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, studentId: val, admissionNo: val });
                      }}
                      placeholder={`e.g. ${activeSchoolCode}-S-2026-1001`}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-blue-800 bg-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const curSes = formData.session || school.currentSession || '2026';
                        const nextId = StorageService.generateNextStudentId(curSes, activeSchoolCode);
                        setFormData({ ...formData, studentId: nextId, admissionNo: nextId });
                      }}
                      className="p-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-700 shrink-0 shadow-2xs"
                      title="Generate new ID according to school & session"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* ID Customizer & Presets Drawer */}
                  {showIdCustomizer && (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 mt-1.5 text-xs animate-in fade-in">
                      <div className="flex items-center justify-between text-[10px] text-blue-900 font-bold">
                        <span>স্কুল অনুযায়ী আইডি প্রিসেট ({activeSchoolCode}):</span>
                        <span className="text-[9px] font-mono text-slate-500">সেশন: {formData.session || '2026'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const curSes = formData.session || school.currentSession || '2026';
                            const nextId = StorageService.generateNextStudentId(curSes, activeSchoolCode, 'S');
                            setFormData({ ...formData, studentId: nextId, admissionNo: nextId });
                          }}
                          className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 rounded-md font-mono text-[10px] font-bold text-blue-900 truncate"
                          title="School-S-Session-Number"
                        >
                          {activeSchoolCode}-S-{formData.session || '2026'}-****
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const curSes = formData.session || school.currentSession || '2026';
                            const nextId = StorageService.generateNextStudentId(curSes, activeSchoolCode, 'STU');
                            setFormData({ ...formData, studentId: nextId, admissionNo: nextId });
                          }}
                          className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 rounded-md font-mono text-[10px] font-bold text-blue-900 truncate"
                          title="School-STU-Session-Number"
                        >
                          {activeSchoolCode}-STU-{formData.session || '2026'}-****
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cls = (formData.className || 'C10').replace(/\s+/g, '').toUpperCase();
                            const rollStr = String(formData.roll || '01').padStart(2, '0');
                            const nextId = `${activeSchoolCode}-${cls}-${rollStr}`;
                            setFormData({ ...formData, studentId: nextId, admissionNo: nextId });
                          }}
                          className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 rounded-md font-mono text-[10px] font-bold text-blue-900 truncate"
                          title="School-Class-Roll format"
                        >
                          {activeSchoolCode}-{(formData.className || 'C10').replace(/\s+/g, '')}-{formData.roll || '01'}
                        </button>
                      </div>

                      {/* Custom Prefix generator */}
                      <div className="flex items-center space-x-1.5 pt-1 border-t border-blue-200/60">
                        <span className="text-[10px] text-slate-600 font-medium shrink-0">কাস্টম প্রিফিক্স:</span>
                        <input
                          type="text"
                          value={customIdPrefix}
                          onChange={(e) => setCustomIdPrefix(e.target.value)}
                          placeholder={`e.g. ${activeSchoolCode}-`}
                          className="w-24 px-1.5 py-0.5 border border-slate-300 rounded font-mono text-[10px] bg-white font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const prefix = customIdPrefix.trim() || `${activeSchoolCode}-S-`;
                            const curSes = formData.session || school.currentSession || '2026';
                            const num = String(students.length + 1001);
                            const nextId = formatSchoolScopedId(`${prefix}${curSes}-${num}`, activeSchoolCode);
                            setFormData({ ...formData, studentId: nextId, admissionNo: nextId });
                          }}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shrink-0"
                        >
                          প্রয়োগ করুন
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Student Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameEn || ''}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    শিক্ষার্থীর পূর্ণ নাম (বাংলায়) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameBn || ''}
                    onChange={(e) => setFormData({ ...formData, nameBn: e.target.value })}
                    placeholder="যেমন: তানভীর আহমেদ"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender / লিঙ্গ</label>
                  <select
                    value={formData.gender || 'Male'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Male">Male / ছাত্র</option>
                    <option value="Female">Female / ছাত্রী</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth / জন্মতারিখ</label>
                  <input
                    type="date"
                    value={formData.dob || ''}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Blood Group / রক্তের গ্রুপ</label>
                  <select
                    value={formData.bloodGroup || 'Unknown'}
                    onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg === 'Unknown' ? 'Unknown / অজানা' : bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Religion / ধর্ম</label>
                  <select
                    value={formData.religion || 'Islam'}
                    onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Islam">Islam / ইসলাম</option>
                    <option value="Hinduism">Hinduism / হিন্দু</option>
                    <option value="Buddhism">Buddhism / বৌদ্ধ</option>
                    <option value="Christianity">Christianity / খ্রিষ্টান</option>
                    <option value="Other">Other / অন্যান্য</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-emerald-800 mb-1">
                    {language === 'bn' ? 'ভর্তির তারিখ (Admission Date) *' : 'Admission Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.admissionDate || ''}
                    onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                    className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/40 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {language === 'bn' ? 'শিক্ষাবর্ষ (Session)' : 'Academic Session'}
                  </label>
                  <select
                    value={formData.session || school.currentSession || '2026'}
                    onChange={(e) => setFormData({ ...formData, session: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-semibold"
                  >
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                  </select>
                </div>
              </div>

              {/* Section 2: Academic Placement */}
              <div className="font-bold text-slate-700 pt-3 pb-1 border-b border-slate-100">
                {language === 'bn' ? '২. একাডেমিক শ্রেণি ও বিভাগ' : '2. Academic Placement'}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Class *</label>
                  <select
                    value={formData.className || managedClassNames[0] || 'Class 10'}
                    onChange={(e) => setFormData({ ...formData, className: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {managedClassList.map((cls) => (
                      <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Section *</label>
                  <select
                    value={formData.section || 'A'}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Shift</label>
                  <select
                    value={formData.shift || 'Day'}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value as ShiftType })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Morning">Morning (প্রভাতি)</option>
                    <option value="Day">Day (দিবা)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Roll No *</label>
                  <input
                    type="text"
                    required
                    value={formData.roll || ''}
                    onChange={(e) => setFormData({ ...formData, roll: toEnNumber(e.target.value) })}
                    placeholder="e.g. 05"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Group if Class 9 or 10 */}
              {(formData.className === 'Class 9' || formData.className === 'Class 10') && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Secondary Group (মাধ্যমিক বিভাগ)
                  </label>
                  <select
                    value={
                      formData.group === 'Commerce'
                        ? 'Business Studies'
                        : formData.group === 'Arts'
                        ? 'Humanities'
                        : formData.group || 'Science'
                    }
                    onChange={(e) => setFormData({ ...formData, group: e.target.value as GroupType })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Science">Science (বিজ্ঞান)</option>
                    <option value="Business Studies">Business Studies (ব্যবসায় শিক্ষা)</option>
                    <option value="Humanities">Humanities (মানবিক)</option>
                    <option value="Vocational">Vocational (ভোকেশনাল / কারিগরি শাখা)</option>
                  </select>
                </div>
              )}

              {/* Section 3: Parents & Guardian */}
              <div className="font-bold text-slate-700 pt-3 pb-1 border-b border-slate-100">
                {language === 'bn' ? '৩. অভিভাবকের তথ্য ও যোগাযোগ' : '3. Guardian & Contact Information'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Father Name (পিতার নাম)</label>
                  <input
                    type="text"
                    value={formData.fatherNameEn || ''}
                    onChange={(e) => setFormData({ ...formData, fatherNameEn: e.target.value })}
                    placeholder="e.g. Md. Anwar Hossain"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mother Name (মাতার নাম)</label>
                  <input
                    type="text"
                    value={formData.motherNameEn || ''}
                    onChange={(e) => setFormData({ ...formData, motherNameEn: e.target.value })}
                    placeholder="e.g. Nasrin Sultana"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guardian Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.guardianName || ''}
                    onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                    placeholder="Name of Primary Guardian"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guardian Mobile (SMS Alert) *</label>
                  <input
                    type="text"
                    required
                    value={formData.guardianPhone || ''}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: toEnNumber(e.target.value) })}
                    placeholder="+880 1711-xxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Present Address (বর্তমান ঠিকানা)</label>
                  <input
                    type="text"
                    value={formData.presentAddress || ''}
                    onChange={(e) => setFormData({ ...formData, presentAddress: e.target.value })}
                    placeholder="House, Road, Block, Area, City"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Section 4: প্রয়োজনীয় নথিপত্র ও হার্ডকপি আপলোড (Birth Certificate, Father/Mother NID, TC) */}
              <div className="font-bold text-slate-700 pt-3 pb-1 border-b border-slate-100 flex items-center justify-between">
                <span>{language === 'bn' ? '৪. প্রয়োজনীয় নথিপত্র ও হার্ডকপি আপলোড (ঐচ্ছিক)' : '4. Student Documents & NID Upload'}</span>
                <span className="text-[10px] text-slate-400 font-normal">ভর্তির সময় বা পরবর্তীতে আপলোড করা যাবে</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {/* 1. Birth Certificate */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center space-x-1">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>জন্ম নিবন্ধন সনদপত্র (Birth Certificate)</span>
                    </span>
                    {formData.birthCertificateUrl && <span className="text-[10px] text-emerald-600 font-bold">✓ ফাইল যুক্ত</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="জন্ম নিবন্ধন নম্বর (১৭ ডিজিট)"
                    value={formData.birthCertificateNo || ''}
                    onChange={(e) => setFormData({ ...formData, birthCertificateNo: toEnNumber(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs font-mono"
                  />
                  <label className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{formData.birthCertificateUrl ? 'সনদের কপি পরিবর্তন' : 'সনদের ছবি / ফাইল আপলোড'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleAdmissionDocUpload(e, 'birthCertificateUrl')}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 2. Father NID */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center space-x-1">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      <span>পিতার জাতীয় পরিচয়পত্র (Father NID)</span>
                    </span>
                    {formData.fatherNidUrl && <span className="text-[10px] text-emerald-600 font-bold">✓ ফাইল যুক্ত</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="পিতার NID নম্বর (১০/১৩/১৭ ডিজিট)"
                    value={formData.fatherNid || ''}
                    onChange={(e) => setFormData({ ...formData, fatherNid: toEnNumber(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs font-mono"
                  />
                  <label className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200 text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{formData.fatherNidUrl ? 'পিতার NID পরিবর্তন' : 'পিতার NID ছবি আপলোড'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleAdmissionDocUpload(e, 'fatherNidUrl')}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 3. Mother NID */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center space-x-1">
                      <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                      <span>মাতার জাতীয় পরিচয়পত্র (Mother NID)</span>
                    </span>
                    {formData.motherNidUrl && <span className="text-[10px] text-emerald-600 font-bold">✓ ফাইল যুক্ত</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="মাতার NID নম্বর"
                    value={formData.motherNid || ''}
                    onChange={(e) => setFormData({ ...formData, motherNid: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs font-mono"
                  />
                  <label className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md border border-purple-200 text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{formData.motherNidUrl ? 'মাতার NID পরিবর্তন' : 'মাতার NID ছবি আপলোড'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleAdmissionDocUpload(e, 'motherNidUrl')}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 4. Previous School TC */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center space-x-1">
                      <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                      <span>পূর্ববর্তী স্কুলের ছাড়পত্র / প্রত্যয়নপত্র (TC)</span>
                    </span>
                    {formData.transferCertificateUrl && <span className="text-[10px] text-emerald-600 font-bold">✓ ফাইল যুক্ত</span>}
                  </div>
                  <input
                    type="text"
                    placeholder="পূর্ববর্তী প্রতিষ্ঠানের নাম"
                    value={formData.previousSchool || ''}
                    onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                  />
                  <label className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{formData.transferCertificateUrl ? 'ছাড়পত্র কপি পরিবর্তন' : 'ছাড়পত্র (TC) ছবি আপলোড'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleAdmissionDocUpload(e, 'transferCertificateUrl')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  {formData.id && (
                    <button
                      type="button"
                      onClick={() =>
                        printStudentAdmissionForm({
                          student: formData as Student,
                          school,
                          schoolCode: activeSchoolCode,
                          language,
                        })
                      }
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg font-bold transition-colors"
                    >
                      <Printer className="w-4 h-4 text-teal-700" />
                      <span>{language === 'bn' ? 'ভর্তি ফরম প্রিন্ট' : 'Print Admission Form'}</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  {!formData.id && (
                    <button
                      type="submit"
                      onClick={() => {
                        printAdmissionAfterSaveRef.current = true;
                      }}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      <span>{language === 'bn' ? 'সংরক্ষণ ও ভর্তি ফরম প্রিন্ট' : 'Save & Print Form'}</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    onClick={() => {
                      printAdmissionAfterSaveRef.current = false;
                    }}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    {formData.id ? t('save') : language === 'bn' ? 'ভর্তি সম্পন্ন করুন' : 'Confirm Admission'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student View Profile Modal with Document Vault */}
      {showViewModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8 max-h-[92vh] overflow-y-auto text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {selectedStudent.nameBn || selectedStudent.nameEn} - {language === 'bn' ? 'শিক্ষার্থী প্রোফাইল ও নথি ভল্ট' : 'Student Profile & Document Vault'}
                </h3>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Switcher inside Modal */}
            <div className="flex items-center space-x-2 mt-4 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setStudentDetailTab('info')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 ${
                  studentDetailTab === 'info'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4" />
                <span>{language === 'bn' ? '১. ব্যক্তিগত ও শিক্ষা তথ্য' : 'Profile Details'}</span>
              </button>
              <button
                type="button"
                onClick={() => setStudentDetailTab('vault')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 ${
                  studentDetailTab === 'vault'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                <span>
                  {language === 'bn' ? '২. ডিজিটাল ডকুমেন্ট ভল্ট ও হার্ডকপি' : 'Document Vault & Hard Copies'}
                  {(selectedStudent.birthCertificateUrl || selectedStudent.fatherNidUrl || selectedStudent.motherNidUrl || (selectedStudent.documents?.length || 0) > 0) && (
                    <span className="ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full bg-amber-400 text-slate-950 font-black">
                      {[
                        selectedStudent.birthCertificateUrl,
                        selectedStudent.fatherNidUrl,
                        selectedStudent.motherNidUrl,
                        selectedStudent.guardianNidUrl,
                        selectedStudent.transferCertificateUrl,
                      ].filter(Boolean).length + (selectedStudent.documents?.length || 0)}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* TAB 1: Profile Information */}
            {studentDetailTab === 'info' && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center space-x-3.5 p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0 shadow-xs">
                    {selectedStudent.photoUrl ? (
                      <img src={selectedStudent.photoUrl} alt={selectedStudent.nameEn} className="w-full h-full object-cover" />
                    ) : (
                      selectedStudent.nameEn.charAt(0)
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{selectedStudent.nameEn}</h4>
                    <p className="text-slate-600 font-medium">{selectedStudent.nameBn}</p>
                    <p className="text-blue-700 font-bold mt-0.5">
                      ID: {selectedStudent.studentId} • Roll: {selectedStudent.roll} • Session: {selectedStudent.session || '2026'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-100">
                  <div>
                    <span className="text-slate-400">Class & Section:</span>
                    <p className="font-bold text-slate-800">
                      {selectedStudent.className} - {selectedStudent.section} ({selectedStudent.shift} Shift)
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Blood Group & Religion:</span>
                    <p className="font-bold text-slate-800">
                      {selectedStudent.bloodGroup} • {selectedStudent.religion}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Date of Birth:</span>
                    <p className="font-semibold text-slate-800">{selectedStudent.dob}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{language === 'bn' ? 'ভর্তির তারিখ (Admission Date):' : 'Admission Date:'}</span>
                    <p className="font-bold text-emerald-700">
                      {selectedStudent.admissionDate
                        ? formatDate(selectedStudent.admissionDate)
                        : language === 'bn'
                        ? 'উল্লেখ নেই'
                        : 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Academic Session:</span>
                    <p className="font-semibold text-blue-900">{selectedStudent.session || '2026'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">জন্ম নিবন্ধন নম্বর (Birth Reg No):</span>
                    <p className="font-mono font-bold text-slate-900">
                      {selectedStudent.birthCertificateNo || 'নম্বর এন্ট্রি করা নেই'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">পিতা/মাতা NID:</span>
                    <p className="font-mono text-slate-700">
                      {selectedStudent.fatherNidUrl ? '✓ পিতার NID সংযুক্ত' : 'NID কপি পাওয়া যায়নি'}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">Father & Mother:</span>
                  <p className="font-medium text-slate-800">{selectedStudent.fatherNameEn} / {selectedStudent.motherNameEn}</p>
                </div>

                <div>
                  <span className="text-slate-400">Guardian Contact:</span>
                  <p className="font-semibold text-slate-900">{selectedStudent.guardianName} ({selectedStudent.guardianPhone})</p>
                </div>

                <div>
                  <span className="text-slate-400">Address:</span>
                  <p className="text-slate-700">{selectedStudent.presentAddress || 'Mirpur, Dhaka'}</p>
                </div>
              </div>
            )}

            {/* TAB 2: Document Vault & Hard Copies */}
            {studentDetailTab === 'vault' && (
              <div className="mt-4 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    শিক্ষার্থীর জন্ম নিবন্ধন সনদ, পিতা/মাতার জাতীয় পরিচয়পত্র (NID) এবং ছাড়পত্রসহ সকল হার্ডকপি নিচে ডিজিটাল ভল্টে সংরক্ষিত রয়েছে। ক্লিক করে বড় করে দেখুন বা ডাউনলোড করুন।
                  </span>
                </div>

                {/* Standard Document Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Document 1: Birth Certificate */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>১. জন্ম নিবন্ধন সনদ</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedStudent.birthCertificateUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {selectedStudent.birthCertificateUrl ? '✓ হার্ডকপি সংরক্ষিত' : 'কপি অনুপস্থিত'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 font-mono">
                      সনদ নং: {selectedStudent.birthCertificateNo || 'নম্বর উল্লেখ নেই'}
                    </div>

                    {selectedStudent.birthCertificateUrl ? (
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            setPreviewDocumentUrl(selectedStudent.birthCertificateUrl!);
                            setPreviewDocumentTitle(`${selectedStudent.nameEn} - জন্ম নিবন্ধন সনদ`);
                          }}
                          className="h-28 rounded-lg overflow-hidden border border-slate-300 bg-white cursor-pointer relative group flex items-center justify-center"
                        >
                          <img
                            src={selectedStudent.birthCertificateUrl}
                            alt="Birth Certificate"
                            className="w-full h-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                            <ZoomIn className="w-4 h-4" />
                            <span>বড় করে দেখুন</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDocumentUrl(selectedStudent.birthCertificateUrl!);
                              setPreviewDocumentTitle(`${selectedStudent.nameEn} - জন্ম নিবন্ধন সনদ`);
                            }}
                            className="flex-1 py-1 px-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>ভিউ</span>
                          </button>
                          <label className="flex-1 py-1 px-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg font-bold text-center cursor-pointer">
                            <span>পরিবর্তন</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleUploadHardCopy(e, 'birth_certificate', 'জন্ম নিবন্ধন সনদ')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="block p-3 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl text-center cursor-pointer bg-white transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <span className="font-bold text-blue-600 block">জন্ম নিবন্ধন কপি আপলোড করুন</span>
                        <span className="text-[10px] text-slate-400">ক্যামেরা ছবি বা স্ক্যান ফাইল</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleUploadHardCopy(e, 'birth_certificate', 'জন্ম নিবন্ধন সনদ')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Document 2: Father NID */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                        <span>২. পিতার জাতীয় পরিচয়পত্র (NID)</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedStudent.fatherNidUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {selectedStudent.fatherNidUrl ? '✓ সংরক্ষিত' : 'সংযুক্ত নেই'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      পিতা: {selectedStudent.fatherNameEn || selectedStudent.fatherNameBn}
                    </div>

                    {selectedStudent.fatherNidUrl ? (
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            setPreviewDocumentUrl(selectedStudent.fatherNidUrl!);
                            setPreviewDocumentTitle(`${selectedStudent.nameEn} - পিতার NID`);
                          }}
                          className="h-28 rounded-lg overflow-hidden border border-slate-300 bg-white cursor-pointer relative group flex items-center justify-center"
                        >
                          <img
                            src={selectedStudent.fatherNidUrl}
                            alt="Father NID"
                            className="w-full h-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                            <ZoomIn className="w-4 h-4" />
                            <span>বড় করে দেখুন</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDocumentUrl(selectedStudent.fatherNidUrl!);
                              setPreviewDocumentTitle(`${selectedStudent.nameEn} - পিতার NID`);
                            }}
                            className="flex-1 py-1 px-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>ভিউ</span>
                          </button>
                          <label className="flex-1 py-1 px-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg font-bold text-center cursor-pointer">
                            <span>পরিবর্তন</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleUploadHardCopy(e, 'father_nid', 'পিতার জাতীয় পরিচয়পত্র')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="block p-3 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl text-center cursor-pointer bg-white transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <span className="font-bold text-indigo-600 block">পিতার NID কার্ড আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleUploadHardCopy(e, 'father_nid', 'পিতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Document 3: Mother NID */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                        <CreditCard className="w-4 h-4 text-purple-600" />
                        <span>৩. মাতার জাতীয় পরিচয়পত্র (NID)</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedStudent.motherNidUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {selectedStudent.motherNidUrl ? '✓ সংরক্ষিত' : 'সংযুক্ত নেই'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      মাতা: {selectedStudent.motherNameEn || selectedStudent.motherNameBn}
                    </div>

                    {selectedStudent.motherNidUrl ? (
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            setPreviewDocumentUrl(selectedStudent.motherNidUrl!);
                            setPreviewDocumentTitle(`${selectedStudent.nameEn} - মাতার NID`);
                          }}
                          className="h-28 rounded-lg overflow-hidden border border-slate-300 bg-white cursor-pointer relative group flex items-center justify-center"
                        >
                          <img
                            src={selectedStudent.motherNidUrl}
                            alt="Mother NID"
                            className="w-full h-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                            <ZoomIn className="w-4 h-4" />
                            <span>বড় করে দেখুন</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDocumentUrl(selectedStudent.motherNidUrl!);
                              setPreviewDocumentTitle(`${selectedStudent.nameEn} - মাতার NID`);
                            }}
                            className="flex-1 py-1 px-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>ভিউ</span>
                          </button>
                          <label className="flex-1 py-1 px-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg font-bold text-center cursor-pointer">
                            <span>পরিবর্তন</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleUploadHardCopy(e, 'mother_nid', 'মাতার জাতীয় পরিচয়পত্র')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="block p-3 border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-xl text-center cursor-pointer bg-white transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <span className="font-bold text-purple-600 block">মাতার NID কার্ড আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleUploadHardCopy(e, 'mother_nid', 'মাতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Document 4: Transfer Certificate / TC */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                        <FileCheck className="w-4 h-4 text-emerald-600" />
                        <span>৪. প্রশংসাপত্র / ছাড়পত্র (TC)</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedStudent.transferCertificateUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {selectedStudent.transferCertificateUrl ? '✓ সংরক্ষিত' : 'প্রয়োজন নেই'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      পূর্ববর্তী স্কুল ছাড়পত্র বা সনদপত্র
                    </div>

                    {selectedStudent.transferCertificateUrl ? (
                      <div className="space-y-2">
                        <div
                          onClick={() => {
                            setPreviewDocumentUrl(selectedStudent.transferCertificateUrl!);
                            setPreviewDocumentTitle(`${selectedStudent.nameEn} - ছাড়পত্র / টিসি`);
                          }}
                          className="h-28 rounded-lg overflow-hidden border border-slate-300 bg-white cursor-pointer relative group flex items-center justify-center"
                        >
                          <img
                            src={selectedStudent.transferCertificateUrl}
                            alt="Transfer Certificate"
                            className="w-full h-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                            <ZoomIn className="w-4 h-4" />
                            <span>বড় করে দেখুন</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDocumentUrl(selectedStudent.transferCertificateUrl!);
                              setPreviewDocumentTitle(`${selectedStudent.nameEn} - ছাড়পত্র / টিসি`);
                            }}
                            className="flex-1 py-1 px-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>ভিউ</span>
                          </button>
                          <label className="flex-1 py-1 px-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg font-bold text-center cursor-pointer">
                            <span>পরিবর্তন</span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleUploadHardCopy(e, 'transfer_certificate', 'ছাড়পত্র / টিসি')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="block p-3 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <span className="font-bold text-emerald-600 block">ছাড়পত্র (TC) কপি আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleUploadHardCopy(e, 'transfer_certificate', 'ছাড়পত্র / টিসি')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Additional Attached Documents List */}
                {selectedStudent.documents && selectedStudent.documents.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h5 className="font-bold text-slate-800">অন্যান্য সংরক্ষিত ডকুমেন্টস ({selectedStudent.documents.length}টি):</h5>
                    <div className="space-y-1.5">
                      {selectedStudent.documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                          <div className="flex items-center space-x-2">
                            <FileCheck className="w-4 h-4 text-blue-600" />
                            <div>
                              <span className="font-bold text-slate-800">{doc.title}</span>
                              <span className="text-[10px] text-slate-400 block">{doc.uploadedAt || doc.uploadDate}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewDocumentUrl(doc.fileUrl);
                              setPreviewDocumentTitle(doc.title);
                            }}
                            className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-bold hover:bg-blue-100 flex items-center space-x-1"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>দেখুন</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="pt-4 mt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  printStudentAdmissionForm({
                    student: selectedStudent,
                    school,
                    schoolCode: activeSchoolCode,
                    language,
                  })
                }
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'ভর্তি ফরম প্রিন্ট' : 'Print Admission Form'}</span>
              </button>
              {onPrintCertificate && (
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    onPrintCertificate(selectedStudent, 'id_card');
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'আইডি কার্ড প্রিন্ট' : 'Print ID Card'}</span>
                </button>
              )}
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-1.5 border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN ZOOM LIGHTBOX MODAL FOR HARD COPY DOCUMENTS */}
      {previewDocumentUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-4 max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {previewDocumentTitle || 'হার্ডকপি প্রিভিউ'}
                </h4>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={previewDocumentUrl}
                  download="student_document.png"
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center space-x-1 hover:bg-blue-100 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ডাউনলোড</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold flex items-center space-x-1 hover:bg-slate-200 text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>প্রিন্ট</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDocumentUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/5 rounded-xl my-3 min-h-[350px]">
              <img
                src={previewDocumentUrl}
                alt="Document Preview"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md border border-slate-200 bg-white"
              />
            </div>

            <div className="text-center text-slate-500 text-[11px]">
              বিদ্যালয়ের ডিজিটাল নথিপত্র ভল্ট • উচ্চ রেজুল্যুশন অরিজিনাল কপি
            </div>
          </div>
        </div>
      )}

      {/* Official Student ID Card Modal (3 Templates + Pure White Back with Black QR & Mobile) */}
      {showIdCardModal && idCardStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 my-8 max-h-[95vh] overflow-y-auto print:p-0 print:border-none print:shadow-none print:max-w-none print:my-0">
            {/* Header controls (hidden on print) */}
            <div className="flex flex-col gap-3 pb-3 border-b border-slate-100 print:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">
                      {idCardStudent.nameBn || idCardStudent.nameEn} - শিক্ষার্থী ডিজিটাল আইডি কার্ড
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      School: <span className="font-mono font-bold text-indigo-700">{activeSchoolCode}</span> • ID:{' '}
                      <span className="font-mono font-bold text-blue-700">
                        {formatSchoolScopedId(idCardStudent.studentId, activeSchoolCode)}
                      </span>{' '}
                      • শ্রেণি: {idCardStudent.className} (রোল: {idCardStudent.roll})
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      printStudentAdmissionForm({
                        student: idCardStudent,
                        school,
                        schoolCode: activeSchoolCode,
                        language,
                      })
                    }
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ভর্তি ফরম প্রিন্ট' : 'Print Admission Form'}</span>
                  </button>
                  {singleStudentQrUrl && (
                    <button
                      type="button"
                      onClick={handleDownloadSingleStudentQR}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'কিউআর ডাউনলোড' : 'Download QR'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => window.print()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'আইডি কার্ড প্রিন্ট' : 'Print ID Card'}</span>
                  </button>
                  <button
                    onClick={() => setShowIdCardModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Toolbars: Template Switcher & Side Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {/* 3 Template Themes Selector */}
                <div className="flex items-center space-x-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 px-1.5">থিম:</span>
                  {ID_CARD_THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIdCardTemplate(opt.id)}
                      className={`px-2.5 py-1 rounded font-bold text-xs transition-colors ${
                        idCardTemplate === opt.id
                          ? opt.activeClass
                          : 'text-slate-600 hover:text-slate-900 bg-white/70'
                      }`}
                    >
                      {language === 'bn' ? opt.labelBn : opt.labelEn}
                    </button>
                  ))}
                </div>

                {/* Front / Back / Both Switcher */}
                <div className="flex items-center space-x-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 px-1.5">সাইড:</span>
                  <button
                    type="button"
                    onClick={() => setIdCardViewMode('both')}
                    className={`px-2 py-1 rounded font-bold ${
                      idCardViewMode === 'both' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    উভয় পাশ
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdCardViewMode('front')}
                    className={`px-2 py-1 rounded font-bold ${
                      idCardViewMode === 'front' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    সামনের পাশ (Front)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdCardViewMode('back')}
                    className={`px-2 py-1 rounded font-bold ${
                      idCardViewMode === 'back' ? 'bg-black text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    পেছনের পাশ (White Back)
                  </button>
                </div>
              </div>
            </div>

            {/* Printable ID Cards Layout */}
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-6 print:m-0 print:gap-4">
              {/* SIDE 1: FRONT SIDE (MODERN DESIGNED STUDENT ID CARD) */}
              {(idCardViewMode === 'both' || idCardViewMode === 'front') && (
                <ModernStudentIDCardFront
                  student={idCardStudent}
                  school={school}
                  scopedStudentId={formatSchoolScopedId(idCardStudent.studentId, activeSchoolCode)}
                  theme={idCardTemplate}
                  qrUrl={singleStudentQrUrl}
                  heightClass="h-[500px]"
                />
              )}

              {/* SIDE 2: BACK SIDE (MATCHED THEMED STUDENT BACK CARD) */}
              {(idCardViewMode === 'both' || idCardViewMode === 'back') && (
                <ModernStudentIDCardBack
                  student={idCardStudent}
                  school={school}
                  scopedStudentId={formatSchoolScopedId(idCardStudent.studentId, activeSchoolCode)}
                  theme={idCardTemplate}
                  qrUrl={singleStudentQrUrl}
                  heightClass="h-[500px]"
                />
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between print:hidden">
              <span className="text-xs text-emerald-700 font-bold flex items-center space-x-1">
                <CheckCircle className="w-4 h-4" />
                <span>স্মার্ট আইডি কার্ড প্রস্তুত (সামনের পাশ + সাদা ব্যাকগ্রাউন্ডে বড় ও স্পষ্ট কালো কিউআর ব্যাক পার্ট)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowIdCardModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold"
              >
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Student Password Management Modal */}
      {showPasswordModal && targetPasswordStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'শিক্ষার্থী লগইন ইমেইল ও পাসওয়ার্ড' : 'Student Login Credentials'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordChangeError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{passwordChangeError}</span>
              </div>
            )}

            {passwordChangeSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordChangeSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveStudentPassword} className="mt-4 space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-blue-950 text-sm">
                    {targetPasswordStudent.nameBn || targetPasswordStudent.nameEn}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      targetPasswordStudent.authUid
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {targetPasswordStudent.authUid ? 'Firebase Auth Active' : 'Pending Activation'}
                  </span>
                </div>
                <div className="text-slate-600">
                  শ্রেণি: {targetPasswordStudent.className} • শাখা: {targetPasswordStudent.section} • রোল: {targetPasswordStudent.roll}
                </div>
                <div className="text-indigo-800 font-mono font-bold pt-1">
                  ID Card: <span className="bg-white px-2 py-0.5 rounded border border-indigo-200">{targetPasswordStudent.studentId}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn'
                    ? 'শিক্ষার্থীর লগইন আইডি (ইমেইল / মোবাইল / যেকোনো নাম) *'
                    : 'Student Login ID (Email, Mobile, or Username) *'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={studentAuthEmail}
                    onChange={(e) => setStudentAuthEmail(e.target.value)}
                    placeholder="017..., rahim01, or student@school.smartschool.bd"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {targetPasswordStudent.authUid
                    ? language === 'bn'
                      ? 'নতুন পাসওয়ার্ড (পরিবর্তন করতে চাইলে ৬+ অক্ষর)'
                      : 'New Password (optional, min 6 chars)'
                    : language === 'bn'
                    ? 'লগইন পাসওয়ার্ড সেট করুন (কমপক্ষে ৬ অক্ষর) *'
                    : 'Set Login Password (min 6 chars) *'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showStudentPassText ? 'text' : 'password'}
                    required={!targetPasswordStudent.authUid}
                    value={newStudentPassword}
                    onChange={(e) => setNewStudentPassword(e.target.value)}
                    placeholder={targetPasswordStudent.authUid ? '•••••••• (leave blank to keep)' : 'Min 6 characters'}
                    className="w-full pl-9 pr-14 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStudentPassText(!showStudentPassText)}
                    className="absolute right-2.5 top-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    {showStudentPassText ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  * শিক্ষার্থী লগইন করার পর উপরের হেডারের &quot;ইউজার/পাসওয়ার্ড&quot; বাটন থেকে নিজেও নিজের পাসওয়ার্ড পরিবর্তন করতে পারবে।
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
                </button>
                <button
                  type="submit"
                  disabled={savingStudentPassword}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-xl shadow-xs transition-colors"
                >
                  {savingStudentPassword
                    ? language === 'bn'
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : language === 'bn'
                    ? 'লগইন আইডি ও পাসওয়ার্ড সংরক্ষণ'
                    : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app Student Delete Confirmation Modal (Native confirm bypass for Mobile / Iframe) */}
      {studentToDelete && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-md w-full p-6 text-center transform scale-100 transition-all">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3.5 border border-rose-200">
              <Trash2 className="w-7 h-7" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              {language === 'bn' ? 'শিক্ষার্থী রেকর্ড মুছে ফেলতে চান?' : 'Delete Student Record?'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
              {language === 'bn' ? (
                <>
                  আপনি কি নিশ্চিত যে শিক্ষার্থী <strong className="text-slate-900 font-bold">"{studentToDelete.nameBn || studentToDelete.nameEn}"</strong> (আইডি: <span className="font-mono text-blue-700 font-bold">{studentToDelete.studentId}</span>, শ্রেণি: <span className="font-bold text-slate-800">{studentToDelete.className}</span>, রোল: <span className="font-bold text-slate-800">{studentToDelete.roll}</span>)-এর তথ্য মুছে ফেলতে চান?
                </>
              ) : (
                <>
                  Are you sure you want to delete student <strong className="text-slate-900 font-bold">"{studentToDelete.nameEn}"</strong> (ID: <span className="font-mono text-blue-700 font-bold">{studentToDelete.studentId}</span>, Class: <span className="font-bold text-slate-800">{studentToDelete.className}</span>, Roll: <span className="font-bold text-slate-800">{studentToDelete.roll}</span>)?
                </>
              )}
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 mb-5 text-left text-[11px] text-amber-900 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {language === 'bn'
                  ? 'এই শিক্ষার্থীকে মুছে দিলে লোকাল ডাটাবেজ এবং ক্লাউড ফায়ারবেস থেকে তাৎক্ষণিকভাবে সম্পূর্ণ রিমুভ হয়ে যাবে।'
                  : 'Deleting will permanently remove this record from both local browser storage and cloud Firestore.'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                disabled={isDeletingStudent}
                className="py-2.5 px-4 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                {language === 'bn' ? 'বাতিল করুন' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                disabled={isDeletingStudent}
                className="py-2.5 px-4 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
              >
                {isDeletingStudent ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'হ্যাঁ, মুছে ফেলুন' : 'Confirm Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Student Document Vault Modal (Birth Certificate, Father/Mother NID, TC) */}
      {showDocVaultModal && docVaultStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 my-8 max-h-[92vh] overflow-y-auto text-xs">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>{docVaultStudent.nameBn || docVaultStudent.nameEn}</span>
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      ID: {docVaultStudent.studentId}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    শ্রেণি: {docVaultStudent.className} (শাখা: {docVaultStudent.section || 'A'}, রোল: {docVaultStudent.roll}) • নথিপত্র ও হার্ডকপি ভল্ট
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {(docVaultStudent.birthCertificateUrl || docVaultStudent.fatherNidUrl || docVaultStudent.motherNidUrl || docVaultStudent.transferCertificateUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (docVaultStudent.birthCertificateUrl) {
                        handlePrintDocument('শিক্ষার্থীর জন্ম নিবন্ধন ও সকল সংরক্ষিত নথিপত্র', docVaultStudent.birthCertificateUrl, docVaultStudent);
                      } else if (docVaultStudent.fatherNidUrl) {
                        handlePrintDocument('পিতার জাতীয় পরিচয়পত্র', docVaultStudent.fatherNidUrl, docVaultStudent);
                      }
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>নথি প্রিন্ট করুন</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDocVaultModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Notification alert */}
            {docVaultNotice && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{docVaultNotice}</span>
              </div>
            )}

            {/* Documents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* 1. BIRTH CERTIFICATE */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 font-black text-slate-900 text-sm">
                      <FileCheck className="w-4 h-4 text-blue-600" />
                      <span>১. জন্ম নিবন্ধন সনদপত্র (Birth Certificate)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      docVaultStudent.birthCertificateUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {docVaultStudent.birthCertificateUrl ? '✓ সংরক্ষিত' : 'কপি অনুপস্থিত'}
                    </span>
                  </div>

                  {/* Document Number with Save */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="জন্ম নিবন্ধন নম্বর (১৭ ডিজিট)"
                      defaultValue={docVaultStudent.birthCertificateNo || ''}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== docVaultStudent.birthCertificateNo) {
                          const updated = { ...docVaultStudent, birthCertificateNo: val };
                          StorageService.updateStudent(updated);
                          setDocVaultStudent(updated);
                          setStudents(StorageService.getStudents());
                          setDocVaultNotice('জন্ম নিবন্ধন নম্বর সংরক্ষিত হয়েছে!');
                          setTimeout(() => setDocVaultNotice(''), 3000);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>

                  {/* Thumbnail / Upload Area */}
                  {docVaultStudent.birthCertificateUrl ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => {
                          setPreviewDocumentUrl(docVaultStudent.birthCertificateUrl!);
                          setPreviewDocumentTitle(`${docVaultStudent.nameEn} - জন্ম নিবন্ধন সনদপত্র`);
                        }}
                        className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-white cursor-pointer relative group flex items-center justify-center p-1"
                      >
                        <img
                          src={docVaultStudent.birthCertificateUrl}
                          alt="Birth Certificate"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>বড় করে প্রিভিউ দেখুন</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDocumentUrl(docVaultStudent.birthCertificateUrl!);
                            setPreviewDocumentTitle(`${docVaultStudent.nameEn} - জন্ম নিবন্ধন সনদপত্র`);
                          }}
                          className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>প্রিভিউ</span>
                        </button>
                        <a
                          href={docVaultStudent.birthCertificateUrl}
                          download={`Birth_Cert_${docVaultStudent.studentId}_${docVaultStudent.nameEn.replace(/\s+/g, '_')}.png`}
                          className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('শিক্ষার্থীর জন্ম নিবন্ধন সনদপত্র', docVaultStudent.birthCertificateUrl!, docVaultStudent)}
                          className="py-1.5 px-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>প্রিন্ট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVaultDeleteDoc('birthCertificateUrl')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
                          title="সনদের কপি মুছুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="p-3 border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Upload className="w-5 h-5 text-blue-500 mb-1" />
                        <span className="font-bold text-blue-700">ফাইল আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleVaultUpload(e, 'birthCertificateUrl', 'জন্ম নিবন্ধন সনদপত্র')}
                          className="hidden"
                        />
                      </label>
                      <label className="p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="font-bold text-emerald-700">ক্যামেরা দিয়ে ছবি</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleVaultUpload(e, 'birthCertificateUrl', 'জন্ম নিবন্ধন সনদপত্র')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. FATHER NID */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 font-black text-slate-900 text-sm">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span>২. পিতার জাতীয় পরিচয়পত্র (Father NID)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      docVaultStudent.fatherNidUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {docVaultStudent.fatherNidUrl ? '✓ সংরক্ষিত' : 'কপি অনুপস্থিত'}
                    </span>
                  </div>

                  {/* Document Number with Save */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="পিতার NID নম্বর (১০/১৩/১৭ ডিজিট)"
                      defaultValue={docVaultStudent.fatherNid || ''}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== docVaultStudent.fatherNid) {
                          const updated = { ...docVaultStudent, fatherNid: val };
                          StorageService.updateStudent(updated);
                          setDocVaultStudent(updated);
                          setStudents(StorageService.getStudents());
                          setDocVaultNotice('পিতার NID নম্বর সংরক্ষিত হয়েছে!');
                          setTimeout(() => setDocVaultNotice(''), 3000);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>

                  {/* Thumbnail / Upload Area */}
                  {docVaultStudent.fatherNidUrl ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => {
                          setPreviewDocumentUrl(docVaultStudent.fatherNidUrl!);
                          setPreviewDocumentTitle(`${docVaultStudent.nameEn} - পিতার NID`);
                        }}
                        className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-white cursor-pointer relative group flex items-center justify-center p-1"
                      >
                        <img
                          src={docVaultStudent.fatherNidUrl}
                          alt="Father NID"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>বড় করে প্রিভিউ দেখুন</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDocumentUrl(docVaultStudent.fatherNidUrl!);
                            setPreviewDocumentTitle(`${docVaultStudent.nameEn} - পিতার NID`);
                          }}
                          className="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>প্রিভিউ</span>
                        </button>
                        <a
                          href={docVaultStudent.fatherNidUrl}
                          download={`Father_NID_${docVaultStudent.studentId}_${docVaultStudent.nameEn.replace(/\s+/g, '_')}.png`}
                          className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('পিতার জাতীয় পরিচয়পত্র (NID)', docVaultStudent.fatherNidUrl!, docVaultStudent)}
                          className="py-1.5 px-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>প্রিন্ট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVaultDeleteDoc('fatherNidUrl')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
                          title="পিতার NID কপি মুছুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="p-3 border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Upload className="w-5 h-5 text-indigo-500 mb-1" />
                        <span className="font-bold text-indigo-700">ফাইল আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleVaultUpload(e, 'fatherNidUrl', 'পিতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                      <label className="p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="font-bold text-emerald-700">ক্যামেরা দিয়ে ছবি</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleVaultUpload(e, 'fatherNidUrl', 'পিতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. MOTHER NID */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 font-black text-slate-900 text-sm">
                      <CreditCard className="w-4 h-4 text-purple-600" />
                      <span>৩. মাতার / অভিভাবকের পরিচয়পত্র (Mother NID)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      docVaultStudent.motherNidUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {docVaultStudent.motherNidUrl ? '✓ সংরক্ষিত' : 'কপি অনুপস্থিত'}
                    </span>
                  </div>

                  {/* Document Number with Save */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="মাতার NID নম্বর"
                      defaultValue={docVaultStudent.motherNid || ''}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== docVaultStudent.motherNid) {
                          const updated = { ...docVaultStudent, motherNid: val };
                          StorageService.updateStudent(updated);
                          setDocVaultStudent(updated);
                          setStudents(StorageService.getStudents());
                          setDocVaultNotice('মাতার NID নম্বর সংরক্ষিত হয়েছে!');
                          setTimeout(() => setDocVaultNotice(''), 3000);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>

                  {/* Thumbnail / Upload Area */}
                  {docVaultStudent.motherNidUrl ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => {
                          setPreviewDocumentUrl(docVaultStudent.motherNidUrl!);
                          setPreviewDocumentTitle(`${docVaultStudent.nameEn} - মাতার NID`);
                        }}
                        className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-white cursor-pointer relative group flex items-center justify-center p-1"
                      >
                        <img
                          src={docVaultStudent.motherNidUrl}
                          alt="Mother NID"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>বড় করে প্রিভিউ দেখুন</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDocumentUrl(docVaultStudent.motherNidUrl!);
                            setPreviewDocumentTitle(`${docVaultStudent.nameEn} - মাতার NID`);
                          }}
                          className="flex-1 py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>প্রিভিউ</span>
                        </button>
                        <a
                          href={docVaultStudent.motherNidUrl}
                          download={`Mother_NID_${docVaultStudent.studentId}_${docVaultStudent.nameEn.replace(/\s+/g, '_')}.png`}
                          className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('মাতার জাতীয় পরিচয়পত্র (NID)', docVaultStudent.motherNidUrl!, docVaultStudent)}
                          className="py-1.5 px-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>প্রিন্ট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVaultDeleteDoc('motherNidUrl')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
                          title="মাতার NID কপি মুছুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="p-3 border-2 border-dashed border-purple-300 hover:border-purple-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Upload className="w-5 h-5 text-purple-500 mb-1" />
                        <span className="font-bold text-purple-700">ফাইল আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleVaultUpload(e, 'motherNidUrl', 'মাতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                      <label className="p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="font-bold text-emerald-700">ক্যামেরা দিয়ে ছবি</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleVaultUpload(e, 'motherNidUrl', 'মাতার জাতীয় পরিচয়পত্র')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. PREVIOUS SCHOOL TC */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 font-black text-slate-900 text-sm">
                      <GraduationCap className="w-4 h-4 text-emerald-600" />
                      <span>৪. পূর্ববর্তী স্কুলের ছাড়পত্র (Transfer Certificate / TC)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      docVaultStudent.transferCertificateUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {docVaultStudent.transferCertificateUrl ? '✓ সংরক্ষিত' : 'কপি অনুপস্থিত'}
                    </span>
                  </div>

                  {/* Previous school name input with save */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="পূর্ববর্তী প্রতিষ্ঠানের নাম"
                      defaultValue={docVaultStudent.previousSchool || ''}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== docVaultStudent.previousSchool) {
                          const updated = { ...docVaultStudent, previousSchool: val };
                          StorageService.updateStudent(updated);
                          setDocVaultStudent(updated);
                          setStudents(StorageService.getStudents());
                          setDocVaultNotice('পূর্ববর্তী প্রতিষ্ঠানের তথ্য সংরক্ষিত হয়েছে!');
                          setTimeout(() => setDocVaultNotice(''), 3000);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  {/* Thumbnail / Upload Area */}
                  {docVaultStudent.transferCertificateUrl ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => {
                          setPreviewDocumentUrl(docVaultStudent.transferCertificateUrl!);
                          setPreviewDocumentTitle(`${docVaultStudent.nameEn} - ছাড়পত্র / প্রত্যয়নপত্র (TC)`);
                        }}
                        className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-white cursor-pointer relative group flex items-center justify-center p-1"
                      >
                        <img
                          src={docVaultStudent.transferCertificateUrl}
                          alt="Transfer Certificate"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold space-x-1 text-xs">
                          <ZoomIn className="w-4 h-4" />
                          <span>বড় করে প্রিভিউ দেখুন</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDocumentUrl(docVaultStudent.transferCertificateUrl!);
                            setPreviewDocumentTitle(`${docVaultStudent.nameEn} - ছাড়পত্র (TC)`);
                          }}
                          className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold flex items-center justify-center space-x-1"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>প্রিভিউ</span>
                        </button>
                        <a
                          href={docVaultStudent.transferCertificateUrl}
                          download={`TC_${docVaultStudent.studentId}_${docVaultStudent.nameEn.replace(/\s+/g, '_')}.png`}
                          className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handlePrintDocument('পূর্ববর্তী প্রতিষ্ঠানের ছাড়পত্র / প্রত্যয়নপত্র (TC)', docVaultStudent.transferCertificateUrl!, docVaultStudent)}
                          className="py-1.5 px-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>প্রিন্ট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVaultDeleteDoc('transferCertificateUrl')}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
                          title="ছাড়পত্র কপি মুছুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Upload className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="font-bold text-emerald-700">ফাইল আপলোড</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleVaultUpload(e, 'transferCertificateUrl', 'ছাড়পত্র / টিসি')}
                          className="hidden"
                        />
                      </label>
                      <label className="p-3 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl text-center cursor-pointer bg-white transition-colors flex flex-col items-center justify-center">
                        <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="font-bold text-emerald-700">ক্যামেরা দিয়ে ছবি</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleVaultUpload(e, 'transferCertificateUrl', 'ছাড়পত্র / টিসি')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Custom Documents Section */}
            <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <Files className="w-4 h-4 text-slate-700" />
                    <span>৫. অন্যান্য সংরক্ষিত নথিপত্র ও সংযুক্তি ({docVaultStudent.documents?.length || 0}টি)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">টিকা কার্ড, মেডিক্যাল সার্টিফিকেট, কোটা সনদপত্র ইত্যাদি</p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="নথির শিরোনাম (যেমন: টিকা কার্ড)"
                    value={customDocTitle}
                    onChange={(e) => setCustomDocTitle(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs w-48"
                  />
                  <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center space-x-1 cursor-pointer transition-colors shadow-xs">
                    <Plus className="w-3.5 h-3.5" />
                    <span>নতুন ফাইল যুক্ত</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        handleVaultUpload(e, 'other', customDocTitle || 'সংযুক্ত নথিপত্র');
                        setCustomDocTitle('');
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {docVaultStudent.documents && docVaultStudent.documents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  {docVaultStudent.documents.map((doc) => (
                    <div key={doc.id} className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col justify-between space-y-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="truncate">
                          <span className="font-bold text-slate-900 block truncate" title={doc.title}>{doc.title}</span>
                          <span className="text-[10px] text-slate-400">{doc.uploadedAt || doc.uploadDate || 'সংরক্ষিত'}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewDocumentUrl(doc.fileUrl);
                            setPreviewDocumentTitle(doc.title);
                          }}
                          className="flex-1 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-[11px] font-bold"
                        >
                          ভিউ
                        </button>
                        <a
                          href={doc.fileUrl}
                          download={`${doc.title.replace(/\s+/g, '_')}_${docVaultStudent.studentId}.png`}
                          className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded"
                          title="ডাউনলোড"
                        >
                          <Download className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handlePrintDocument(doc.title, doc.fileUrl, docVaultStudent)}
                          className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded"
                          title="প্রিন্ট"
                        >
                          <Printer className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVaultDeleteDoc(doc.id)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          title="মুছুন"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-white rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                  কোনো অতিরিক্ত ফাইল এখনও যুক্ত করা হয়নি।
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                বিদ্যালয়ের সেন্ট্রাল ডিজিটাল ভল্টে প্রতিটি নথি সুরক্ষিতভাবে সংরক্ষিত থাকে।
              </span>
              <button
                type="button"
                onClick={() => setShowDocVaultModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-bold transition-colors"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Success Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-[99999] flex items-center space-x-2.5 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 text-xs animate-in slide-in-from-bottom duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{actionToast}</span>
          <button
            type="button"
            onClick={() => setActionToast('')}
            className="ml-2 text-slate-400 hover:text-white p-0.5 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
