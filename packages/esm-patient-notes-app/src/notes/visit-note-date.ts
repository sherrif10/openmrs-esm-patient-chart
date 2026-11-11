import dayjs from 'dayjs';
import { type Visit } from '@openmrs/esm-framework';

/**
 * The date a new visit note defaults to: the start of the visit when entering a past visit
 * (retrospective data entry), otherwise now.
 */
export function getDefaultVisitNoteDate(visit?: Visit | null, now = new Date()): Date {
  return visit?.stopDatetime && visit?.startDatetime ? new Date(visit.startDatetime) : now;
}

/**
 * The encounterDatetime to save a visit note with, or `null` to let the server stamp it with the
 * time it is saved.
 *
 * A note for today in an ongoing visit is left to the server. Any other date is kept, moved inside
 * the visit the note is entered in if needed (the date picker only picks a day, and the server
 * rejects encounters outside their visit), so a note keyed in for a past visit shows on the day
 * the patient was seen. The server still records when it was entered in `dateCreated`.
 */
export function getVisitNoteDatetime(
  noteDate: Date | null | undefined,
  visit: Visit | null | undefined,
  isEditing: boolean,
  now = new Date(),
): Date | null {
  if (isEditing || !noteDate) {
    return null;
  }
  const isPastVisit = Boolean(visit?.stopDatetime);
  if (!isPastVisit && dayjs(noteDate).isSame(now, 'day')) {
    return null;
  }
  const visitStart = visit?.startDatetime ? new Date(visit.startDatetime) : null;
  const latest = visit?.stopDatetime ? new Date(visit.stopDatetime) : now;
  if (visitStart && noteDate < visitStart) {
    return visitStart;
  }
  if (noteDate > latest) {
    return latest;
  }
  return noteDate;
}
