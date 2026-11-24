import dayjs from 'dayjs';
import { type Order } from '@openmrs/esm-patient-common-lib';

/** The drug orders placed in one visit: shown as one prescription in the medications table. */
export interface MedicationVisitGroup {
  /** The visit uuid; else the encounter uuid; else `date:YYYY-MM-DD` for orders with neither. */
  key: string;
  /** When the prescription was started: the earliest start date of its orders. */
  dateActivated: string;
  /** Names of the clinicians who placed the orders, in the order first seen. */
  orderers: Array<string>;
  medications: Array<Order>;
}

function groupKey(medication: Order): string {
  return (
    medication.encounter?.visit?.uuid ??
    medication.encounter?.uuid ??
    `date:${dayjs(medication.dateActivated).format('YYYY-MM-DD')}`
  );
}

function time(date: string | undefined): number {
  const value = date ? dayjs(date).valueOf() : NaN;
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Groups drug orders by the visit they were placed in, so that everything prescribed at one visit shows
 * as one block with its date and prescriber once, instead of repeating them on every drug. Drugs saved
 * in several goes during the same visit (several order basket submissions, so several encounters) still
 * land in one block.
 *
 * Groups are sorted newest prescription first; the drugs in a group alphabetically. Orders without a
 * visit fall back to their encounter, and orders with neither are grouped by the day they were started.
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
