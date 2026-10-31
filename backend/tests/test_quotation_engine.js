// tests/test_quotation_engine.js
// ─────────────────────────────────────────────────────────────────────────────
// Automated Test Suite for Module B: Merchant Quotation Engine & RFQ System
// ─────────────────────────────────────────────────────────────────────────────
const assert = require('assert');
const { parseCustomerRequirement } = require('../services/rfqParser');
const {
  validateAndCalculateQuote,
  rankQuotations
} = require('../services/quotationEngine');

async function runTests() {
  console.log('🧪 Starting Merchant Quotation Engine (Module B) Test Suite...\n');

  // ─── TEST 1: Natural Language Requirement Parser ──────────────────────────
  console.log('▶ Test 1: Natural Language Requirement Parsing');
  const userPrompt = "I need 25 kg basmati rice for a hostel. My budget is ₹2,500. Delivery within two days.";
  const parsed = parseCustomerRequirement(userPrompt);

  console.log('  Parsed Result:', JSON.stringify(parsed, null, 2));

  assert.strictEqual(parsed.budget, 2500, 'Budget should be parsed as 2500');
  assert.strictEqual(parsed.deliveryDays, 2, 'Delivery days should be parsed as 2');
  assert.ok(parsed.items.length > 0, 'Should extract at least one item');
  assert.ok(
    parsed.items[0].name.toLowerCase().includes('basmati') || parsed.items[0].name.toLowerCase().includes('rice'),
    'First item should be rice / basmati rice'
  );
  assert.strictEqual(parsed.items[0].quantity, 25, 'Quantity should be 25');
  assert.strictEqual(parsed.items[0].unit, 'kg', 'Unit should be kg');
  console.log('  ✅ Test 1 Passed: NL requirement parsing matches expected fields.\n');

  // ─── TEST 2: Line Item Calculation & Total Validation ────────────────────
  console.log('▶ Test 2: Itemized Line-Item Calculations');
  
  // Shop A: 25 kg @ ₹94 = ₹2,350 + ₹50 delivery = ₹2,400
  const quoteA = validateAndCalculateQuote(
    [{ productName: 'Basmati Rice', quantity: 25, unit: 'kg', unitPrice: 94, inStock: true }],
    50, // Delivery
    0   // Tax
  );
  assert.strictEqual(quoteA.itemsSubtotal, 2350, 'Shop A subtotal should be 2350');
  assert.strictEqual(quoteA.deliveryCharge, 50, 'Shop A delivery charge should be 50');
  assert.strictEqual(quoteA.grandTotal, 2400, 'Shop A grand total should be 2400');

  // Shop B: 25 kg @ ₹90 = ₹2,250 + ₹100 delivery = ₹2,350
  const quoteB = validateAndCalculateQuote(
    [{ productName: 'Basmati Rice', quantity: 25, unit: 'kg', unitPrice: 90, inStock: true }],
    100,
    0
  );
  assert.strictEqual(quoteB.itemsSubtotal, 2250, 'Shop B subtotal should be 2250');
  assert.strictEqual(quoteB.deliveryCharge, 100, 'Shop B delivery charge should be 100');
  assert.strictEqual(quoteB.grandTotal, 2350, 'Shop B grand total should be 2350');

  // Shop C: 25 kg @ ₹91.20 = ₹2,280 + ₹0 delivery = ₹2,280
  const quoteC = validateAndCalculateQuote(
    [{ productName: 'Basmati Rice', quantity: 25, unit: 'kg', unitPrice: 91.2, inStock: true }],
    0,
    0
  );
  assert.strictEqual(quoteC.itemsSubtotal, 2280, 'Shop C subtotal should be 2280');
  assert.strictEqual(quoteC.deliveryCharge, 0, 'Shop C delivery charge should be 0');
  assert.strictEqual(quoteC.grandTotal, 2280, 'Shop C grand total should be 2280');

  console.log('  Shop A: Subtotal ₹2,350 + Delivery ₹50  = Grand Total ₹2,400');
  console.log('  Shop B: Subtotal ₹2,250 + Delivery ₹100 = Grand Total ₹2,350');
  console.log('  Shop C: Subtotal ₹2,280 + Delivery ₹0   = Grand Total ₹2,280');
  console.log('  ✅ Test 2 Passed: Line-item calculations and delivery totals verified.\n');

  // ─── TEST 3: Multi-Criteria Dynamic Quotation Ranking ─────────────────────
  console.log('▶ Test 3: Multi-Criteria Dynamic Quotation Ranking');
  const now = Date.now();
  const sampleQuotations = [
    {
      quotationId: 'QUO-SHOP-A',
      grandTotal: 2400,
      proposedDeliveryDate: new Date(now + 12 * 3600 * 1000), // 12 hours (earliest)
      store: { name: 'Shop A QuickMart', ratings: { average: 4.2, count: 40 } }
    },
    {
      quotationId: 'QUO-SHOP-B',
      grandTotal: 2350,
      proposedDeliveryDate: new Date(now + 36 * 3600 * 1000), // 36 hours
      store: { name: 'Shop B MegaStore', ratings: { average: 4.9, count: 120 } } // highest rating
    },
    {
      quotationId: 'QUO-SHOP-C',
      grandTotal: 2280, // lowest price
      proposedDeliveryDate: new Date(now + 24 * 3600 * 1000), // 24 hours
      store: { name: 'Shop C Express', ratings: { average: 4.5, count: 65 } }
    }
  ];

  // 3a. Ranking by 'lowest_price'
  console.log("  3a. Ranking by 'lowest_price':");
  const rankedByPrice = rankQuotations(sampleQuotations, 'lowest_price', 2500);
  assert.strictEqual(rankedByPrice[0].quotationId, 'QUO-SHOP-C', 'Shop C must rank #1 for lowest price');
  assert.strictEqual(rankedByPrice[1].quotationId, 'QUO-SHOP-B', 'Shop B must rank #2 for lowest price');
  assert.strictEqual(rankedByPrice[2].quotationId, 'QUO-SHOP-A', 'Shop A must rank #3 for lowest price');
  assert.strictEqual(rankedByPrice[0].rankBadge, 'Lowest Total Price');
  console.log(`      #1: ${rankedByPrice[0].quotationId} (₹${rankedByPrice[0].grandTotal}) [${rankedByPrice[0].rankBadge}]`);
  console.log(`      #2: ${rankedByPrice[1].quotationId} (₹${rankedByPrice[1].grandTotal})`);
  console.log(`      #3: ${rankedByPrice[2].quotationId} (₹${rankedByPrice[2].grandTotal})`);

  // 3b. Ranking by 'fastest_delivery'
  console.log("  3b. Ranking by 'fastest_delivery':");
  const rankedByDelivery = rankQuotations(sampleQuotations, 'fastest_delivery', 2500);
  assert.strictEqual(rankedByDelivery[0].quotationId, 'QUO-SHOP-A', 'Shop A must rank #1 for fastest delivery');
  assert.strictEqual(rankedByDelivery[0].rankBadge, 'Fastest Delivery');
  console.log(`      #1: ${rankedByDelivery[0].quotationId} [${rankedByDelivery[0].rankBadge}]`);

  // 3c. Ranking by 'highest_rated'
  console.log("  3c. Ranking by 'highest_rated':");
  const rankedByRating = rankQuotations(sampleQuotations, 'highest_rated', 2500);
  assert.strictEqual(rankedByRating[0].quotationId, 'QUO-SHOP-B', 'Shop B must rank #1 for highest rated store');
  assert.strictEqual(rankedByRating[0].rankBadge, 'Top Rated Store');
  console.log(`      #1: ${rankedByRating[0].quotationId} (Rating: ${rankedByRating[0].store.ratings.average}★) [${rankedByRating[0].rankBadge}]`);

  // 3d. Ranking by 'balanced' composite score
  console.log("  3d. Ranking by 'balanced':");
  const rankedBalanced = rankQuotations(sampleQuotations, 'balanced', 2500);
  assert.ok(rankedBalanced.length === 3, 'Should rank all 3 quotes');
  console.log(`      #1: ${rankedBalanced[0].quotationId} (Score: ${rankedBalanced[0].rankScore}) [${rankedBalanced[0].rankBadge}]`);
  console.log(`      #2: ${rankedBalanced[1].quotationId} (Score: ${rankedBalanced[1].rankScore})`);
  console.log(`      #3: ${rankedBalanced[2].quotationId} (Score: ${rankedBalanced[2].rankScore})`);

  console.log('  ✅ Test 3 Passed: Multi-criteria dynamic ranking operates accurately for all customer priorities.\n');

  // ─── TEST 4: Multiple Items with Varying Line Items ───────────────────────
  console.log('▶ Test 4: Multi-Item Quotation Validation');
  const multiItems = [
    { productName: 'Basmati Rice', quantity: 25, unit: 'kg', unitPrice: 90 },
    { productName: 'Sunflower Oil', quantity: 5, unit: 'L', unitPrice: 140 },
    { productName: 'Sugar', quantity: 10, unit: 'kg', unitPrice: 42 }
  ];
  const multiQuote = validateAndCalculateQuote(multiItems, 70, 25);
  // Expected:
  // Rice: 25 * 90 = 2250
  // Oil: 5 * 140 = 700
  // Sugar: 10 * 42 = 420
  // Subtotal = 3370
  // Delivery = 70, Tax = 25 -> Grand Total = 3465
  assert.strictEqual(multiQuote.itemsSubtotal, 3370);
  assert.strictEqual(multiQuote.grandTotal, 3465);
  console.log(`  Multi-item Subtotal: ₹${multiQuote.itemsSubtotal}, Delivery: ₹${multiQuote.deliveryCharge}, Grand Total: ₹${multiQuote.grandTotal}`);
  console.log('  ✅ Test 4 Passed: Multi-item quotation calculation verified.\n');

  console.log('🎉 ALL QUOTATION ENGINE TESTS PASSED SUCCESSFULLY! (100% PASS)\n');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
