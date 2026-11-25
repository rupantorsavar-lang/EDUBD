import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { StorageService } from '../../services/storage';
import { SaaSApi } from '../../services/saasApi';
import { Staff, UserRole, StaffRBACPermissions, SchoolProfile, SuperAdminCredentials } from '../../types';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  KeyRound,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Check,
  X,
  User,
  Mail,
  Phone,
  Briefcase,
  Layers,
  Camera,
  Droplets,
  Printer,
  Eye,
  EyeOff,
  Copy,
  Building,
  CreditCard,
} from 'lucide-react';
import { SuperAdminCredentialsModal } from '../auth/SuperAdminCredentialsModal';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import { resolveSchoolCode, formatSchoolScopedId } from '../../utils/schoolIdFormatter';
import {
  ModernTeacherIDCardFront,
  ModernTeacherIDCardBack,
  ID_CARD_THEME_OPTIONS,
  IDCardTheme,
} from '../common/ModernIDCardFronts';
import { formatDisplayLoginId, isSyntheticAuthEmail, validateLoginIdentifier } from '../../utils/loginIdentifier';
import { printStaffJoiningRecord } from '../../utils/admissionPrintHelper';

const DEFAULT_PERMISSIONS: Record<string, StaffRBACPermissions> = {
  admin: {
    manageStudents: true,
    manageAttendance: true,
    manageExams: true,
    manageFees: true,
    manageRoutine: true,
    manageHomework: true,
    manageLibrary: true,
  },
  teacher: {
    manageStudents: true,
    manageAttendance: true,
    manageExams: true,
    manageFees: false,
    manageRoutine: true,
    manageHomework: true,
    manageLibrary: false,
  },
  accountant: {
    manageStudents: true,
    manageAttendance: false,
    manageExams: false,
    manageFees: true,
    manageRoutine: false,
    manageHomework: false,
    manageLibrary: false,
  },
  librarian: {
    manageStudents: false,
    manageAttendance: false,
    manageExams: false,
    manageFees: false,
    manageRoutine: false,
    manageHomework: false,
    manageLibrary: true,
  },
  receptionist: {
    manageStudents: true,
    manageAttendance: false,
    manageExams: false,
    manageFees: false,
    manageRoutine: false,
    manageHomework: false,
    manageLibrary: false,
  },
  gatekeeper: {
    manageStudents: false,
    manageAttendance: true,
    manageExams: false,
    manageFees: false,
    manageRoutine: false,
    manageHomework: false,
    manageLibrary: false,
    onlyQrAttendanceKiosk: true,
  },
};

export const SuperAdminStaffRBAC: React.FC = () => {
  const { language, toBnNumber, formatDate } = useLanguage();
  const { saasSession, currentUser } = useAuth();

  const [staffList, setStaffList] = useState<Staff[]>(() => {
    // CRITICAL: Filter out any master_admin account so Super Admin NEVER sees Master Admin!
    return StorageService.getStaff().filter(
      (s) => s.role !== 'master_admin' && s.username?.toLowerCase() !== 'shafiq'
    );
  });

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [provisioningError, setProvisioningError] = useState<string>('');
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);

  // Super Admin Credentials state
  const [superAdminCreds, setSuperAdminCreds] = useState<SuperAdminCredentials>(() =>
    StorageService.getSuperAdminCredentials()
  );
  const [showSuperAdminPass, setShowSuperAdminPass] = useState<boolean>(false);
  const [showSuperAdminCredsModal, setShowSuperAdminCredsModal] = useState<boolean>(false);

  // Form states
  const [nameEn, setNameEn] = useState<string>('');
  const [nameBn, setNameBn] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [designation, setDesignation] = useState<string>('Assistant Teacher');
  const [department, setDepartment] = useState<string>('General Academics');
  const [phone, setPhone] = useState<string>('+880 1700-112233');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [bloodGroup, setBloodGroup] = useState<string>('B+');
  const [emergencyContact, setEmergencyContact] = useState<string>('+880 1800-998877');
  const [joiningDate, setJoiningDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [permissions, setPermissions] = useState<StaffRBACPermissions>(DEFAULT_PERMISSIONS['teacher']);

  // ID Card Modal states
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [selectedStaffForIdCard, setSelectedStaffForIdCard] = useState<Staff | null>(null);
  const [idCardTheme, setIdCardTheme] = useState<IDCardTheme>('classic_academic');
  const [idCardViewMode, setIdCardViewMode] = useState<'both' | 'front' | 'back'>('both');

  // Credentials notification modal / toast
  const [showCredentialsModal, setShowCredentialsModal] = useState<boolean>(false);
  const [activeCredentials, setActiveCredentials] = useState<{
    name: string;
    username: string;
    password: string;
    role: string;
    email: string;
  } | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string>('');

  const schoolProfile: SchoolProfile = StorageService.getSchoolProfile();

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToPassportSize(file, 240, 300, 0.75);
      setPhotoUrl(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Reset form
  const handleOpenAdd = () => {
    const nextNum = 100 + staffList.length + 1;
    setEditingStaff(null);
    setProvisioningError('');
    setNameEn('');
    setNameBn('');
    setUsername(`emp${nextNum}`);
    setEmail(`staff${nextNum}@${(saasSession?.school?.schoolCode || 'school').toLowerCase()}.edu.bd`);
    setPassword('');
    setRole('teacher');
    setDesignation('Assistant Teacher');
    setDepartment('General Academics');
    setPhone('+880 1700-112233');
    setPhotoUrl('');
    setBloodGroup('B+');
    setEmergencyContact('+880 1800-998877');
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setPermissions(DEFAULT_PERMISSIONS['teacher']);
    setShowModal(true);
  };

  const handleOpenEdit = (st: Staff) => {
    setEditingStaff(st);
    setProvisioningError('');
    setNameEn(st.nameEn);
    setNameBn(st.nameBn || '');
    setUsername(st.username || st.employeeId.toLowerCase());
    setEmail(st.email);
    setPassword('');
    setRole(st.role);
    setDesignation(st.designation);
    setDepartment(st.department);
    setPhone(st.phone);
    setPhotoUrl(st.photoUrl || '');
    setBloodGroup(st.bloodGroup || 'B+');
    setEmergencyContact(st.emergencyContact || '');
    setJoiningDate(st.joiningDate || new Date().toISOString().split('T')[0]);
    setPermissions(st.permissions || DEFAULT_PERMISSIONS[st.role] || DEFAULT_PERMISSIONS['teacher']);
    setShowModal(true);
  };

  const handleViewIdCard = (st: Staff) => {
    setSelectedStaffForIdCard(st);
    setShowIdCardModal(true);
  };

  const handleShowCredentials = (st: Staff) => {
    setActiveCredentials({
      name: st.nameEn,
      username: st.username || st.employeeId.toLowerCase(),
      password: st.authUid ? 'Managed securely via Firebase Auth' : 'Not yet provisioned',
      role: st.role,
      email: st.email,
    });
    setShowCredentialsModal(true);
  };

  const handleCopyCredentials = () => {
    if (!activeCredentials) return;
    const text = `School ERP Staff Login Credentials:\nName: ${activeCredentials.name}\nUsername: ${activeCredentials.username}\nPassword: ${activeCredentials.password}\nRole: ${activeCredentials.role}\nWebsite: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopiedNotice(language === 'bn' ? 'কপি সম্পন্ন হয়েছে!' : 'Credentials Copied!');
    setTimeout(() => setCopiedNotice(''), 2500);
  };

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    if (DEFAULT_PERMISSIONS[newRole]) {
      setPermissions(DEFAULT_PERMISSIONS[newRole]);
    }
    if (newRole === 'teacher') setDesignation('Assistant Teacher');
    if (newRole === 'accountant') setDesignation('Accounts Officer');
    if (newRole === 'admin') setDesignation('Assistant Head Teacher');
    if (newRole === 'librarian') setDesignation('Librarian');
    if (newRole === 'receptionist') setDesignation('Front Desk Officer');
    if (newRole === 'gatekeeper') {
      setDesignation('Gate Scanner Operator');
      setDepartment('Security & Gate Attendance');
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameEn.trim() || !username.trim()) return;

    const trimmedUsername = username.trim();
    const cleanEmail = email.trim();
    const cleanPass = password.trim();
    const staffId = editingStaff ? editingStaff.id : `st_${Date.now()}`;
    const targetSchoolId = saasSession?.school?.schoolId || currentUser?.schoolId;

    setProvisioningError('');

    const parsedUsername = validateLoginIdentifier(trimmedUsername);
    if (!parsedUsername.valid) {
      setProvisioningError(
        (language === 'bn' ? parsedUsername.errorBn : parsedUsername.error) ||
          'Please enter a valid username or mobile number.'
      );
      return;
    }

    let parsedOptionalEmail: ReturnType<typeof validateLoginIdentifier> | null = null;
    if (cleanEmail) {
      parsedOptionalEmail = validateLoginIdentifier(cleanEmail);
      if (!parsedOptionalEmail.valid) {
        setProvisioningError(
          (language === 'bn' ? parsedOptionalEmail.errorBn : parsedOptionalEmail.error) ||
            'Please enter a valid email or login ID.'
        );
        return;
      }
    }

    setIsProvisioning(true);

    let provisionedUid = editingStaff?.authUid;
    let provisionedEmail = cleanEmail || editingStaff?.email || trimmedUsername;
    let provisionedUsername = trimmedUsername;
    let authStatus: Staff['authProvisionStatus'] =
      editingStaff?.authProvisionStatus || (editingStaff?.authUid ? 'provisioned' : 'pending_provisioning');

    try {
      const shouldProvisionAuth = (!editingStaff || !editingStaff.authUid) && cleanPass.length >= 6;
      if (!editingStaff && cleanPass.length < 6) {
        setProvisioningError('Initial password must be at least 6 characters for Firebase Authentication.');
        setIsProvisioning(false);
        return;
      }

      if (shouldProvisionAuth) {
        const res = await SaaSApi.provisionUser({
          email: parsedOptionalEmail ? parsedOptionalEmail.displayValue : parsedUsername.displayValue,
          username: parsedUsername.kind !== 'email' ? parsedUsername.displayValue : undefined,
          password: cleanPass,
          displayName: nameEn.trim(),
          schoolRole: role,
          schoolId: targetSchoolId,
          linkedStaffId: staffId,
          phone,
        });
        provisionedUid = res.user.uid;
        provisionedEmail = res.user.email;
        provisionedUsername = res.user.username || trimmedUsername;
        authStatus = 'provisioned';
      }

      if (editingStaff) {
        const updatedStaff: Staff = {
          ...editingStaff,
          nameEn,
          nameBn: nameBn || nameEn,
          username: provisionedUsername,
          email: provisionedEmail,
          role,
          designation,
          department,
          phone,
          photoUrl,
          bloodGroup,
          emergencyContact,
          joiningDate: joiningDate.trim() || editingStaff.joiningDate || new Date().toISOString().split('T')[0],
          permissions,
          authUid: provisionedUid,
          schoolId: targetSchoolId || editingStaff.schoolId,
          authProvisionStatus: authStatus,
        };
        delete (updatedStaff as any).password;
        StorageService.updateStaff(updatedStaff);
      } else {
        const nextNum = 100 + staffList.length + 1;
        const newStaff: Staff = {
          id: staffId,
          employeeId: `T-${nextNum}`,
          nameEn,
          nameBn: nameBn || nameEn,
          gender: 'Male',
          designation,
          department,
          role,
          email: provisionedEmail,
          phone,
          qualification: 'B.Sc / M.A',
          joiningDate: joiningDate.trim() || new Date().toISOString().split('T')[0],
          basicSalary: 28000,
          houseRentAllowance: 12000,
          medicalAllowance: 2500,
          otherAllowance: 1500,
          providentFundDeduction: 2000,
          status: 'active',
          username: provisionedUsername,
          authUid: provisionedUid,
          schoolId: targetSchoolId,
          authProvisionStatus: authStatus,
          photoUrl,
          bloodGroup,
          emergencyContact,
          permissions,
        };
        StorageService.addStaff(newStaff);

        setActiveCredentials({
          name: nameEn,
          username: provisionedUsername,
          password: cleanPass,
          role,
          email: provisionedEmail,
        });
        setShowCredentialsModal(true);
      }

      const freshList = StorageService.getStaff().filter(
        (s) => s.role !== 'master_admin' && s.username?.toLowerCase() !== 'shafiq'
      );
      setStaffList(freshList);
      setShowModal(false);
    } catch (err: any) {
      setProvisioningError(err?.message || 'Failed to provision staff Firebase account.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleToggleStatus = async (staffId: string) => {
    const target = staffList.find((s) => s.id === staffId);
    if (!target) return;
    const updatedStatus = target.status === 'active' ? 'resigned' : 'active';
    if (target.authUid) {
      try {
        await SaaSApi.setUserStatus(target.authUid, updatedStatus !== 'active');
      } catch (err) {
        console.warn('Failed updating Firebase Auth user status:', err);
      }
    }
    const updated: Staff = { ...target, status: updatedStatus };
    StorageService.updateStaff(updated);
    setStaffList((prev) => prev.map((s) => (s.id === staffId ? updated : s)));
  };

  const handleDeleteStaff = (staffId: string) => {
    if (window.confirm('Are you sure you want to revoke and delete this staff access login?')) {
      StorageService.deleteStaff(staffId);
      setStaffList((prev) => prev.filter((s) => s.id !== staffId));
    }
  };

  // Filter staff list (always excluding master_admin)
  const filteredStaff = staffList.filter((s) => {
    if (s.role === 'master_admin') return false; // Strictly protect master_admin from super admin view
    const matchSearch =
      s.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.username && s.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = filterRole === 'all' || s.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {language === 'bn' ? 'স্টাফ আরবিএসি ও এক্সেস নিয়ন্ত্রণ (Staff RBAC Management)' : 'Staff RBAC & Login Access Control'}
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'bn'
                  ? 'সুপার অ্যাডমিন হিসেবে নতুন শিক্ষক ও কর্মচারীদের আইডি/পাসওয়ার্ড এবং নির্দিষ্ট রোল ও পারমিশন প্রদান করুন।'
                  : 'Grant system login credentials, assign institutional roles, and configure feature permissions for school staff.'}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>{language === 'bn' ? 'নতুন স্টাফ এক্সেস দিন' : 'Grant New Staff Access'}</span>
        </button>
      </div>

      {/* Super Admin Own Credentials Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-600 text-white shadow-xs shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                  {language === 'bn' ? 'সুপার অ্যাডমিনের নিজস্ব লগইন ইউজার ও পাসওয়ার্ড' : 'Super Admin Own Credentials'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">
                  Super Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {language === 'bn'
                  ? 'আপনার অ্যাকাউন্টের বর্তমান ইউজারনেম ও পাসওয়ার্ড নিচে দেওয়া হলো। চোখ আইকনে ক্লিক করে পাসওয়ার্ড দেখতে পারেন।'
                  : 'Your active Super Admin credentials. Click the eye icon to see your password or change anytime.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-purple-200 text-xs shadow-2xs">
              <span className="text-slate-500 text-[11px]">User:</span>
              <strong className="font-mono text-purple-950 font-bold select-all">{superAdminCreds.username}</strong>
            </div>

            <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-lg border border-purple-200 text-xs shadow-2xs">
              <span className="text-slate-500 text-[11px]">Pass:</span>
              <strong className="font-mono text-purple-950 font-bold select-all">
                {showSuperAdminPass ? superAdminCreds.password : '••••••••'}
              </strong>
              <button
                type="button"
                onClick={() => setShowSuperAdminPass(!showSuperAdminPass)}
                title={showSuperAdminPass ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                className="p-1 text-purple-600 hover:text-purple-800 rounded hover:bg-purple-50 transition-colors"
              >
                {showSuperAdminPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <button
              onClick={() => setShowSuperAdminCredsModal(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'পাসওয়ার্ড পরিবর্তন' : 'Change Password'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, employee ID..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600 font-medium">Role:</span>
          {/* Strictly exclude master_admin from filter options */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white font-medium"
          >
            <option value="all">All Staff Roles ({staffList.length})</option>
            <option value="admin">Head Teacher / Admin</option>
            <option value="teacher">Assistant Teacher</option>
            <option value="accountant">Accountant</option>
            <option value="librarian">Librarian</option>
            <option value="receptionist">Admission Officer</option>
            <option value="gatekeeper">School Gate / QR Kiosk</option>
          </select>
        </div>
      </div>

      {/* Staff RBAC Table */}
      <div className="overflow-x-auto border border-slate-100 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <th className="py-3 px-4">Staff Member & ID</th>
              <th className="py-3 px-4">Assigned Role</th>
              <th className="py-3 px-4">Login Username</th>
              <th className="py-3 px-4">Enabled Permissions</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                  No staff members matched your search.
                </td>
              </tr>
            ) : (
              filteredStaff.map((st) => {
                const isActive = st.status === 'active';
                const roleBadgeColors: Record<string, string> = {
                  admin: 'bg-blue-50 text-blue-700 border-blue-200',
                  teacher: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  accountant: 'bg-amber-50 text-amber-700 border-amber-200',
                  librarian: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                  receptionist: 'bg-rose-50 text-rose-700 border-rose-200',
                  gatekeeper: 'bg-slate-900 text-amber-300 border-amber-400 font-bold',
                };

                return (
                  <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{st.nameEn}</div>
                      <div className="text-[11px] text-slate-400">
                        {st.designation} • {st.employeeId}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                        {language === 'bn' ? 'যোগদান:' : 'Joined:'}{' '}
                        {st.joiningDate ? formatDate(st.joiningDate) : language === 'bn' ? 'উল্লেখ নেই' : 'N/A'}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-[10px] border capitalize ${
                          roleBadgeColors[st.role] || 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {st.role}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-800 font-semibold">
                        {formatDisplayLoginId({ username: st.username, email: st.email }) || st.employeeId.toLowerCase()}
                      </div>
                      {!isSyntheticAuthEmail(st.email) && st.email && (
                        <div className="text-[10px] text-slate-400">{st.email}</div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {st.permissions?.manageStudents && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-700">
                            Students
                          </span>
                        )}
                        {st.permissions?.manageAttendance && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-50 text-emerald-700">
                            Attendance
                          </span>
                        )}
                        {st.permissions?.manageExams && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-50 text-blue-700">
                            Exams
                          </span>
                        )}
                        {st.permissions?.manageFees && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-50 text-amber-700">
                            Fees
                          </span>
                        )}
                        {st.permissions?.manageRoutine && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-teal-50 text-teal-700">
                            Routine
                          </span>
                        )}
                        {st.permissions?.manageHomework && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-50 text-purple-700">
                            Homework
                          </span>
                        )}
                        {st.permissions?.manageLibrary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-50 text-indigo-700">
                            Library
                          </span>
                        )}
                        {(st.permissions?.onlyQrAttendanceKiosk || st.role === 'gatekeeper') && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            🔒 QR Kiosk Only
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(st.id)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                        title="Click to toggle active/inactive"
                      >
                        {isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1 text-rose-600" />
                            Suspended
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          printStaffJoiningRecord({
                            staff: st,
                            school: schoolProfile,
                            schoolCode: resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile),
                            language,
                          })
                        }
                        className="p-1.5 px-2 rounded-lg border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-800 inline-flex items-center space-x-1 transition-colors"
                        title={language === 'bn' ? 'যোগদান ও প্রোফাইল প্রিন্ট করুন' : 'Print Staff Joining Record'}
                      >
                        <Printer className="w-3.5 h-3.5 text-teal-700" />
                        <span className="font-bold text-[10px]">{language === 'bn' ? 'যোগদান প্রিন্ট' : 'Print'}</span>
                      </button>
                      <button
                        onClick={() => handleViewIdCard(st)}
                        className="p-1.5 px-2 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 inline-flex items-center space-x-1 transition-colors"
                        title={language === 'bn' ? 'স্টাফ আইডি কার্ড দেখুন ও প্রিন্ট করুন' : 'View & Print Staff ID Card'}
                      >
                        <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-bold text-[10px]">{language === 'bn' ? 'আইডি কার্ড' : 'ID Card'}</span>
                      </button>
                      <button
                        onClick={() => handleShowCredentials(st)}
                        className="p-1.5 px-2 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-700 inline-flex items-center space-x-1 transition-colors"
                        title={language === 'bn' ? 'লগইন তথ্য ও পাসওয়ার্ড দেখুন / কপি করুন' : 'View Login Credentials'}
                      >
                        <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-[10px]">{language === 'bn' ? 'পাসওয়ার্ড' : 'Login Pass'}</span>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(st)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                        title="Edit Permissions & Details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(st.id)}
                        className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors"
                        title="Revoke Staff Access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: GRANT NEW STAFF ACCESS / EDIT ACCESS */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>
                  {editingStaff
                    ? (language === 'bn' ? 'স্টাফ অনুমতি সম্পাদনা' : 'Edit Staff Permissions')
                    : (language === 'bn' ? 'নতুন স্টাফ এক্সেস প্রদান' : 'Grant New Staff Access')}
                </span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="mt-4 space-y-3.5">
              {/* Photo Upload */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-14 h-14 rounded-xl border border-dashed border-blue-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-slate-400">
                        <User className="w-6 h-6 mx-auto text-slate-300" />
                        <span className="text-[9px] block">No Photo</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">
                      {language === 'bn' ? 'স্টাফ ছবি (Staff Photo)' : 'Staff Member Photo'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {language === 'bn' ? 'আইডি কার্ড ও প্রোফাইলের জন্য (Max 2MB)' : 'For ID Card & Faculty Profile'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <label className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs cursor-pointer shadow-xs">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{photoUrl ? (language === 'bn' ? 'পরিবর্তন' : 'Change') : (language === 'bn' ? 'আপলোড' : 'Upload')}</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Staff Name (English) *</label>
                  <input
                    type="text"
                    required
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Jamal Uddin"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">নাম (বাংলায়)</label>
                  <input
                    type="text"
                    value={nameBn}
                    onChange={(e) => setNameBn(e.target.value)}
                    placeholder="যেমন: জামাল উদ্দিন"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Login Credentials */}
              {provisioningError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {provisioningError}
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                  <span>Firebase Auth Account Provisioning</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Username / Mobile / Login ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. jamal01 or 017XXXXXXXX"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {editingStaff?.authUid ? 'Auth Linked (Optional Reset)' : 'Initial Password (Min 6 chars) *'}
                    </label>
                    <input
                      type="password"
                      required={!editingStaff || !editingStaff.authUid}
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingStaff?.authUid ? 'Managed by Firebase Auth' : 'Min 6 characters'}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {language === 'bn'
                      ? 'অফিশিয়াল লগইন ইমেইল (ঐচ্ছিক — চাইলে ইমেইল বা মোবাইল/নাম ব্যবহার করুন)'
                      : 'Official Login Email (Optional if using Username / Mobile above)'}
                  </label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. jamal@school.edu.bd (optional)"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Role Selection (CRITICAL: master_admin is omitted!) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Assign Role (রোল) *</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-800"
                  >
                    <option value="teacher">Assistant Teacher (সহকারী শিক্ষক)</option>
                    <option value="accountant">Accountant / Cashier (হিসাবরক্ষক)</option>
                    <option value="admin">Head Teacher / Admin (প্রধান শিক্ষক)</option>
                    <option value="librarian">Librarian (গ্রন্থাগারিক)</option>
                    <option value="receptionist">Admission Officer (ভর্তি কর্মকর্তা)</option>
                    <option value="gatekeeper">School Gate / QR Attendance Kiosk (স্কুল গেট কিওস্ক)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Senior Math Teacher"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Phone, Blood Group & Emergency Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1700-112233"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Blood Group (রক্তের গ্রুপ)</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-rose-700"
                  >
                    <option value="A+">A+ (A Positive)</option>
                    <option value="A-">A- (A Negative)</option>
                    <option value="B+">B+ (B Positive)</option>
                    <option value="B-">B- (B Negative)</option>
                    <option value="O+">O+ (O Positive)</option>
                    <option value="O-">O- (O Negative)</option>
                    <option value="AB+">AB+ (AB Positive)</option>
                    <option value="AB-">AB- (AB Negative)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Emergency Contact</label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Emergency Phone"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-emerald-800">
                  {language === 'bn' ? 'যোগদানের তারিখ (Joining Date) *' : 'Joining Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/40 rounded-lg font-semibold text-slate-900 text-xs"
                />
              </div>

              {/* Permissions Checklist */}
              <div>
                <label className="block font-semibold mb-2">Granular Feature Permissions (অনুমোদন তালিকা)</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageStudents}
                      onChange={(e) => setPermissions({ ...permissions, manageStudents: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Students & Admissions</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageAttendance}
                      onChange={(e) => setPermissions({ ...permissions, manageAttendance: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Take Daily Attendance</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageExams}
                      onChange={(e) => setPermissions({ ...permissions, manageExams: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Exams & Marks Entry</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageFees}
                      onChange={(e) => setPermissions({ ...permissions, manageFees: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Fee Collection & Invoices</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageRoutine}
                      onChange={(e) => setPermissions({ ...permissions, manageRoutine: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Class Routine Setup</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageHomework}
                      onChange={(e) => setPermissions({ ...permissions, manageHomework: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Assign Homework</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permissions.manageLibrary}
                      onChange={(e) => setPermissions({ ...permissions, manageLibrary: e.target.checked })}
                      className="rounded text-blue-600"
                    />
                    <span>Library & Book Issues</span>
                  </label>

                  <div className="col-span-2 mt-2 p-3 rounded-xl bg-amber-50/90 border border-amber-300">
                    <label className="flex items-start space-x-2.5 text-amber-950 font-bold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={permissions.onlyQrAttendanceKiosk || role === 'gatekeeper'}
                        onChange={(e) => setPermissions({ ...permissions, onlyQrAttendanceKiosk: e.target.checked })}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                      />
                      <div className="text-xs">
                        <span className="flex items-center space-x-1.5 text-amber-950 font-bold">
                          <span>🔒 স্কুল গেট কিওস্ক মোড (শুধুমাত্র কিউআর ক্যামেরা স্ক্যানার দৃশ্যমান)</span>
                        </span>
                        <p className="text-[11px] text-amber-800 font-normal mt-0.5 leading-snug">
                          {language === 'bn'
                            ? 'এই অপশন চালু থাকলে গেটের ট্যাবলেট/ল্যাপটপে শুধুমাত্র কিউআর স্ক্যানার চলবে। ছাত্রছাত্রীর তথ্য, ফি, বেতন, রুটিন বা অন্য কোনো মেনুতে প্রবেশ সম্পূর্ণ ব্লক থাকবে।'
                            : 'Strict Kiosk Lockdown: Only the QR attendance camera scanner is visible and accessible. Navigation to all other ERP modules is completely disabled.'}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs disabled:opacity-50"
                >
                  {isProvisioning
                    ? 'Provisioning Auth...'
                    : editingStaff
                    ? 'Update Staff Access'
                    : 'Save & Grant Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREDENTIALS SUCCESS & SHARING POPUP */}
      {showCredentialsModal && activeCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {language === 'bn' ? 'স্টাফ লগইন তথ্য' : 'Staff Login Credentials'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn' ? 'এই তথ্য সংশ্লিষ্ট শিক্ষক বা কর্মচারীকে প্রদান করুন' : 'Provide these credentials to the staff member'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-sans font-medium">Name:</span>
                <span className="font-bold font-sans text-slate-900">{activeCredentials.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-sans font-medium">Assigned Role:</span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold capitalize font-sans">
                  {activeCredentials.role}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-sans font-medium">Username:</span>
                <span className="font-bold text-blue-900 bg-white px-2 py-1 rounded border border-slate-200">
                  {activeCredentials.username}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-sans font-medium">Password:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                  {activeCredentials.password}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-sans font-medium">Official Email:</span>
                <span className="text-slate-700 text-[11px]">{activeCredentials.email}</span>
              </div>
            </div>

            {copiedNotice && (
              <div className="mt-3 p-2 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg text-center font-bold">
                {copiedNotice}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={handleCopyCredentials}
                className="flex-1 py-2 px-3 bg-slate-900 hover:bg-black text-white rounded-xl font-bold flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'তথ্য কপি করুন' : 'Copy Credentials'}</span>
              </button>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="py-2 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold"
              >
                {language === 'bn' ? 'সম্পন্ন' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL STAFF IDENTITY CARD MODAL & PRINTING */}
      {showIdCardModal && selectedStaffForIdCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 text-xs max-h-[95vh] overflow-y-auto custom-scrollbar print:p-0 print:border-none print:shadow-none print:max-w-none">
            {/* Modal Controls */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {language === 'bn' ? 'শিক্ষক / স্টাফ অফিসিয়াল আইডি কার্ড' : 'Official Faculty / Staff Identity Card'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID: {selectedStaffForIdCard.employeeId} • {selectedStaffForIdCard.nameEn}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'প্রিন্ট আইডি কার্ড' : 'Print ID Card'}</span>
                </button>
                <button
                  onClick={() => setShowIdCardModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Theme & Side Switchers */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
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

              <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
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
                  সামনের পাশ
                </button>
                <button
                  type="button"
                  onClick={() => setIdCardViewMode('back')}
                  className={`px-2 py-1 rounded font-bold ${
                    idCardViewMode === 'back' ? 'bg-black text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  পেছনের পাশ
                </button>
              </div>
            </div>

            {/* Printable ID Card Container */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-6 print:m-0 print:gap-4">
              {(idCardViewMode === 'both' || idCardViewMode === 'front') && (
                <ModernTeacherIDCardFront
                  member={selectedStaffForIdCard}
                  school={schoolProfile}
                  scopedEmployeeId={formatSchoolScopedId(
                    selectedStaffForIdCard.employeeId,
                    resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile)
                  )}
                  theme={idCardTheme}
                  heightClass="h-[500px]"
                />
              )}
              {(idCardViewMode === 'both' || idCardViewMode === 'back') && (
                <ModernTeacherIDCardBack
                  member={selectedStaffForIdCard}
                  school={schoolProfile}
                  scopedEmployeeId={formatSchoolScopedId(
                    selectedStaffForIdCard.employeeId,
                    resolveSchoolCode(saasSession?.school?.schoolId, schoolProfile)
                  )}
                  theme={idCardTheme}
                  heightClass="h-[500px]"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Credentials Modal */}
      <SuperAdminCredentialsModal
        isOpen={showSuperAdminCredsModal}
        onClose={() => {
          setShowSuperAdminCredsModal(false);
          setSuperAdminCreds(StorageService.getSuperAdminCredentials());
        }}
      />
    </div>
  );
};
