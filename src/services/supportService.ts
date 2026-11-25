import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  SaaSApi,
  SupportCategory,
  SupportMessageDTO,
  SupportTicketDTO,
  SupportTicketStatus,
  SupportVideoAudience,
  SupportVideoCategory,
  SupportVideoDTO,
  isSaaSBackendUnavailableError,
} from './saasApi';
import { parseYouTubeEmbedInput } from '../utils/youtubeEmbed';

export const SUPPORT_UPDATED_EVENT = 'support_tickets_updated';

export function emitSupportUpdated(tickets?: SupportTicketDTO[]) {
  try {
    window.dispatchEvent(
      new CustomEvent(SUPPORT_UPDATED_EVENT, { detail: { tickets } })
    );
  } catch {
    // ignore outside browser window
  }
}

export function sortTicketsDesc(tickets: SupportTicketDTO[]): SupportTicketDTO[] {
  return [...tickets].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(
      String(a.updatedAt || a.createdAt || '')
    )
  );
}

export function sortMessagesAsc(messages: SupportMessageDTO[]): SupportMessageDTO[] {
  return [...messages].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  );
}

function buildPreview(text: string, imageCount: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean) {
    return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
  }
  return imageCount > 1 ? `[${imageCount}টি ছবি সংযুক্ত]` : '[ছবি সংযুক্ত]';
}

export interface SubscribeSupportTicketsParams {
  schoolId?: string | null;
  uid?: string | null;
  isMasterAdmin: boolean;
  onTickets: (tickets: SupportTicketDTO[]) => void;
  onError?: (err: Error) => void;
}

/**
 * Real-time subscription for Support Tickets:
 * - Attaches live Firestore onSnapshot when auth.currentUser is signed in
 * - Fetches immediately via Backend Admin SDK API (/api/saas/support/tickets)
 *   so everything works even before firestore.rules are published or when offline
 */
export function subscribeToSupportTickets({
  schoolId,
  uid,
  isMasterAdmin,
  onTickets,
  onError,
}: SubscribeSupportTicketsParams): Unsubscribe {
  let cancelled = false;
  let unsubSnapshot: Unsubscribe | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const deliver = (list: SupportTicketDTO[]) => {
    if (cancelled) return;
    const sorted = sortTicketsDesc(list);
    onTickets(sorted);
    emitSupportUpdated(sorted);
  };

  const fetchViaApi = async () => {
    if (cancelled || !auth.currentUser) return;
    try {
      const res = await SaaSApi.listSupportTickets();
      if (!cancelled && Array.isArray(res.tickets)) {
        deliver(res.tickets);
      }
    } catch (err: any) {
      if (!isSaaSBackendUnavailableError(err) && onError && !cancelled) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const startApiPollingFallback = () => {
    if (cancelled || pollTimer) return;
    pollTimer = setInterval(() => {
      void fetchViaApi();
    }, 8000);
  };

  // Immediate API load so UI renders reliably
  void fetchViaApi();

  // Attach Firestore real-time stream if user is authenticated
  if (auth.currentUser) {
    try {
      const colRef = collection(db, 'support_tickets');
      const q = isMasterAdmin
        ? query(colRef)
        : schoolId
        ? query(colRef, where('schoolId', '==', schoolId))
        : uid
        ? query(colRef, where('createdByUid', '==', uid))
        : null;

      if (q) {
        unsubSnapshot = onSnapshot(
          q,
          (snap) => {
            if (cancelled) return;
            const list = snap.docs
              .map((d) => d.data() as SupportTicketDTO)
              .filter((t) => Boolean(t?.id));
            // Only replace with snapshot when snapshot returns data or rules allow reading empty collection
            deliver(list);
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'support_tickets');
            // Fall back smoothly to Admin SDK API polling if client rules are not yet deployed
            startApiPollingFallback();
          }
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'support_tickets');
      startApiPollingFallback();
    }
  }

  return () => {
    cancelled = true;
    if (unsubSnapshot) unsubSnapshot();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export interface SubscribeSupportMessagesParams {
  ticketId: string;
  onMessages: (messages: SupportMessageDTO[]) => void;
  onTicketUpdated?: (ticket: SupportTicketDTO) => void;
  onError?: (err: Error) => void;
}

/**
 * Real-time subscription for messages inside an active Support Ticket.
 */
export function subscribeToSupportMessages({
  ticketId,
  onMessages,
  onTicketUpdated,
  onError,
}: SubscribeSupportMessagesParams): Unsubscribe {
  let cancelled = false;
  let unsubMessages: Unsubscribe | null = null;
  let unsubTicket: Unsubscribe | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const fetchViaApi = async () => {
    if (cancelled || !auth.currentUser || !ticketId) return;
    try {
      const res = await SaaSApi.listSupportMessages(ticketId);
      if (cancelled) return;
      if (res.ticket && onTicketUpdated) {
        onTicketUpdated(res.ticket);
      }
      if (Array.isArray(res.messages)) {
        onMessages(sortMessagesAsc(res.messages));
      }
    } catch (err: any) {
      if (!isSaaSBackendUnavailableError(err) && onError && !cancelled) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const startApiPollingFallback = () => {
    if (cancelled || pollTimer) return;
    pollTimer = setInterval(() => {
      void fetchViaApi();
    }, 5000);
  };

  void fetchViaApi();

  if (auth.currentUser && ticketId) {
    try {
      const msgQuery = query(
        collection(db, 'support_tickets', ticketId, 'messages'),
        orderBy('createdAt', 'asc')
      );
      unsubMessages = onSnapshot(
        msgQuery,
        (snap) => {
          if (cancelled) return;
          const msgs = snap.docs
            .map((d) => d.data() as SupportMessageDTO)
            .filter((m) => Boolean(m?.id));
          onMessages(sortMessagesAsc(msgs));
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `support_tickets/${ticketId}/messages`
          );
          startApiPollingFallback();
        }
      );

      unsubTicket = onSnapshot(
        doc(db, 'support_tickets', ticketId),
        (snap) => {
          if (cancelled || !snap.exists()) return;
          if (onTicketUpdated) {
            onTicketUpdated(snap.data() as SupportTicketDTO);
          }
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.GET,
            `support_tickets/${ticketId}`
          );
        }
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.LIST,
        `support_tickets/${ticketId}/messages`
      );
      startApiPollingFallback();
    }
  }

  return () => {
    cancelled = true;
    if (unsubMessages) unsubMessages();
    if (unsubTicket) unsubTicket();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export interface CreateSupportTicketClientInput {
  subject: string;
  category: SupportCategory;
  text: string;
  imageUrls: string[];
  schoolId: string;
  schoolName: string;
  schoolCode?: string;
  senderName: string;
  senderEmail: string;
  senderSchoolRole: string;
  isMasterAdmin: boolean;
}

export async function createSupportTicketClient(
  input: CreateSupportTicketClientInput
): Promise<{ ticket: SupportTicketDTO; message: SupportMessageDTO }> {
  try {
    const res = await SaaSApi.createSupportTicket({
      subject: input.subject,
      category: input.category,
      text: input.text,
      imageUrls: input.imageUrls,
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      schoolCode: input.schoolCode,
    });
    emitSupportUpdated();
    return { ticket: res.ticket, message: res.message };
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to create a support request.');
    }
    const nowIso = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 7);
    const ticketId = `tkt_${Date.now()}_${rand}`;
    const messageId = `msg_${Date.now()}_${rand}`;
    const senderRole = input.isMasterAdmin ? 'master_admin' : 'school';

    const ticket: SupportTicketDTO = {
      id: ticketId,
      schoolId: input.schoolId || user.uid,
      schoolName: input.schoolName || input.schoolId || 'School',
      ...(input.schoolCode ? { schoolCode: input.schoolCode } : {}),
      createdByUid: user.uid,
      createdByName: input.senderName,
      createdByEmail: input.senderEmail || user.email || '',
      createdByRole: input.senderSchoolRole,
      subject: input.subject.trim().slice(0, 240),
      category: input.category,
      status: input.isMasterAdmin ? 'replied' : 'open',
      lastMessagePreview: buildPreview(input.text, input.imageUrls.length),
      lastSenderRole: senderRole,
      unreadByMaster: !input.isMasterAdmin,
      unreadBySchool: input.isMasterAdmin,
      messageCount: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const message: SupportMessageDTO = {
      id: messageId,
      ticketId,
      schoolId: ticket.schoolId,
      ticketCreatorUid: user.uid,
      senderUid: user.uid,
      senderName: input.senderName,
      senderEmail: input.senderEmail || user.email || '',
      senderRole,
      senderSchoolRole: input.senderSchoolRole,
      text: input.text.trim().slice(0, 3500),
      imageUrls: input.imageUrls.slice(0, 3),
      createdAt: nowIso,
    };

    try {
      const batch = writeBatch(db);
      const tRef = doc(db, 'support_tickets', ticketId);
      const mRef = doc(db, 'support_tickets', ticketId, 'messages', messageId);
      batch.set(tRef, ticket);
      batch.set(mRef, message);
      await batch.commit();
      emitSupportUpdated();
      return { ticket, message };
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.CREATE, `support_tickets/${ticketId}`);
      throw fsErr;
    }
  }
}

export interface SendSupportReplyClientInput {
  ticket: SupportTicketDTO;
  text: string;
  imageUrls: string[];
  senderName: string;
  senderEmail: string;
  senderSchoolRole: string;
  isMasterAdmin: boolean;
}

export async function sendSupportReplyClient(
  input: SendSupportReplyClientInput
): Promise<{ ticket: SupportTicketDTO; message: SupportMessageDTO }> {
  try {
    const res = await SaaSApi.sendSupportMessage(input.ticket.id, {
      text: input.text,
      imageUrls: input.imageUrls,
    });
    emitSupportUpdated();
    return { ticket: res.ticket, message: res.message };
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to send support reply.');
    }
    const nowIso = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 7);
    const messageId = `msg_${Date.now()}_${rand}`;
    const senderRole = input.isMasterAdmin ? 'master_admin' : 'school';

    const message: SupportMessageDTO = {
      id: messageId,
      ticketId: input.ticket.id,
      schoolId: input.ticket.schoolId,
      ticketCreatorUid: input.ticket.createdByUid,
      senderUid: user.uid,
      senderName: input.senderName,
      senderEmail: input.senderEmail || user.email || '',
      senderRole,
      senderSchoolRole: input.senderSchoolRole,
      text: input.text.trim().slice(0, 3500),
      imageUrls: input.imageUrls.slice(0, 3),
      createdAt: nowIso,
    };

    const updatedTicket: SupportTicketDTO = {
      ...input.ticket,
      status: input.isMasterAdmin ? 'replied' : 'open',
      lastSenderRole: senderRole,
      lastMessagePreview: buildPreview(input.text, input.imageUrls.length),
      unreadByMaster: !input.isMasterAdmin,
      unreadBySchool: input.isMasterAdmin,
      messageCount: Number(input.ticket.messageCount || 0) + 1,
      updatedAt: nowIso,
    };

    try {
      const batch = writeBatch(db);
      const tRef = doc(db, 'support_tickets', input.ticket.id);
      const mRef = doc(db, 'support_tickets', input.ticket.id, 'messages', messageId);
      batch.set(tRef, updatedTicket);
      batch.set(mRef, message);
      await batch.commit();
      emitSupportUpdated();
      return { ticket: updatedTicket, message };
    } catch (fsErr) {
      handleFirestoreError(
        fsErr,
        OperationType.CREATE,
        `support_tickets/${input.ticket.id}/messages/${messageId}`
      );
      throw fsErr;
    }
  }
}

export async function updateSupportTicketStatusClient(
  ticket: SupportTicketDTO,
  status: SupportTicketStatus
): Promise<SupportTicketDTO> {
  try {
    const res = await SaaSApi.updateSupportTicketStatus(ticket.id, { status });
    emitSupportUpdated();
    return res.ticket;
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }
    const updated: SupportTicketDTO = {
      ...ticket,
      status,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'support_tickets', ticket.id), updated);
      emitSupportUpdated();
      return updated;
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.UPDATE, `support_tickets/${ticket.id}`);
      throw fsErr;
    }
  }
}

export async function markSupportTicketReadClient(
  ticket: SupportTicketDTO,
  isMasterAdmin: boolean
): Promise<void> {
  const needsUpdate = isMasterAdmin ? ticket.unreadByMaster : ticket.unreadBySchool;
  if (!needsUpdate) return;
  try {
    await SaaSApi.updateSupportTicketStatus(ticket.id, { markRead: true });
    emitSupportUpdated();
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) return;
    try {
      await setDoc(doc(db, 'support_tickets', ticket.id), {
        ...ticket,
        ...(isMasterAdmin ? { unreadByMaster: false } : { unreadBySchool: false }),
      });
      emitSupportUpdated();
    } catch {
      // ignore non-critical read receipt failures
    }
  }
}

export const SUPPORT_VIDEOS_UPDATED_EVENT = 'support_videos_updated';

export function emitSupportVideosUpdated(videos?: SupportVideoDTO[]) {
  try {
    window.dispatchEvent(
      new CustomEvent(SUPPORT_VIDEOS_UPDATED_EVENT, { detail: { videos } })
    );
  } catch {
    // ignore outside browser window
  }
}

export function sortSupportVideos(videos: SupportVideoDTO[]): SupportVideoDTO[] {
  return [...videos].sort((a, b) => {
    const orderDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export interface SubscribeSupportVideosParams {
  isMasterAdmin: boolean;
  schoolRole?: string | null;
  onVideos: (videos: SupportVideoDTO[]) => void;
  onError?: (err: Error) => void;
}

export function subscribeToSupportVideos({
  isMasterAdmin,
  schoolRole,
  onVideos,
  onError,
}: SubscribeSupportVideosParams): Unsubscribe {
  let cancelled = false;
  let unsubSnapshot: Unsubscribe | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const isAdminRole = schoolRole === 'super_admin' || schoolRole === 'admin';

  const filterVisible = (list: SupportVideoDTO[]): SupportVideoDTO[] => {
    if (isMasterAdmin) return sortSupportVideos(list);
    return sortSupportVideos(
      list.filter(
        (v) =>
          v?.isActive &&
          (v.audience === 'all' || (v.audience === 'admins' && isAdminRole))
      )
    );
  };

  const deliver = (list: SupportVideoDTO[]) => {
    if (cancelled) return;
    const filtered = filterVisible(list);
    onVideos(filtered);
    emitSupportVideosUpdated(filtered);
  };

  const fetchViaApi = async () => {
    if (cancelled || !auth.currentUser) return;
    try {
      const res = await SaaSApi.listSupportVideos();
      if (!cancelled && Array.isArray(res.videos)) {
        deliver(res.videos);
      }
    } catch (err: any) {
      if (!isSaaSBackendUnavailableError(err) && onError && !cancelled) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const startApiPollingFallback = () => {
    if (cancelled || pollTimer) return;
    pollTimer = setInterval(() => {
      void fetchViaApi();
    }, 15000);
  };

  void fetchViaApi();

  if (auth.currentUser) {
    try {
      const colRef = collection(db, 'support_videos');
      const q = isMasterAdmin
        ? query(colRef)
        : isAdminRole
        ? query(colRef, where('isActive', '==', true))
        : query(
            colRef,
            where('isActive', '==', true),
            where('audience', '==', 'all')
          );

      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          const list = snap.docs
            .map((d) => d.data() as SupportVideoDTO)
            .filter((v) => Boolean(v?.id && v?.embedUrl));
          deliver(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'support_videos');
          startApiPollingFallback();
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'support_videos');
      startApiPollingFallback();
    }
  }

  return () => {
    cancelled = true;
    if (unsubSnapshot) unsubSnapshot();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export interface CreateSupportVideoItemInput {
  title: string;
  description?: string;
  category?: SupportVideoCategory;
  rawInput: string;
  audience?: SupportVideoAudience;
  sortOrder?: number;
}

export async function createSupportVideosClient(
  items: CreateSupportVideoItemInput[],
  meta: { createdByName: string; existingMaxOrder?: number }
): Promise<SupportVideoDTO[]> {
  try {
    const res = await SaaSApi.createSupportVideos({ videos: items });
    emitSupportVideosUpdated();
    return res.videos;
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to upload support videos.');
    }

    const nowIso = new Date().toISOString();
    const baseOrder = meta.existingMaxOrder ?? 0;
    const batch = writeBatch(db);
    const created: SupportVideoDTO[] = [];

    items.forEach((item, idx) => {
      const parsed = parseYouTubeEmbedInput(item.rawInput);
      if (!parsed) {
        throw new Error(
          `ভিডিও #${idx + 1}: সঠিক YouTube এম্বেড কোড (<iframe>) বা লিংক দিন।`
        );
      }
      const title = String(item.title || parsed.extractedTitle || '').trim().slice(0, 180);
      if (!title) {
        throw new Error(`ভিডিও #${idx + 1}: শিরোনাম লিখুন।`);
      }
      const rand = Math.random().toString(36).slice(2, 7);
      const id = `vid_${Date.now()}_${idx}_${rand}`;
      const record: SupportVideoDTO = {
        id,
        title,
        ...(item.description?.trim() ? { description: item.description.trim().slice(0, 1000) } : {}),
        category: item.category || 'getting_started',
        videoId: parsed.videoId,
        embedUrl: parsed.embedUrl,
        watchUrl: parsed.watchUrl,
        thumbnailUrl: parsed.thumbnailUrl,
        audience: item.audience === 'all' ? 'all' : 'admins',
        sortOrder:
          typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)
            ? Math.max(0, Math.floor(item.sortOrder))
            : baseOrder + idx + 1,
        isActive: true,
        createdByUid: user.uid,
        createdByName: meta.createdByName || 'Master Admin',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      batch.set(doc(db, 'support_videos', id), record);
      created.push(record);
    });

    try {
      await batch.commit();
      emitSupportVideosUpdated();
      return created;
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.CREATE, 'support_videos');
      throw fsErr;
    }
  }
}

export async function updateSupportVideoClient(
  existing: SupportVideoDTO,
  updates: {
    title?: string;
    description?: string;
    category?: SupportVideoCategory;
    rawInput?: string;
    audience?: SupportVideoAudience;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<SupportVideoDTO> {
  try {
    const res = await SaaSApi.updateSupportVideo(existing.id, updates);
    emitSupportVideosUpdated();
    return res.video;
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }

    let videoId = existing.videoId;
    let embedUrl = existing.embedUrl;
    let watchUrl = existing.watchUrl;
    let thumbnailUrl = existing.thumbnailUrl;

    if (updates.rawInput?.trim()) {
      const parsed = parseYouTubeEmbedInput(updates.rawInput.trim());
      if (!parsed) {
        throw new Error('সঠিক YouTube এম্বেড কোড (<iframe>) বা লিংক দিন।');
      }
      videoId = parsed.videoId;
      embedUrl = parsed.embedUrl;
      watchUrl = parsed.watchUrl;
      thumbnailUrl = parsed.thumbnailUrl;
    }

    const updated: SupportVideoDTO = {
      ...existing,
      title: updates.title !== undefined ? updates.title.trim().slice(0, 180) : existing.title,
      ...(updates.description !== undefined
        ? updates.description.trim()
          ? { description: updates.description.trim().slice(0, 1000) }
          : {}
        : existing.description
        ? { description: existing.description }
        : {}),
      category: updates.category ?? existing.category,
      videoId,
      embedUrl,
      watchUrl,
      thumbnailUrl,
      audience: updates.audience ?? existing.audience,
      sortOrder:
        updates.sortOrder !== undefined ? Math.max(0, Math.floor(updates.sortOrder)) : existing.sortOrder,
      isActive: updates.isActive !== undefined ? updates.isActive : existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'support_videos', existing.id), updated);
      emitSupportVideosUpdated();
      return updated;
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.UPDATE, `support_videos/${existing.id}`);
      throw fsErr;
    }
  }
}

export async function deleteSupportVideoClient(docId: string): Promise<void> {
  try {
    await SaaSApi.deleteSupportVideo(docId);
    emitSupportVideosUpdated();
  } catch (err: any) {
    if (!isSaaSBackendUnavailableError(err)) {
      throw err;
    }
    try {
      await deleteDoc(doc(db, 'support_videos', docId));
      emitSupportVideosUpdated();
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.DELETE, `support_videos/${docId}`);
      throw fsErr;
    }
  }
}
