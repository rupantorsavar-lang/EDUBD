import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  FileText,
  GraduationCap,
  ImagePlus,
  Loader2,
  Phone,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { AdmissionEnquiry, ClassLevel } from '../../types';
import { submitPublicAdmissionApplication } from '../../services/publicWebsiteService';
import { StorageService } from '../../services/storage';
import { compressImageToPassportSize, safeGetLocalStorage } from '../../utils/storageHelper';
import { SAAS_ACTIVE_SCHOOL_KEY } from '../../services/cloudSync';

interface PublicAdmissionModalProps {
  isOpen: boolean;
  mode: 'apply' | 'info';
  onClose: () => void;
  onSwitchMode: (mode: 'apply' | 'info') => void;
  schoolId: string;
  schoolName: string;
  activeClasses: string[];
  admissionInfoText: string;
  language: 'en' | 'bn';
  defaultClass?: string;
}

const FALLBACK_CLASSES = [
  'Nursery',
  'KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
];

export const PublicAdmissionModal: React.FC<PublicAdmissionModalProps> = ({
  isOpen,
  mode,
  onClose,
  onSwitchMode,
  schoolId,
  schoolName,
  activeClasses,
  admissionInfoText,
  language,
  defaultClass,
}) => {
  const classOptions = activeClasses.length > 0 ? activeClasses : FALLBACK_CLASSES;

  const [applicantNameEn, setApplicantNameEn] = useState('');
  const [applicantNameBn, setApplicantNameBn] = useState('');
  const [applyingClass, setApplyingClass] = useState<string>(defaultClass || classOptions[0] || 'Class 1');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [previousSchool, setPreviousSchool] = useState('');
  const [gpa, setGpa] = useState('');
  const [address, setAddress] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEnquiry, setSubmittedEnquiry] = useState<AdmissionEnquiry | null>(null);

  useEffect(() => {
    if (defaultClass && classOptions.includes(defaultClass)) {
      setApplyingClass(defaultClass);
    } else if (!classOptions.includes(applyingClass) && classOptions.length > 0) {
      setApplyingClass(classOptions[0]);
    }
  }, [defaultClass, classOptions, applyingClass]);

  if (!isOpen) return null;

  const isBn = language === 'bn';

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(isBn ? 'অনুগ্রহ করে একটি সঠিক ছবি (JPG/PNG) নির্বাচন করুন।' : 'Please select a valid image file.');
      return;
    }
    try {
      let compressed = await compressImageToPassportSize(file, 200, 240, 0.78);
      if (compressed.length > 180_000) {
        compressed = await compressImageToPassportSize(file, 160, 190, 0.65);
      }
      setPhotoUrl(compressed);
      setError(null);
    } catch {
      setError(isBn ? 'ছবিটি প্রসেস করা যায়নি।' : 'Could not process the selected image.');
    }
  };

  const handleResetAndClose = () => {
    setSubmittedEnquiry(null);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!applicantNameEn.trim()) {
      setError(isBn ? 'শিক্ষার্থীর নাম (ইংরেজি) লিখুন।' : 'Please enter student full name in English.');
      return;
    }
    if (!dob.trim()) {
      setError(isBn ? 'জন্ম তারিখ নির্বাচন করুন।' : 'Please enter date of birth.');
      return;
    }
    if (!guardianName.trim()) {
      setError(isBn ? 'অভিভাবকের নাম লিখুন।' : 'Please enter guardian full name.');
      return;
    }
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 7) {
      setError(isBn ? 'সঠিক মোবাইল নম্বর দিন।' : 'Please provide a valid phone number.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(isBn ? 'সঠিক ইমেইল ঠিকানা লিখুন।' : 'Please enter a valid email address.');
      return;
    }
    if (!address.trim()) {
      setError(isBn ? 'বর্তমান ঠিকানা লিখুন।' : 'Please enter present address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPublicAdmissionApplication(schoolId, {
        photoUrl: photoUrl || undefined,
        applicantNameEn: applicantNameEn.trim(),
        applicantNameBn: applicantNameBn.trim() || applicantNameEn.trim(),
        applyingClass: applyingClass as ClassLevel,
        gender,
        dob,
        bloodGroup: bloodGroup || undefined,
        guardianName: guardianName.trim(),
        phone: cleanPhone,
        email: email.trim() || undefined,
        address: address.trim(),
        previousSchool: previousSchool.trim() || undefined,
        gpa: gpa.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });

      if (result.success && result.enquiry) {
        const activeSaasId = safeGetLocalStorage(SAAS_ACTIVE_SCHOOL_KEY);
        if (schoolId === 'local_school' || (activeSaasId && schoolId === activeSaasId)) {
          StorageService.addEnquiry(result.enquiry);
        }
        setSubmittedEnquiry(result.enquiry);
        setApplicantNameEn('');
        setApplicantNameBn('');
        setDob('');
        setBloodGroup('');
        setGuardianName('');
        setPhone('');
        setEmail('');
        setPreviousSchool('');
        setGpa('');
        setAddress('');
        setRemarks('');
        setPhotoUrl('');
      } else {
        setError(result.error || (isBn ? 'আবেদন জমা দেওয়া যায়নি।' : 'Could not submit application.'));
      }
    } catch {
      setError(
        isBn
          ? 'সার্ভারে সংযোগে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
          : 'Unable to submit right now. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-admission-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h2 id="public-admission-modal-title" className="text-base sm:text-lg font-bold truncate">
                {mode === 'apply'
                  ? isBn
                    ? 'অনলাইন ভর্তি আবেদন ফরম'
                    : 'Online Admission Application'
                  : isBn
                  ? 'ভর্তি সংক্রান্ত নির্দেশনা'
                  : 'Admission Information & Guidelines'}
              </h2>
              <p className="text-xs text-blue-100 truncate">{schoolName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex items-center gap-2 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={() => onSwitchMode('apply')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'apply'
                ? 'bg-[#0B47B8] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
            }`}
          >
            {isBn ? 'অনলাইন ফরম পূরণ করুন' : 'Apply Online'}
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode('info')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'info'
                ? 'bg-[#15803D] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
            }`}
          >
            {isBn ? 'ভর্তির তথ্য ও শর্তাবলি' : 'Admission Information'}
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {mode === 'info' ? (
            <div className="space-y-5">
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0B2D7A]">
                  <FileText className="w-4 h-4 text-[#15803D]" />
                  <span>{isBn ? 'ভর্তি নির্দেশিকা' : 'Eligibility & Required Documents'}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {admissionInfoText}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <p className="text-xs font-bold text-slate-500 mb-1.5">
                    {isBn ? 'উপলব্ধ শ্রেণিসমূহ' : 'Available Classes'}
                  </p>
                  <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                    {classOptions.join(', ')}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <p className="text-xs font-bold text-slate-500 mb-1.5">
                    {isBn ? 'আবেদন প্রক্রিয়া' : 'Application Process'}
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {isBn
                      ? 'অনলাইনে আবেদন জমা দেওয়ার পর স্কুল ভর্তি অফিস থেকে যাচাই করে আপনার সাথে যোগাযোগ করা হবে।'
                      : 'Submit your online application to receive an Application ID. Our admission desk reviews applications and contacts guardians directly.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => onSwitchMode('apply')}
                  className="px-5 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {isBn ? 'এখনই আবেদন করুন' : 'Proceed to Online Form'}
                </button>
              </div>
            </div>
          ) : submittedEnquiry ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-slate-900">
                  {isBn ? 'ভর্তি আবেদন সফলভাবে জমা হয়েছে!' : 'Admission Application Submitted!'}
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  {isBn
                    ? 'আপনার আবেদনটি স্কুলের অ্যাডমিন প্যানেলে সংরক্ষিত হয়েছে। নিচের আবেদন নম্বরটি সংরক্ষণ করুন।'
                    : 'Your application has been recorded for review by the school administration. Please keep your reference ID below.'}
                </p>
              </div>
              <div className="inline-block px-5 py-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500">
                  {isBn ? 'আবেদন নম্বর (Application No)' : 'Application Reference'}
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-[#0B47B8]">
                  {submittedEnquiry.applicationNo || submittedEnquiry.id}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {submittedEnquiry.applicantNameEn} · {submittedEnquiry.applyingClass}
                </p>
              </div>
              <div className="pt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setSubmittedEnquiry(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  {isBn ? 'আরেকটি আবেদন করুন' : 'Submit Another'}
                </button>
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-5 py-2 rounded-lg bg-[#0B47B8] hover:bg-[#083A9E] text-white text-sm font-semibold cursor-pointer"
                >
                  {isBn ? 'সম্পন্ন' : 'Done'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Optional Passport Photo */}
              <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Applicant"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800">
                    {isBn ? 'শিক্ষার্থীর পাসপোর্ট ছবি (ঐচ্ছিক)' : 'Student Photo (Optional)'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isBn ? 'স্পষ্ট মুখমণ্ডলের JPG বা PNG ছবি দিন' : 'Upload a clear passport-size JPG or PNG photo'}
                  </p>
                </div>
                <label className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0">
                  <ImagePlus className="w-3.5 h-3.5 text-[#0B47B8]" />
                  <span>{photoUrl ? (isBn ? 'পরিবর্তন' : 'Change') : isBn ? 'আপলোড' : 'Upload'}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'শিক্ষার্থীর নাম (ইংরেজি) *' : 'Student Full Name (English) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={applicantNameEn}
                    onChange={(e) => setApplicantNameEn(e.target.value)}
                    placeholder="e.g. Ayesha Rahman"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'শিক্ষার্থীর নাম (বাংলা)' : 'Student Name (Bangla)'}
                  </label>
                  <input
                    type="text"
                    value={applicantNameBn}
                    onChange={(e) => setApplicantNameBn(e.target.value)}
                    placeholder="উদাঃ আয়েশা রহমান"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'ভর্তির শ্রেণি *' : 'Applying Class *'}
                  </label>
                  <select
                    value={applyingClass}
                    onChange={(e) => setApplyingClass(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  >
                    {classOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'লিঙ্গ *' : 'Gender *'}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value === 'Female' ? 'Female' : 'Male')}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  >
                    <option value="Male">{isBn ? 'ছেলে (Male)' : 'Male'}</option>
                    <option value="Female">{isBn ? 'মেয়ে (Female)' : 'Female'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'জন্ম তারিখ *' : 'Date of Birth *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'অভিভাবকের নাম *' : 'Guardian Full Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="e.g. Md. Tariqul Islam"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'অভিভাবকের মোবাইল নম্বর *' : 'Guardian Phone Number *'}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'ইমেইল (ঐচ্ছিক)' : 'Email (Optional)'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'রক্তের গ্রুপ' : 'Blood Group'}
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  >
                    <option value="">{isBn ? 'নির্বাচন করুন' : 'Select'}</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'পূর্বের জিপিএ / নম্বর' : 'Previous Result / GPA'}
                  </label>
                  <input
                    type="text"
                    value={gpa}
                    onChange={(e) => setGpa(e.target.value)}
                    placeholder="e.g. GPA 5.00"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'পূর্ববর্তী বিদ্যালয়ের নাম' : 'Previous School (if any)'}
                  </label>
                  <input
                    type="text"
                    value={previousSchool}
                    onChange={(e) => setPreviousSchool(e.target.value)}
                    placeholder={isBn ? 'পূর্বের প্রতিষ্ঠানের নাম' : 'Previous institution name'}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'বর্তমান ঠিকানা *' : 'Present Address *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={isBn ? 'বাসা নং, রোড, এলাকা, জেলা' : 'House, Road, Area, District'}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isBn ? 'অতিরিক্ত তথ্য / মন্তব্য' : 'Additional Remarks (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={isBn ? 'যেকোনো বিশেষ তথ্য বা প্রশ্ন লিখতে পারেন...' : 'Any notes regarding shift preference, transport, etc.'}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {isBn
                      ? 'তথ্য সরাসরি স্কুল ভর্তি শাখায় সংরক্ষিত হবে'
                      : 'Sent securely to the school admission desk'}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shrink-0"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isBn ? 'জমা হচ্ছে...' : 'Submitting...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{isBn ? 'আবেদন জমা দিন' : 'Submit Application'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
