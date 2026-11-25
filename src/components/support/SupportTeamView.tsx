import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSchool } from '../../context/SchoolContext';
import {
  SupportCategory,
  SupportMessageDTO,
  SupportTicketDTO,
  SupportTicketStatus,
  SupportVideoDTO,
} from '../../services/saasApi';
import {
  createSupportTicketClient,
  markSupportTicketReadClient,
  sendSupportReplyClient,
  subscribeToSupportMessages,
  subscribeToSupportTickets,
  subscribeToSupportVideos,
  updateSupportTicketStatusClient,
} from '../../services/supportService';
import { compressSupportScreenshot } from '../../utils/storageHelper';
import { resolveSchoolDisplayName } from '../../utils/schoolNameResolver';
import { LauncherIconGrid, LauncherTileItem } from '../common/LauncherIconGrid';
import { SupportVideoGuideSection } from './SupportVideoGuideSection';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Headphones,
  Layers,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  X,
  ZoomIn,
} from 'lucide-react';

interface SupportTeamViewProps {
  embedded?: boolean;
}

const MAX_IMAGES_PER_MESSAGE = 3;

export const SupportTeamView: React.FC<SupportTeamViewProps> = ({ embedded = false }) => {
  const { activeRole, currentUser, saasSession, firebaseUser } = useAuth();
  const { language, toBnNumber } = useLanguage();
  const { schoolProfile } = useSchool();

  const isMasterAdmin =
    activeRole === 'master_admin' || Boolean(saasSession?.principal?.isMasterAdmin);
  const isAdminOrSuperAdmin =
    isMasterAdmin || activeRole === 'super_admin' || activeRole === 'admin';

  const [supportSection, setSupportSection] = useState<'tickets' | 'videos'>('tickets');
  const [supportVideos, setSupportVideos] = useState<SupportVideoDTO[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  const [tickets, setTickets] = useState<SupportTicketDTO[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageDTO[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Ticket Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState<SupportCategory>('technical');
  const [newText, setNewText] = useState('');
  const [newImages, setNewImages] = useState<string[]>([]);
  const [compressingNewImages, setCompressingNewImages] = useState(false);
  const [submittingNew, setSubmittingNew] = useState(false);

  // Reply Composer
  const [replyText, setReplyText] = useState('');
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [compressingReplyImages, setCompressingReplyImages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // UI feedback & image lightbox
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveSchoolId =
    saasSession?.school?.schoolId ||
    saasSession?.principal?.schoolId ||
    currentUser?.schoolId ||
    firebaseUser?.uid ||
    '';

  const effectiveSchoolName = isMasterAdmin
    ? saasSession?.school?.schoolName || 'Platform Master Admin'
    : resolveSchoolDisplayName(schoolProfile, saasSession?.school, language);

  const effectiveSchoolCode = saasSession?.school?.schoolCode || '';

  const senderDisplayName =
    saasSession?.principal?.displayName ||
    (language === 'bn' ? currentUser?.nameBn || currentUser?.name : currentUser?.name) ||
    firebaseUser?.displayName ||
    firebaseUser?.email ||
    (isMasterAdmin ? 'Master Admin' : 'School User');

  const senderEmail =
    saasSession?.principal?.email || currentUser?.email || firebaseUser?.email || '';

  // Subscribe to ticket list
  useEffect(() => {
    setLoadingTickets(true);
    let firstDelivery = true;
    const unsub = subscribeToSupportTickets({
      schoolId: isMasterAdmin ? null : saasSession?.school?.schoolId || currentUser?.schoolId || null,
      uid: firebaseUser?.uid || null,
      isMasterAdmin,
      onTickets: (list) => {
        setTickets(list);
        if (firstDelivery) {
          firstDelivery = false;
          setLoadingTickets(false);
        }
      },
      onError: (err) => {
        setLoadingTickets(false);
        setErrorMsg(err.message);
      },
    });
    const safetyTimer = setTimeout(() => setLoadingTickets(false), 3500);
    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, [isMasterAdmin, saasSession?.school?.schoolId, currentUser?.schoolId, firebaseUser?.uid]);

  // Subscribe to Support Video Tutorials
  useEffect(() => {
    setLoadingVideos(true);
    let firstDelivery = true;
    const unsub = subscribeToSupportVideos({
      isMasterAdmin,
      schoolRole: saasSession?.principal?.schoolRole || activeRole,
      onVideos: (list) => {
        setSupportVideos(list);
        if (firstDelivery) {
          firstDelivery = false;
          setLoadingVideos(false);
        }
      },
      onError: () => {
        setLoadingVideos(false);
      },
    });
    const safetyTimer = setTimeout(() => setLoadingVideos(false), 3500);
    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, [isMasterAdmin, saasSession?.principal?.schoolRole, activeRole, firebaseUser?.uid]);

  // Auto-select first ticket on desktop if none selected yet
  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [tickets, selectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Subscribe to messages of the selected ticket
  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    let firstBatch = true;
    const unsub = subscribeToSupportMessages({
      ticketId: selectedTicketId,
      onMessages: (list) => {
        setMessages(list);
        if (firstBatch) {
          firstBatch = false;
          setLoadingMessages(false);
        }
      },
      onTicketUpdated: (updated) => {
        setTickets((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
      },
      onError: (err) => {
        setLoadingMessages(false);
        setErrorMsg(err.message);
      },
    });

    if (selectedTicket) {
      void markSupportTicketReadClient(selectedTicket, isMasterAdmin);
    }

    const safetyTimer = setTimeout(() => setLoadingMessages(false), 3000);
    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, [selectedTicketId, isMasterAdmin]);

  // Scroll chat to newest message
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, selectedTicketId]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.schoolName.toLowerCase().includes(q) ||
        t.schoolId.toLowerCase().includes(q) ||
        (t.createdByName || '').toLowerCase().includes(q) ||
        t.createdByEmail.toLowerCase().includes(q) ||
        (t.lastMessagePreview || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, searchQuery]);

  const unreadCount = useMemo(
    () =>
      tickets.filter((t) => (isMasterAdmin ? t.unreadByMaster : t.unreadBySchool)).length,
    [tickets, isMasterAdmin]
  );

  const handleCompressFiles = async (
    files: FileList | null,
    currentList: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setBusy: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    const remaining = MAX_IMAGES_PER_MESSAGE - currentList.length;
    if (remaining <= 0) {
      setErrorMsg(
        language === 'bn'
          ? `একটি মেসেজে সর্বোচ্চ ${toBnNumber(MAX_IMAGES_PER_MESSAGE)}টি ছবি যুক্ত করা যাবে।`
          : `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`
      );
      return;
    }

    const chosen = Array.from(files).slice(0, remaining);
    setBusy(true);
    try {
      const compressed = await Promise.all(
        chosen.map((file) => compressSupportScreenshot(file, 1080))
      );
      setList((prev) => [...prev, ...compressed.filter(Boolean)].slice(0, MAX_IMAGES_PER_MESSAGE));
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (language === 'bn'
            ? 'ছবি প্রক্রিয়াকরণ করতে সমস্যা হয়েছে। অনুগ্রহ করে সঠিক ছবি নির্বাচন করুন।'
            : 'Failed to process selected image(s).')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingNew) return;
    setErrorMsg(null);

    if (!newSubject.trim()) {
      setErrorMsg(
        language === 'bn' ? 'সমস্যার বিষয় (Subject) লিখুন।' : 'Please enter a subject.'
      );
      return;
    }
    if (!newText.trim() && newImages.length === 0) {
      setErrorMsg(
        language === 'bn'
          ? 'সমস্যার বিবরণ লিখুন অথবা স্ক্রিনশট/ছবি আপলোড করুন।'
          : 'Please describe your issue or upload a screenshot.'
      );
      return;
    }

    setSubmittingNew(true);
    try {
      const res = await createSupportTicketClient({
        subject: newSubject.trim(),
        category: newCategory,
        text: newText.trim(),
        imageUrls: newImages,
        schoolId: effectiveSchoolId || 'SCHOOL',
        schoolName: effectiveSchoolName || effectiveSchoolId || 'School',
        schoolCode: effectiveSchoolCode || undefined,
        senderName: senderDisplayName,
        senderEmail,
        senderSchoolRole: activeRole,
        isMasterAdmin,
      });

      setTickets((prev) => {
        const without = prev.filter((t) => t.id !== res.ticket.id);
        return [res.ticket, ...without];
      });
      setSelectedTicketId(res.ticket.id);
      setMessages([res.message]);
      setShowNewModal(false);
      setNewSubject('');
      setNewCategory('technical');
      setNewText('');
      setNewImages([]);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (language === 'bn'
            ? 'সাপোর্ট মেসেজ পাঠানো সম্ভব হয়নি।'
            : 'Failed to submit support request.')
      );
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || sendingReply) return;
    if (!replyText.trim() && replyImages.length === 0) return;

    setErrorMsg(null);
    setSendingReply(true);
    try {
      const res = await sendSupportReplyClient({
        ticket: selectedTicket,
        text: replyText.trim(),
        imageUrls: replyImages,
        senderName: senderDisplayName,
        senderEmail,
        senderSchoolRole: activeRole,
        isMasterAdmin,
      });

      setTickets((prev) => {
        const others = prev.filter((t) => t.id !== res.ticket.id);
        return [res.ticket, ...others];
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setReplyText('');
      setReplyImages([]);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (language === 'bn'
            ? 'রিপ্লাই পাঠানো যায়নি। আবার চেষ্টা করুন।'
            : 'Failed to send reply.')
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleToggleStatus = async (nextStatus: SupportTicketStatus) => {
    if (!selectedTicket || updatingStatus) return;
    setUpdatingStatus(true);
    setErrorMsg(null);
    try {
      const updated = await updateSupportTicketStatusClient(selectedTicket, nextStatus);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update ticket status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const categoryLabels: Record<SupportCategory, { bn: string; en: string }> = {
    technical: { bn: 'টেকনিক্যাল / এরর', en: 'Technical Issue' },
    billing: { bn: 'বিলিং ও সাবস্ক্রিপশন', en: 'Billing & Plan' },
    training: { bn: 'ব্যবহার বুঝতে অসুবিধা', en: 'How-To / Guidance' },
    data: { bn: 'ডাটা / ইমপোর্ট', en: 'Data & Import' },
    other: { bn: 'অন্যান্য', en: 'Other' },
  };

  const statusMeta: Record<
    SupportTicketStatus,
    { bn: string; en: string; cls: string }
  > = {
    open: {
      bn: 'অপেক্ষমাণ (Open)',
      en: 'Open',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    replied: {
      bn: 'ফিডব্যাক পাওয়া গেছে',
      en: 'Replied',
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    resolved: {
      bn: 'সমাধান হয়েছে',
      en: 'Resolved',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const showVideosTile = isAdminOrSuperAdmin || supportVideos.length > 0;

  const supportLauncherItems: LauncherTileItem[] = [
    {
      id: 'all',
      label: language === 'bn' ? 'সকল টিকেট' : 'All Tickets',
      icon: Layers,
      color: 'blue',
      active: supportSection === 'tickets' && statusFilter === 'all',
      badge: tickets.length || undefined,
      onClick: () => {
        setSupportSection('tickets');
        setStatusFilter('all');
      },
    },
    {
      id: 'open',
      label: language === 'bn' ? 'অপেক্ষমাণ' : 'Open',
      icon: Clock,
      color: 'amber',
      active: supportSection === 'tickets' && statusFilter === 'open',
      badge: tickets.filter((t) => t.status === 'open').length || undefined,
      onClick: () => {
        setSupportSection('tickets');
        setStatusFilter('open');
      },
    },
    {
      id: 'replied',
      label: language === 'bn' ? 'উত্তর পাওয়া' : 'Replied',
      icon: Headphones,
      color: 'teal',
      active: supportSection === 'tickets' && statusFilter === 'replied',
      badge: tickets.filter((t) => t.status === 'replied').length || undefined,
      onClick: () => {
        setSupportSection('tickets');
        setStatusFilter('replied');
      },
    },
    {
      id: 'resolved',
      label: language === 'bn' ? 'সমাধান' : 'Resolved',
      icon: CheckCircle2,
      color: 'purple',
      active: supportSection === 'tickets' && statusFilter === 'resolved',
      badge: tickets.filter((t) => t.status === 'resolved').length || undefined,
      onClick: () => {
        setSupportSection('tickets');
        setStatusFilter('resolved');
      },
    },
    ...(showVideosTile
      ? [
          {
            id: 'videos',
            label: language === 'bn' ? 'ভিডিও গাইড' : 'Video Guides',
            icon: PlayCircle,
            color: 'red' as const,
            active: supportSection === 'videos',
            badge: supportVideos.length || undefined,
            onClick: () => setSupportSection('videos'),
          },
        ]
      : []),
    ...(!isMasterAdmin
      ? [
          {
            id: 'new_ticket',
            label: language === 'bn' ? 'নতুন সমস্যা' : 'New Request',
            icon: MessageSquarePlus,
            color: 'green' as const,
            onClick: () => {
              setErrorMsg(null);
              setShowNewModal(true);
            },
          },
        ]
      : []),
  ];

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* App-Launcher Icon Tile Grid */}
      <LauncherIconGrid items={supportLauncherItems} columns={6} compact />

      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                {language === 'bn'
                  ? 'সাপোর্ট টিম ও মাস্টার অ্যাডমিন হেল্প ডেস্ক'
                  : 'Support Team & Master Admin Help Desk'}
              </h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold">
                  {language === 'bn'
                    ? `${toBnNumber(unreadCount)}টি নতুন মেসেজ`
                    : `${unreadCount} unread`}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isMasterAdmin
                ? language === 'bn'
                  ? 'সকল স্কুলের সমস্যা দেখুন, স্ক্রিনশট/ছবি আপলোড করে চ্যাট করুন এবং ভিডিও গাইড ট্যাবে YouTube টিউটোরিয়াল আপলোড করুন।'
                  : 'Review school issues, reply with screenshots, and publish YouTube tutorial videos in the Video Guides tab.'
                : language === 'bn'
                ? 'ভিডিও গাইডে ক্লিক করে টিউটোরিয়াল দেখুন অথবা সমস্যা লিখে ছবি/স্ক্রিনশট পাঠান—মাস্টার অ্যাডমিন সরাসরি সমাধান দেবেন।'
                : 'Watch tutorial videos in Video Guides or send a support ticket with screenshots.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showVideosTile && (
            <button
              type="button"
              onClick={() =>
                setSupportSection((prev) => (prev === 'videos' ? 'tickets' : 'videos'))
              }
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer border whitespace-nowrap shrink-0 ${
                supportSection === 'videos'
                  ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
            >
              {supportSection === 'videos' ? (
                <>
                  <Layers className="w-4 h-4" />
                  <span>
                    {language === 'bn' ? 'সাপোর্ট টিকেটে ফিরুন' : 'Back to Tickets'}
                  </span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>
                    {language === 'bn'
                      ? `ভিডিও গাইড (${toBnNumber(supportVideos.length)})`
                      : `Video Guides (${supportVideos.length})`}
                  </span>
                </>
              )}
            </button>
          )}

          {!isMasterAdmin && (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setShowNewModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>
                {language === 'bn' ? 'নতুন সমস্যা পাঠান' : 'New Support Request'}
              </span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-700 hover:text-rose-900 font-bold px-1.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {supportSection === 'videos' ? (
        <SupportVideoGuideSection
          videos={supportVideos}
          loading={loadingVideos}
          isMasterAdmin={isMasterAdmin}
          senderDisplayName={senderDisplayName}
        />
      ) : (
        <>
          {showVideosTile && supportVideos.length > 0 && !isMasterAdmin && (
            <button
              type="button"
              onClick={() => setSupportSection('videos')}
              className="w-full p-3 rounded-2xl bg-rose-50/80 hover:bg-rose-100/80 border border-rose-200 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-xl bg-rose-600 text-white shrink-0">
                  <PlayCircle className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-black text-rose-950 truncate">
                    {language === 'bn'
                      ? `সফটওয়্যার ব্যবহারের ${toBnNumber(
                          supportVideos.length
                        )}টি ভিডিও টিউটোরিয়াল দেখুন`
                      : `Watch ${supportVideos.length} Video Tutorial Guide(s)`}
                  </div>
                  <div className="text-[11px] text-rose-700 truncate">
                    {language === 'bn'
                      ? 'এখানে ক্লিক করলেই সাপোর্টের ভেতরেই YouTube ভিডিও প্লে হবে।'
                      : 'Click here to play YouTube guides directly inside Support.'}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold whitespace-nowrap shrink-0">
                {language === 'bn' ? 'ভিডিও দেখুন →' : 'Watch Videos →'}
              </span>
            </button>
          )}

          {/* Main Split View: Ticket Inbox + Two-Way Chat */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
        {/* Left Sidebar: Ticket List */}
        <div
          className={`lg:col-span-4 xl:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col ${
            selectedTicketId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Search + Status Filters */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isMasterAdmin
                    ? language === 'bn'
                      ? 'স্কুল, কোড বা বিষয় দিয়ে খুঁজুন...'
                      : 'Search school, ID, or subject...'
                    : language === 'bn'
                    ? 'বিষয় বা বার্তা দিয়ে খুঁজুন...'
                    : 'Search tickets...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['all', 'open', 'replied', 'resolved'] as const).map((st) => {
                const active = statusFilter === st;
                const label =
                  st === 'all'
                    ? language === 'bn'
                      ? 'সকল'
                      : 'All'
                    : language === 'bn'
                    ? st === 'open'
                      ? 'অপেক্ষমাণ'
                      : st === 'replied'
                      ? 'উত্তর পাওয়া'
                      : 'সমাধান'
                    : st === 'open'
                    ? 'Open'
                    : st === 'replied'
                    ? 'Replied'
                    : 'Resolved';
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tickets Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[540px]">
            {loadingTickets ? (
              <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span>
                  {language === 'bn' ? 'সাপোর্ট বার্তা লোড হচ্ছে...' : 'Loading support threads...'}
                </span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Headphones className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-700">
                  {language === 'bn'
                    ? 'কোনো সাপোর্ট কথোপকথন পাওয়া যায়নি'
                    : 'No support conversations yet'}
                </div>
                <p className="text-[11px] text-slate-500">
                  {isMasterAdmin
                    ? language === 'bn'
                      ? 'কোনো স্কুল থেকে সমস্যা পাঠালে এখানে সরাসরি দেখাবে।'
                      : 'When any school submits a support message, it will appear here.'
                    : language === 'bn'
                    ? 'সিস্টেম ব্যবহারে কোনো সমস্যা হলে "নতুন সমস্যা পাঠান" বাটনে ক্লিক করে লিখে ও স্ক্রিনশট দিয়ে জানান।'
                    : 'Click "New Support Request" to message Master Admin with screenshots.'}
                </p>
                {!isMasterAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowNewModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center space-x-1.5"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'প্রথম বার্তা পাঠান' : 'Start Support Chat'}</span>
                  </button>
                )}
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = t.id === selectedTicketId;
                const isUnread = isMasterAdmin ? t.unreadByMaster : t.unreadBySchool;
                const meta = statusMeta[t.status] || statusMeta.open;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-blue-50/80'
                        : isUnread
                        ? 'bg-amber-50/50 hover:bg-amber-50/80'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isUnread && (
                            <span
                              className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                              title="Unread"
                            />
                          )}
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {t.subject}
                          </span>
                        </div>
                        {isMasterAdmin && (
                          <div className="text-[11px] font-semibold text-blue-700 truncate mt-0.5">
                            {t.schoolName} ({t.schoolId})
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${meta.cls}`}
                      >
                        {language === 'bn' ? meta.bn : meta.en}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 line-clamp-2">
                      {t.lastSenderRole === 'master_admin'
                        ? language === 'bn'
                          ? 'মাস্টার অ্যাডমিন: '
                          : 'Master Admin: '
                        : ''}
                      {t.lastMessagePreview || ''}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>
                        {language === 'bn'
                          ? categoryLabels[t.category]?.bn
                          : categoryLabels[t.category]?.en}
                      </span>
                      <span>{formatTime(t.updatedAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Conversation Thread & Reply Box */}
        <div
          className={`lg:col-span-8 xl:col-span-8 flex flex-col bg-slate-50/40 ${
            selectedTicketId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <Headphones className="w-6 h-6" />
              </div>
              <div className="font-bold text-slate-700 text-sm">
                {language === 'bn'
                  ? 'বাম পাশ থেকে একটি কথোপকথন নির্বাচন করুন'
                  : 'Select a support conversation to view chat'}
              </div>
              <p className="max-w-sm text-[11px] text-slate-500">
                {isMasterAdmin
                  ? language === 'bn'
                    ? 'স্কুলের পাঠানো সমস্যা ও স্ক্রিনশট দেখে আপনি সরাসরি ছবি ও লিখিত উত্তর দিতে পারবেন।'
                    : 'View school issues and screenshots, then reply directly with feedback and images.'
                  : language === 'bn'
                  ? 'অথবা "নতুন সমস্যা পাঠান" বাটনে ক্লিক করে আপনার সমস্যার ছবি ও বিবরণ পাঠান।'
                  : 'Or submit a new support request with screenshots.'}
              </p>
            </div>
          ) : (
            <>
              {/* Active Conversation Header */}
              <div className="p-3.5 sm:p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedTicketId(null)}
                    className="lg:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
                    aria-label="Back to ticket list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {selectedTicket.subject}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-700">
                        {selectedTicket.schoolName} ({selectedTicket.schoolId})
                      </span>
                      <span>•</span>
                      <span>
                        {selectedTicket.createdByName || selectedTicket.createdByEmail} (
                        {selectedTicket.createdByRole})
                      </span>
                      <span>•</span>
                      <span>
                        {language === 'bn'
                          ? categoryLabels[selectedTicket.category]?.bn
                          : categoryLabels[selectedTicket.category]?.en}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                      (statusMeta[selectedTicket.status] || statusMeta.open).cls
                    }`}
                  >
                    {language === 'bn'
                      ? (statusMeta[selectedTicket.status] || statusMeta.open).bn
                      : (statusMeta[selectedTicket.status] || statusMeta.open).en}
                  </span>

                  {selectedTicket.status !== 'resolved' ? (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleToggleStatus('resolved')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {language === 'bn' ? 'সমাধান হয়েছে' : 'Mark Resolved'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleToggleStatus('open')}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>
                        {language === 'bn' ? 'পুনরায় চালু করুন' : 'Reopen'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[420px]">
                {loadingMessages && messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                    <span>{language === 'bn' ? 'মেসেজ লোড হচ্ছে...' : 'Loading messages...'}</span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = isMasterAdmin
                      ? msg.senderRole === 'master_admin'
                      : msg.senderRole === 'school';
                    const isFromMaster = msg.senderRole === 'master_admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 border text-xs space-y-2 ${
                            isFromMaster
                              ? isMine
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-800 border-blue-200'
                              : isMine
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-800 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px]">
                            <div className="flex items-center gap-1.5 font-bold">
                              {isFromMaster && (
                                <ShieldCheck
                                  className={`w-3.5 h-3.5 ${
                                    isMine ? 'text-emerald-400' : 'text-blue-600'
                                  }`}
                                />
                              )}
                              <span>
                                {isFromMaster
                                  ? language === 'bn'
                                    ? 'মাস্টার অ্যাডমিন (Support Team)'
                                    : 'Master Admin (Support)'
                                  : `${msg.senderName}${
                                      msg.senderSchoolRole ? ` (${msg.senderSchoolRole})` : ''
                                    }`}
                              </span>
                            </div>
                            <span
                              className={
                                isMine ? 'text-white/70' : 'text-slate-400'
                              }
                            >
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>

                          {msg.text && (
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {msg.text}
                            </p>
                          )}

                          {Array.isArray(msg.imageUrls) && msg.imageUrls.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                              {msg.imageUrls.map((url, idx) => (
                                <button
                                  key={`${msg.id}_img_${idx}`}
                                  type="button"
                                  onClick={() => setLightboxImage(url)}
                                  className="group relative rounded-xl overflow-hidden border border-black/10 bg-slate-100 aspect-video"
                                >
                                  <img
                                    src={url}
                                    alt={`Attachment ${idx + 1}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                  <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 flex items-center justify-center transition-colors">
                                    <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input Composer */}
              <form
                onSubmit={handleSendReply}
                className="p-3.5 bg-white border-t border-slate-200 space-y-2.5"
              >
                {replyImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {replyImages.map((imgUrl, idx) => (
                      <div
                        key={`reply_preview_${idx}`}
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={imgUrl}
                          alt={`Selected ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setReplyImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-rose-600"
                          aria-label="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleCompressFiles(
                        e.target.files,
                        replyImages,
                        setReplyImages,
                        setCompressingReplyImages
                      );
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={
                      compressingReplyImages ||
                      replyImages.length >= MAX_IMAGES_PER_MESSAGE
                    }
                    onClick={() => replyFileInputRef.current?.click()}
                    title={
                      language === 'bn'
                        ? 'ছবি / স্ক্রিনশট যুক্ত করুন (সর্বোচ্চ ৩টি)'
                        : 'Attach image / screenshot (max 3)'
                    }
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 shrink-0 disabled:opacity-50"
                  >
                    {compressingReplyImages ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                  </button>

                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isMasterAdmin
                        ? language === 'bn'
                          ? 'স্কুলকে ফিডব্যাক / সমাধান লিখুন (ছবি সহ চ্যাট করতে পাশে ছবি আইকনে চাপুন)...'
                          : 'Write feedback or solution to the school (attach screenshots on the left)...'
                        : language === 'bn'
                        ? 'আপনার সমস্যা বা প্রশ্ন লিখুন (স্ক্রিনশট দিতে চাইলে ছবি বাটনে ক্লিক করুন)...'
                        : 'Type your message or question (attach screenshots on the left)...'
                    }
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 resize-none"
                  />

                  <button
                    type="submit"
                    disabled={
                      sendingReply ||
                      compressingReplyImages ||
                      (!replyText.trim() && replyImages.length === 0)
                    }
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {sendingReply ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {language === 'bn' ? 'পাঠান' : 'Send'}
                    </span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
        </>
      )}

      {/* NEW SUPPORT REQUEST MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 shadow-2xl text-xs max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Headphones className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">
                  {language === 'bn'
                    ? 'সাপোর্ট টিমে নতুন সমস্যা পাঠান'
                    : 'Submit New Support Request'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn' ? 'সমস্যার ধরন' : 'Category'}
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as SupportCategory)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                >
                  {(Object.keys(categoryLabels) as SupportCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {language === 'bn' ? categoryLabels[cat].bn : categoryLabels[cat].en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn' ? 'সমস্যার বিষয় (Subject) *' : 'Subject *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={240}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'যেমন: শিক্ষার্থীর ফি রসিদ বা লগইন বুঝতে পারছি না'
                      : 'e.g. Need help with student fee invoice or attendance'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {language === 'bn'
                    ? 'কোথায় সমস্যা হচ্ছে বা বুঝতে পারছেন না বিস্তারিত লিখুন *'
                    : 'Describe your issue or question *'}
                </label>
                <textarea
                  rows={4}
                  maxLength={3500}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'কোন পেজে সমস্যা হচ্ছে তা বিস্তারিত লিখুন...'
                      : 'Explain what happened or which screen you need help with...'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    {language === 'bn'
                      ? 'সমস্যার স্ক্রিনশট / ছবি আপলোড (সর্বোচ্চ ৩টি)'
                      : 'Upload Screenshots / Photos (Max 3)'}
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {language === 'bn'
                      ? `${toBnNumber(newImages.length)}/${toBnNumber(MAX_IMAGES_PER_MESSAGE)}`
                      : `${newImages.length}/${MAX_IMAGES_PER_MESSAGE}`}
                  </span>
                </div>

                <input
                  ref={newFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleCompressFiles(
                      e.target.files,
                      newImages,
                      setNewImages,
                      setCompressingNewImages
                    );
                    e.target.value = '';
                  }}
                />

                <div className="flex flex-wrap gap-2.5">
                  {newImages.map((imgUrl, idx) => (
                    <div
                      key={`new_img_${idx}`}
                      className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
                    >
                      <img
                        src={imgUrl}
                        alt={`Screenshot ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNewImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-rose-600"
                        aria-label="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {newImages.length < MAX_IMAGES_PER_MESSAGE && (
                    <button
                      type="button"
                      disabled={compressingNewImages}
                      onClick={() => newFileInputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400 text-slate-600 flex flex-col items-center justify-center gap-1 transition-colors"
                    >
                      {compressingNewImages ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      ) : (
                        <ImagePlus className="w-5 h-5 text-blue-600" />
                      )}
                      <span className="text-[10px] font-bold">
                        {language === 'bn' ? 'ছবি দিন' : 'Add Photo'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submittingNew || compressingNewImages}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingNew ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {submittingNew
                      ? language === 'bn'
                        ? 'পাঠানো হচ্ছে...'
                        : 'Submitting...'
                      : language === 'bn'
                      ? 'সাপোর্টে পাঠান'
                      : 'Send to Support'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMAGE LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative bg-white rounded-2xl p-2 max-w-3xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg hover:bg-rose-600"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxImage}
              alt="Support attachment preview"
              className="w-full max-h-[82vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
