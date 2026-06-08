'use strict';

const assert = require('assert');
const { requireHeaderIndex } = require('../fetch-data');

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

console.log('detail-records column tests passed');
