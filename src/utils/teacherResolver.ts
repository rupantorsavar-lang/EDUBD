import { Staff, UserProfile } from '../types';

/**
 * Strictly resolves the logged-in user's own Staff profile without falling back
 * to arbitrary other teachers/staff members. Used to enforce self-attendance
 * privacy and teacher timetable scoping.
 */
export function resolveTeacherStaffProfile(
  currentUser: UserProfile | null | undefined,
  staffList: Staff[]
): Staff | null {
  if (!currentUser || !Array.isArray(staffList) || staffList.length === 0) {
    return null;
  }

  const activeList = staffList.filter((s) => s.status !== 'resigned');

  if (currentUser.linkedStaffId) {
    const byLinkedId = activeList.find((s) => s.id === currentUser.linkedStaffId);
    if (byLinkedId) return byLinkedId;
  }

  if (currentUser.authUid) {
    const byAuthUid = activeList.find((s) => s.authUid && s.authUid === currentUser.authUid);
    if (byAuthUid) return byAuthUid;
  }

  const email = (currentUser.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = activeList.find((s) => (s.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  const username = (currentUser.username || '').trim().toLowerCase();
  if (username) {
    const byUsername = activeList.find(
      (s) =>
        (s.username || '').trim().toLowerCase() === username ||
        (s.employeeId || '').trim().toLowerCase() === username
    );
    if (byUsername) return byUsername;
  }

  return null;
}
