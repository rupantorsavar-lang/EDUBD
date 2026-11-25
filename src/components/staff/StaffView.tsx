import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { StorageService } from '../../services/storage';
import { Staff, StaffSalaryPayment } from '../../types';
import { StaffSalaryPayrollTab } from './StaffSalaryPayrollTab';
import { computeStaffMonthSummary, getCurrentYearMonth, formatMonthLabel } from '../../utils/payrollCalculator';
import { useSchool } from '../../context/SchoolContext';
import {
  Users,
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Printer,
  DollarSign,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  CheckCircle,
  AlertTriangle,
  X,
  FileText,
  CreditCard,
  Camera,
  Droplets,
  QrCode,
  Building,
  Download,
  ShieldCheck,
  Wifi,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import { LiveCameraModal } from '../common/LiveCameraModal';
import { SaaSApi } from '../../services/saasApi';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import { DigitInput } from '../common/DigitInput';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import {
  ModernTeacherIDCardFront,
  ModernTeacherIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';
import { printStaffJoiningRecord } from '../../utils/admissionPrintHelper';

export const StaffView: React.FC = () => {
  const { activeRole, saasSession } = useAuth();
  const { t, language, formatTaka, toBnNumber, formatDate } = useLanguage();
  const { schoolProfile } = useSchool();
  const activeSchoolCode = resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile);
  const [staffList, setStaffList] = useState<Staff[]>(() => StorageService.getStaff());
  const [salaryPayments, setSalaryPayments] = useState<StaffSalaryPayment[]>(() => StorageService.getStaffSalaries());
  const [activeSection, setActiveSection] = useState<'directory' | 'payroll'>('directory');
  const [payrollFocusStaffId, setPayrollFocusStaffId] = useState<string | null>(null);
  const [showPhotoCamera, setShowPhotoCamera] = useState<boolean>(false);

  useEffect(() => {
    const handleSync = () => {
      setStaffList(StorageService.getStaff());
      setSalaryPayments(StorageService.getStaffSalaries());
    };
    window.addEventListener('school_cloud_data_synced', handleSync);
    window.addEventListener('school_staff_salaries_updated', handleSync);
    return () => {
      window.removeEventListener('school_cloud_data_synced', handleSync);
      window.removeEventListener('school_staff_salaries_updated', handleSync);
    };
  }, []);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showPayslipModal, setShowPayslipModal] = useState<boolean>(false);
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedStaffForIdCard, setSelectedStaffForIdCard] = useState<Staff | null>(null);
  const [idCardTemplate, setIdCardTemplate] = useState<IDCardTheme>('classic_academic');
  const [idCardViewMode, setIdCardViewMode] = useState<'both' | 'front' | 'back'>('both');
  const [staffQrUrl, setStaffQrUrl] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Staff>>({
    nameEn: '',
    nameBn: '',
    gender: 'Male',
    designation: 'Assistant Teacher',
    department: 'Languages',
    role: 'teacher',
    email: '',
    phone: '',
    qualification: '',
    joiningDate: '2022-01-01',
    basicSalary: 32000,
    houseRentAllowance: 8000,
    medicalAllowance: 2000,
    otherAllowance: 1000,
    providentFundDeduction: 3200,
    status: 'active',
  });

  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string>('');
  const canManage = activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'master_admin';
  const canViewSalary = activeRole === 'super_admin' || activeRole === 'admin' || activeRole === 'accountant' || activeRole === 'master_admin';

  const departments = ['All', 'Administration', 'Mathematics & Science', 'Languages', 'Science', 'Accounts & Finance', 'Library', 'Front Office'];

  const filteredStaff = staffList.filter((st) => {
    if (selectedDept !== 'all' && st.department !== selectedDept) return false;
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      return (
        st.nameEn.toLowerCase().includes(q) ||
        st.nameBn.includes(q) ||
        st.employeeId.toLowerCase().includes(q) ||
        st.designation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToPassportSize(file, 240, 300, 0.75);
      setFormData((prev) => ({ ...prev, photoUrl: compressed }));
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData((prev) => ({ ...prev, photoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenAdd = () => {
    const nextId = StorageService.generateNextEmployeeId(activeSchoolCode);
    const numMatch = nextId.match(/(\d+)$/);
    const nextNum = numMatch ? numMatch[1] : String(100 + staffList.length + 1);
    setFormData({
      employeeId: nextId,
      nameEn: '',
      nameBn: '',
      gender: 'Male',
      designation: 'Assistant Teacher',
      department: 'Science',
      role: 'teacher',
      email: '',
      phone: '',
      username: `${activeSchoolCode.toLowerCase()}_emp${nextNum}`,
      password: '',
      bloodGroup: 'B+',
      subject: '',
      permanentAddress: '',
      emergencyContact: '',
      qualification: 'B.Sc (Hons), M.Sc',
      joiningDate: new Date().toISOString().split('T')[0],
      basicSalary: 32000,
      houseRentAllowance: 8000,
      medicalAllowance: 2000,
      otherAllowance: 1000,
      providentFundDeduction: 3200,
      status: 'active',
      photoUrl: '',
    });
    setFormError('');
    setFormSuccess('');
    setShowAddModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameEn || !formData.designation || !formData.phone) {
      setFormError('Please fill in required fields.');
      return;
    }

    const cleanPass = (formData.password || '').trim();
    const cleanEmail = (formData.email || '').trim().toLowerCase();

    try {
      if (formData.id) {
        if (cleanPass && cleanPass.length < 6) {
          setFormError('New password must be at least 6 characters.');
          return;
        }
        const existing = staffList.find((x) => x.id === formData.id);
        let updatedAuthUid = formData.authUid || existing?.authUid;
        let updatedProvisionStatus = formData.authProvisionStatus || existing?.authProvisionStatus;

        if (updatedAuthUid) {
          const emailChanged = Boolean(cleanEmail && cleanEmail !== (existing?.email || '').toLowerCase());
          const roleChanged = Boolean(formData.role && formData.role !== existing?.role);
          const nameChanged = Boolean(formData.nameEn && formData.nameEn !== existing?.nameEn);
          if (cleanPass || emailChanged || roleChanged || nameChanged) {
            await SaaSApi.updateUserCredentials(updatedAuthUid, {
              displayName: formData.nameEn,
              ...(cleanEmail ? { email: cleanEmail } : {}),
              ...(formData.phone ? { phone: formData.phone } : {}),
              ...(formData.role && formData.role !== 'master_admin' ? { schoolRole: formData.role } : {}),
              ...(cleanPass ? { password: cleanPass } : {}),
            });
          }
          updatedProvisionStatus = 'provisioned';
        } else if (cleanEmail && cleanPass.length >= 6) {
          const res = await SaaSApi.provisionUser({
            email: cleanEmail,
            password: cleanPass,
            displayName: formData.nameEn,
            schoolRole: formData.role || 'teacher',
            schoolId: saasSession?.school?.schoolId,
            linkedStaffId: formData.id,
            phone: formData.phone,
          });
          updatedAuthUid = res.user.uid;
          updatedProvisionStatus = 'provisioned';
        }

        const sanitized = {
          ...formData,
          email: cleanEmail,
          authUid: updatedAuthUid,
          authProvisionStatus: updatedProvisionStatus,
        } as Staff;
        delete (sanitized as any).password;
        StorageService.updateStaff(sanitized);
        setStaffList(StorageService.getStaff());
        setFormSuccess(
          updatedAuthUid
            ? 'Staff profile & Firebase Auth credentials updated successfully.'
            : 'Staff updated successfully.'
        );
      } else {
        const autoEmpId = StorageService.generateNextEmployeeId(activeSchoolCode);
        const numMatch = autoEmpId.match(/(\d+)$/);
        const nextNum = numMatch ? numMatch[1] : String(100 + staffList.length + 1);
        const staffId = `st_${Date.now()}`;
        let authUid: string | undefined;
        let authProvisionStatus: Staff['authProvisionStatus'] = 'pending_provisioning';

        if (cleanEmail && cleanPass.length >= 6) {
          const res = await SaaSApi.provisionUser({
            email: cleanEmail,
            password: cleanPass,
            displayName: formData.nameEn,
            schoolRole: formData.role || 'teacher',
            schoolId: saasSession?.school?.schoolId,
            linkedStaffId: staffId,
            phone: formData.phone,
          });
          authUid = res.user.uid;
          authProvisionStatus = 'provisioned';
        }

        const newStaff: Staff = {
          ...(formData as Staff),
          id: staffId,
          employeeId: formatSchoolScopedId(formData.employeeId || autoEmpId, activeSchoolCode),
          username: formData.username || `${activeSchoolCode.toLowerCase()}_emp${nextNum}`,
          email: cleanEmail,
          authUid,
          schoolId: saasSession?.school?.schoolId || activeSchoolCode,
          authProvisionStatus,
          bloodGroup: formData.bloodGroup || 'B+',
          joiningDate: formData.joiningDate || new Date().toISOString().split('T')[0],
        };
        delete (newStaff as any).password;
        StorageService.addStaff(newStaff);
        setStaffList(StorageService.getStaff());
        setFormSuccess(
          authUid
            ? 'Staff profile & Firebase Auth login provisioned successfully.'
            : 'Staff profile created (provision Firebase Auth from RBAC/Credentials panel when ready).'
        );
      }
      setTimeout(() => {
        setShowAddModal(false);
        setFormSuccess('');
      }, 1200);
    } catch (err: any) {
      setFormError(err?.message || 'Failed saving staff record.');
    }
  };

  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState<boolean>(false);

  const handleConfirmDeleteStaff = async () => {
    if (!staffToDelete) return;
    setIsDeletingStaff(true);
    try {
      StorageService.deleteStaff(staffToDelete.id);
      setStaffList(StorageService.getStaff());
      setStaffToDelete(null);
    } catch (e) {
      console.error('Delete staff error:', e);
    } finally {
      setIsDeletingStaff(false);
    }
  };

  const handlePrintPayslip = (staffMember: Staff) => {
    setSelectedStaff(staffMember);
    setShowPayslipModal(true);
  };

  const handleViewIdCard = async (staffMember: Staff) => {
    setSelectedStaffForIdCard(staffMember);
    setShowIdCardModal(true);
    try {
      const qrData = StorageService.generateStaffQRData(staffMember);
      const url = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 240,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setStaffQrUrl(url);
    } catch (e) {
      console.error('Error generating staff QR code:', e);
    }
  };

  const handleDownloadStaffQR = () => {
    if (!staffQrUrl || !selectedStaffForIdCard) return;
    const scopedEmpId = formatSchoolScopedId(selectedStaffForIdCard.employeeId, activeSchoolCode);
    const a = document.createElement('a');
    a.href = staffQrUrl;
    a.download = `Staff_Attendance_QR_${scopedEmpId}_${selectedStaffForIdCard.nameEn.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const staffLauncherItems: LauncherTileItem[] = [
    {
      id: 'directory',
      label: language === 'bn' ? 'স্টাফ ডিরেক্টরি' : 'Staff Directory',
      icon: Users,
      color: 'green',
      badge: staffList.length,
      active: activeSection === 'directory',
      onClick: () => setActiveSection('directory'),
    },
    ...(canViewSalary
      ? [
          {
            id: 'payroll',
            label: language === 'bn' ? 'বেতন ও বকেয়া' : 'Salary & Payroll',
            icon: DollarSign,
            color: 'amber' as const,
            active: activeSection === 'payroll',
            onClick: () => setActiveSection('payroll'),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: 'add_staff',
            label: language === 'bn' ? 'নতুন স্টাফ যোগ' : 'Add Staff',
            icon: Plus,
            color: 'blue' as const,
            onClick: () => {
              setActiveSection('directory');
              handleOpenAdd();
            },
          },
        ]
      : []),
    {
      id: 'print_staff',
      label: language === 'bn' ? 'তালিকা প্রিন্ট' : 'Print List',
      icon: Printer,
      color: 'purple',
      onClick: () => window.print(),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-module Colorful Launcher Grid */}
      <LauncherIconGrid items={staffLauncherItems} columns={4} />

      {/* Clean Action Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {language === 'bn' ? 'শিক্ষক ও কর্মচারী ডিরেক্টরি' : 'Teachers & Staff Directory'}
          </h2>
          <p className="text-xs text-slate-500">
            {language === 'bn'
              ? `মোট ${toBnNumber(staffList.length)} জন শিক্ষক ও প্রশাসনিক কর্মকর্তা নিয়োজিত`
              : `Total ${staffList.length} faculty and administrative personnel`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManage && activeSection === 'directory' && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'নতুন স্টাফ যোগ করুন' : 'Add New Staff'}</span>
            </button>
          )}
        </div>
      </div>

      {activeSection === 'payroll' && canViewSalary ? (
        <StaffSalaryPayrollTab
          preselectedStaffId={payrollFocusStaffId}
          onClearPreselectedStaff={() => setPayrollFocusStaffId(null)}
        />
      ) : (
        <>

      {/* Search and Dept Filter */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={language === 'bn' ? 'নাম, পদবি বা আইডি দিয়ে খুঁজুন...' : 'Search by name, designation, ID...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>
        <div className="sm:w-64">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">{language === 'bn' ? 'সকল বিভাগ' : 'All Departments'}</option>
            {departments.slice(1).map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map((member) => {
          const gross = member.basicSalary + member.houseRentAllowance + member.medicalAllowance + member.otherAllowance;
          const netSalary = gross - member.providentFundDeduction;

          return (
            <div
              key={member.id}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-xs overflow-hidden shrink-0 border border-slate-200">
                      {member.photoUrl ? (
                        <img src={member.photoUrl} alt={member.nameEn} className="w-full h-full object-cover" />
                      ) : (
                        member.nameEn.charAt(0)
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{member.nameEn}</h4>
                      <p className="text-[11px] text-slate-500">{member.nameBn}</p>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="inline-block text-[10px] font-bold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded border border-blue-200 font-mono">
                          {formatSchoolScopedId(member.employeeId, activeSchoolCode)}
                        </span>
                        {member.bloodGroup && (
                          <span className="inline-flex items-center space-x-0.5 text-[10px] font-bold px-1.5 py-0.2 bg-rose-50 text-rose-700 rounded border border-rose-200">
                            <Droplets className="w-2.5 h-2.5 text-rose-500" />
                            <span>{member.bloodGroup}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                    Active
                  </span>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-400">Designation:</span>
                    <span className="font-semibold text-slate-900">{member.designation}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-medium">{member.department}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-medium text-slate-900 font-mono">{member.phone}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-400">Qualification:</span>
                    <span className="font-medium text-slate-600 truncate max-w-[150px]" title={member.qualification}>
                      {member.qualification}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-400 flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      <span>{language === 'bn' ? 'যোগদানের তারিখ:' : 'Joining Date:'}</span>
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {member.joiningDate
                        ? formatDate(member.joiningDate)
                        : language === 'bn'
                        ? 'উল্লেখ নেই'
                        : 'Not set'}
                    </span>
                  </div>

                  {canViewSalary && (() => {
                    const curSummary = computeStaffMonthSummary(member, getCurrentYearMonth(), salaryPayments);
                    return (
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {language === 'bn' ? 'মাসিক নিট বেতন:' : 'Net Monthly Salary:'}
                          </span>
                          <span className="text-xs font-bold text-slate-900 font-mono">
                            {formatTaka(netSalary)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            {formatMonthLabel(curSummary.month, language)}:
                          </span>
                          <span
                            className={`font-semibold ${
                              curSummary.status === 'Paid'
                                ? 'text-emerald-700'
                                : curSummary.status === 'Partial'
                                ? 'text-amber-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {curSummary.status === 'Paid'
                              ? language === 'bn'
                                ? '✓ পরিশোধিত'
                                : '✓ Paid'
                              : curSummary.status === 'Partial'
                              ? `${language === 'bn' ? 'বাকি' : 'Due'} ${formatTaka(curSummary.dueAmount)}`
                              : language === 'bn'
                              ? 'বকেয়া (Due)'
                              : 'Due'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleViewIdCard(member)}
                    title="Generate Teacher / Staff ID Card"
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors shadow-2xs"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>{language === 'bn' ? 'আইডি কার্ড' : 'ID Card'}</span>
                  </button>

                  <button
                    onClick={() => handleViewIdCard(member)}
                    title="Teacher Attendance QR Pass / শিক্ষক হাজিরা কিউআর"
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
                  >
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{language === 'bn' ? 'হাজিরা কিউআর' : 'QR Pass'}</span>
                  </button>

                  {canViewSalary && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPayrollFocusStaffId(member.id);
                          setActiveSection('payroll');
                        }}
                        title={language === 'bn' ? 'বেতন পরিশোধ ও বকেয়া হিসাব' : 'Pay Salary & Check Dues'}
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'বেতন দিন' : 'Pay'}</span>
                      </button>
                      <button
                        onClick={() => handlePrintPayslip(member)}
                        title="Generate Monthly Payslip"
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'পে-স্লিপ' : 'Payslip'}</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      printStaffJoiningRecord({
                        staff: member,
                        school: schoolProfile,
                        schoolCode: activeSchoolCode,
                        language,
                      })
                    }
                    title={language === 'bn' ? 'যোগদান ও প্রোফাইল প্রিন্ট করুন' : 'Print Staff Joining & Profile'}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-teal-700" />
                    <span>{language === 'bn' ? 'যোগদান প্রিন্ট' : 'Joining Print'}</span>
                  </button>
                </div>

                {canManage && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setFormData({
                          ...member,
                          joiningDate: member.joiningDate || new Date().toISOString().split('T')[0],
                        });
                        setFormError('');
                        setFormSuccess('');
                        setShowAddModal(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffToDelete(member)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-100 min-w-[32px] min-h-[32px] flex items-center justify-center transition-colors"
                      title={language === 'bn' ? 'স্টাফ মুছে ফেলুন' : 'Delete Staff'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Add / Edit Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {formData.id ? 'Edit Staff Profile' : 'Add New Teacher / Staff Member'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="mt-3 p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="mt-4 space-y-3 text-xs">
              {/* Photo Upload Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-blue-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                    {formData.photoUrl ? (
                      <img src={formData.photoUrl} alt="Staff Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-slate-400 text-center">
                        <Users className="w-6 h-6 mx-auto text-slate-300" />
                        <span className="text-[9px] block">No Photo</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">
                      {language === 'bn' ? 'শিক্ষক / স্টাফ ছবি (Staff Image)' : 'Teacher / Staff Photo'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {language === 'bn'
                        ? 'আইডি কার্ড ও প্রোফাইলে প্রদর্শনের জন্য ছবি আপলোড করুন (Max 2MB)'
                        : 'Upload photo for Staff ID Card and institutional directory'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs cursor-pointer shadow-xs transition-colors">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{formData.photoUrl ? (language === 'bn' ? 'পরিবর্তন' : 'Change') : (language === 'bn' ? 'ছবি আপলোড' : 'Upload')}</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPhotoCamera(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'ক্যামেরায় তুলুন' : 'Take Photo'}</span>
                  </button>
                  {formData.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, photoUrl: '' }))}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200"
                      title="Remove Photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <LiveCameraModal
                  isOpen={showPhotoCamera}
                  title={language === 'bn' ? 'শিক্ষক / স্টাফের ফেস ছবি তুলুন' : 'Capture Staff Face Photo'}
                  defaultFacing="user"
                  onCapture={(dataUrl) => setFormData((prev) => ({ ...prev, photoUrl: dataUrl }))}
                  onClose={() => setShowPhotoCamera(false)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold">Employee ID ({activeSchoolCode})</label>
                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                      School: {activeSchoolCode}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      required
                      value={formData.employeeId || ''}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      placeholder={`e.g. ${activeSchoolCode}-EMP-101`}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-bold text-blue-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          employeeId: StorageService.generateNextEmployeeId(activeSchoolCode),
                        })
                      }
                      className="p-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-600 shrink-0"
                      title="Generate school-scoped Employee ID"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">System Role</label>
                  <select
                    value={formData.role || 'teacher'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="admin">Head Teacher / Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="accountant">Accountant</option>
                    <option value="librarian">Librarian</option>
                    <option value="receptionist">Admission Officer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Login Username (ইউজারনেম) *</label>
                  <input
                    type="text"
                    required
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. rohim"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {formData.id
                      ? formData.authUid
                        ? 'Reset Firebase Password (Optional, 6+ chars)'
                        : 'Activate Firebase Login Password (6+ chars)'
                      : 'Initial Login Password (6+ chars)'}
                  </label>
                  <input
                    type="password"
                    value={formData.password || ''}
                    placeholder={
                      formData.authUid
                        ? 'Leave blank to keep existing, or enter 6+ chars'
                        : 'Min 6 chars + Email to create Firebase login'
                    }
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Full Name (English) *</label>
                  <input
                    type="text"
                    required
                    value={formData.nameEn || ''}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">পূর্ণ নাম (বাংলায়)</label>
                  <input
                    type="text"
                    value={formData.nameBn || ''}
                    onChange={(e) => setFormData({ ...formData, nameBn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Designation (পদবি) *</label>
                  <input
                    type="text"
                    required
                    value={formData.designation || ''}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Department</label>
                  <select
                    value={formData.department || 'Science'}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    {departments.slice(1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Email / Login ID</label>
                  <input
                    type="text"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Blood Group (রক্তের গ্রুপ)</label>
                  <select
                    value={formData.bloodGroup || 'B+'}
                    onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Subject (পাঠদানের বিষয়)</label>
                  <input
                    type="text"
                    value={formData.subject || ''}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="e.g. Mathematics / Physics"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Emergency Contact (জরুরি যোগাযোগ নম্বর)</label>
                  <input
                    type="text"
                    value={formData.emergencyContact || ''}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    placeholder="e.g. +880 1711-..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Permanent Address (স্থায়ী ঠিকানা)</label>
                  <input
                    type="text"
                    value={formData.permanentAddress || ''}
                    onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                    placeholder="e.g. Mirpur-10, Dhaka"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Qualification (শিক্ষাগত যোগ্যতা)</label>
                  <input
                    type="text"
                    value={formData.qualification || ''}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    placeholder="e.g. M.Sc in Mathematics, B.Ed (DU)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-emerald-800">
                    {language === 'bn' ? 'যোগদানের তারিখ (Joining Date) *' : 'Joining Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.joiningDate || ''}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/40 rounded-lg font-semibold text-slate-900"
                  />
                </div>
                {/* Salary configuration */}
                <div>
                  <label className="block font-semibold mb-1">Basic Salary (মূল বেতন)</label>
                  <DigitInput
                    value={formData.basicSalary || 0}
                    onValueChange={(val) => setFormData({ ...formData, basicSalary: val })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">House Rent (বাড়ি ভাড়া)</label>
                  <DigitInput
                    value={formData.houseRentAllowance || 0}
                    onValueChange={(val) => setFormData({ ...formData, houseRentAllowance: val })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Medical Allowance (চিকিৎসা ভাতা)</label>
                  <DigitInput
                    value={formData.medicalAllowance || 0}
                    onValueChange={(val) => setFormData({ ...formData, medicalAllowance: val })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Other Allowance (অন্যান্য ভাতা)</label>
                  <DigitInput
                    value={formData.otherAllowance || 0}
                    onValueChange={(val) => setFormData({ ...formData, otherAllowance: val })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Provident Fund Deduction (প্রভিডেন্ট ফান্ড কর্তন)</label>
                  <DigitInput
                    value={formData.providentFundDeduction || 0}
                    onValueChange={(val) => setFormData({ ...formData, providentFundDeduction: val })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  {formData.id && (
                    <button
                      type="button"
                      onClick={() =>
                        printStaffJoiningRecord({
                          staff: formData as Staff,
                          school: schoolProfile,
                          schoolCode: activeSchoolCode,
                          language,
                        })
                      }
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg font-bold"
                    >
                      <Printer className="w-4 h-4 text-teal-700" />
                      <span>{language === 'bn' ? 'যোগদান ও প্রোফাইল প্রিন্ট' : 'Print Joining Record'}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                  >
                    {formData.id ? 'Save Changes' : 'Create Profile'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Printable Salary Payslip Modal */}
      {showPayslipModal && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 print:p-0 print:border-none print:shadow-none">
            {/* Header controls (hidden when printing) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'bn' ? 'বেতন বিবরণী স্লিপ (Payslip)' : 'Official Salary Payslip'}
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'প্রিন্ট করুন' : 'Print Payslip'}</span>
                </button>
                <button
                  onClick={() => setShowPayslipModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Payslip Body */}
            {(() => {
              const slipSummary = computeStaffMonthSummary(
                selectedStaff,
                getCurrentYearMonth(),
                salaryPayments
              );
              return (
                <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-white text-xs text-slate-800">
                  {/* School Header */}
                  <div className="text-center pb-3 border-b border-slate-200">
                    <h2 className="text-base font-bold text-slate-900">{schoolProfile.nameBn}</h2>
                    <h3 className="text-xs font-semibold text-slate-700">{schoolProfile.nameEn}</h3>
                    <p className="text-[11px] text-slate-500">
                      {schoolProfile.addressBn || schoolProfile.addressEn} • EIIN: {schoolProfile.eiin}
                    </p>
                    <div className="inline-block mt-2 px-3 py-0.5 bg-slate-100 rounded text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      Salary Slip for {formatMonthLabel(slipSummary.month, language)}
                    </div>
                  </div>

                  {/* Staff Details */}
                  <div className="grid grid-cols-2 gap-2 my-3 py-2 border-b border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-500">Employee Name: </span>
                      <strong className="text-slate-900">
                        {selectedStaff.nameEn} ({selectedStaff.nameBn})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Employee ID: </span>
                      <strong className="text-slate-900">{selectedStaff.employeeId}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Designation: </span>
                      <strong className="text-slate-900">{selectedStaff.designation}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Department: </span>
                      <strong className="text-slate-900">{selectedStaff.department}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Joining Date: </span>
                      <strong className="text-slate-900">
                        {selectedStaff.joiningDate ? formatDate(selectedStaff.joiningDate) : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {/* Earnings & Deductions Table */}
                  <div className="grid grid-cols-2 gap-4 my-3">
                    <div className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
                      <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-1.5">
                        Earnings (প্রাপ্তি)
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span>Basic Salary:</span>
                          <span className="font-semibold">{formatTaka(slipSummary.basicSalary)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>House Rent:</span>
                          <span className="font-semibold">{formatTaka(slipSummary.houseRentAllowance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Medical Allowance:</span>
                          <span className="font-semibold">{formatTaka(slipSummary.medicalAllowance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Other Allowance:</span>
                          <span className="font-semibold">{formatTaka(slipSummary.otherAllowance)}</span>
                        </div>
                        {slipSummary.bonus > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>Bonus:</span>
                            <span className="font-semibold">{formatTaka(slipSummary.bonus)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-900">
                          <span>Gross Salary:</span>
                          <span>{formatTaka(slipSummary.grossSalary)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
                      <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-1.5">
                        Deductions (কর্তন)
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span>Provident Fund (PF):</span>
                          <span className="font-semibold">{formatTaka(slipSummary.providentFundDeduction)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax / Other:</span>
                          <span className="font-semibold">{formatTaka(slipSummary.otherDeduction)}</span>
                        </div>
                        <div className="flex justify-between pt-3 border-t border-slate-200 font-bold text-slate-900">
                          <span>Total Deductions:</span>
                          <span className="text-rose-600">
                            {formatTaka(slipSummary.providentFundDeduction + slipSummary.otherDeduction)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Net Payable & Paid/Due Highlight */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1 text-xs font-bold text-blue-900 my-3">
                    <div className="flex items-center justify-between">
                      <span>Net Salary Payable (মোট প্রদেয় বেতন):</span>
                      <span className="text-base text-blue-700">{formatTaka(slipSummary.netPayable)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-emerald-700">Paid: {formatTaka(slipSummary.paidAmount)}</span>
                      <span className={slipSummary.dueAmount > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        Due: {formatTaka(slipSummary.dueAmount)} ({slipSummary.status})
                      </span>
                    </div>
                  </div>

                  {/* Signature lines */}
                  <div className="pt-8 grid grid-cols-3 text-center text-[10px] text-slate-500">
                    <div>
                      <div className="border-t border-slate-300 pt-1">Employee Signature</div>
                    </div>
                    <div>
                      <div className="border-t border-slate-300 pt-1">Accountant Signature</div>
                    </div>
                    <div>
                      <div className="border-t border-slate-300 pt-1">Principal / Head Teacher</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Official Printable Teacher & Staff ID Card Modal (3 Templates + Pure White Back with Black QR & Mobile) */}
      {showIdCardModal && selectedStaffForIdCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 print:p-0 print:border-none print:shadow-none print:max-w-none my-6 max-h-[95vh] overflow-y-auto">
            {/* Header controls (hidden on print) */}
            <div className="flex flex-col gap-3 pb-3 border-b border-slate-100 print:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                      {selectedStaffForIdCard.nameBn || selectedStaffForIdCard.nameEn} - শিক্ষক ও কর্মকর্তা ডিজিটাল আইডি কার্ড
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      School: <span className="font-mono font-bold text-indigo-700">{activeSchoolCode}</span> • EMP ID:{' '}
                      <span className="font-mono font-bold text-blue-700">
                        {formatSchoolScopedId(selectedStaffForIdCard.employeeId, activeSchoolCode)}
                      </span>{' '}
                      • {selectedStaffForIdCard.designation} ({selectedStaffForIdCard.department})
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      printStaffJoiningRecord({
                        staff: selectedStaffForIdCard,
                        school: schoolProfile,
                        schoolCode: activeSchoolCode,
                        language,
                      })
                    }
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'যোগদান প্রিন্ট' : 'Print Joining'}</span>
                  </button>
                  <button
                    onClick={handleDownloadStaffQR}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                    title="Download Attendance QR"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'কিউআর ডাউনলোড' : 'Download QR'}</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'প্রিন্ট' : 'Print'}</span>
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

            {/* Printable ID Card Container */}
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-6 print:m-0 print:gap-4">
              {/* SIDE 1: FRONT SIDE (MODERN DESIGNED TEACHER/STAFF ID CARD) */}
              {(idCardViewMode === 'both' || idCardViewMode === 'front') && (
                <ModernTeacherIDCardFront
                  member={selectedStaffForIdCard}
                  school={schoolProfile}
                  scopedEmployeeId={formatSchoolScopedId(selectedStaffForIdCard.employeeId, activeSchoolCode)}
                  theme={idCardTemplate}
                  qrUrl={staffQrUrl}
                  heightClass="h-[500px]"
                />
              )}

              {/* SIDE 2: BACK SIDE (MATCHED THEMED FACULTY & STAFF BACK CARD) */}
              {(idCardViewMode === 'both' || idCardViewMode === 'back') && (
                <ModernTeacherIDCardBack
                  member={selectedStaffForIdCard}
                  school={schoolProfile}
                  scopedEmployeeId={formatSchoolScopedId(selectedStaffForIdCard.employeeId, activeSchoolCode)}
                  theme={idCardTemplate}
                  qrUrl={staffQrUrl}
                  heightClass="h-[500px]"
                />
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between print:hidden">
              <span className="text-xs text-emerald-700 font-bold flex items-center space-x-1">
                <CheckCircle className="w-4 h-4" />
                <span>শিক্ষক/স্টাফ স্মার্ট আইডি কার্ড প্রস্তুত (সামনের পাশ + সাদা ব্যাকগ্রাউন্ডে কালো কিউআর ও মোবাইলযুক্ত ব্যাক পার্ট)</span>
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

      {/* In-app Staff Delete Confirmation Modal */}
      {staffToDelete && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-md w-full p-6 text-center transform scale-100 transition-all">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3.5 border border-rose-200">
              <Trash2 className="w-7 h-7" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              {language === 'bn' ? 'স্টাফ রেকর্ড মুছে ফেলতে চান?' : 'Delete Staff Record?'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
              {language === 'bn' ? (
                <>
                  আপনি কি নিশ্চিত যে শিক্ষক/কর্মচারী <strong className="text-slate-900 font-bold">"{staffToDelete.nameBn || staffToDelete.nameEn}"</strong> (পদবি: <span className="font-bold text-slate-800">{staffToDelete.designation}</span>, আইডি: <span className="font-mono text-blue-700 font-bold">{staffToDelete.employeeId}</span>)-এর রেকর্ড মুছে ফেলতে চান?
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete staff member <strong className="text-slate-900 font-bold">"{staffToDelete.nameEn}"</strong> ({staffToDelete.designation}, ID: <span className="font-mono text-blue-700 font-bold">{staffToDelete.employeeId}</span>)?
                </>
              )}
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 mb-5 text-left text-[11px] text-amber-900 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {language === 'bn'
                  ? 'এই স্টাফকে মুছে দিলে লোকাল ডাটাবেজ এবং ক্লাউড ডাটাবেজ থেকে তথ্য রিমুভ হয়ে যাবে।'
                  : 'Deleting will remove this record from both local device and cloud Firestore.'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                disabled={isDeletingStaff}
                className="py-2.5 px-4 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                {language === 'bn' ? 'বাতিল করুন' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStaff}
                disabled={isDeletingStaff}
                className="py-2.5 px-4 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'হ্যাঁ, মুছে ফেলুন' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
