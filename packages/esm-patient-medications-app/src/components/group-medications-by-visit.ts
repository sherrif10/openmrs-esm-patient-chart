import dayjs from 'dayjs';
import { type Order } from '@openmrs/esm-patient-common-lib';

/** The drug orders placed in one visit encounter: shown as one prescription in the medications table. */
export interface MedicationVisitGroup {
  /** The encounter uuid, or `date:YYYY-MM-DD` for orders without an encounter. */
  key: string;
  /** When the prescription was started: the earliest start date of its orders. */
  dateActivated: string;
  /** Names of the clinicians who placed the orders, in the order first seen. */
  orderers: Array<string>;
  medications: Array<Order>;
}

function groupKey(medication: Order): string {
  return medication.encounter?.uuid ?? `date:${dayjs(medication.dateActivated).format('YYYY-MM-DD')}`;
}

function time(date: string | undefined): number {
  const value = date ? dayjs(date).valueOf() : NaN;
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Groups drug orders by the encounter they were placed in, so that a prescription of several drugs shows
 * as one block with its date and prescriber once, instead of repeating them on every drug.
 *
 * Groups are sorted newest prescription first; the drugs in a group alphabetically. Orders without an
 * encounter are grouped by the day they were started.
 */
export function groupMedicationsByVisit(medications: Array<Order> | null | undefined): Array<MedicationVisitGroup> {
  const groups = new Map<string, MedicationVisitGroup>();

  for (const medication of medications ?? []) {
    const key = groupKey(medication);
    let group = groups.get(key);
    if (!group) {
      group = { key, dateActivated: medication.dateActivated, orderers: [], medications: [] };
      groups.set(key, group);
    }
    group.medications.push(medication);
    if (time(medication.dateActivated) && time(medication.dateActivated) < time(group.dateActivated)) {
      group.dateActivated = medication.dateActivated;
    }
    const orderer = medication.orderer?.person?.display;
    if (orderer && !group.orderers.includes(orderer)) {
      group.orderers.push(orderer);
    }
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.medications.sort((a, b) => (a.drug?.display ?? '').localeCompare(b.drug?.display ?? ''));
  }
  return result.sort((a, b) => time(b.dateActivated) - time(a.dateActivated));
}
