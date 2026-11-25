import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Film,
  Layers,
  ListPlus,
  Loader2,
  Play,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  SupportVideoAudience,
  SupportVideoCategory,
  SupportVideoDTO,
} from '../../services/saasApi';
import {
  createSupportVideosClient,
  deleteSupportVideoClient,
  updateSupportVideoClient,
} from '../../services/supportService';
import {
  BulkParsedYouTubeEntry,
  SUPPORT_VIDEO_CATEGORY_LABELS,
  parseBulkYouTubeEntries,
  parseYouTubeEmbedInput,
} from '../../utils/youtubeEmbed';

interface SupportVideoGuideSectionProps {
  videos: SupportVideoDTO[];
  loading: boolean;
  isMasterAdmin: boolean;
  senderDisplayName: string;
}

interface BulkRowDraft {
  key: string;
  title: string;
  category: SupportVideoCategory;
  rawInput: string;
  description: string;
}

const ALL_CATEGORIES = Object.keys(
  SUPPORT_VIDEO_CATEGORY_LABELS
) as SupportVideoCategory[];

function createEmptyBulkRows(count: number, startIdx = 1): BulkRowDraft[] {
  return Array.from({ length: count }, (_, idx) => ({
    key: `row_${Date.now()}_${startIdx + idx}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    category: 'getting_started',
    rawInput: '',
    description: '',
  }));
}

export const SupportVideoGuideSection: React.FC<SupportVideoGuideSectionProps> = ({
  videos,
  loading,
  isMasterAdmin,
  senderDisplayName,
}) => {
  const { language, toBnNumber } = useLanguage();

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportVideoCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Confirm delete inline state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);

  // Single / Edit modal state
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<SupportVideoDTO | null>(null);
  const [singleTitle, setSingleTitle] = useState('');
  const [singleCategory, setSingleCategory] =
    useState<SupportVideoCategory>('getting_started');
  const [singleAudience, setSingleAudience] = useState<SupportVideoAudience>('admins');
  const [singleSortOrder, setSingleSortOrder] = useState<string>('');
  const [singleRawInput, setSingleRawInput] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);

  // Bulk Upload modal state (10-15+ videos)
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<'paste' | 'rows'>('paste');
  const [bulkDefaultCategory, setBulkDefaultCategory] =
    useState<SupportVideoCategory>('getting_started');
  const [bulkAudience, setBulkAudience] = useState<SupportVideoAudience>('admins');
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkParsedOverrides, setBulkParsedOverrides] = useState<
    Record<number, { title?: string; category?: SupportVideoCategory }>
  >({});
  const [bulkRows, setBulkRows] = useState<BulkRowDraft[]>(() => createEmptyBulkRows(5));
  const [savingBulk, setSavingBulk] = useState(false);

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter((v) => {
      if (categoryFilter !== 'all' && v.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        v.videoId.toLowerCase().includes(q)
      );
    });
  }, [videos, categoryFilter, searchQuery]);

  // Keep active selected video in sync
  useEffect(() => {
    if (filteredVideos.length === 0) {
      if (selectedVideoId && !videos.some((v) => v.id === selectedVideoId)) {
        setSelectedVideoId(null);
      }
      return;
    }
    if (!selectedVideoId || !filteredVideos.some((v) => v.id === selectedVideoId)) {
      setSelectedVideoId(filteredVideos[0].id);
    }
  }, [filteredVideos, videos, selectedVideoId]);

  const activeIndex = useMemo(
    () => filteredVideos.findIndex((v) => v.id === selectedVideoId),
    [filteredVideos, selectedVideoId]
  );

  const activeVideo =
    activeIndex >= 0 ? filteredVideos[activeIndex] : filteredVideos[0] || null;

  const existingMaxOrder = useMemo(
    () => videos.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0),
    [videos]
  );

  const singleParsedPreview = useMemo(
    () => (singleRawInput.trim() ? parseYouTubeEmbedInput(singleRawInput) : null),
    [singleRawInput]
  );

  // Auto-fill extracted title if empty when pasting iframe code
  useEffect(() => {
    if (
      showSingleModal &&
      !editingVideo &&
      !singleTitle.trim() &&
      singleParsedPreview?.extractedTitle
    ) {
      setSingleTitle(singleParsedPreview.extractedTitle);
    }
  }, [showSingleModal, editingVideo, singleTitle, singleParsedPreview]);

  const bulkParsedEntries: BulkParsedYouTubeEntry[] = useMemo(() => {
    if (!bulkPasteText.trim()) return [];
    const base = parseBulkYouTubeEntries(bulkPasteText, bulkDefaultCategory);
    return base.map((entry) => {
      const ov = bulkParsedOverrides[entry.lineNumber];
      return {
        ...entry,
        title: ov?.title !== undefined ? ov.title : entry.title,
        category: ov?.category !== undefined ? ov.category : entry.category,
      };
    });
  }, [bulkPasteText, bulkDefaultCategory, bulkParsedOverrides]);

  const validBulkPasteEntries = useMemo(
    () => bulkParsedEntries.filter((e) => e.parsed && e.title.trim()),
    [bulkParsedEntries]
  );

  const parsedBulkRowEntries = useMemo(() => {
    return bulkRows
      .map((row, idx) => {
        const hasAnyInput = row.rawInput.trim() || row.title.trim();
        const parsed = row.rawInput.trim()
          ? parseYouTubeEmbedInput(row.rawInput)
          : null;
        return {
          ...row,
          index: idx + 1,
          hasAnyInput,
          parsed,
          effectiveTitle:
            row.title.trim() ||
            parsed?.extractedTitle ||
            (parsed ? `টিউটোরিয়াল ভিডিও #${idx + 1}` : ''),
        };
      })
      .filter((r) => r.hasAnyInput);
  }, [bulkRows]);

  const validBulkRowEntries = useMemo(
    () => parsedBulkRowEntries.filter((r) => r.parsed && r.effectiveTitle),
    [parsedBulkRowEntries]
  );

  const openAddSingleModal = () => {
    setActionError(null);
    setActionSuccess(null);
    setEditingVideo(null);
    setSingleTitle('');
    setSingleCategory('getting_started');
    setSingleAudience('admins');
    setSingleSortOrder(String(existingMaxOrder + 1));
    setSingleRawInput('');
    setSingleDescription('');
    setShowSingleModal(true);
  };

  const openEditSingleModal = (video: SupportVideoDTO) => {
    setActionError(null);
    setActionSuccess(null);
    setEditingVideo(video);
    setSingleTitle(video.title);
    setSingleCategory(video.category);
    setSingleAudience(video.audience);
    setSingleSortOrder(String(video.sortOrder ?? 1));
    setSingleRawInput(video.embedUrl);
    setSingleDescription(video.description || '');
    setShowSingleModal(true);
  };

  const openBulkModal = () => {
    setActionError(null);
    setActionSuccess(null);
    setBulkMode('paste');
    setBulkDefaultCategory('getting_started');
    setBulkAudience('admins');
    setBulkPasteText('');
    setBulkParsedOverrides({});
    setBulkRows(createEmptyBulkRows(5));
    setShowBulkModal(true);
  };

  const handleSaveSingleVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSingle) return;
    setActionError(null);
    setActionSuccess(null);

    if (!singleParsedPreview) {
      setActionError(
        language === 'bn'
          ? 'সঠিক YouTube এম্বেড কোড (<iframe>) অথবা YouTube ভিডিও লিংক দিন।'
          : 'Please enter a valid YouTube embed code (<iframe>) or YouTube URL.'
      );
      return;
    }

    const finalTitle = singleTitle.trim() || singleParsedPreview.extractedTitle || '';
    if (!finalTitle) {
      setActionError(
        language === 'bn'
          ? 'ভিডিওর একটি শিরোনাম (Title) লিখুন।'
          : 'Please enter a video title.'
      );
      return;
    }

    const sortNum = singleSortOrder.trim() ? Number(singleSortOrder) : undefined;

    setSavingSingle(true);
    try {
      if (editingVideo) {
        const updated = await updateSupportVideoClient(editingVideo, {
          title: finalTitle,
          description: singleDescription.trim(),
          category: singleCategory,
          rawInput: singleRawInput.trim(),
          audience: singleAudience,
          sortOrder:
            sortNum !== undefined && Number.isFinite(sortNum) ? sortNum : undefined,
        });
        setSelectedVideoId(updated.id);
        setActionSuccess(
          language === 'bn'
            ? `"${updated.title}" ভিডিওটি আপডেট করা হয়েছে।`
            : `Updated "${updated.title}".`
        );
      } else {
        const created = await createSupportVideosClient(
          [
            {
              title: finalTitle,
              description: singleDescription.trim() || undefined,
              category: singleCategory,
              rawInput: singleRawInput.trim(),
              audience: singleAudience,
              sortOrder:
                sortNum !== undefined && Number.isFinite(sortNum) ? sortNum : undefined,
            },
          ],
          { createdByName: senderDisplayName, existingMaxOrder }
        );
        if (created[0]) setSelectedVideoId(created[0].id);
        setActionSuccess(
          language === 'bn'
            ? `"${finalTitle}" ভিডিওটি সাপোর্ট পোর্টালে যুক্ত হয়েছে।`
            : `Added "${finalTitle}" to Support Video Guides.`
        );
      }
      setShowSingleModal(false);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save video.');
    } finally {
      setSavingSingle(false);
    }
  };

  const handleSaveBulkVideos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingBulk) return;
    setActionError(null);
    setActionSuccess(null);

    const payloadItems =
      bulkMode === 'paste'
        ? validBulkPasteEntries.map((entry, idx) => ({
            title: entry.title.trim(),
            category: entry.category,
            rawInput: entry.parsed!.embedUrl,
            audience: bulkAudience,
            sortOrder: existingMaxOrder + idx + 1,
          }))
        : validBulkRowEntries.map((row, idx) => ({
            title: row.effectiveTitle,
            description: row.description.trim() || undefined,
            category: row.category,
            rawInput: row.parsed!.embedUrl,
            audience: bulkAudience,
            sortOrder: existingMaxOrder + idx + 1,
          }));

    if (payloadItems.length === 0) {
      setActionError(
        language === 'bn'
          ? 'অন্তত ১টি সঠিক YouTube এম্বেড কোড বা লিংক দিন।'
          : 'Please provide at least 1 valid YouTube embed code or URL.'
      );
      return;
    }

    if (payloadItems.length > 30) {
      setActionError(
        language === 'bn'
          ? 'একসাথে সর্বোচ্চ ৩০টি ভিডিও আপলোড করা যাবে। অনুগ্রহ করে ভাগ করে আপলোড করুন।'
          : 'You can upload up to 30 videos per batch.'
      );
      return;
    }

    setSavingBulk(true);
    try {
      const created = await createSupportVideosClient(payloadItems, {
        createdByName: senderDisplayName,
        existingMaxOrder,
      });
      if (created[0]) setSelectedVideoId(created[0].id);
      setShowBulkModal(false);
      setActionSuccess(
        language === 'bn'
          ? `একসাথে ${toBnNumber(created.length)}টি YouTube ভিডিও সফলভাবে যুক্ত হয়েছে! এখন সুপার অ্যাডমিন ও অ্যাডমিনরা সাপোর্টে প্লে করে দেখতে পারবেন।`
          : `Successfully added ${created.length} tutorial video(s).`
      );
    } catch (err: any) {
      setActionError(err?.message || 'Failed to upload bulk videos.');
    } finally {
      setSavingBulk(false);
    }
  };

  const handleToggleActive = async (video: SupportVideoDTO) => {
    if (!isMasterAdmin || togglingActiveId) return;
    setTogglingActiveId(video.id);
    setActionError(null);
    try {
      await updateSupportVideoClient(video, { isActive: !video.isActive });
    } catch (err: any) {
      setActionError(err?.message || 'Could not toggle video visibility.');
    } finally {
      setTogglingActiveId(null);
    }
  };

  const handleDeleteVideo = async (docId: string) => {
    if (!isMasterAdmin || deletingId) return;
    setDeletingId(docId);
    setActionError(null);
    try {
      await deleteSupportVideoClient(docId);
      setConfirmDeleteId(null);
      setActionSuccess(
        language === 'bn' ? 'ভিডিওটি তালিকা থেকে মুছে ফেলা হয়েছে।' : 'Video deleted.'
      );
    } catch (err: any) {
      setActionError(err?.message || 'Could not delete video.');
    } finally {
      setDeletingId(null);
    }
  };

  const countByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: videos.length };
    for (const v of videos) {
      counts[v.category] = (counts[v.category] || 0) + 1;
    }
    return counts;
  }, [videos]);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
            <PlayCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                {language === 'bn'
                  ? 'ভিডিও টিউটোরিয়াল ও ব্যবহার গাইড'
                  : 'Video Tutorials & User Guides'}
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold font-mono tabular-nums">
                {language === 'bn'
                  ? `${toBnNumber(videos.length)}টি ভিডিও`
                  : `${videos.length} videos`}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isMasterAdmin
                ? language === 'bn'
                  ? 'YouTube থেকে ১টি বা একসাথে ১০–১৫টি ভিডিও এম্বেড কোড (<iframe>) অথবা লিংক যুক্ত করুন—সুপার অ্যাডমিন ও অ্যাডমিনরা এখান থেকেই প্লে করে দেখতে পারবেন।'
                  : 'Upload 1 or 10–15+ YouTube embed codes or links—School Super Admins and Admins will play them right inside Support.'
                : language === 'bn'
                ? 'মাস্টার অ্যাডমিনের দেওয়া YouTube ভিডিও গাইড এখান থেকেই সরাসরি প্লে করে দেখুন ও সফটওয়্যার ব্যবহার শিখুন।'
                : 'Watch step-by-step YouTube video guides uploaded by Master Admin directly inside Support.'}
            </p>
          </div>
        </div>

        {isMasterAdmin && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openAddSingleModal}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'bn' ? '১টি ভিডিও যোগ করুন' : 'Add 1 Video'}
              </span>
            </button>
            <button
              type="button"
              onClick={openBulkModal}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ListPlus className="w-4 h-4" />
              <span>
                {language === 'bn'
                  ? 'একসাথে একাধিক ভিডিও (১০–১৫টি)'
                  : 'Bulk Add (10–15 Videos)'}
              </span>
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Inline Video Player */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-rose-600" />
          <span>
            {language === 'bn' ? 'ভিডিও গাইড লোড হচ্ছে...' : 'Loading video guides...'}
          </span>
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-slate-900">
            {language === 'bn'
              ? 'এখনো কোনো ভিডিও টিউটোরিয়াল যোগ করা হয়নি'
              : 'No tutorial videos added yet'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isMasterAdmin
              ? language === 'bn'
                ? 'উপরের "একসাথে একাধিক ভিডিও (১০–১৫টি)" বাটনে ক্লিক করে YouTube থেকে এম্বেড কোড (<iframe>) বা লিংক পেস্ট করে সাথে সাথে আপলোড করুন।'
                : 'Click "Bulk Add (10–15 Videos)" above to paste YouTube embed codes or links.'
              : language === 'bn'
              ? 'মাস্টার অ্যাডমিন ভিডিও টিউটোরিয়াল যোগ করলে সেগুলো এখানে দেখাবে এবং আপনি সরাসরি প্লে করতে পারবেন।'
              : 'Tutorial videos published by Master Admin will appear here for playback.'}
          </p>
          {isMasterAdmin && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={openAddSingleModal}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>{language === 'bn' ? '১টি ভিডিও যোগ করুন' : 'Add 1 Video'}</span>
              </button>
              <button
                type="button"
                onClick={openBulkModal}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  {language === 'bn'
                    ? 'একসাথে ১০–১৫টি ভিডিও আপলোড'
                    : 'Upload 10–15 Videos'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {activeVideo && (
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* 16:9 Embedded YouTube Player */}
                <div className="lg:col-span-8 bg-black">
                  <div className="relative w-full aspect-video">
                    <iframe
                      key={activeVideo.id}
                      src={activeVideo.embedUrl}
                      title={activeVideo.title}
                      className="absolute inset-0 w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>

                {/* Active Video Details & Next/Prev Controls */}
                <div className="lg:col-span-4 p-4 sm:p-5 flex flex-col justify-between gap-4 text-slate-100 bg-slate-900">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-rose-600/20 border border-rose-500/30 text-rose-300 text-[11px] font-bold">
                        {language === 'bn'
                          ? SUPPORT_VIDEO_CATEGORY_LABELS[activeVideo.category]?.bn
                          : SUPPORT_VIDEO_CATEGORY_LABELS[activeVideo.category]?.en}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {language === 'bn'
                          ? `ভিডিও ${toBnNumber(activeIndex + 1)} / ${toBnNumber(
                              filteredVideos.length
                            )}`
                          : `Video ${activeIndex + 1} / ${filteredVideos.length}`}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-black text-white leading-snug">
                      {activeVideo.title}
                    </h3>

                    {activeVideo.description ? (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                        {activeVideo.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {language === 'bn'
                          ? 'ভিডিওটি ফুল-স্ক্রিন করে দেখতে প্লেয়ারের নিচের ডান কোণার ফুলস্ক্রিন আইকনে চাপুন।'
                          : 'Use the fullscreen button in the bottom-right corner of the player for larger view.'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={activeIndex <= 0}
                        onClick={() => {
                          if (activeIndex > 0) {
                            setSelectedVideoId(filteredVideos[activeIndex - 1].id);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>{language === 'bn' ? 'আগের ভিডিও' : 'Previous'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={activeIndex < 0 || activeIndex >= filteredVideos.length - 1}
                        onClick={() => {
                          if (activeIndex < filteredVideos.length - 1) {
                            setSelectedVideoId(filteredVideos[activeIndex + 1].id);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <span>{language === 'bn' ? 'পরের ভিডিও' : 'Next'}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {isMasterAdmin && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-400">
                          {activeVideo.audience === 'all'
                            ? language === 'bn'
                              ? 'দৃশ্যমান: সকল স্টাফ'
                              : 'Visible: All Staff'
                            : language === 'bn'
                            ? 'দৃশ্যমান: Super Admin ও Admin'
                            : 'Visible: Super Admin & Admin'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditSingleModal(activeVideo)}
                          className="text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{language === 'bn' ? 'সম্পাদনা' : 'Edit'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'ভিডিওর নাম বা বিষয় লিখে খুঁজুন...'
                      : 'Search video tutorials by title...'
                  }
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="text-[11px] font-semibold text-slate-500 font-mono tabular-nums">
                {language === 'bn'
                  ? `দেখানো হচ্ছে ${toBnNumber(filteredVideos.length)} / ${toBnNumber(
                      videos.length
                    )}টি`
                  : `Showing ${filteredVideos.length} of ${videos.length}`}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {language === 'bn'
                  ? `সকল (${toBnNumber(videos.length)})`
                  : `All (${videos.length})`}
              </button>
              {ALL_CATEGORIES.map((cat) => {
                const count = countByCategory[cat] || 0;
                if (count === 0 && categoryFilter !== cat) return null;
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      active
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {language === 'bn'
                      ? `${SUPPORT_VIDEO_CATEGORY_LABELS[cat].bn} (${toBnNumber(count)})`
                      : `${SUPPORT_VIDEO_CATEGORY_LABELS[cat].en} (${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Playlist Grid */}
          {filteredVideos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
              {language === 'bn'
                ? 'এই ক্যাটাগরি বা সার্চে কোনো ভিডিও পাওয়া যায়নি।'
                : 'No tutorial videos matched your filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredVideos.map((vid, idx) => {
                const isSelected = activeVideo?.id === vid.id;
                const isConfirmingDelete = confirmDeleteId === vid.id;
                return (
                  <div
                    key={vid.id}
                    className={`bg-white rounded-2xl border overflow-hidden flex flex-col transition-all ${
                      isSelected
                        ? 'border-rose-500 ring-2 ring-rose-500/20 shadow-md'
                        : 'border-slate-200 hover:border-slate-300 shadow-xs'
                    } ${!vid.isActive ? 'opacity-70' : ''}`}
                  >
                    {/* Thumbnail Click to Play */}
                    <button
                      type="button"
                      onClick={() => setSelectedVideoId(vid.id)}
                      className="relative aspect-video bg-slate-900 overflow-hidden group text-left w-full cursor-pointer"
                    >
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-slate-950/30 group-hover:bg-slate-950/45 transition-colors flex items-center justify-center">
                        <span
                          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                            isSelected
                              ? 'bg-rose-600 text-white'
                              : 'bg-white/95 text-rose-600'
                          }`}
                        >
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </span>
                      </div>

                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[10px] font-bold font-mono tabular-nums">
                        #{language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                      </span>

                      {isSelected && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold">
                          {language === 'bn' ? 'চলছে' : 'Playing'}
                        </span>
                      )}

                      {!vid.isActive && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold">
                          {language === 'bn' ? 'লুকানো' : 'Hidden'}
                        </span>
                      )}
                    </button>

                    {/* Card Details */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                            {language === 'bn'
                              ? SUPPORT_VIDEO_CATEGORY_LABELS[vid.category]?.bn
                              : SUPPORT_VIDEO_CATEGORY_LABELS[vid.category]?.en}
                          </span>
                          {isMasterAdmin && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              {vid.audience === 'all'
                                ? language === 'bn'
                                  ? 'সকল স্টাফ'
                                  : 'All'
                                : language === 'bn'
                                ? 'Super/Admin'
                                : 'Admins'}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedVideoId(vid.id)}
                          className="text-left text-xs sm:text-sm font-bold text-slate-900 hover:text-rose-600 line-clamp-2 transition-colors cursor-pointer"
                        >
                          {vid.title}
                        </button>

                        {vid.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2">
                            {vid.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setSelectedVideoId(vid.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>
                            {isSelected
                              ? language === 'bn'
                                ? 'প্লে হচ্ছে'
                                : 'Playing'
                              : language === 'bn'
                              ? 'ভিডিও দেখুন'
                              : 'Play Video'}
                          </span>
                        </button>

                        {isMasterAdmin && (
                          <div className="flex items-center gap-1">
                            {isConfirmingDelete ? (
                              <>
                                <button
                                  type="button"
                                  disabled={deletingId === vid.id}
                                  onClick={() => void handleDeleteVideo(vid.id)}
                                  className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold"
                                >
                                  {deletingId === vid.id
                                    ? '...'
                                    : language === 'bn'
                                    ? 'মুছুন'
                                    : 'Delete'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-bold"
                                >
                                  {language === 'bn' ? 'না' : 'No'}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={togglingActiveId === vid.id}
                                  onClick={() => void handleToggleActive(vid)}
                                  title={
                                    vid.isActive
                                      ? language === 'bn'
                                        ? 'লুকান'
                                        : 'Hide'
                                      : language === 'bn'
                                      ? 'দৃশ্যমান করুন'
                                      : 'Show'
                                  }
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                  {vid.isActive ? (
                                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditSingleModal(vid)}
                                  title={language === 'bn' ? 'সম্পাদনা' : 'Edit'}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(vid.id)}
                                  title={language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ==================== MASTER ADMIN: SINGLE / EDIT VIDEO MODAL ==================== */}
      {showSingleModal && isMasterAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 border border-slate-200 shadow-2xl text-xs max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-black text-slate-900">
                  {editingVideo
                    ? language === 'bn'
                      ? 'টিউটোরিয়াল ভিডিও সম্পাদনা'
                      : 'Edit Tutorial Video'
                    : language === 'bn'
                    ? 'YouTube ভিডিও এম্বেড যুক্ত করুন'
                    : 'Add YouTube Video Embed'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSingleModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleVideo} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn'
                    ? 'YouTube এম্বেড কোড (<iframe>) অথবা ভিডিও লিংক *'
                    : 'YouTube Embed Code (<iframe>) or Video URL *'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={singleRawInput}
                  onChange={(e) => setSingleRawInput(e.target.value)}
                  placeholder='<iframe width="560" height="315" src="https://www.youtube.com/embed/..." ...></iframe> অথবা https://youtu.be/...'
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
                {singleRawInput.trim() && (
                  <div className="mt-2">
                    {singleParsedPreview ? (
                      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                        <img
                          src={singleParsedPreview.thumbnailUrl}
                          alt="YouTube thumbnail preview"
                          className="w-24 h-14 object-cover rounded-lg border border-emerald-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {language === 'bn'
                                ? 'সঠিক YouTube ভিডিও পাওয়া গেছে'
                                : 'Valid YouTube video detected'}
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-700 font-mono truncate mt-0.5">
                            ID: {singleParsedPreview.videoId}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                        {language === 'bn'
                          ? 'সঠিক YouTube এম্বেড কোড (<iframe>) অথবা youtube.com / youtu.be লিংক দিন।'
                          : 'Enter a valid YouTube <iframe> embed code or youtube.com / youtu.be URL.'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn' ? 'ভিডিওর শিরোনাম (Title) *' : 'Video Title *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={singleTitle}
                  onChange={(e) => setSingleTitle(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'যেমন: কীভাবে শিক্ষার্থীর মাসিক ফি আদায় ও রসিদ প্রিন্ট করবেন'
                      : 'e.g. How to collect student fees and print receipt'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                  </label>
                  <select
                    value={singleCategory}
                    onChange={(e) =>
                      setSingleCategory(e.target.value as SupportVideoCategory)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                  >
                    {ALL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {language === 'bn'
                          ? SUPPORT_VIDEO_CATEGORY_LABELS[cat].bn
                          : SUPPORT_VIDEO_CATEGORY_LABELS[cat].en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'কারা দেখতে পারবে' : 'Visible To'}
                  </label>
                  <select
                    value={singleAudience}
                    onChange={(e) =>
                      setSingleAudience(e.target.value as SupportVideoAudience)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                  >
                    <option value="admins">
                      {language === 'bn'
                        ? 'Super Admin ও Admin'
                        : 'Super Admin & Admin'}
                    </option>
                    <option value="all">
                      {language === 'bn' ? 'সবাই (সকল স্টাফ)' : 'All School Staff'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {language === 'bn' ? 'ক্রম নম্বর (Order)' : 'Order #'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={singleSortOrder}
                    onChange={(e) => setSingleSortOrder(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn'
                    ? 'সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)'
                    : 'Short Description (Optional)'}
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={singleDescription}
                  onChange={(e) => setSingleDescription(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'এই ভিডিওতে কোন ধাপগুলো দেখানো হয়েছে...'
                      : 'Brief note about what this tutorial covers...'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSingleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={savingSingle || !singleParsedPreview}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingSingle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {savingSingle
                      ? language === 'bn'
                        ? 'সেভ হচ্ছে...'
                        : 'Saving...'
                      : editingVideo
                      ? language === 'bn'
                        ? 'আপডেট করুন'
                        : 'Update Video'
                      : language === 'bn'
                      ? 'ভিডিও যুক্ত করুন'
                      : 'Save Video'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MASTER ADMIN: BULK UPLOAD (10-15+ VIDEOS) MODAL ==================== */}
      {showBulkModal && isMasterAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 border border-slate-200 shadow-2xl text-xs max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-rose-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {language === 'bn'
                      ? 'একসাথে একাধিক YouTube ভিডিও আপলোড (১০–১৫টি বা তার বেশি)'
                      : 'Bulk Upload Multiple YouTube Videos (10–15+)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? 'একসাথে পেস্ট করে অথবা সারি যোগ করে সর্বোচ্চ ৩০টি ভিডিও একবারে পাবলিশ করতে পারবেন।'
                      : 'Paste multiple embed codes/links or fill multiple rows to publish up to 30 videos at once.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bulk Mode Switcher & Shared Settings */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="inline-flex rounded-xl bg-white p-1 border border-slate-200 w-fit">
                <button
                  type="button"
                  onClick={() => setBulkMode('paste')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    bulkMode === 'paste'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {language === 'bn'
                    ? 'মোড ১: একসাথে কোড/লিংক পেস্ট করুন'
                    : 'Mode 1: Bulk Paste'}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode('rows')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    bulkMode === 'rows'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {language === 'bn'
                    ? 'মোড ২: আলাদা আলাদা সারি (Rows)'
                    : 'Mode 2: Multi-Row Form'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {bulkMode === 'paste' && (
                  <select
                    value={bulkDefaultCategory}
                    onChange={(e) =>
                      setBulkDefaultCategory(e.target.value as SupportVideoCategory)
                    }
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-[11px] font-semibold"
                    title="Default category"
                  >
                    {ALL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {language === 'bn'
                          ? `ডিফল্ট: ${SUPPORT_VIDEO_CATEGORY_LABELS[cat].bn}`
                          : `Default: ${SUPPORT_VIDEO_CATEGORY_LABELS[cat].en}`}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={bulkAudience}
                  onChange={(e) =>
                    setBulkAudience(e.target.value as SupportVideoAudience)
                  }
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-[11px] font-semibold"
                >
                  <option value="admins">
                    {language === 'bn'
                      ? 'দেখবে: Super Admin ও Admin'
                      : 'Audience: Super Admin & Admin'}
                  </option>
                  <option value="all">
                    {language === 'bn'
                      ? 'দেখবে: সবাই (সকল স্টাফ)'
                      : 'Audience: All Staff'}
                  </option>
                </select>
              </div>
            </div>

            <form onSubmit={handleSaveBulkVideos} className="space-y-4">
              {bulkMode === 'paste' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {language === 'bn'
                        ? 'প্রতি লাইনে ১টি করে ১০–১৫টি YouTube এম্বেড কোড (<iframe>) অথবা লিংক পেস্ট করুন'
                        : 'Paste 10–15 YouTube <iframe> embed codes or URLs (one per line)'}
                    </label>
                    <p className="text-[11px] text-slate-500 mb-1.5">
                      {language === 'bn'
                        ? 'শিরোনামসহ দিতে চাইলে লিখুন:  শিরোনাম | <iframe ...></iframe>  অথবা শুধু <iframe ...></iframe> বা লিংক দিন—নিচে শিরোনাম এডিট করা যাবে।'
                        : 'Optional title prefix: "Title | <iframe ...></iframe>" or "Title | https://youtu.be/...". You can also edit titles below.'}
                    </p>
                    <textarea
                      rows={7}
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      placeholder={`ফি আদায় করার নিয়ম | <iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" ...></iframe>\nহাজিরা ও QR সেটআপ | https://youtu.be/...\nরেজাল্ট প্রকাশ | https://www.youtube.com/watch?v=...`}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {bulkParsedEntries.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-slate-700">
                          {language === 'bn'
                            ? `প্রিভিউ (${toBnNumber(
                                validBulkPasteEntries.length
                              )}টি সঠিক / মোট ${toBnNumber(bulkParsedEntries.length)}টি)`
                            : `Preview (${validBulkPasteEntries.length} valid of ${bulkParsedEntries.length})`}
                        </span>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                        {bulkParsedEntries.map((entry) => (
                          <div
                            key={`parsed_${entry.lineNumber}`}
                            className={`p-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5 ${
                              entry.parsed ? 'bg-white' : 'bg-rose-50/70'
                            }`}
                          >
                            {entry.parsed ? (
                              <img
                                src={entry.parsed.thumbnailUrl}
                                alt={entry.title}
                                className="w-20 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-20 h-12 rounded-lg bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                Invalid
                              </div>
                            )}

                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <input
                                type="text"
                                value={entry.title}
                                disabled={!entry.parsed}
                                onChange={(e) =>
                                  setBulkParsedOverrides((prev) => ({
                                    ...prev,
                                    [entry.lineNumber]: {
                                      ...prev[entry.lineNumber],
                                      title: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="ভিডিওর শিরোনাম"
                                className="sm:col-span-7 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold disabled:bg-slate-100"
                              />
                              <select
                                value={entry.category}
                                disabled={!entry.parsed}
                                onChange={(e) =>
                                  setBulkParsedOverrides((prev) => ({
                                    ...prev,
                                    [entry.lineNumber]: {
                                      ...prev[entry.lineNumber],
                                      category: e.target.value as SupportVideoCategory,
                                    },
                                  }))
                                }
                                className="sm:col-span-5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-[11px] font-semibold disabled:bg-slate-100"
                              >
                                {ALL_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {language === 'bn'
                                      ? SUPPORT_VIDEO_CATEGORY_LABELS[cat].bn
                                      : SUPPORT_VIDEO_CATEGORY_LABELS[cat].en}
                                  </option>
                                ))}
                              </select>
                              {entry.error && (
                                <div className="sm:col-span-12 text-[11px] font-semibold text-rose-700">
                                  লাইন #{entry.lineNumber}: {entry.error}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {bulkRows.map((row, idx) => {
                      const rowParsed = row.rawInput.trim()
                        ? parseYouTubeEmbedInput(row.rawInput)
                        : null;
                      return (
                        <div
                          key={row.key}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                        >
                          <div className="sm:col-span-1 flex items-center justify-between sm:justify-center gap-2">
                            <span className="font-mono font-bold text-slate-600">
                              #{language === 'bn' ? toBnNumber(idx + 1) : idx + 1}
                            </span>
                            {bulkRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setBulkRows((prev) =>
                                    prev.filter((r) => r.key !== row.key)
                                  )
                                }
                                className="sm:hidden text-rose-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key ? { ...r, title: e.target.value } : r
                                )
                              )
                            }
                            placeholder={
                              language === 'bn' ? 'ভিডিওর শিরোনাম *' : 'Video Title *'
                            }
                            className="sm:col-span-4 px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs font-semibold"
                          />

                          <select
                            value={row.category}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? {
                                        ...r,
                                        category: e.target.value as SupportVideoCategory,
                                      }
                                    : r
                                )
                              )
                            }
                            className="sm:col-span-2 px-2 py-2 border border-slate-200 rounded-lg bg-white text-[11px] font-semibold"
                          >
                            {ALL_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {language === 'bn'
                                  ? SUPPORT_VIDEO_CATEGORY_LABELS[cat].bn
                                  : SUPPORT_VIDEO_CATEGORY_LABELS[cat].en}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={row.rawInput}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, rawInput: e.target.value }
                                    : r
                                )
                              )
                            }
                            placeholder='<iframe src="..."></iframe> বা লিংক'
                            className={`sm:col-span-4 px-2.5 py-2 border rounded-lg bg-white font-mono text-[11px] ${
                              row.rawInput.trim()
                                ? rowParsed
                                  ? 'border-emerald-400'
                                  : 'border-rose-400'
                                : 'border-slate-200'
                            }`}
                          />

                          <div className="sm:col-span-1 flex items-center justify-end gap-1">
                            {rowParsed && (
                              <img
                                src={rowParsed.thumbnailUrl}
                                alt="Thumb"
                                className="w-10 h-7 rounded object-cover border border-emerald-300"
                              />
                            )}
                            {bulkRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setBulkRows((prev) =>
                                    prev.filter((r) => r.key !== row.key)
                                  )
                                }
                                className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                aria-label="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={bulkRows.length >= 30}
                      onClick={() =>
                        setBulkRows((prev) => [
                          ...prev,
                          ...createEmptyBulkRows(1, prev.length + 1),
                        ])
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>{language === 'bn' ? '১টি সারি যোগ' : 'Add 1 Row'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={bulkRows.length >= 30}
                      onClick={() =>
                        setBulkRows((prev) => [
                          ...prev,
                          ...createEmptyBulkRows(
                            Math.min(5, 30 - prev.length),
                            prev.length + 1
                          ),
                        ])
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 text-rose-600" />
                      <span>
                        {language === 'bn' ? 'আরও ৫টি সারি যোগ' : 'Add 5 More Rows'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500">
                  {bulkMode === 'paste'
                    ? language === 'bn'
                      ? `${toBnNumber(validBulkPasteEntries.length)}টি সঠিক ভিডিও সেভের জন্য প্রস্তুত`
                      : `${validBulkPasteEntries.length} valid video(s) ready to publish`
                    : language === 'bn'
                    ? `${toBnNumber(validBulkRowEntries.length)}টি সঠিক ভিডিও সেভের জন্য প্রস্তুত`
                    : `${validBulkRowEntries.length} valid video(s) ready to publish`}
                </span>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      savingBulk ||
                      (bulkMode === 'paste'
                        ? validBulkPasteEntries.length === 0
                        : validBulkRowEntries.length === 0)
                    }
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingBulk ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>
                      {savingBulk
                        ? language === 'bn'
                          ? 'আপলোড হচ্ছে...'
                          : 'Publishing...'
                        : language === 'bn'
                        ? `সবগুলো আপলোড করুন (${toBnNumber(
                            bulkMode === 'paste'
                              ? validBulkPasteEntries.length
                              : validBulkRowEntries.length
                          )}টি)`
                        : `Publish All (${
                            bulkMode === 'paste'
                              ? validBulkPasteEntries.length
                              : validBulkRowEntries.length
                          })`}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
