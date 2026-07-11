'use strict';

const assert = require('assert');
const {
  requireHeaderIndex,
  calculateLeadTotals,
  aggregateCustomerRevenue,
} = require('../fetch-data');

const headers = [
  '#',
  '',
  '',
  '',
  'Type',
  'Date\n(MM/DD/YYYY)',
  'Country',
  'Month',
  'Purchased Product',
  'Purchased Item',
  'Remark',
  'Quotation Currency',
  'Direct Sale /\nThrough TG3D',
  'NunoX Invoice Amount',
  'TG3D Invoice Amount ',
  'TG3D Invoice Amount \n(in USD)',
  'Sales Rep',
  'Discount',
  'Payment Currency',
  'Deposit',
  'Deposit Date\n(MM/DD/YYYY)',
  'Bank Fee',
  'Exchange Rate to \nTWD',
  'Remaining Payment Date\n(MM/DD/YYYY)',
  'Remaining Payment Amount',
  'TG3D Distribution in USD\n(Invoiced to TG3D)',
  'Share Revenue to TG3D in USD',
  'NunoX Direct Sales\nInvoice Amount in USD',
  'Total NunoX \nRevenue',
  'Total Received Amount\n in USD',
  'Outstanding Balance',
  'NOTE',
];

assert.strictEqual(requireHeaderIndex(headers, ['type']), 4);
assert.strictEqual(requireHeaderIndex(headers, ['date', 'mm/dd/yyyy']), 5);
assert.strictEqual(requireHeaderIndex(headers, ['purchased product']), 8);
assert.strictEqual(requireHeaderIndex(headers, ['total nunox', 'revenue']), 28);
assert.strictEqual(requireHeaderIndex(headers, ['outstanding balance']), 30);
assert.throws(() => requireHeaderIndex(headers, ['missing column']), /Missing Detail Records column/);

const leadTotals = calculateLeadTotals({
  Active: { totalValue: 1058606, totalWeighted: 120911 },
  Pending: { totalValue: 228219, totalWeighted: 23706 },
  Closed: { totalValue: 477542, totalWeighted: 333393 },
  Dead: { totalValue: 45000, totalWeighted: 0 },
});
assert.deepStrictEqual(leadTotals, {
  totalLeadRevenue: 1058606,
  totalWeightedRevenue: 120911,
});

const customerRevenueTotals = aggregateCustomerRevenue([
  ['', 'Acme', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '20,000'],
  ['', 'Beta', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '$26,000'],
  ['', ' acme ', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 6000],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 5000],
], {
  customerIndex: 1,
  revenueIndex: 28,
});

assert.deepStrictEqual(customerRevenueTotals, [
  { name: 'Acme', totalRevenue: 26000 },
  { name: 'Beta', totalRevenue: 26000 },
]);
assert.strictEqual(customerRevenueTotals.filter(customer => customer.totalRevenue > 25000).length, 2);

console.log('detail-records column tests passed');
