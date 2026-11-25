import React, { useState } from 'react';
import {
  SchoolProfile,
  WebsiteFacilityItem,
  WebsiteGalleryCategory,
  WebsiteGalleryItem,
  WebsiteHeaderMenuItem,
  WebsiteSettingsConfig,
  WebsiteTestimonialItem,
  WebsiteWhyChooseItem,
} from '../../types';
import {
  DEFAULT_CAMPUS_HERO_IMAGE,
  DEFAULT_FACILITIES,
  DEFAULT_HEADER_MENU_ITEMS,
  DEFAULT_WHY_CHOOSE_ITEMS,
  getDefaultWebsiteConfig,
  resolveCleanHeroImage,
} from '../../services/publicWebsiteService';
import { StorageService } from '../../services/storage';
import { compressImageToPassportSize } from '../../utils/storageHelper';
import {
  Building2,
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe,
  Image as ImageIcon,
  Layers,
  MapPin,
  MessageSquareQuote,
  Palette,
  Plus,
  Save,
  Share2,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  Video,
} from 'lucide-react';

interface WebsiteCmsEditorProps {
  profile: SchoolProfile;
  schoolId: string;
  language: 'en' | 'bn';
  onChangeProfile: (updated: SchoolProfile) => void;
  onSaveAndPublish: (updated: SchoolProfile) => Promise<void> | void;
  onPreviewWebsite?: () => void;
}

type CmsSectionTab =
  | 'branding_header'
  | 'hero_stats'
  | 'principal_about'
  | 'facilities_why'
  | 'gallery'
  | 'testimonials_admission'
  | 'contact_footer';

const GALLERY_CATEGORIES: WebsiteGalleryCategory[] = [
  'Campus',
  'Classroom',
  'Sports',
  'Cultural Events',
  'Annual Programs',
  'Student Activities',
];

const FACILITY_ICONS = [
  { key: 'monitor', label: 'Smart Classroom / Screen' },
  { key: 'cpu', label: 'Computer / Tech Lab' },
  { key: 'flask', label: 'Science Lab' },
  { key: 'book', label: 'Library / Books' },
  { key: 'trophy', label: 'Playground / Sports' },
  { key: 'bus', label: 'Transport / Bus' },
  { key: 'qr', label: 'Digital Attendance / QR' },
  { key: 'users', label: 'Experienced Teachers' },
];

export const WebsiteCmsEditor: React.FC<WebsiteCmsEditorProps> = ({
  profile,
  schoolId,
  language,
  onChangeProfile,
  onSaveAndPublish,
  onPreviewWebsite,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<CmsSectionTab>('branding_header');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Gallery new upload form
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryCat, setNewGalleryCat] = useState<WebsiteGalleryCategory>('Campus');
  const [newGalleryCaption, setNewGalleryCaption] = useState('');
  const [newGalleryImage, setNewGalleryImage] = useState('');

  // Testimonial new form
  const [newTestiName, setNewTestiName] = useState('');
  const [newTestiRole, setNewTestiRole] = useState('Parent');
  const [newTestiFeedback, setNewTestiFeedback] = useState('');
  const [newTestiRating, setNewTestiRating] = useState(5);
  const [newTestiPhoto, setNewTestiPhoto] = useState('');

  const cfg = getDefaultWebsiteConfig(profile);

  const liveStudentsCount = StorageService.getStudents().filter(
    (s) => s.status !== 'inactive' && s.status !== 'transferred'
  ).length;
  const liveTeachersCount = StorageService.getStaff().filter(
    (s) => s.status === 'active'
  ).length;
  const liveClassesCount = StorageService.getClasses().filter((c) => c.isActive !== false).length;
  const livePublicNoticesCount = StorageService.getNotices().filter(
    (n) => n.targetAudience === 'All'
  ).length;
  const liveBlogsCount = StorageService.getPublishedBlogPosts().length;

  const updateWebsiteCfg = (patch: Partial<WebsiteSettingsConfig>) => {
    const nextProfile: SchoolProfile = {
      ...profile,
      ...(patch.heroBadgeBn !== undefined ? { heroTaglineBn: patch.heroBadgeBn } : {}),
      ...(patch.heroDescriptionBn !== undefined
        ? { heroSubtitleBn: patch.heroDescriptionBn }
        : {}),
      ...(patch.contactPhone !== undefined ? { phone: patch.contactPhone } : {}),
      ...(patch.contactEmail !== undefined ? { email: patch.contactEmail } : {}),
      ...(patch.contactAddressEn !== undefined ? { addressEn: patch.contactAddressEn } : {}),
      ...(patch.contactAddressBn !== undefined ? { addressBn: patch.contactAddressBn } : {}),
      ...(patch.statsOverrides
        ? {
            statsStudents: patch.statsOverrides.students ?? profile.statsStudents,
            statsTeachers: patch.statsOverrides.teachers ?? profile.statsTeachers,
            statsClassrooms: patch.statsOverrides.classes ?? profile.statsClassrooms,
            statsExperience:
              patch.statsOverrides.yearsOfExcellence ?? profile.statsExperience,
          }
        : {}),
      websiteConfig: {
        ...cfg,
        ...patch,
      },
    };
    onChangeProfile(nextProfile);
  };

  const handleUploadCompressedImage = async (
    file: File,
    maxW: number,
    maxH: number,
    quality: number,
    onDone: (dataUrl: string) => void
  ) => {
    try {
      const compressed = await compressImageToPassportSize(file, maxW, maxH, quality);
      if (compressed) {
        onDone(compressed);
        return;
      }
    } catch {}
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onDone(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await onSaveAndPublish(profile);
      setSavedMsg(
        language === 'bn'
          ? 'ওয়েবসাইটের সকল পরিবর্তন সংরক্ষিত ও পাবলিক হোমপেজে প্রকাশিত হয়েছে!'
          : 'Website settings saved & published to your school public homepage!'
      );
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleMenuToggle = (id: string) => {
    const items = (cfg.headerMenuItems || DEFAULT_HEADER_MENU_ITEMS).map((m) =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    );
    updateWebsiteCfg({ headerMenuItems: items });
  };

  const handleMenuLabelChange = (id: string, field: 'labelEn' | 'labelBn', val: string) => {
    const items = (cfg.headerMenuItems || DEFAULT_HEADER_MENU_ITEMS).map((m) =>
      m.id === id ? { ...m, [field]: val } : m
    );
    updateWebsiteCfg({ headerMenuItems: items });
  };

  const handleFacilityChange = (
    id: string,
    patch: Partial<WebsiteFacilityItem>
  ) => {
    const items = (cfg.facilities || DEFAULT_FACILITIES).map((f) =>
      f.id === id ? { ...f, ...patch } : f
    );
    updateWebsiteCfg({ facilities: items });
  };

  const handleAddFacility = () => {
    const next: WebsiteFacilityItem = {
      id: `fac_${Date.now()}`,
      titleEn: 'New Facility',
      titleBn: 'নতুন সুবিধা',
      descriptionEn: 'Describe this campus facility for parents and students.',
      descriptionBn: 'এই সুবিধা সম্পর্কে সংক্ষিপ্ত বিবরণ লিখুন।',
      iconKey: 'monitor',
      enabled: true,
    };
    updateWebsiteCfg({ facilities: [...(cfg.facilities || DEFAULT_FACILITIES), next] });
  };

  const handleDeleteFacility = (id: string) => {
    updateWebsiteCfg({
      facilities: (cfg.facilities || DEFAULT_FACILITIES).filter((f) => f.id !== id),
    });
  };

  const handleWhyChange = (id: string, patch: Partial<WebsiteWhyChooseItem>) => {
    const items = (cfg.whyChooseUs || DEFAULT_WHY_CHOOSE_ITEMS).map((w) =>
      w.id === id ? { ...w, ...patch } : w
    );
    updateWebsiteCfg({ whyChooseUs: items });
  };

  const handleAddGalleryItem = () => {
    if (!newGalleryImage) return;
    const item: WebsiteGalleryItem = {
      id: `gal_${Date.now()}`,
      titleEn: newGalleryTitle.trim() || `${newGalleryCat} Photo`,
      titleBn: newGalleryTitle.trim() || newGalleryCat,
      category: newGalleryCat,
      imageUrl: newGalleryImage,
      caption: newGalleryCaption.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    updateWebsiteCfg({ gallery: [item, ...(cfg.gallery || [])] });
    setNewGalleryTitle('');
    setNewGalleryCaption('');
    setNewGalleryImage('');
  };

  const handleDeleteGalleryItem = (id: string) => {
    updateWebsiteCfg({
      gallery: (cfg.gallery || []).filter((g) => g.id !== id),
    });
  };

  const handleAddTestimonial = () => {
    if (!newTestiName.trim() || !newTestiFeedback.trim()) return;
    const item: WebsiteTestimonialItem = {
      id: `testi_${Date.now()}`,
      name: newTestiName.trim(),
      role: newTestiRole.trim() || 'Parent',
      photoUrl: newTestiPhoto || undefined,
      feedback: newTestiFeedback.trim(),
      rating: newTestiRating,
      createdAt: new Date().toISOString(),
    };
    updateWebsiteCfg({ testimonials: [item, ...(cfg.testimonials || [])] });
    setNewTestiName('');
    setNewTestiRole('Parent');
    setNewTestiFeedback('');
    setNewTestiRating(5);
    setNewTestiPhoto('');
  };

  const handleDeleteTestimonial = (id: string) => {
    updateWebsiteCfg({
      testimonials: (cfg.testimonials || []).filter((t) => t.id !== id),
    });
  };

  const publicUrl =
    typeof window !== 'undefined' && schoolId && schoolId !== 'local_school'
      ? `${window.location.origin}/?school=${encodeURIComponent(schoolId)}`
      : typeof window !== 'undefined'
      ? window.location.origin
      : '';

  const tabs: { id: CmsSectionTab; labelEn: string; labelBn: string; icon: typeof Globe }[] = [
    { id: 'branding_header', labelEn: 'Header & Branding', labelBn: 'হেডার ও ব্র্যান্ডিং', icon: Globe },
    { id: 'hero_stats', labelEn: 'Hero & Statistics', labelBn: 'হিরো ও পরিসংখ্যান', icon: Sparkles },
    { id: 'principal_about', labelEn: 'Principal & About', labelBn: 'অধ্যক্ষ ও পরিচিতি', icon: UserCheck },
    { id: 'facilities_why', labelEn: 'Facilities & Features', labelBn: 'সুবিধাসমূহ', icon: Layers },
    { id: 'gallery', labelEn: 'Photo Gallery', labelBn: 'ফটো গ্যালারি', icon: ImageIcon },
    { id: 'testimonials_admission', labelEn: 'Testimonials & Admission', labelBn: 'মতামত ও ভর্তি', icon: MessageSquareQuote },
    { id: 'contact_footer', labelEn: 'Contact, Social & Footer', labelBn: 'যোগাযোগ ও ফুটার', icon: MapPin },
  ];

  return (
    <div className="p-5 sm:p-6 bg-white rounded-2xl border border-blue-200 shadow-xs space-y-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0B47B8] via-[#1D63ED] to-[#15803D]" />

      {/* Top Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4 pt-1">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#0B47B8]" />
              <span>
                {language === 'bn'
                  ? 'পাবলিক স্কুল ওয়েবসাইট সিএমএস (Public Website Homepage CMS)'
                  : 'Public School Website Homepage CMS'}
              </span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {cfg.isPublished !== false
                ? language === 'bn'
                  ? 'লাইভ প্রকাশিত'
                  : 'Published Live'
                : language === 'bn'
                ? 'ড্রাফট মোড'
                : 'Unpublished'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'bn'
              ? `এই সেটিংস শুধুমাত্র আপনার বিদ্যালয়ের (${schoolId || 'Local'}) পাবলিক ওয়েবসাইটে প্রদর্শিত হবে। নোটিশ (${livePublicNoticesCount}) এবং ব্লগ (${liveBlogsCount}) স্বয়ংক্রিয়ভাবে সিঙ্ক হয়।`
              : `Strictly isolated per school (${schoolId || 'Local'}). Public notices (${livePublicNoticesCount}) and published blogs (${liveBlogsCount}) sync automatically.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onPreviewWebsite && (
            <button
              type="button"
              onClick={onPreviewWebsite}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4 text-[#0B47B8]" />
              <span>{language === 'bn' ? 'হোমপেজ প্রিভিউ দেখুন' : 'Preview Homepage'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B47B8] hover:bg-[#083A9E] text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving
                ? language === 'bn'
                  ? 'প্রকাশ হচ্ছে...'
                  : 'Publishing...'
                : language === 'bn'
                ? 'সেভ ও ওয়েবসাইট আপডেট করুন'
                : 'Save & Publish Website'}
            </span>
          </button>
        </div>
      </div>

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* Shareable Multi-School Website URL Strip */}
      {publicUrl && (
        <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              {language === 'bn' ? 'আপনার স্কুলের পাবলিক ওয়েবসাইট লিংক' : 'School Public Website Link'}
            </span>
            <code className="text-[11px] font-mono font-semibold text-slate-800 truncate block">
              {publicUrl}
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(publicUrl);
              setSavedMsg(language === 'bn' ? 'ওয়েবসাইট লিংক কপি করা হয়েছে!' : 'Public website URL copied!');
              setTimeout(() => setSavedMsg(''), 2500);
            }}
            className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 font-bold text-xs hover:bg-blue-50 shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'লিংক কপি করুন' : 'Copy Link'}</span>
          </button>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0B47B8] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? tab.labelBn : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: HEADER & BRANDING */}
      {activeSubTab === 'branding_header' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900">
                {language === 'bn' ? 'পাবলিক হোমপেজ দৃশ্যমানতা' : 'Public Homepage Visibility'}
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === 'bn'
                  ? 'চালু থাকলে আপনার স্কুলের ওয়েবসাইট ভিজিটরদের জন্য উন্মুক্ত থাকবে।'
                  : 'Enable to make this school public homepage live for parents and visitors.'}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.isPublished !== false}
                onChange={(e) => updateWebsiteCfg({ isPublished: e.target.checked })}
                className="w-4 h-4 rounded text-[#0B47B8]"
              />
              <span>{language === 'bn' ? 'ওয়েবসাইট প্রকাশিত (Published)' : 'Published Live'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                School Slogan / Motto (English)
              </label>
              <input
                type="text"
                value={profile.mottoEn || ''}
                onChange={(e) => onChangeProfile({ ...profile, mottoEn: e.target.value })}
                placeholder="Knowledge • Discipline • Prosperity"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                বিদ্যালয়ের স্লোগান / মূলমন্ত্র (বাংলা)
              </label>
              <input
                type="text"
                value={profile.mottoBn || ''}
                onChange={(e) => onChangeProfile({ ...profile, mottoBn: e.target.value })}
                placeholder="জ্ঞান • শৃঙ্খলা • সমৃদ্ধি"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Header Admission CTA Button (English)
              </label>
              <input
                type="text"
                value={cfg.admissionButtonTextEn || ''}
                onChange={(e) => updateWebsiteCfg({ admissionButtonTextEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                হেডার ভর্তি বাটন টেক্সট (বাংলা)
              </label>
              <input
                type="text"
                value={cfg.admissionButtonTextBn || ''}
                onChange={(e) => updateWebsiteCfg({ admissionButtonTextBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Menu Items Customization */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">
              {language === 'bn' ? 'মেনু আইটেম কাস্টমাইজেশন (Main Navigation Menu)' : 'Main Navigation Menu Items'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {(cfg.headerMenuItems || DEFAULT_HEADER_MENU_ITEMS).map((item: WebsiteHeaderMenuItem) => (
                <div
                  key={item.id}
                  className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={() => handleMenuToggle(item.id)}
                    className="w-4 h-4 text-[#0B47B8] rounded shrink-0"
                  />
                  <input
                    type="text"
                    value={item.labelEn}
                    onChange={(e) => handleMenuLabelChange(item.id, 'labelEn', e.target.value)}
                    placeholder="English Label"
                    className="w-1/2 px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                  <input
                    type="text"
                    value={item.labelBn}
                    onChange={(e) => handleMenuLabelChange(item.id, 'labelBn', e.target.value)}
                    placeholder="বাংলা লেবেল"
                    className="w-1/2 px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HERO & STATISTICS */}
      {activeSubTab === 'hero_stats' && (
        <div className="space-y-5 text-xs">
          {/* Hero Image Upload */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full md:w-64 h-36 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0">
              <img
                src={resolveCleanHeroImage(profile.heroImageUrl)}
                alt="School Hero Preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-bold text-slate-900">
                {language === 'bn' ? 'হিরো ক্যাম্পাস ব্যানার ছবি (Hero Campus Image)' : 'Hero Campus Banner Image'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? 'বিদ্যালয়ের সবুজ ক্যাম্পাস ও শিক্ষার্থীদের ছবি আপলোড করুন। আপলোড না করলে ডিফল্ট ক্যাম্পাস ছবি ব্যবহৃত হবে।'
                  : 'Upload your school campus & students image (auto-compressed for fast page load).'}
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B47B8] text-white font-bold cursor-pointer hover:bg-[#083A9E]">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'নতুন হিরো ছবি আপলোড' : 'Upload Hero Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) {
                        void handleUploadCompressedImage(f, 960, 540, 0.75, (url) =>
                          onChangeProfile({ ...profile, heroImageUrl: url })
                        );
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onChangeProfile({ ...profile, heroImageUrl: DEFAULT_CAMPUS_HERO_IMAGE })
                  }
                  className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  {language === 'bn' ? 'ডিফল্ট ক্যাম্পাস ছবি' : 'Use Default Campus Photo'}
                </button>
              </div>
            </div>
          </div>

          {/* Hero Text Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hero Small Badge (English)</label>
              <input
                type="text"
                value={cfg.heroBadgeEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroBadgeEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">হিরো ব্যাজ (বাংলা)</label>
              <input
                type="text"
                value={cfg.heroBadgeBn || ''}
                onChange={(e) => updateWebsiteCfg({ heroBadgeBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hero Main Heading (English)</label>
              <input
                type="text"
                value={cfg.heroHeadingEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroHeadingEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Highlight Phrase (Blue Accent)</label>
              <input
                type="text"
                value={cfg.heroHeadingHighlightEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroHeadingHighlightEn: e.target.value })}
                placeholder="Quality Education"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">হিরো শিরোনাম (বাংলা)</label>
              <input
                type="text"
                value={cfg.heroHeadingBn || ''}
                onChange={(e) => updateWebsiteCfg({ heroHeadingBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hero Description (English)</label>
              <textarea
                rows={3}
                value={cfg.heroDescriptionEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroDescriptionEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">হিরো বিবরণ (বাংলা)</label>
              <textarea
                rows={3}
                value={cfg.heroDescriptionBn || ''}
                onChange={(e) => updateWebsiteCfg({ heroDescriptionBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Hero Video URL */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Button Text (EN)</label>
              <input
                type="text"
                value={cfg.heroPrimaryBtnEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroPrimaryBtnEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Secondary Button Text (EN)</label>
              <input
                type="text"
                value={cfg.heroSecondaryBtnEn || ''}
                onChange={(e) => updateWebsiteCfg({ heroSecondaryBtnEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Video className="w-3.5 h-3.5 text-[#0B47B8]" />
                <span>School Intro Video URL (YouTube)</span>
              </label>
              <input
                type="url"
                value={cfg.heroVideoUrl || ''}
                onChange={(e) => updateWebsiteCfg({ heroVideoUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Real Statistics & Manual Fallback Overrides */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-900">
                  {language === 'bn'
                    ? 'বিদ্যালয়ের পরিসংখ্যান (Admin Settings ও Live DB Data)'
                    : 'School Statistics (Custom Settings & Live Database Counts)'}
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {language === 'bn'
                    ? 'নিচে কাস্টম সংখ্যা (যেমন 350+) লিখলে সেটিই পাবলিক ওয়েবসাইটে দেখাবে। খালি বা ০ রাখলে ফায়ারবেস ডেটাবেজের আসল সংখ্যা স্বয়ংক্রিয়ভাবে প্রদর্শিত হবে।'
                    : 'Enter custom values below (e.g. 350+) to display on the website, or leave blank / 0 to automatically show live database counts.'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={cfg.statsDisplayMode || 'manual_or_live'}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsDisplayMode:
                        e.target.value === 'live_only' ? 'live_only' : 'manual_or_live',
                    })
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-[11px] font-bold text-slate-800"
                >
                  <option value="manual_or_live">
                    {language === 'bn'
                      ? 'কাস্টম মান (না থাকলে Live DB)'
                      : 'Custom Value (Fallback to Live DB)'}
                  </option>
                  <option value="live_only">
                    {language === 'bn'
                      ? 'শুধু Live ডেটাবেজ সংখ্যা'
                      : 'Always Use Live Database'}
                  </option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    updateWebsiteCfg({
                      statsDisplayMode: 'live_only',
                      statsOverrides: {
                        students: '',
                        teachers: '',
                        classes: '',
                        yearsOfExcellence: '',
                        successRate: '',
                      },
                    })
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold whitespace-nowrap cursor-pointer"
                >
                  {language === 'bn' ? 'Live DB ব্যবহার করুন' : 'Use Live DB'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Students (Live: {liveStudentsCount})
                </span>
                <input
                  type="text"
                  value={cfg.statsOverrides?.students || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsOverrides: { ...cfg.statsOverrides, students: e.target.value },
                    })
                  }
                  placeholder="e.g. 1,200+"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Teachers (Live: {liveTeachersCount})
                </span>
                <input
                  type="text"
                  value={cfg.statsOverrides?.teachers || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsOverrides: { ...cfg.statsOverrides, teachers: e.target.value },
                    })
                  }
                  placeholder="e.g. 45+"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Classes (Live: {liveClassesCount})
                </span>
                <input
                  type="text"
                  value={cfg.statsOverrides?.classes || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsOverrides: { ...cfg.statsOverrides, classes: e.target.value },
                    })
                  }
                  placeholder="e.g. 10+"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Years of Excellence
                </span>
                <input
                  type="text"
                  value={cfg.statsOverrides?.yearsOfExcellence || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsOverrides: {
                        ...cfg.statsOverrides,
                        yearsOfExcellence: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g. 20+"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Success Rate
                </span>
                <input
                  type="text"
                  value={cfg.statsOverrides?.successRate || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({
                      statsOverrides: { ...cfg.statsOverrides, successRate: e.target.value },
                    })
                  }
                  placeholder="e.g. 98%"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PRINCIPAL & ABOUT */}
      {activeSubTab === 'principal_about' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center shrink-0">
              {cfg.principalPhotoUrl ? (
                <img
                  src={cfg.principalPhotoUrl}
                  alt="Principal"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCheck className="w-9 h-9 text-slate-300" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-bold text-slate-900">
                {language === 'bn' ? 'অধ্যক্ষ / প্রধান শিক্ষকের ছবি' : 'Principal Photo'}
              </h4>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B47B8] text-white font-bold cursor-pointer hover:bg-[#083A9E]">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'ছবি আপলোড করুন' : 'Upload Principal Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) {
                        void handleUploadCompressedImage(f, 360, 360, 0.78, (url) =>
                          updateWebsiteCfg({ principalPhotoUrl: url })
                        );
                      }
                    }}
                  />
                </label>
                {cfg.principalPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => updateWebsiteCfg({ principalPhotoUrl: '' })}
                    className="px-3 py-2 rounded-lg bg-white border border-rose-200 text-rose-600 font-semibold hover:bg-rose-50 cursor-pointer"
                  >
                    {language === 'bn' ? 'মুছে ফেলুন' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Principal Name (EN)</label>
              <input
                type="text"
                value={profile.principalNameEn}
                onChange={(e) => onChangeProfile({ ...profile, principalNameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">অধ্যক্ষের নাম (বাংলা)</label>
              <input
                type="text"
                value={profile.principalNameBn}
                onChange={(e) => onChangeProfile({ ...profile, principalNameBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Designation (EN)</label>
              <input
                type="text"
                value={cfg.principalDesignationEn || ''}
                onChange={(e) => updateWebsiteCfg({ principalDesignationEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">পদবি (বাংলা)</label>
              <input
                type="text"
                value={cfg.principalDesignationBn || ''}
                onChange={(e) => updateWebsiteCfg({ principalDesignationBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Principal Welcome Message (EN)</label>
              <textarea
                rows={4}
                value={cfg.principalMessageEn || ''}
                onChange={(e) => updateWebsiteCfg({ principalMessageEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">অধ্যক্ষের বাণী (বাংলা)</label>
              <textarea
                rows={4}
                value={cfg.principalMessageBn || ''}
                onChange={(e) => updateWebsiteCfg({ principalMessageBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">About Us Heading (EN)</label>
              <input
                type="text"
                value={cfg.aboutTitleEn || ''}
                onChange={(e) => updateWebsiteCfg({ aboutTitleEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">আমাদের সম্পর্কে শিরোনাম (বাংলা)</label>
              <input
                type="text"
                value={cfg.aboutTitleBn || ''}
                onChange={(e) => updateWebsiteCfg({ aboutTitleBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">About Us Description (EN)</label>
              <textarea
                rows={3}
                value={cfg.aboutDescriptionEn || ''}
                onChange={(e) => updateWebsiteCfg({ aboutDescriptionEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">আমাদের সম্পর্কে বিবরণ (বাংলা)</label>
              <textarea
                rows={3}
                value={cfg.aboutDescriptionBn || ''}
                onChange={(e) => updateWebsiteCfg({ aboutDescriptionBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FACILITIES & WHY CHOOSE US */}
      {activeSubTab === 'facilities_why' && (
        <div className="space-y-5 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">
                {language === 'bn' ? 'বিদ্যালয়ের সুবিধাসমূহ (School Facilities)' : 'School Facilities'}
              </h4>
              <button
                type="button"
                onClick={handleAddFacility}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#15803D] text-white font-bold hover:bg-[#166534] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'সুবিধা যোগ করুন' : 'Add Facility'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(cfg.facilities || DEFAULT_FACILITIES).map((fac) => (
                <div
                  key={fac.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={fac.enabled}
                        onChange={(e) =>
                          handleFacilityChange(fac.id, { enabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-[#0B47B8]"
                      />
                      <span>Show Card</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={fac.iconKey}
                        onChange={(e) =>
                          handleFacilityChange(fac.id, { iconKey: e.target.value })
                        }
                        className="px-2 py-1 border border-slate-200 rounded bg-white text-[11px]"
                      >
                        {FACILITY_ICONS.map((ic) => (
                          <option key={ic.key} value={ic.key}>
                            {ic.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteFacility(fac.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={fac.titleEn}
                      onChange={(e) =>
                        handleFacilityChange(fac.id, { titleEn: e.target.value })
                      }
                      placeholder="Title (EN)"
                      className="px-2.5 py-1.5 border border-slate-200 rounded bg-white font-semibold"
                    />
                    <input
                      type="text"
                      value={fac.titleBn}
                      onChange={(e) =>
                        handleFacilityChange(fac.id, { titleBn: e.target.value })
                      }
                      placeholder="শিরোনাম (বাংলা)"
                      className="px-2.5 py-1.5 border border-slate-200 rounded bg-white font-semibold"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={fac.descriptionEn}
                    onChange={(e) =>
                      handleFacilityChange(fac.id, { descriptionEn: e.target.value })
                    }
                    placeholder="Description (EN)"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                  />
                  <textarea
                    rows={2}
                    value={fac.descriptionBn}
                    onChange={(e) =>
                      handleFacilityChange(fac.id, { descriptionBn: e.target.value })
                    }
                    placeholder="বিবরণ (বাংলা)"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">
              {language === 'bn' ? 'কেন আমাদের স্কুল সেরা (Why Choose Our School)' : 'Why Choose Our School Features'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(cfg.whyChooseUs || DEFAULT_WHY_CHOOSE_ITEMS).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <label className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) =>
                        handleWhyChange(item.id, { enabled: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#0B47B8]"
                    />
                    <span>{item.titleEn}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={item.titleEn}
                      onChange={(e) =>
                        handleWhyChange(item.id, { titleEn: e.target.value })
                      }
                      className="px-2 py-1 border border-slate-200 rounded bg-white font-semibold"
                    />
                    <input
                      type="text"
                      value={item.titleBn}
                      onChange={(e) =>
                        handleWhyChange(item.id, { titleBn: e.target.value })
                      }
                      className="px-2 py-1 border border-slate-200 rounded bg-white font-semibold"
                    />
                  </div>
                  <input
                    type="text"
                    value={item.descriptionEn}
                    onChange={(e) =>
                      handleWhyChange(item.id, { descriptionEn: e.target.value })
                    }
                    className="w-full px-2 py-1 border border-slate-200 rounded bg-white"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PHOTO GALLERY */}
      {activeSubTab === 'gallery' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">
              {language === 'bn' ? 'গ্যালারিতে নতুন ছবি আপলোড করুন' : 'Upload New Gallery Photo'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={newGalleryCat}
                  onChange={(e) => setNewGalleryCat(e.target.value as WebsiteGalleryCategory)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  {GALLERY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Photo Title</label>
                <input
                  type="text"
                  value={newGalleryTitle}
                  onChange={(e) => setNewGalleryTitle(e.target.value)}
                  placeholder="e.g. Annual Sports Day 2026"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Caption (Optional)</label>
                <input
                  type="text"
                  value={newGalleryCaption}
                  onChange={(e) => setNewGalleryCaption(e.target.value)}
                  placeholder="Short description..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B47B8] text-white font-bold cursor-pointer hover:bg-[#083A9E]">
                <Camera className="w-3.5 h-3.5" />
                <span>{newGalleryImage ? 'Change Photo' : 'Select Image File'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) {
                      void handleUploadCompressedImage(f, 760, 520, 0.72, setNewGalleryImage);
                    }
                  }}
                />
              </label>

              {newGalleryImage && (
                <>
                  <img
                    src={newGalleryImage}
                    alt="Preview"
                    className="w-16 h-12 rounded-lg object-cover border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={handleAddGalleryItem}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803D] text-white font-bold hover:bg-[#166534] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Gallery</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Existing Gallery Grid */}
          {(cfg.gallery || []).length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 text-slate-500">
              {language === 'bn'
                ? 'এখনো কোনো গ্যালারি ছবি যোগ করা হয়নি। উপরের ফর্ম থেকে ছবি আপলোড করুন।'
                : 'No gallery photos uploaded yet. Use the form above to upload school photos.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(cfg.gallery || []).map((img) => (
                <div
                  key={img.id}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs"
                >
                  <div className="h-28 bg-slate-100 relative">
                    <img
                      src={img.imageUrl}
                      alt={img.titleEn}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-900/75 text-white text-[10px] font-bold">
                      {img.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteGalleryItem(img.id)}
                      className="absolute top-1.5 right-1.5 p-1 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                      title="Delete Photo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-2">
                    <div className="font-bold text-slate-900 truncate">{img.titleEn}</div>
                    {img.caption && (
                      <div className="text-[10px] text-slate-500 truncate">{img.caption}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: TESTIMONIALS & ADMISSION BANNER */}
      {activeSubTab === 'testimonials_admission' && (
        <div className="space-y-5 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">
              {language === 'bn' ? 'অনলাইন ভর্তি ব্যানার (Admission Banner)' : 'Online Admission CTA Banner'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Banner Heading (EN)</label>
                <input
                  type="text"
                  value={cfg.admissionBannerTitleEn || ''}
                  onChange={(e) => updateWebsiteCfg({ admissionBannerTitleEn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ব্যানার শিরোনাম (বাংলা)</label>
                <input
                  type="text"
                  value={cfg.admissionBannerTitleBn || ''}
                  onChange={(e) => updateWebsiteCfg({ admissionBannerTitleBn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Banner Description (EN)</label>
                <input
                  type="text"
                  value={cfg.admissionBannerSubtitleEn || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({ admissionBannerSubtitleEn: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ব্যানার বিবরণ (বাংলা)</label>
                <input
                  type="text"
                  value={cfg.admissionBannerSubtitleBn || ''}
                  onChange={(e) =>
                    updateWebsiteCfg({ admissionBannerSubtitleBn: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Admission Information Guide (EN)</label>
                <textarea
                  rows={3}
                  value={cfg.admissionInfoEn || ''}
                  onChange={(e) => updateWebsiteCfg({ admissionInfoEn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ভর্তি নির্দেশিকা ও কাগজপত্র (বাংলা)</label>
                <textarea
                  rows={3}
                  value={cfg.admissionInfoBn || ''}
                  onChange={(e) => updateWebsiteCfg({ admissionInfoBn: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Testimonials Manager */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">
              {language === 'bn'
                ? 'অভিভাবক ও শিক্ষার্থীদের মতামত (Testimonials)'
                : 'Parent & Student Testimonials'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={newTestiName}
                onChange={(e) => setNewTestiName(e.target.value)}
                placeholder="Name (e.g. Farhana Akter)"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <input
                type="text"
                value={newTestiRole}
                onChange={(e) => setNewTestiRole(e.target.value)}
                placeholder="Role (e.g. Parent • Class 6)"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <select
                value={newTestiRating}
                onChange={(e) => setNewTestiRating(Number(e.target.value))}
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>
                    {r} Stars Rating
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              value={newTestiFeedback}
              onChange={(e) => setNewTestiFeedback(e.target.value)}
              placeholder="Write parent or student feedback..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold cursor-pointer hover:bg-slate-100">
                <Camera className="w-3.5 h-3.5" />
                <span>{newTestiPhoto ? 'Photo Added' : 'Optional Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) {
                      void handleUploadCompressedImage(f, 180, 180, 0.75, setNewTestiPhoto);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleAddTestimonial}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0B47B8] text-white font-bold hover:bg-[#083A9E] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Testimonial</span>
              </button>
            </div>

            {(cfg.testimonials || []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(cfg.testimonials || []).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900">{t.name}</strong>
                        <span className="text-[10px] text-slate-500">({t.role})</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-amber-500 my-1">
                        {Array.from({ length: t.rating || 5 }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{t.feedback}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTestimonial(t.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: CONTACT, SOCIAL & FOOTER */}
      {activeSubTab === 'contact_footer' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Public Contact Phone</label>
              <input
                type="text"
                value={cfg.contactPhone || ''}
                onChange={(e) => updateWebsiteCfg({ contactPhone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Public Contact Email</label>
              <input
                type="email"
                value={cfg.contactEmail || ''}
                onChange={(e) => updateWebsiteCfg({ contactEmail: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contact Address (EN)</label>
              <input
                type="text"
                value={cfg.contactAddressEn || ''}
                onChange={(e) => updateWebsiteCfg({ contactAddressEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">ঠিকানা (বাংলা)</label>
              <input
                type="text"
                value={cfg.contactAddressBn || ''}
                onChange={(e) => updateWebsiteCfg({ contactAddressBn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office Hours (EN)</label>
              <input
                type="text"
                value={cfg.officeHoursEn || ''}
                onChange={(e) => updateWebsiteCfg({ officeHoursEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Google Map Embed URL / Location</label>
              <input
                type="text"
                value={cfg.googleMapEmbedUrl || ''}
                onChange={(e) => updateWebsiteCfg({ googleMapEmbedUrl: e.target.value })}
                placeholder="Paste Google Maps embed URL or campus city/address"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-[#0B47B8]" />
              <span>Social Media Links</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                type="url"
                value={cfg.socialLinks?.facebook || ''}
                onChange={(e) =>
                  updateWebsiteCfg({
                    socialLinks: { ...cfg.socialLinks, facebook: e.target.value },
                  })
                }
                placeholder="Facebook Page URL"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <input
                type="url"
                value={cfg.socialLinks?.youtube || ''}
                onChange={(e) =>
                  updateWebsiteCfg({
                    socialLinks: { ...cfg.socialLinks, youtube: e.target.value },
                  })
                }
                placeholder="YouTube Channel URL"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <input
                type="url"
                value={cfg.socialLinks?.instagram || ''}
                onChange={(e) =>
                  updateWebsiteCfg({
                    socialLinks: { ...cfg.socialLinks, instagram: e.target.value },
                  })
                }
                placeholder="Instagram URL"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <input
                type="url"
                value={cfg.socialLinks?.linkedin || ''}
                onChange={(e) =>
                  updateWebsiteCfg({
                    socialLinks: { ...cfg.socialLinks, linkedin: e.target.value },
                  })
                }
                placeholder="LinkedIn URL"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
              <input
                type="url"
                value={cfg.socialLinks?.website || ''}
                onChange={(e) =>
                  updateWebsiteCfg({
                    socialLinks: { ...cfg.socialLinks, website: e.target.value },
                  })
                }
                placeholder="Official Website URL"
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Footer Tagline (EN)</label>
              <input
                type="text"
                value={cfg.footerTextEn || ''}
                onChange={(e) => updateWebsiteCfg({ footerTextEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Copyright Notice</label>
              <input
                type="text"
                value={cfg.copyrightText || ''}
                onChange={(e) => updateWebsiteCfg({ copyrightText: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Privacy Policy Text</label>
              <textarea
                rows={3}
                value={cfg.privacyPolicyText || ''}
                onChange={(e) => updateWebsiteCfg({ privacyPolicyText: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Terms & Conditions Text</label>
              <textarea
                rows={3}
                value={cfg.termsConditionsText || ''}
                onChange={(e) => updateWebsiteCfg({ termsConditionsText: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
