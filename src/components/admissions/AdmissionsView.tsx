import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import { StorageService } from '../../services/storage';
import { AdmissionEnquiry, ClassInfo, ClassLevel, GroupType, Student } from '../../types';
import { formatClassOptionLabel, getManagedClassList, getManagedClassNames, isEarlyChildhoodClass } from '../../utils/academicClasses';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import { toEnNumber } from '../../utils/i18n';
import { exportStudentsAdmissionExcel } from '../../utils/studentExcelExport';
import { printStudentAdmissionForm } from '../../utils/admissionPrintHelper';
import {
  ModernStudentIDCardFront,
  ModernStudentIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import { LiveCameraModal } from '../common/LiveCameraModal';
import {
  UserPlus,
  Users,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  Mail,
  Building,
  GraduationCap,
  Calendar,
  X,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  CreditCard,
  Printer,
  Camera,
  Sparkles,
  Check,
  Award,
  RefreshCw,
  QrCode,
  ShieldCheck,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';

export const AdmissionsView: React.FC = () => {
  const { activeRole, saasSession } = useAuth();
  const { t, language, toBnNumber, formatDate } = useLanguage();
  const { schoolProfile } = useSchool();
  const school = schoolProfile;
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile);

  const [academicClasses, setAcademicClasses] = useState<ClassInfo[]>(() => StorageService.getClasses());
  const managedClassList = React.useMemo(() => getManagedClassList(academicClasses), [academicClasses]);
  const managedClassNames = React.useMemo(() => getManagedClassNames(academicClasses), [academicClasses]);
  const [enquiries, setEnquiries] = useState<AdmissionEnquiry[]>(() => StorageService.getEnquiries());

  React.useEffect(() => {
    void StorageService.syncPublicInboxFromCloud(saasSession?.school?.schoolId).then((res) => {
      if (res.newAdmissions > 0) {
        setEnquiries(StorageService.getEnquiries());
      }
    });
    const handleSync = () => {
      setAcademicClasses(StorageService.getClasses());
      setEnquiries(StorageService.getEnquiries());
    };
    const handleClassesUpdated = () => {
      setAcademicClasses(StorageService.getClasses());
    };
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_classes_updated', handleClassesUpdated);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_classes_updated', handleClassesUpdated);
      window.removeEventListener('storage', handleSync);
    };
  }, [saasSession?.school?.schoolId]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [idCardTheme, setIdCardTheme] = useState<IDCardTheme>('classic_academic');
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [targetEnquiry, setTargetEnquiry] = useState<AdmissionEnquiry | null>(null);

  // ID Card Modal after enrollment
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [newlyEnrolledStudent, setNewlyEnrolledStudent] = useState<Student | null>(null);

  // Form for New Admission Enquiry
  const [applicantNameEn, setApplicantNameEn] = useState<string>('');
  const [applicantNameBn, setApplicantNameBn] = useState<string>('');
  const [applyingClass, setApplyingClass] = useState<ClassLevel>(() => getManagedClassNames(StorageService.getClasses())[0] || 'Nursery');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [dob, setDob] = useState<string>('2021-02-14');
  const [bloodGroup, setBloodGroup] = useState<string>('Unknown');
  const [guardianName, setGuardianName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('Mirpur, Dhaka');
  const [previousSchool, setPreviousSchool] = useState<string>('');
  const [gpa, setGpa] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');

  // Enroll parameters
  const [enrollSession, setEnrollSession] = useState<string>('2027');
  const [enrollStudentId, setEnrollStudentId] = useState<string>('');
  const [enrollRoll, setEnrollRoll] = useState<string>('01');
  const [enrollSection, setEnrollSection] = useState<string>('A');
  const [enrollShift, setEnrollShift] = useState<'Morning' | 'Day'>('Morning');
  const [enrollGroup, setEnrollGroup] = useState<GroupType>('Science');
  const [enrollBloodGroup, setEnrollBloodGroup] = useState<string>('B+');
  const [enrollPhotoUrl, setEnrollPhotoUrl] = useState<string>('');
  const [enrollAdmissionDate, setEnrollAdmissionDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  // Hard Copy & Document Vault States
  const [birthCertificateNo, setBirthCertificateNo] = useState<string>('');
  const [birthCertificateUrl, setBirthCertificateUrl] = useState<string>('');
  const [fatherNidUrl, setFatherNidUrl] = useState<string>('');
  const [motherNidUrl, setMotherNidUrl] = useState<string>('');
  const [transferCertificateUrl, setTransferCertificateUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const enrollFileInputRef = useRef<HTMLInputElement>(null);
  const [cameraTarget, setCameraTarget] = useState<'add' | 'enroll' | null>(null);

  const canManage = activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'receptionist' || activeRole === 'master_admin';

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'birthCert' | 'fatherNid' | 'motherNid' | 'tc') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const assignDoc = (base64: string) => {
      if (field === 'birthCert') setBirthCertificateUrl(base64);
      else if (field === 'fatherNid') setFatherNidUrl(base64);
      else if (field === 'motherNid') setMotherNidUrl(base64);
      else if (field === 'tc') setTransferCertificateUrl(base64);
    };
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageToPassportSize(file, 900, 1200, 0.72);
        if (compressed) {
          assignDoc(compressed);
          return;
        }
      } catch {}
    }
    const reader = new FileReader();
    reader.onload = (ev) => assignDoc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Handle Photo File Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'add' | 'enroll') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToPassportSize(file, 240, 300, 0.75);
      if (target === 'add') {
        setPhotoUrl(compressed);
      } else {
        setEnrollPhotoUrl(compressed);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const base64 = uploadEvent.target?.result as string;
        if (target === 'add') {
          setPhotoUrl(base64);
        } else {
          setEnrollPhotoUrl(base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenAddModal = () => {
    setApplicantNameEn('');
    setApplicantNameBn('');
    setApplyingClass(managedClassNames[0] || 'Nursery');
    setGender('Male');
    setDob('2021-02-14');
    setBloodGroup('B+');
    setGuardianName('');
    setPhone('');
    setEmail('');
    setAddress('Mirpur, Dhaka');
    setPreviousSchool('');
    setGpa('');
    setRemarks('');
    setPhotoUrl('');
    setShowAddModal(true);
  };

  const handleCreateEnquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantNameEn || !guardianName || !phone) return;

    const newEnquiry: AdmissionEnquiry = {
      id: `enq_${Date.now()}`,
      applicationNo: `APP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      applicantNameEn,
      applicantNameBn: applicantNameBn || applicantNameEn,
      applyingClass,
      gender,
      dob,
      bloodGroup,
      photoUrl,
      guardianName,
      phone,
      email,
      address,
      previousSchool,
      gpa,
      status: 'Approved',
      appliedDate: new Date().toISOString().split('T')[0],
      remarks,
    };
    StorageService.addEnquiry(newEnquiry);
    setEnquiries(StorageService.getEnquiries());
    setShowAddModal(false);

    setTargetEnquiry(newEnquiry);
    prepareEnroll(newEnquiry);
  };

  const handleUpdateStatus = (id: string, status: AdmissionEnquiry['status']) => {
    StorageService.updateEnquiryStatus(id, status);
    setEnquiries(StorageService.getEnquiries());
  };

  const prepareEnroll = (enq: AdmissionEnquiry) => {
    setTargetEnquiry(enq);
    const session = '2027';
    setEnrollSession(session);
    const autoId = StorageService.generateNextStudentId(session, activeSchoolCode);
    setEnrollStudentId(autoId);

    const existingInClass = StorageService.getStudents().filter((s) => s.className === enq.applyingClass);
    const nextRoll = String(existingInClass.length + 1).padStart(2, '0');
    setEnrollRoll(nextRoll);
    setEnrollSection('A');
    setEnrollShift(isEarlyChildhoodClass(enq.applyingClass) ? 'Morning' : 'Day');
    setEnrollGroup(['Class 9', 'Class 10'].includes(enq.applyingClass) ? 'Science' : 'General');
    setEnrollBloodGroup(enq.bloodGroup || 'Unknown');
    setEnrollPhotoUrl(enq.photoUrl || '');
    setEnrollAdmissionDate(new Date().toISOString().split('T')[0]);
    setBirthCertificateNo('');
    setBirthCertificateUrl('');
    setFatherNidUrl('');
    setMotherNidUrl('');
    setTransferCertificateUrl('');
    setShowEnrollModal(true);
  };

  const handleConfirmEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEnquiry) return;

    const enrolled = StorageService.convertEnquiryToStudent(
      targetEnquiry.id,
      enrollRoll,
      enrollSection,
      enrollShift,
      enrollStudentId,
      enrollPhotoUrl,
      enrollBloodGroup,
      enrollSession,
      {
        birthCertificateNo,
        birthCertificateUrl,
        fatherNidUrl,
        motherNidUrl,
        transferCertificateUrl,
        group: ['Class 9', 'Class 10'].includes(targetEnquiry.applyingClass) ? enrollGroup : 'General',
        admissionDate: enrollAdmissionDate,
      }
    );

    setEnquiries(StorageService.getEnquiries());
    setShowEnrollModal(false);
    if (enrolled) {
      setNewlyEnrolledStudent(enrolled);
      setShowIdCardModal(true);
    }
  };

  const filteredEnquiries = enquiries.filter((enq) => {
    if (statusFilter !== 'all' && enq.status !== statusFilter) return false;
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      return (
        enq.applicantNameEn.toLowerCase().includes(q) ||
        enq.applicantNameBn.includes(q) ||
        enq.phone.includes(q) ||
        (enq.applicationNo && enq.applicationNo.toLowerCase().includes(q)) ||
        enq.applyingClass.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const admissionLauncherItems: LauncherTileItem[] = [
    {
      id: 'all',
      label: language === 'bn' ? 'সকল আবেদন' : 'All Enquiries',
      icon: Users,
      color: 'blue',
      active: statusFilter === 'all',
      badge: enquiries.length,
      onClick: () => setStatusFilter('all'),
    },
    {
      id: 'Pending',
      label: language === 'bn' ? 'অপেক্ষমাণ' : 'Pending',
      icon: Clock,
      color: 'amber',
      active: statusFilter === 'Pending',
      badge: enquiries.filter((e) => e.status === 'Pending').length || undefined,
      onClick: () => setStatusFilter('Pending'),
    },
    {
      id: 'Approved',
      label: language === 'bn' ? 'অনুমোদিত' : 'Approved',
      icon: CheckCircle,
      color: 'teal',
      active: statusFilter === 'Approved',
      badge: enquiries.filter((e) => e.status === 'Approved').length || undefined,
      onClick: () => setStatusFilter('Approved'),
    },
    {
      id: 'Enrolled',
      label: language === 'bn' ? 'ভর্তি সম্পন্ন' : 'Enrolled',
      icon: GraduationCap,
      color: 'purple',
      active: statusFilter === 'Enrolled',
      badge: enquiries.filter((e) => e.status === 'Enrolled').length || undefined,
      onClick: () => setStatusFilter('Enrolled'),
    },
    ...(canManage
      ? [
          {
            id: 'new',
            label: language === 'bn' ? 'নতুন আবেদন' : 'New Admission',
            icon: UserPlus,
            color: 'green' as const,
            onClick: handleOpenAddModal,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* App-Launcher Icon Tile Grid */}
      <LauncherIconGrid items={admissionLauncherItems} columns={5} compact />

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-extrabold text-slate-900">
              {language === 'bn' ? 'ভর্তি ও শিক্ষার্থী নিবন্ধন ডেস্ক' : 'Admissions & Enquiries Desk'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {language === 'bn' ? 'অটো আইডি ও ছবি' : 'Auto ID & Photo'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'শিক্ষার্থীর ছবি আপলোড, অটো স্টুডেন্ট আইডি জেনারেশন এবং ভর্তির সাথে সাথে আইডি কার্ড প্রিন্ট'
              : 'Student admission with photo upload, auto ID number generation & instant printable Student ID Card'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const allStudents = StorageService.getStudents();
              if (allStudents.length === 0) return;
              exportStudentsAdmissionExcel({
                allStudents,
                schoolName: schoolProfile?.nameEn,
                schoolCode: activeSchoolCode,
              });
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{language === 'bn' ? 'সকল শিক্ষার্থীর Excel' : 'All Students Excel'}</span>
          </button>
          {canManage && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? '+ নতুন ভর্তি আবেদন' : '+ New Admission'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={
              language === 'bn'
                ? 'আবেদনকারীর নাম, ফোন নম্বর, শ্রেণি অথবা আবেদন নং...'
                : 'Search by applicant name, phone, class, or application no...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
          >
            <option value="all">{language === 'bn' ? 'সকল আবেদন' : 'All Statuses'}</option>
            <option value="Pending">Pending (অপেক্ষমাণ)</option>
            <option value="Approved">Approved (অনুমোদিত)</option>
            <option value="Enrolled">Enrolled (ভর্তি সম্পন্ন)</option>
            <option value="Rejected">Rejected (বাতিল)</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                <th className="py-3 px-4">Photo & Applicant Name</th>
                <th className="py-3 px-4">Target Class</th>
                <th className="py-3 px-4">Guardian & Contact</th>
                <th className="py-3 px-4">Previous School & GPA</th>
                <th className="py-3 px-4">Applied Date</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEnquiries.map((enq) => (
                <tr key={enq.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      {enq.photoUrl ? (
                        <img
                          src={enq.photoUrl}
                          alt={enq.applicantNameEn}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-xs">
                          {enq.applicantNameEn.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900">{enq.applicantNameEn}</div>
                        <div className="text-[11px] text-slate-500">{enq.applicantNameBn}</div>
                        {enq.applicationNo && (
                          <div className="text-[10px] text-blue-600 font-mono">{enq.applicationNo}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-blue-700">{enq.applyingClass}</span>
                    <div className="text-[10px] text-slate-400 capitalize">{enq.gender}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    <div className="font-semibold">{enq.guardianName}</div>
                    <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{enq.phone}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-[11px]">
                    <div>{enq.previousSchool || 'Not provided'}</div>
                    {enq.gpa && <span className="font-semibold text-emerald-700">GPA: {enq.gpa}</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{formatDate(enq.appliedDate)}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        enq.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : enq.status === 'Enrolled'
                          ? 'bg-blue-100 text-blue-800'
                          : enq.status === 'Pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {enq.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center space-x-1">
                      {canManage && enq.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(enq.id, 'Approved')}
                            className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-semibold text-[11px]"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(enq.id, 'Rejected')}
                            className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-semibold text-[11px]"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {canManage && (enq.status === 'Approved' || enq.status === 'Pending') && (
                        <button
                          onClick={() => prepareEnroll(enq)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] shadow-xs"
                        >
                          <span>{language === 'bn' ? 'ভর্তি করুন' : 'Enroll'}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      {enq.status === 'Enrolled' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const st = StorageService.getStudents().find(
                                (s) => s.nameEn === enq.applicantNameEn || s.guardianPhone === enq.phone
                              );
                              if (st) {
                                printStudentAdmissionForm({
                                  student: st,
                                  school,
                                  schoolCode: activeSchoolCode,
                                  language,
                                });
                              }
                            }}
                            className="flex items-center space-x-1 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-[11px] font-semibold border border-teal-200"
                            title={language === 'bn' ? 'ভর্তি ফরম প্রিন্ট' : 'Print Admission Form'}
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-700" />
                            <span>{language === 'bn' ? 'ভর্তি ফরম' : 'Form'}</span>
                          </button>
                          <button
                            onClick={() => {
                              const st = StorageService.getStudents().find(
                                (s) => s.nameEn === enq.applicantNameEn || s.guardianPhone === enq.phone
                              );
                              if (st) {
                                setNewlyEnrolledStudent(st);
                                setShowIdCardModal(true);
                              }
                            }}
                            className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-blue-700 rounded-lg text-[11px] font-semibold border border-slate-200"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                            <span>{language === 'bn' ? 'আইডি কার্ড' : 'ID Card'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEnquiries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {language === 'bn' ? 'কোনো ভর্তির আবেদন মেলেনি' : 'No admission applications found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW ADMISSION APPLICATION MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {language === 'bn' ? 'নতুন শিক্ষার্থী ভর্তির আবেদন' : 'New Admission Application Form'}
                </h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEnquiry} className="mt-4 space-y-4">
              <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                <div className="relative shrink-0">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Student"
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500 shadow-sm"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-slate-200 text-slate-400 flex flex-col items-center justify-center border border-slate-300">
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[9px] font-semibold">{language === 'bn' ? 'ছবি নেই' : 'No Photo'}</span>
                    </div>
                  )}
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="absolute -top-1.5 -right-1.5 p-1 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-xs"
                      title="Remove Photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex-1 space-y-1.5 text-center sm:text-left">
                  <span className="font-bold text-slate-800 text-xs block">
                    {language === 'bn' ? 'শিক্ষার্থীর পাসপোর্ট সাইজ ছবি আপলোড করুন' : 'Upload Student Passport Size Photo'}
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? 'JPG, PNG বা WebP ফরম্যাট (সর্বোচ্চ 3 মেগাবাইট)। এটি আইডি কার্ডে প্রিন্ট হবে।'
                      : 'JPG, PNG or WebP format (Max 3MB). Will be printed on Student ID card.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 justify-center sm:justify-start">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, 'add')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{photoUrl ? (language === 'bn' ? 'ছবি পরিবর্তন' : 'Change Photo') : (language === 'bn' ? 'ছবি বাছাই করুন' : 'Choose Photo')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraTarget('add')}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'ক্যামেরা দিয়ে তুলুন' : 'Take Face Photo'}</span>
                    </button>
                    {!photoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoUrl(
                            'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&auto=format&fit=crop&q=80'
                          )
                        }
                        className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium"
                      >
                        {language === 'bn' ? 'ডেমো ছবি ব্যবহার' : 'Use Sample Photo'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Student Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শিক্ষার্থীর নাম (English) *' : 'Applicant Full Name (English) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={applicantNameEn}
                    onChange={(e) => setApplicantNameEn(e.target.value)}
                    placeholder="e.g. Mahid Yafee"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'নাম (বাংলায়)' : 'Applicant Name (Bangla)'}
                  </label>
                  <input
                    type="text"
                    value={applicantNameBn}
                    onChange={(e) => setApplicantNameBn(e.target.value)}
                    placeholder="যেমন: মাহিদ ইয়াফি"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Class, Gender, Blood Group & DOB */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'কাঙ্ক্ষিত শ্রেণি *' : 'Applying Class *'}
                  </label>
                  <select
                    value={applyingClass}
                    onChange={(e) => setApplyingClass(e.target.value as ClassLevel)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold text-blue-700 bg-white"
                  >
                    {managedClassList.map((cls) => (
                      <option key={cls.id} value={cls.name}>{formatClassOptionLabel(cls, language)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'লিঙ্গ' : 'Gender'}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Male">Male (ছাত্র)</option>
                    <option value="Female">Female (ছাত্রী)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg === 'Unknown' ? (language === 'bn' ? 'Unknown / অজানা' : 'Unknown') : bg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'জন্মতারিখ' : 'Date of Birth'}
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              {/* Guardian Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'অভিভাবকের নাম *' : 'Guardian Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="e.g. Mow Akter / মোঃ শফিকুল ইসলাম"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'অভিভাবকের মোবাইল *' : 'Guardian Mobile Phone *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(toEnNumber(e.target.value))}
                    placeholder="+880 1942529984"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block font-semibold mb-1 text-slate-700">
                  {language === 'bn' ? 'বর্তমান ঠিকানা (Address)' : 'Present Address'}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Mirpur-10, Dhaka"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs flex items-center space-x-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{language === 'bn' ? 'সাবমিট ও ভর্তির দিকে যান' : 'Submit & Proceed to Enroll'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-CLICK ENROLL MODAL */}
      {showEnrollModal && targetEnquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {language === 'bn' ? 'শিক্ষার্থী ভর্তি ও আইডি কার্ড ইস্যু' : 'Enroll Student & Issue ID Card'}
                </h3>
              </div>
              <button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEnroll} className="mt-4 space-y-4">
              <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex items-center space-x-3.5">
                <div className="relative shrink-0">
                  {enrollPhotoUrl ? (
                    <img
                      src={enrollPhotoUrl}
                      alt={targetEnquiry.applicantNameEn}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-600 shadow-sm"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-blue-200 text-blue-800 font-bold flex items-center justify-center text-lg shadow-sm">
                      {targetEnquiry.applicantNameEn.charAt(0)}
                    </div>
                  )}
                  <input
                    type="file"
                    ref={enrollFileInputRef}
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, 'enroll')}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => enrollFileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs"
                    title="Change Photo"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-slate-900 truncate">{targetEnquiry.applicantNameEn}</h4>
                  <p className="text-xs text-slate-600">{targetEnquiry.applicantNameBn}</p>
                  <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                    Class: {targetEnquiry.applyingClass} • Guardian: {targetEnquiry.guardianName}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCameraTarget('enroll')}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-xs"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{language === 'bn' ? 'ক্যামেরায় ফেস তুলুন' : 'Live Face Cam'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => enrollFileInputRef.current?.click()}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{language === 'bn' ? 'গ্যালারি' : 'Upload'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Academic Session Selector (e.g. 2026 vs 2027) */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    {language === 'bn' ? 'ভর্তি শিক্ষাবর্ষ (Academic Session) *' : 'Academic Session *'}
                  </label>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                    {enrollSession === '2027' ? 'অগ্রিম ভর্তি সেশন' : 'নিয়মিত সেশন'}
                  </span>
                </div>
                <select
                  value={enrollSession}
                  onChange={(e) => {
                    const sess = e.target.value;
                    setEnrollSession(sess);
                    setEnrollStudentId(StorageService.generateNextStudentId(sess, activeSchoolCode));
                  }}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg font-bold text-blue-900 bg-white"
                >
                  <option value="2027">শিক্ষাবর্ষ 2027 (নতুন ভর্তি / আগামী সেশন)</option>
                  <option value="2026">শিক্ষাবর্ষ 2026 (চলতি সেশন)</option>
                  <option value="2028">শিক্ষাবর্ষ 2028</option>
                </select>
                <p className="text-[10px] text-blue-700">
                  সেশন অনুযায়ী স্বয়ংক্রিয়ভাবে স্টুডেন্ট আইডি ও ভর্তি ফি নির্ধারিত হবে।
                </p>
              </div>

              {/* Auto Generated Student ID */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    {language === 'bn' ? 'স্টুডেন্ট আইডি (Student ID) *' : 'Student ID (Unique Admission ID) *'}
                  </label>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    {activeSchoolCode} • {language === 'bn' ? 'অটো জেনারেটেড' : 'Auto Generated'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    required
                    value={enrollStudentId}
                    onChange={(e) => setEnrollStudentId(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg font-mono font-bold text-slate-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setEnrollStudentId(StorageService.generateNextStudentId(enrollSession, activeSchoolCode))}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600"
                    title="Regenerate ID"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  {language === 'bn'
                    ? 'এই আইডি স্টুডেন্ট আইডি কার্ড ও সকল রসিদে মুদ্রিত থাকবে।'
                    : 'This unique ID will appear on student ID card & fee receipts.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শ্রেণি রোল নম্বর *' : 'Class Roll Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={enrollRoll}
                    onChange={(e) => setEnrollRoll(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শাখা (Section) *' : 'Assign Section *'}
                  </label>
                  <select
                    value={enrollSection}
                    onChange={(e) => setEnrollSection(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold bg-white"
                  >
                    <option value="A">Section A (ক শাখা)</option>
                    <option value="B">Section B (খ শাখা)</option>
                    <option value="C">Section C (গ শাখা)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'শিফট (Shift) *' : 'Assign Shift *'}
                  </label>
                  <select
                    value={enrollShift}
                    onChange={(e) => setEnrollShift(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Morning">Morning Shift (প্রভাতি)</option>
                    <option value="Day">Day Shift (দিবা)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}
                  </label>
                  <select
                    value={enrollBloodGroup}
                    onChange={(e) => setEnrollBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg === 'Unknown' ? (language === 'bn' ? 'Unknown / অজানা' : 'Unknown') : bg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-emerald-800">
                  {language === 'bn' ? 'ভর্তির তারিখ (Admission Date) *' : 'Admission Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={enrollAdmissionDate}
                  onChange={(e) => setEnrollAdmissionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/40 rounded-lg font-semibold text-slate-900"
                />
              </div>

              {['Class 9', 'Class 10'].includes(targetEnquiry.applyingClass) && (
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    {language === 'bn' ? 'বিভাগ / গ্রুপ (Class 9-10 Group) *' : 'Academic Group (Class 9-10) *'}
                  </label>
                  <select
                    value={enrollGroup}
                    onChange={(e) => setEnrollGroup(e.target.value as GroupType)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-semibold"
                  >
                    <option value="Science">Science (বিজ্ঞান)</option>
                    <option value="Business Studies">Business Studies (ব্যবসায় শিক্ষা)</option>
                    <option value="Humanities">Humanities (মানবিক)</option>
                    <option value="Vocational">Vocational (ভোকেশনাল)</option>
                  </select>
                </div>
              )}

              {/* Document Vault & Hard Copies Collection */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>📂 হার্ডকপি ও ডিজিটাল ডকুমেন্ট ভল্ট (ঐচ্ছিক/সংগ্রহ)</span>
                  </div>
                </div>

                {/* Birth Certificate */}
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    জন্ম নিবন্ধন সনদ নম্বর (Birth Certificate No)
                  </label>
                  <input
                    type="text"
                    value={birthCertificateNo}
                    onChange={(e) => setBirthCertificateNo(toEnNumber(e.target.value))}
                    placeholder="17 ডিজিটের জন্ম নিবন্ধন নম্বর..."
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  <div className="mt-1 flex items-center space-x-2">
                    <label className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 font-bold cursor-pointer flex items-center space-x-1">
                      <Upload className="w-3 h-3 text-blue-600" />
                      <span>{birthCertificateUrl ? '✓ জন্ম নিবন্ধন কপি লোড হয়েছে' : 'জন্ম নিবন্ধন কপি আপলোড'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleDocUpload(e, 'birthCert')}
                        className="hidden"
                      />
                    </label>
                    {birthCertificateUrl && (
                      <span className="text-[10px] text-emerald-600 font-bold">সংযুক্ত</span>
                    )}
                  </div>
                </div>

                {/* Parent NID & Transfer Certificate */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="block font-semibold text-slate-700 mb-1">পিতার NID কার্ড</span>
                    <label className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 font-medium cursor-pointer block text-center truncate">
                      <span>{fatherNidUrl ? '✓ পিতার NID সংযুক্ত' : 'NID কপি আপলোড'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleDocUpload(e, 'fatherNid')}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-700 mb-1">ছাড়পত্র (TC কপি)</span>
                    <label className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 font-medium cursor-pointer block text-center truncate">
                      <span>{transferCertificateUrl ? '✓ টিসি সংযুক্ত' : 'টিসি কপি আপলোড'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleDocUpload(e, 'tc')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-700/20 flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{language === 'bn' ? 'ভর্তি সম্পন্ন ও আইডি কার্ড তৈরি' : 'Complete Admission & Generate ID Card'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICIAL STUDENT ID CARD MODAL */}
      {showIdCardModal && newlyEnrolledStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 my-8 max-h-[95vh] overflow-y-auto print:p-0 print:border-none print:shadow-none print:max-w-none print:my-0">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
              <div className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {language === 'bn' ? 'ভর্তি সম্পন্ন! ডিজিটাল আইডি কার্ড' : 'Admission Successful! Student ID Card'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn' ? 'সরাসরি প্রিন্ট নিতে "Print ID Card" চাপুন' : 'Click "Print ID Card" to print standard A4 or plastic badge'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    printStudentAdmissionForm({
                      student: newlyEnrolledStudent,
                      school,
                      schoolCode: activeSchoolCode,
                      language,
                    })
                  }
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  <span>{language === 'bn' ? 'ভর্তি ফরম প্রিন্ট' : 'Print Admission Form'}</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>{language === 'bn' ? 'প্রিন্ট আইডি কার্ড' : 'Print ID Card'}</span>
                </button>
                <button
                  onClick={() => setShowIdCardModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Theme Switcher */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 print:hidden">
              <span className="text-[10px] font-bold text-slate-500 px-1.5">থিম:</span>
              {ID_CARD_THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIdCardTheme(opt.id)}
                  className={`px-2.5 py-1 rounded font-bold text-xs transition-colors ${
                    idCardTheme === opt.id
                      ? opt.activeClass
                      : 'text-slate-600 hover:text-slate-900 bg-white/70'
                  }`}
                >
                  {language === 'bn' ? opt.labelBn : opt.labelEn}
                </button>
              ))}
            </div>

            {/* Printable ID Card: Front Side & Back Side */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-6 print:m-0 print:gap-4">
              {/* FRONT SIDE */}
              <ModernStudentIDCardFront
                student={newlyEnrolledStudent}
                school={school}
                scopedStudentId={formatSchoolScopedId(newlyEnrolledStudent.studentId, activeSchoolCode)}
                theme={idCardTheme}
                heightClass="h-[500px]"
              />

              {/* BACK SIDE */}
              <ModernStudentIDCardBack
                student={newlyEnrolledStudent}
                school={school}
                scopedStudentId={formatSchoolScopedId(newlyEnrolledStudent.studentId, activeSchoolCode)}
                theme={idCardTheme}
                heightClass="h-[500px]"
              />
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between print:hidden">
              <span className="text-xs text-emerald-700 font-bold flex items-center space-x-1">
                <CheckCircle className="w-4 h-4" />
                <span>{language === 'bn' ? 'শিক্ষার্থী নথি ও আইডি কার্ড প্রস্তুত' : 'Student record & ID card saved'}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowIdCardModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold"
              >
                {language === 'bn' ? 'সম্পন্ন' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
      <LiveCameraModal
        isOpen={cameraTarget !== null}
        title={language === 'bn' ? 'শিক্ষার্থীর ফেস ছবি তুলুন' : 'Capture Student Face Photo'}
        defaultFacing="user"
        onCapture={(dataUrl) => {
          if (cameraTarget === 'add') {
            setPhotoUrl(dataUrl);
          } else if (cameraTarget === 'enroll') {
            setEnrollPhotoUrl(dataUrl);
          }
        }}
        onClose={() => setCameraTarget(null)}
      />
    </div>
  );
};
