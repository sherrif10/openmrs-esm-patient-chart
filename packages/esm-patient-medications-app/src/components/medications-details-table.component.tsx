import React, { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  Button,
  DataTable,
  IconButton,
  InlineLoading,
  OverflowMenu,
  OverflowMenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tooltip,
} from '@carbon/react';
import { capitalize } from 'lodash-es';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { useSWRConfig } from 'swr';
import {
  CardHeader,
  compare,
  invalidateVisitAndEncounterData,
  invalidateVisitByUuid,
  PatientChartPagination,
  type DrugOrderBasketItem,
  type Order,
  type OrderBasketWindowProps,
  type PatientWorkspaceGroupProps,
  useLaunchWorkspaceRequiringVisit,
  useOrderBasket,
} from '@openmrs/esm-patient-common-lib';
import {
  AddIcon,
  age,
  ChevronDownIcon,
  ChevronUpIcon,
  formatDate,
  getPatientName,
  launchWorkspace2,
  PrinterIcon,
  useConfig,
  useLayoutType,
  usePagination,
  UserIcon,
} from '@openmrs/esm-framework';
import { buildMedicationOrder } from '../api';
import { type AddDrugOrderWorkspaceProps } from '../add-drug-order/add-drug-order.workspace';
import { type ConfigObject } from '../config-schema';
import PrintComponent from '../print/print.component';
import { groupMedicationsByVisit } from './group-medications-by-visit';
import styles from './medications-details-table.scss';

export interface MedicationsDetailsTableProps {
  isValidating?: boolean;
  title?: string;
  medications?: Array<Order> | null;
  showAddButton?: boolean;
  showDiscontinueButton: boolean;
  showModifyButton: boolean;
  showRenewButton: boolean;
  patient: fhir.Patient;
}

const MedicationsDetailsTable: React.FC<MedicationsDetailsTableProps> = ({
  isValidating,
  title,
  medications,
  showAddButton,
  showDiscontinueButton,
  showModifyButton,
  showRenewButton,
  patient,
}) => {
  const pageSize = 5;
  const { t } = useTranslation();
  const launchOrderBasket = useLaunchWorkspaceRequiringVisit(patient.id, 'order-basket');
  const config = useConfig<ConfigObject>();
  const showPrintButton = config.showPrintButton;
  const contentToPrintRef = useRef(null);
  const { excludePatientIdentifierCodeTypes } = useConfig();
  const [isPrinting, setIsPrinting] = useState(false);

  const { orders, setOrders } = useOrderBasket<DrugOrderBasketItem>(patient, 'medications');
  const { results, goTo, currentPage } = usePagination(medications, pageSize);

  // MediHealth: one block per prescription (visit encounter), its date and prescriber shown once.
  // Pages count prescriptions, so a prescription is never split across pages.
  const groupByVisit = config.groupMedicationsByVisit === true;
  const groups = useMemo(() => groupMedicationsByVisit(medications), [medications]);
  const groupPages = usePagination(groups, pageSize);
  // The newest prescription starts open, older ones closed; a click overrides that per prescription.
  const [toggledGroups, setToggledGroups] = useState<Record<string, boolean>>({});
  const isGroupExpanded = (key: string) => isPrinting || (toggledGroups[key] ?? key === groups[0]?.key);
  const toggleGroup = (key: string) => setToggledGroups((current) => ({ ...current, [key]: !isGroupExpanded(key) }));

  const tableHeaders = [
    {
      key: 'startDate',
      header: t('startDate', 'Start date'),
      isSortable: true,
      isVisible: true,
    },
    {
      key: 'details',
      header: t('details', 'Details'),
      isSortable: true,
      isVisible: true,
    },
  ];

  const medicationsByUuid = useMemo(
    () => new Map(results?.map((medication) => [medication.uuid, medication]) ?? []),
    [results],
  );

  const tableRows = results?.map((medication) => ({
    id: medication.uuid,
    details: {
      sortKey: medication.drug?.display,
      content: <MedicationDetails medication={medication} />,
    },
    startDate: {
      sortKey: dayjs(medication.dateActivated).toDate(),
      content: (
        <div className={styles.startDateColumn}>
          <span>{formatDate(new Date(medication.dateActivated))}</span>
          {!isPrinting && <InfoTooltip orderer={medication.orderer?.person?.display ?? '--'} />}
        </div>
      ),
    },
  }));

  const sortRow = (cellA, cellB, { sortDirection, sortStates }) => {
    return sortDirection === sortStates.DESC
      ? compare(cellB.sortKey, cellA.sortKey)
      : compare(cellA.sortKey, cellB.sortKey);
  };

  const patientDetails = useMemo(() => {
    const getGender = (gender: string): string => {
      switch (gender) {
        case 'male':
          return t('male', 'Male');
        case 'female':
          return t('female', 'Female');
        case 'other':
          return t('other', 'Other');
        case 'unknown':
          return t('unknown', 'Unknown');
        default:
          return gender;
      }
    };

    const identifiers =
      patient?.identifier?.filter(
        (identifier) => !excludePatientIdentifierCodeTypes?.uuids.includes(identifier.type.coding[0].code),
      ) ?? [];

    return {
      name: patient ? getPatientName(patient) : '',
      age: age(patient?.birthDate),
      gender: getGender(patient?.gender),
      location: patient?.address?.[0].city,
      identifiers: identifiers?.length ? identifiers.map(({ value }) => value) : [],
    };
  }, [patient, t, excludePatientIdentifierCodeTypes?.uuids]);

  const onBeforeGetContentResolve = useRef(null);

  useEffect(() => {
    if (isPrinting && onBeforeGetContentResolve.current) {
      onBeforeGetContentResolve.current();
    }
  }, [isPrinting]);

  const handlePrint = useReactToPrint({
    content: () => contentToPrintRef.current,
    documentTitle: `OpenMRS - ${patientDetails.name} - ${title}`,
    onBeforeGetContent: () =>
      new Promise((resolve) => {
        if (patient && title) {
          onBeforeGetContentResolve.current = resolve;
          setIsPrinting(true);
        }
      }),
    onAfterPrint: () => {
      onBeforeGetContentResolve.current = null;
      setIsPrinting(false);
    },
  });

  return (
    <div className={styles.widgetCard}>
      <CardHeader title={title}>
        {isValidating ? (
          <span>
            <InlineLoading />
          </span>
        ) : null}
        <div className={styles.buttons}>
          {showPrintButton && (
            <Button
              kind="ghost"
              renderIcon={PrinterIcon}
              iconDescription={t('printMedications', 'Print medications')}
              className={styles.printButton}
              onClick={handlePrint}
            >
              {t('print', 'Print')}
            </Button>
          )}
          {showAddButton ?? true ? (
            <Button
              kind="ghost"
              renderIcon={(props: ComponentProps<typeof AddIcon>) => <AddIcon size={16} {...props} />}
              iconDescription={t('launchOrderBasket', 'Launch order basket')}
              onClick={() => launchOrderBasket({}, { encounterUuid: '' })}
            >
              {t('add', 'Add')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <div ref={contentToPrintRef}>
        <PrintComponent subheader={title} patientDetails={patientDetails} />
        {groupByVisit ? (
          <>
            <TableContainer>
              <Table aria-label="medications" className={styles.table} size="sm" overflowMenuOnHover={false}>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('details', 'Details')}</TableHeader>
                    {!isPrinting && <TableHeader aria-label={t('actions', 'Actions')} />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupPages.results.map((group) => {
                    const expanded = isGroupExpanded(group.key);
                    // with the time, so two visits on the same day can be told apart
                    const date = formatDate(new Date(group.dateActivated), { time: true });
                    return (
                      <React.Fragment key={group.key}>
                        <TableRow className={styles.visitGroupRow} data-testid="medication-visit-group">
                          <TableCell colSpan={isPrinting ? 1 : 2}>
                            <div className={styles.visitGroupHeader}>
                              {!isPrinting && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  hasIconOnly
                                  renderIcon={(props: ComponentProps<typeof ChevronDownIcon>) =>
                                    expanded ? (
                                      <ChevronUpIcon size={16} {...props} />
                                    ) : (
                                      <ChevronDownIcon size={16} {...props} />
                                    )
                                  }
                                  iconDescription={
                                    expanded
                                      ? t('hidePrescription', 'Hide medications prescribed on {{date}}', { date })
                                      : t('showPrescription', 'Show medications prescribed on {{date}}', { date })
                                  }
                                  aria-expanded={expanded}
                                  tooltipPosition="right"
                                  onClick={() => toggleGroup(group.key)}
                                />
                              )}
                              <span className={styles.visitGroupDate}>{date}</span>
                              <span className={styles.visitGroupMeta}>
                                {t('prescriptionDrugCount', '{{count}} drug(s)', { count: group.medications.length })}
                              </span>
                              {group.orderers.length > 0 && (
                                <span className={styles.visitGroupMeta}>
                                  {t('prescribedBy', 'Prescribed by {{names}}', { names: group.orderers.join(', ') })}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expanded &&
                          group.medications.map((medication) => (
                            <TableRow className={styles.row} key={medication.uuid}>
                              <TableCell className={styles.tableCell}>
                                <MedicationDetails medication={medication} />
                              </TableCell>
                              {!isPrinting && (
                                <TableCell className="cds--table-column-menu">
                                  <OrderBasketItemActions
                                    patient={patient}
                                    showDiscontinueButton={showDiscontinueButton}
                                    showModifyButton={showModifyButton}
                                    showRenewButton={showRenewButton}
                                    medication={medication}
                                    items={orders}
                                    setItems={setOrders}
                                  />
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <PatientChartPagination
              pageNumber={groupPages.currentPage}
              totalItems={groups.length}
              currentItems={groupPages.results.length}
              pageSize={pageSize}
              onPageNumberChange={({ page }) => groupPages.goTo(page)}
            />
          </>
        ) : (
          <>
            <DataTable
              data-floating-menu-container
              size="sm"
              headers={tableHeaders}
              rows={tableRows}
              isSortable
              sortRow={sortRow}
              overflowMenuOnHover={false}
              useZebraStyles
            >
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                <TableContainer>
                  <Table aria-label="medications" className={styles.table} {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHeader
                            {...getHeaderProps({
                              header,
                            })}
                          >
                            {header.header}
                          </TableHeader>
                        ))}
                        {!isPrinting && <TableHeader aria-label={t('actions', 'Actions')} />}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const medication = medicationsByUuid.get(row.id);

                        return (
                          <TableRow className={styles.row} {...getRowProps({ row })}>
                            {row.cells.map((cell) => (
                              <TableCell className={styles.tableCell} key={cell.id}>
                                {cell.value?.content ?? cell.value}
                              </TableCell>
                            ))}

                            {!isPrinting && medication && (
                              <TableCell className="cds--table-column-menu">
                                <OrderBasketItemActions
                                  patient={patient}
                                  showDiscontinueButton={showDiscontinueButton}
                                  showModifyButton={showModifyButton}
                                  showRenewButton={showRenewButton}
                                  medication={medication}
                                  items={orders}
                                  setItems={setOrders}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
            <PatientChartPagination
              pageNumber={currentPage}
              totalItems={medications?.length ?? 0}
              currentItems={results.length}
              pageSize={pageSize}
              onPageNumberChange={({ page }) => goTo(page)}
            />
          </>
        )}
      </div>
    </div>
  );
};

function MedicationDetails({ medication }: { medication: Order }) {
  const { t } = useTranslation();
  return (
    <div className={styles.medicationRecord}>
      <div>
        <p className={styles.bodyLong01}>
          <strong>{capitalize(medication.drug?.display)}</strong>{' '}
          {medication.drug?.strength && <>&mdash; {medication.drug?.strength.toLowerCase()}</>}{' '}
          {medication.drug?.dosageForm?.display && <>&mdash; {medication.drug.dosageForm.display.toLowerCase()}</>}
          {medication.dateStopped && (
            <Tooltip align="right" label={<>{formatDate(new Date(medication.dateStopped))}</>}>
              <Tag type="gray" className={styles.tag}>
                {t('discontinued', 'Discontinued')}
              </Tag>
            </Tooltip>
          )}
        </p>
        <p className={styles.bodyLong01}>
          {medication.dose != null && (
            <>
              <span className={styles.label01}>{t('dose', 'Dose').toUpperCase()}</span>{' '}
              <span className={styles.dosage}>
                {medication.dose} {medication.doseUnits?.display?.toLowerCase()}
              </span>{' '}
            </>
          )}
          {medication.route?.display && (
            <>
              {medication.dose != null && <>&mdash; </>}
              {medication.route?.display.toLowerCase()}{' '}
            </>
          )}
          {medication.frequency?.display && <>&mdash; {medication.frequency?.display.toLowerCase()} </>}
          {medication.duration != null && (
            <>
              {(medication.dose != null || medication.route?.display || medication.frequency?.display) && <>&mdash; </>}
              {t('medicationDurationAndUnit', 'for {{duration}} {{durationUnit}}', {
                duration: medication.duration,
                durationUnit: medication.durationUnits?.display?.toLowerCase(),
              })}{' '}
            </>
          )}
          {medication.duration == null &&
            (medication.dose != null || medication.route?.display || medication.frequency?.display) && (
              <>&mdash; {t('medicationIndefiniteDuration', 'Indefinite duration').toLowerCase()} </>
            )}
          {medication.numRefills != null && medication.numRefills !== 0 && (
            <span>
              {(medication.dose != null ||
                medication.route?.display ||
                medication.frequency?.display ||
                medication.duration != null) && <> &mdash; </>}
              <span className={styles.label01}>{t('refills', 'Refills').toUpperCase()}</span> {medication.numRefills}
            </span>
          )}
          {medication.dosingInstructions && (
            <span>
              {(medication.dose != null ||
                medication.route?.display ||
                medication.frequency?.display ||
                medication.duration != null ||
                (medication.numRefills != null && medication.numRefills !== 0)) && <> &mdash; </>}
              {medication.dosingInstructions.toLocaleLowerCase()}
            </span>
          )}
        </p>
      </div>
      <p className={styles.bodyLong01}>
        {medication.orderReasonNonCoded && (
          <span>
            <span className={styles.label01}>{t('indication', 'Indication').toUpperCase()}</span>{' '}
            {medication.orderReasonNonCoded}
          </span>
        )}{' '}
        {medication.orderReasonNonCoded && medication.quantity != null && <>&mdash;</>}
        {medication.quantity != null && (
          <span>
            <span className={styles.label01}> {t('quantity', 'Quantity').toUpperCase()}</span> {medication.quantity}{' '}
            {medication?.quantityUnits?.display}
          </span>
        )}
      </p>
    </div>
  );
}

function InfoTooltip({ orderer }: { orderer: string }) {
  return (
    <IconButton className={styles.tooltip} align="top-left" label={orderer} kind="ghost" size="sm">
      <UserIcon size={16} />
    </IconButton>
  );
}

function OrderBasketItemActions({
  patient,
  showDiscontinueButton,
  showModifyButton,
  showRenewButton,
  medication,
  items,
  setItems,
}: {
  patient: fhir.Patient;
  showDiscontinueButton: boolean;
  showModifyButton: boolean;
  showRenewButton: boolean;
  medication: Order;
  items: Array<DrugOrderBasketItem>;
  setItems: (items: Array<DrugOrderBasketItem>) => void;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const alreadyInBasket = items.some((x) => x.uuid === medication.uuid);

  const workspaceGroupProps: PatientWorkspaceGroupProps = useMemo(
    () => ({
      patient,
      patientUuid: patient.id,
      visitContext: medication.encounter.visit,
      mutateVisitContext: () => {
        invalidateVisitByUuid(globalMutate, medication.encounter.visit?.uuid);
        invalidateVisitAndEncounterData(globalMutate, patient.id);
      },
    }),
    [patient, medication, globalMutate],
  );
  const handleDiscontinueClick = useCallback(() => {
    setItems([...items, buildMedicationOrder(medication, 'DISCONTINUE')]);
    launchWorkspace2<{}, OrderBasketWindowProps, PatientWorkspaceGroupProps>(
      'order-basket',
      {},
      { encounterUuid: medication.encounter.uuid },
      workspaceGroupProps,
    );
  }, [items, setItems, medication, workspaceGroupProps]);

  const handleModifyClick = useCallback(() => {
    launchWorkspace2<AddDrugOrderWorkspaceProps, OrderBasketWindowProps, PatientWorkspaceGroupProps>(
      'add-drug-order',
      {
        order: buildMedicationOrder(medication, 'REVISE'),
        orderToEditOrdererUuid: medication.orderer.uuid,
      },
      { encounterUuid: medication.encounter.uuid },
      workspaceGroupProps,
    );
  }, [medication, workspaceGroupProps]);

  const handleRenewClick = useCallback(() => {
    setItems([...items, buildMedicationOrder(medication, 'RENEW')]);
    launchWorkspace2<{}, OrderBasketWindowProps, PatientWorkspaceGroupProps>(
      'order-basket',
      {},
      { encounterUuid: medication.encounter.uuid },
      workspaceGroupProps,
    );
  }, [items, setItems, medication, workspaceGroupProps]);

  return (
    <OverflowMenu
      aria-label={t('actionsMenu', 'Actions menu')}
      align="left"
      selectorPrimaryFocus={'#modify'}
      flipped
      size={isTablet ? 'lg' : 'md'}
    >
      {showModifyButton && (
        <OverflowMenuItem
          className={styles.menuItem}
          id="modify"
          itemText={t('modify', 'Modify')}
          onClick={handleModifyClick}
          disabled={alreadyInBasket}
        />
      )}
      {showRenewButton && (
        <OverflowMenuItem
          className={styles.menuItem}
          disabled={alreadyInBasket}
          id="renew"
          itemText={t('orderActionRenew', 'Renew')}
          onClick={handleRenewClick}
        />
      )}
      {showDiscontinueButton && (
        <OverflowMenuItem
          className={styles.menuItem}
          disabled={alreadyInBasket}
          hasDivider
          id="discontinue"
          isDelete
          itemText={t('discontinue', 'Discontinue')}
          onClick={handleDiscontinueClick}
        />
      )}
    </OverflowMenu>
  );
}

export default MedicationsDetailsTable;
