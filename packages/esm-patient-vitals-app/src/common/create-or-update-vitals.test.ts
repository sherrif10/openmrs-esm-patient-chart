import { openmrsFetch, type Visit } from '@openmrs/esm-framework';
import { createOrUpdateVitalsAndBiometrics } from './data.resource';

const mockOpenmrsFetch = jest.mocked(openmrsFetch);

const save = (encounterUuid: string | null, visit?: Visit | null) => {
  createOrUpdateVitalsAndBiometrics(
    'patient-uuid',
    'vitals-encounter-type',
    encounterUuid,
    'location-uuid',
    [],
    new AbortController(),
    visit,
  );
  return mockOpenmrsFetch.mock.calls[0][1].body as Record<string, unknown>;
};

const pastVisit = {
  uuid: 'past-visit',
  startDatetime: '2026-11-07T09:00:00.000Z',
  stopDatetime: '2026-11-07T10:00:00.000Z',
} as Visit;

const ongoingVisit = { uuid: 'ongoing-visit', startDatetime: '2026-11-11T08:00:00.000Z', stopDatetime: null } as Visit;

describe('createOrUpdateVitalsAndBiometrics', () => {
  beforeEach(() => mockOpenmrsFetch.mockClear());

  it('dates new vitals at the start of a past visit and attaches them to it', () => {
    expect(save(null, pastVisit)).toMatchObject({
      visit: 'past-visit',
      encounterDatetime: '2026-11-07T09:00:00.000Z',
    });
  });

  it('attaches new vitals to an ongoing visit and lets the server stamp the time', () => {
    const body = save(null, ongoingVisit);
    expect(body.visit).toBe('ongoing-visit');
    expect(body).not.toHaveProperty('encounterDatetime');
  });

  it('sends neither a visit nor a date without a visit', () => {
    const body = save(null, null);
    expect(body).not.toHaveProperty('visit');
    expect(body).not.toHaveProperty('encounterDatetime');
  });

  it('leaves the visit and date of edited vitals unchanged', () => {
    const body = save('encounter-uuid', pastVisit);
    expect(body).not.toHaveProperty('visit');
    expect(body).not.toHaveProperty('encounterDatetime');
  });
});
