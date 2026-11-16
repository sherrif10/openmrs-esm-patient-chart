import { type Order } from '@openmrs/esm-patient-common-lib';
import { groupMedicationsByVisit } from './group-medications-by-visit';

function order(
  uuid: string,
  drug: string,
  encounterUuid: string | null,
  dateActivated: string,
  orderer = 'Dr Ade',
  visitUuid?: string,
): Order {
  return {
    uuid,
    drug: { display: drug },
    encounter: encounterUuid ? { uuid: encounterUuid, visit: visitUuid ? { uuid: visitUuid } : undefined } : undefined,
    dateActivated,
    orderer: { person: { display: orderer } },
  } as unknown as Order;
}

describe('groupMedicationsByVisit', () => {
  test('returns no groups for no medications', () => {
    expect(groupMedicationsByVisit(undefined)).toEqual([]);
    expect(groupMedicationsByVisit(null)).toEqual([]);
    expect(groupMedicationsByVisit([])).toEqual([]);
  });

  test('puts the drugs of one encounter in one group, sorted by drug name', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'Paracetamol tab', 'enc-1', '2026-11-16T10:10:00.000+0000'),
      order('2', 'Erythromycin tab', 'enc-1', '2026-11-16T10:10:00.000+0000'),
      order('3', 'Fluconazole 150mg', 'enc-1', '2026-11-16T10:11:00.000+0000'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('enc-1');
    expect(groups[0].medications.map((m) => m.drug.display)).toEqual([
      'Erythromycin tab',
      'Fluconazole 150mg',
      'Paracetamol tab',
    ]);
  });

  test('dates a group by its earliest order and lists each prescriber once', () => {
    const [group] = groupMedicationsByVisit([
      order('1', 'B', 'enc-1', '2026-11-16T10:15:00.000+0000', 'Dr Ade'),
      order('2', 'A', 'enc-1', '2026-11-16T10:05:00.000+0000', 'Nurse Bola'),
      order('3', 'C', 'enc-1', '2026-11-16T10:20:00.000+0000', 'Dr Ade'),
    ]);

    expect(group.dateActivated).toBe('2026-11-16T10:05:00.000+0000');
    expect(group.orderers).toEqual(['Dr Ade', 'Nurse Bola']);
  });

  test('keeps different encounters apart, newest prescription first', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'Amoxicillin', 'enc-old', '2026-11-01T09:00:00.000+0000'),
      order('2', 'Paracetamol', 'enc-new', '2026-11-16T10:00:00.000+0000'),
      order('3', 'Metronidazole', 'enc-old', '2026-11-01T09:01:00.000+0000'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['enc-new', 'enc-old']);
    expect(groups[1].medications).toHaveLength(2);
  });

  test('drugs saved in several goes during one visit form one group', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'Paracetamol', 'enc-first-save', '2026-11-11T12:25:00.000+0000', 'Dr Ade', 'visit-1'),
      order('2', 'Vit C', 'enc-second-save', '2026-11-11T12:25:30.000+0000', 'Dr Ade', 'visit-1'),
      order('3', 'Amoxicillin', 'enc-third-save', '2026-11-11T13:09:00.000+0000', 'Dr Ade', 'visit-1'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('visit-1');
    expect(groups[0].dateActivated).toBe('2026-11-11T12:25:00.000+0000');
    expect(groups[0].medications.map((m) => m.drug.display)).toEqual(['Amoxicillin', 'Paracetamol', 'Vit C']);
  });

  test('two visits on the same day stay separate prescriptions', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'A', 'enc-morning', '2026-11-16T08:00:00.000+0000', 'Dr Ade', 'visit-morning'),
      order('2', 'B', 'enc-evening', '2026-11-16T18:00:00.000+0000', 'Dr Ade', 'visit-evening'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['visit-evening', 'visit-morning']);
  });

  test('falls back to the encounter when an order has no visit', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'A', 'enc-1', '2026-11-16T08:00:00.000+0000'),
      order('2', 'B', 'enc-2', '2026-11-16T08:05:00.000+0000'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['enc-2', 'enc-1']);
  });

  test('groups orders without an encounter by the day they were started', () => {
    const groups = groupMedicationsByVisit([
      order('1', 'A', null, '2026-11-16T08:00:00.000+0000'),
      order('2', 'B', null, '2026-11-16T15:00:00.000+0000'),
      order('3', 'C', null, '2026-11-15T15:00:00.000+0000'),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['date:2026-11-16', 'date:2026-11-15']);
    expect(groups[0].medications).toHaveLength(2);
  });

  test('does not lose any medication', () => {
    const medications = Array.from({ length: 20 }, (_, i) =>
      order(`${i}`, `Drug ${i}`, `enc-${i % 3}`, `2026-11-${10 + (i % 3)}T10:00:00.000+0000`),
    );

    const groups = groupMedicationsByVisit(medications);

    expect(groups).toHaveLength(3);
    expect(
      groups
        .flatMap((g) => g.medications)
        .map((m) => m.uuid)
        .sort(),
    ).toEqual(medications.map((m) => m.uuid).sort());
  });
});
