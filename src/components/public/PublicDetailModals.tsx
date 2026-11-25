import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  LogIn,
  Megaphone,
  Play,
  Shield,
  User,
  X,
} from 'lucide-react';
import {
  PublicAcademicProgramItem,
  PublicBlogSummary,
  PublicNoticeSummary,
  WebsiteGalleryItem,
} from '../../types';
import { parseYouTubeEmbedInput } from '../../utils/youtubeEmbed';
import { DEFAULT_CAMPUS_HERO_IMAGE } from '../../services/publicWebsiteService';

/* -------------------------------------------------------------------------- */
/* 1. Notice Detail Modal                                                     */
/* -------------------------------------------------------------------------- */
export const PublicNoticeDetailModal: React.FC<{
  notice: PublicNoticeSummary | null;
  onClose: () => void;
  language: 'en' | 'bn';
}> = ({ notice, onClose, language }) => {
  if (!notice) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[88vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Megaphone className="w-5 h-5 text-emerald-300" />
            <span className="text-sm font-bold">{isBn ? 'নোটিশ বিস্তারিত' : 'Official Notice'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-[#0B47B8]">{notice.category}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{notice.date}</span>
            {notice.author && (
              <>
                <span aria-hidden="true">·</span>
                <span>{notice.author}</span>
              </>
            )}
          </div>
          <h3 className="text-xl font-bold text-slate-900 leading-snug">{notice.title}</h3>
          <div className="pt-3 border-t border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {notice.content}
          </div>
        </div>
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#0B47B8] hover:bg-[#083A9E] text-white text-xs font-semibold cursor-pointer"
          >
            {isBn ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. All Notices Browser Modal                                               */
/* -------------------------------------------------------------------------- */
export const PublicAllNoticesModal: React.FC<{
  isOpen: boolean;
  notices: PublicNoticeSummary[];
  onClose: () => void;
  onSelectNotice: (notice: PublicNoticeSummary) => void;
  language: 'en' | 'bn';
}> = ({ isOpen, notices, onClose, onSelectNotice, language }) => {
  const [filterCat, setFilterCat] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;
  const isBn = language === 'bn';

  const categories = ['All', 'Admission', 'Exam', 'Holiday', 'General', 'Academic', 'Emergency'];

  const filtered = notices.filter((n) => {
    const matchesCat = filterCat === 'All' || n.category === filterCat;
    const q = searchTerm.trim().toLowerCase();
    const matchesQuery =
      !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Megaphone className="w-5 h-5 text-emerald-300" />
            <h3 className="text-base font-bold">
              {isBn ? 'সকল নোটিশ ও বিজ্ঞপ্তি' : 'All School Notices'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 space-y-3 bg-slate-50 shrink-0">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isBn ? 'নোটিশ খুঁজুন...' : 'Search notices by title or keyword...'}
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B47B8]/25 focus:border-[#0B47B8]"
          />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  filterCat === cat
                    ? 'bg-[#0B47B8] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {isBn ? 'এই বিভাগে কোনো নোটিশ পাওয়া যায়নি।' : 'No notices found matching your filter.'}
            </div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelectNotice(n)}
                className="w-full py-3.5 text-left flex items-start justify-between gap-4 hover:bg-slate-50 px-2 rounded-lg transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-[#0B47B8]">{n.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{n.date}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 line-clamp-1">{n.title}</p>
                  <p className="text-xs text-slate-600 line-clamp-2">{n.content}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Principal Full Message Modal                                            */
/* -------------------------------------------------------------------------- */
export const PublicPrincipalModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  principalName: string;
  designation: string;
  photoUrl?: string;
  schoolName: string;
  message: string;
  language: 'en' | 'bn';
}> = ({ isOpen, onClose, principalName, designation, photoUrl, schoolName, message, language }) => {
  if (!isOpen) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[88vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between">
          <span className="text-sm font-bold">
            {isBn ? 'অধ্যক্ষ / প্রধান শিক্ষকের বাণী' : 'Message from the Principal'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="w-28 h-32 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={principalName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-slate-400" />
              )}
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-xl font-bold text-[#0B245B]">{principalName}</h3>
              <p className="text-sm font-semibold text-[#15803D]">{designation}</p>
              <p className="text-xs text-slate-500 mt-1">{schoolName}</p>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Academic Program Details Modal                                          */
/* -------------------------------------------------------------------------- */
export const PublicProgramModal: React.FC<{
  program: PublicAcademicProgramItem | null;
  onClose: () => void;
  onApplyForClass: (className?: string) => void;
  language: 'en' | 'bn';
}> = ({ program, onClose, onApplyForClass, language }) => {
  if (!program) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[88vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="w-5 h-5 text-emerald-300" />
            <span className="text-sm font-bold">{isBn ? program.titleBn : program.titleEn}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <p className="text-xs font-semibold text-[#15803D]">
            {isBn ? program.subtitleBn : program.subtitleEn}
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            {isBn ? program.descriptionBn : program.descriptionEn}
          </p>

          {program.classesIncluded.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">
                {isBn ? 'অন্তর্ভুক্ত শ্রেণিসমূহ' : 'Classes Included'}
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {program.classesIncluded.join(' · ')}
              </p>
            </div>
          )}

          {program.subjectsPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">
                {isBn
                  ? `পাঠ্যবিষয়সমূহ (${program.totalSubjects || program.subjectsPreview.length}টি)`
                  : `Core Subjects (${program.totalSubjects || program.subjectsPreview.length})`}
              </p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {program.subjectsPreview.map((subj) => (
                  <li
                    key={subj}
                    className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 flex items-center gap-2"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#0B47B8] shrink-0" />
                    <span className="truncate">{subj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {isBn ? 'বন্ধ করুন' : 'Close'}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onApplyForClass(program.classesIncluded[0]);
              }}
              className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold cursor-pointer"
            >
              {isBn ? 'ভর্তির আবেদন করুন' : 'Apply for This Program'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. Gallery Lightbox Modal                                                  */
/* -------------------------------------------------------------------------- */
export const PublicGalleryLightbox: React.FC<{
  items: WebsiteGalleryItem[];
  activeIndex: number | null;
  onClose: () => void;
  onChangeIndex: (idx: number) => void;
  language: 'en' | 'bn';
}> = ({ items, activeIndex, onClose, onChangeIndex, language }) => {
  if (activeIndex === null || !items[activeIndex]) return null;
  const item = items[activeIndex];
  const isBn = language === 'bn';

  const handlePrev = () => {
    onChangeIndex((activeIndex - 1 + items.length) % items.length);
  };
  const handleNext = () => {
    onChangeIndex((activeIndex + 1) % items.length);
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
        aria-label="Close lightbox"
      >
        <X className="w-6 h-6" />
      </button>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-3 sm:left-6 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-3 sm:right-6 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            aria-label="Next photo"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <div className="max-w-4xl w-full flex flex-col items-center gap-3">
        <img
          src={item.imageUrl}
          alt={item.titleEn}
          referrerPolicy="no-referrer"
          className="max-h-[76vh] w-auto max-w-full rounded-xl object-contain shadow-2xl border border-white/15"
        />
        <div className="text-center text-white space-y-0.5 px-4">
          <p className="text-sm font-bold">{isBn && item.titleBn ? item.titleBn : item.titleEn}</p>
          <p className="text-xs text-slate-300">
            {item.category}
            {item.caption ? ` · ${item.caption}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. Blog Article Reader Modal                                               */
/* -------------------------------------------------------------------------- */
export const PublicBlogModal: React.FC<{
  post: PublicBlogSummary | null;
  onClose: () => void;
  language: 'en' | 'bn';
}> = ({ post, onClose, language }) => {
  if (!post) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold">
            <BookOpen className="w-4 h-4 text-emerald-300" />
            <span>{isBn ? 'সংবাদ ও ব্লগ বিস্তারিত' : 'School News & Article'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {post.coverImage && (
            <div className="w-full h-56 sm:h-64 bg-slate-100 overflow-hidden">
              <img
                src={post.coverImage}
                alt={post.titleEn}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-[#15803D]">
                {isBn ? post.categoryBn || post.category : post.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar className="w-3.5 h-3.5" />
                {post.publishedAt}
              </span>
              {post.authorName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {post.authorName}
                    {post.authorRole ? ` (${post.authorRole})` : ''}
                  </span>
                </>
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              {isBn && post.titleBn ? post.titleBn : post.titleEn}
            </h3>

            <div className="pt-3 border-t border-slate-100 text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
              {post.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 7. School Intro Video Modal                                                */
/* -------------------------------------------------------------------------- */
export const PublicVideoModal: React.FC<{
  isOpen: boolean;
  videoUrl?: string;
  schoolName: string;
  heroImageUrl: string;
  onClose: () => void;
  language: 'en' | 'bn';
}> = ({ isOpen, videoUrl, schoolName, heroImageUrl, onClose, language }) => {
  if (!isOpen) return null;
  const isBn = language === 'bn';
  const ytParsed = videoUrl ? parseYouTubeEmbedInput(videoUrl) : null;
  const isDirectVideo =
    videoUrl && /\.(mp4|webm|ogg)(\?.*)?$/i.test(videoUrl.trim());

  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-950 flex items-center justify-between text-white border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Play className="w-4 h-4 text-emerald-400" />
            <span>{schoolName} — {isBn ? 'ক্যাম্পাস পরিচিতি' : 'Campus Showcase'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close video"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="aspect-video w-full bg-black relative">
          {ytParsed ? (
            <iframe
              src={ytParsed.embedUrl}
              title={ytParsed.extractedTitle || `${schoolName} Campus Video`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : isDirectVideo && videoUrl ? (
            <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full relative flex items-end">
              <img
                src={heroImageUrl || DEFAULT_CAMPUS_HERO_IMAGE}
                alt={schoolName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-75"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex flex-col justify-end p-6 text-white">
                <p className="text-lg font-bold">{schoolName}</p>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                  {isBn
                    ? 'স্কুলের অ্যাডমিন ড্যাশবোর্ড → Website CMS Settings থেকে YouTube বা ক্যাম্পাস ভিডিও লিংক যুক্ত করলে এখানে সরাসরি ভিডিও চলবে।'
                    : 'School Administrators can attach an official YouTube tour or campus video link from Admin Settings → Hero & Statistics.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 8. Results Info Modal (Safe Access via Login)                              */
/* -------------------------------------------------------------------------- */
export const PublicResultsPortalModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  schoolName: string;
  language: 'en' | 'bn';
}> = ({ isOpen, onClose, onOpenLogin, schoolName, language }) => {
  if (!isOpen) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-300" />
            <span className="text-sm font-bold">
              {isBn ? 'শিক্ষার্থীর পরীক্ষার ফলাফল' : 'Student Exam Results'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {isBn
              ? `${schoolName}-এর শিক্ষার্থীদের ব্যক্তিগত তথ্য ও পরীক্ষার ফলাফলের গোপনীয়তা রক্ষার্থে মার্কশিট ও জিপিএ শুধুমাত্র শিক্ষার্থী/অভিভাবক লগইনের মাধ্যমে দেখা যায়।`
              : `To protect student privacy at ${schoolName}, individual mark sheets, GPA reports, and merit positions are securely accessible via your Student or Guardian portal login.`}
          </p>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
            <span>
              {isBn
                ? 'টপবারে থাকা Login বাটনে ক্লিক করে আপনার স্টুডেন্ট বা গার্ডিয়ান আইডি দিয়ে লগইন করুন।'
                : 'Use your registered Student or Parent credentials on the Login screen to view published exam results.'}
            </span>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {isBn ? 'বন্ধ করুন' : 'Close'}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="px-4 py-2 rounded-lg bg-[#0B47B8] hover:bg-[#083A9E] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isBn ? 'লগইন করুন' : 'Go to Login'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 9. Legal Info Modal (Privacy Policy / Terms)                               */
/* -------------------------------------------------------------------------- */
export const PublicLegalModal: React.FC<{
  type: 'privacy' | 'terms' | null;
  schoolName: string;
  privacyText: string;
  termsText: string;
  onClose: () => void;
  language: 'en' | 'bn';
}> = ({ type, schoolName, privacyText, termsText, onClose, language }) => {
  if (!type) return null;
  const isBn = language === 'bn';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 bg-[#0B2D7A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-300" />
            <span className="text-sm font-bold">
              {type === 'privacy'
                ? isBn
                  ? 'গোপনীয়তা নীতি (Privacy Policy)'
                  : 'Privacy Policy'
                : isBn
                ? 'শর্তাবলি (Terms & Conditions)'
                : 'Terms & Conditions'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          <p className="text-xs font-bold text-slate-500">{schoolName}</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {type === 'privacy' ? privacyText : termsText}
          </p>
        </div>
      </div>
    </div>
  );
};
