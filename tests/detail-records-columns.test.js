'use strict';

const assert = require('assert');
const {
  requireHeaderIndex,
  calculateLeadTotals,
  buildCustomerProfiles,
  classifyCustomerCategory,
  isActiveCustomer,
  aggregateCustomerRevenue,
  calculateAverageDealValueByCategory,
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

const customerProfiles = buildCustomerProfiles([
  ['T2 - Textile (Apparel)', '1', 'Acme', 'Active'],
  ['T1 - Apparel', '2', 'Beta', 'Active'],
  ['Acadamic', '3', 'Campus', 'Active'],
  ['Others', '4', 'Dormant', 'Suspend'],
  ['T1 & T2 - Apparel', '5', 'Hybrid', 'Active'],
]);

assert.strictEqual(classifyCustomerCategory('T2 - Textile (Apparel)'), 'T2 Suppliers');
assert.strictEqual(classifyCustomerCategory('T1 - Apparel'), 'T1 Suppliers');
assert.strictEqual(classifyCustomerCategory('Acadamic'), 'Acadamic');
assert.strictEqual(classifyCustomerCategory(''), 'Others');
assert.strictEqual(classifyCustomerCategory('T1 & T2 - Apparel'), 'T2 Suppliers');

const customerRevenueRows = [
  ['', 'Acme', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '20,000'],
  ['', 'Beta', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '$26,000'],
  ['', ' acme ', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 6000],
  ['', 'Dormant', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 50000],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 5000],
];

const customerRevenueTotals = aggregateCustomerRevenue(customerRevenueRows, {
  customerIndex: 1,
  revenueIndex: 28,
  includeCustomer: customerName => isActiveCustomer(customerName, customerProfiles),
});

assert.deepStrictEqual(customerRevenueTotals, [
  { name: 'Acme', totalRevenue: 26000 },
  { name: 'Beta', totalRevenue: 26000 },
]);
assert.strictEqual(customerRevenueTotals.filter(customer => customer.totalRevenue > 25000).length, 2);

const averageDealValueByCategory = calculateAverageDealValueByCategory([
  ['', 'Acme', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 10000],
  ['', 'Acme', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 30000],
  ['', 'Beta', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 12000],
  ['', 'Campus', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 4000],
  ['', 'Hybrid', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 20000],
  ['', 'Dormant', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 50000],
], {
  customerIndex: 1,
  revenueIndex: 28,
  customerProfiles,
});

assert.deepStrictEqual(averageDealValueByCategory, [
  { group: 'T2 Suppliers', revenue: 60000, dealCount: 3, customerCount: 2, averageDealValue: 20000 },
  { group: 'T1 Suppliers', revenue: 12000, dealCount: 1, customerCount: 1, averageDealValue: 12000 },
  { group: 'Acadamic', revenue: 4000, dealCount: 1, customerCount: 1, averageDealValue: 4000 },
  { group: 'Others', revenue: 0, dealCount: 0, customerCount: 0, averageDealValue: 0 },
]);

console.log('detail-records column tests passed');
