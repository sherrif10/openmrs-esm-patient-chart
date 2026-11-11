import { type Visit } from '@openmrs/esm-framework';
import { getDefaultVisitNoteDate, getVisitNoteDatetime } from './visit-note-date';

const now = new Date('2026-11-11T14:00:00.000Z');

const pastVisit = {
  uuid: 'past-visit',
  startDatetime: '2026-11-07T09:00:00.000Z',
  stopDatetime: '2026-11-07T10:00:00.000Z',
} as Visit;

const ongoingVisit = {
  uuid: 'ongoing-visit',
  startDatetime: '2026-11-09T08:00:00.000Z',
  stopDatetime: null,
} as Visit;

describe('getDefaultVisitNoteDate', () => {
  it('defaults to the start of a past visit', () => {
    expect(getDefaultVisitNoteDate(pastVisit, now)).toEqual(new Date('2026-11-07T09:00:00.000Z'));
  });

  it('defaults to now in an ongoing visit or without a visit', () => {
    expect(getDefaultVisitNoteDate(ongoingVisit, now)).toEqual(now);
    expect(getDefaultVisitNoteDate(null, now)).toEqual(now);
  });
});

describe('getVisitNoteDatetime', () => {
  it('dates a note in a past visit at the visit start when only its day is picked', () => {
    const pickedDay = new Date('2026-11-07T00:00:00.000Z');
    expect(getVisitNoteDatetime(pickedDay, pastVisit, false, now)).toEqual(new Date('2026-11-07T09:00:00.000Z'));
  });

  it('keeps a time inside a past visit', () => {
    const inVisit = new Date('2026-11-07T09:30:00.000Z');
    expect(getVisitNoteDatetime(inVisit, pastVisit, false, now)).toEqual(inVisit);
  });

  it('keeps a note in a past visit inside it even when the default (now) is left unchanged', () => {
    expect(getVisitNoteDatetime(now, pastVisit, false, now)).toEqual(new Date('2026-11-07T10:00:00.000Z'));
  });

  it('lets the server stamp a note for today in an ongoing visit', () => {
    expect(getVisitNoteDatetime(now, ongoingVisit, false, now)).toBeNull();
    expect(getVisitNoteDatetime(new Date('2026-11-11T00:00:00.000Z'), ongoingVisit, false, now)).toBeNull();
  });

  it('keeps an earlier day picked in an ongoing visit, but not before the visit started', () => {
    expect(getVisitNoteDatetime(new Date('2026-11-10T00:00:00.000Z'), ongoingVisit, false, now)).toEqual(
      new Date('2026-11-10T00:00:00.000Z'),
    );
    expect(getVisitNoteDatetime(new Date('2026-11-01T00:00:00.000Z'), ongoingVisit, false, now)).toEqual(
      new Date('2026-11-09T08:00:00.000Z'),
    );
  });

  it('keeps a past day picked without a visit', () => {
    const pickedDay = new Date('2026-11-05T00:00:00.000Z');
    expect(getVisitNoteDatetime(pickedDay, null, false, now)).toEqual(pickedDay);
  });

  it('leaves the date of an edited note unchanged', () => {
    expect(getVisitNoteDatetime(new Date('2026-11-07T09:30:00.000Z'), pastVisit, true, now)).toBeNull();
  });
});
