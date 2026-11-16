import React from 'react';
import { getDefaultsFromConfigSchema, openmrsFetch, useConfig, useSession } from '@openmrs/esm-framework';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockPatientDrugOrdersApiData, mockSessionDataResponse } from '__mocks__';
import { mockPatient, renderWithSwr, waitForLoadingToFinish } from 'tools';
import { configSchema, type ConfigObject } from '../config-schema';
import ActiveMedications from '../active-medications/active-medications.component';

// MediHealth: with groupMedicationsByVisit on, the medications table shows one block per prescription
// (visit encounter) with its date and prescriber once, instead of repeating them on every drug.

const mockOpenmrsFetch = openmrsFetch as jest.Mock;
const mockUseConfig = jest.mocked(useConfig<ConfigObject>);
jest.mocked(useSession).mockReturnValue(mockSessionDataResponse.data);

jest.mock('@openmrs/esm-patient-common-lib', () => {
  const originalModule = jest.requireActual('@openmrs/esm-patient-common-lib');
  return { ...originalModule, useLaunchWorkspaceRequiringVisit: () => jest.fn() };
});

const OLD_ENCOUNTER = '0a1b2c3d-0000-4000-8000-000000000001';

/** The mock orders all belong to one encounter; move Aspirin into an older visit. */
function withOlderAspirinVisit() {
  return mockPatientDrugOrdersApiData.map((order) =>
    order.drug?.display === 'Aspirin 162.5mg'
      ? {
          ...order,
          encounter: { uuid: OLD_ENCOUNTER, display: 'Visit Note 01/08/2023' },
          dateActivated: '2023-08-01T09:00:00.000+0000',
        }
      : order,
  );
}

function renderGrouped(groupMedicationsByVisit = true) {
  mockUseConfig.mockReturnValue({ ...getDefaultsFromConfigSchema(configSchema), groupMedicationsByVisit });
  return renderWithSwr(<ActiveMedications patient={mockPatient} />);
}

describe('Medications grouped by prescription', () => {
  test('shows the drugs of one visit under a single header with the date, count and prescriber', async () => {
    mockOpenmrsFetch.mockReturnValueOnce({ data: { results: mockPatientDrugOrdersApiData } });

    renderGrouped();
    await waitForLoadingToFinish();

    const groups = screen.getAllByTestId('medication-visit-group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveTextContent(/14-Aug-2023/);
    expect(groups[0]).toHaveTextContent(/4 drug\(s\)/);
    expect(groups[0]).toHaveTextContent(/Prescribed by Admin User/);

    // the date is no longer repeated in a column of its own
    expect(screen.queryByRole('columnheader', { name: /start date/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /details/i })).toBeInTheDocument();

    const table = screen.getByRole('table');
    for (const drug of [/Aspirin 162.5mg/i, /Sulfacetamide 0.1/i]) {
      expect(within(table).getByText(drug)).toBeInTheDocument();
    }
    expect(within(table).getAllByText(/Acetaminophen 325 mg/i)).toHaveLength(2);
  });

  test('every drug keeps its own actions menu', async () => {
    mockOpenmrsFetch.mockReturnValueOnce({ data: { results: mockPatientDrugOrdersApiData } });

    renderGrouped();
    await waitForLoadingToFinish();

    // Carbon names each per-drug overflow menu "Options"
    expect(screen.getAllByRole('button', { name: /^options$/i })).toHaveLength(4);
  });

  test('opens the newest prescription and keeps older ones closed until clicked', async () => {
    const user = userEvent.setup();
    mockOpenmrsFetch.mockReturnValueOnce({ data: { results: withOlderAspirinVisit() } });

    renderGrouped();
    await waitForLoadingToFinish();

    const [newest, older] = screen.getAllByTestId('medication-visit-group');
    expect(newest).toHaveTextContent(/14-Aug-2023/);
    expect(newest).toHaveTextContent(/3 drug\(s\)/);
    expect(older).toHaveTextContent(/01-Aug-2023/);
    expect(older).toHaveTextContent(/1 drug\(s\)/);

    // newest open, older closed
    expect(screen.getByText(/Sulfacetamide 0.1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Aspirin 162.5mg/i)).not.toBeInTheDocument();

    const showOlder = within(older).getByRole('button', { name: /show medications prescribed on 01-Aug-2023/i });
    expect(showOlder).toHaveAttribute('aria-expanded', 'false');
    await user.click(showOlder);

    expect(screen.getByText(/Aspirin 162.5mg/i)).toBeInTheDocument();
    expect(within(older).getByRole('button', { name: /hide medications prescribed on 01-Aug-2023/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // the newest can be closed too
    await user.click(within(newest).getByRole('button', { name: /hide medications prescribed on 14-Aug-2023/i }));
    expect(screen.queryByText(/Sulfacetamide 0.1/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Aspirin 162.5mg/i)).toBeInTheDocument();
  });

  test('keeps one row per drug with a start date column when the setting is off', async () => {
    mockOpenmrsFetch.mockReturnValueOnce({ data: { results: mockPatientDrugOrdersApiData } });

    renderGrouped(false);
    await waitForLoadingToFinish();

    expect(screen.queryByTestId('medication-visit-group')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /start date/i })).toBeInTheDocument();
  });
});
