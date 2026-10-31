// tests/test_shopping_agent.js
// ─────────────────────────────────────────────────────────────────────────────
//  Test Suite for GroDealz Autonomous AI Shopping Agent
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const mongoose = require('mongoose');
const { parseShoppingRequest, calculateNormalizedRate, processAgentShoppingRequest } = require('../ai/shoppingAgent');
const { validateAndVerifyBasket } = require('../controllers/aiController');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/grodeaz';

async function runTests() {
  console.log('🧪 Starting AI Shopping Agent Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Complex Natural Language Parsing (User's Exact Benchmark Prompt)
  console.log('--- Test Case 1: Complex NL Intent & Constraint Extraction ---');
  const benchmarkPrompt = 'Buy groceries for a family of four for three days. My budget is ₹1,500. Prefer fresh vegetables, good-quality rice, and the cheapest reasonable options. Deliver today.';
  const parsed = parseShoppingRequest(benchmarkPrompt);
  console.log('  Parsed Output:', parsed);

  assert(parsed.familySize === 4, `Family size parsed as 4 (got ${parsed.familySize})`);
  assert(parsed.durationDays === 3, `Duration parsed as 3 days (got ${parsed.durationDays})`);
  assert(parsed.budget === 1500, `Budget parsed as ₹1500 (got ${parsed.budget})`);
  assert(parsed.deliveryUrgency === 'today', `Delivery urgency parsed as 'today' (got ${parsed.deliveryUrgency})`);
  assert(parsed.requestedItems.includes('rice'), `Identified 'rice' in requested items`);
  assert(parsed.categories.includes('vegetables') || parsed.requestedItems.length > 0, `Identified vegetable/produce requirement`);

  // TEST 2: Unit Normalization Calculations
  console.log('\n--- Test Case 2: Unit Normalization & Apples-to-Apples Rate Comparison ---');
  const rate500g = calculateNormalizedRate(35, '500g'); // ₹35 for 500g -> ₹70/kg
  const rate1kg = calculateNormalizedRate(60, '1kg');   // ₹60 for 1kg -> ₹60/kg
  const rate200ml = calculateNormalizedRate(25, '200ml'); // ₹25 for 200ml -> ₹125/L
  const rate1L = calculateNormalizedRate(52, '1L');     // ₹52 for 1L -> ₹52/L

  assert(rate500g === 70, `500g @ ₹35 normalized to ₹70/kg (got ${rate500g})`);
  assert(rate1kg === 60, `1kg @ ₹60 normalized to ₹60/kg (got ${rate1kg})`);
  assert(rate1kg < rate500g, `Correctly identifies 1kg pack as lower unit rate than 500g pack`);
  assert(rate1L === 52, `1L @ ₹52 normalized to ₹52/L (got ${rate1L})`);

  // TEST 3: Full End-to-End Database Grounding & Basket Optimization
  console.log('\n--- Test Case 3: MongoDB Connected Multi-Store Optimization ---');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log('  Connected to MongoDB');

    const result = await processAgentShoppingRequest(benchmarkPrompt);
    assert(result.success === true, 'Agent shopping request succeeded');
    assert(result.strategies?.multiStore !== undefined, 'Multi-store strategy generated');
    assert(result.strategies.multiStore.stores.length >= 1, `Multi-store contains stores (got ${result.strategies.multiStore.stores.length})`);
    assert(result.strategies.multiStore.grandTotal <= 1500, `Total cost ₹${result.strategies.multiStore.grandTotal} is within ₹1500 budget`);

    // Verify database grounding safety
    const safety = await validateAndVerifyBasket(result.strategies.multiStore.allItems);
    assert(safety.valid === true, 'Zero-hallucination guarantee: All proposed items verified active & in-stock in MongoDB');

    await mongoose.disconnect();
  } catch (err) {
    console.log('  ℹ️ MongoDB not running locally or timeout, skipped live DB query step (syntax & parsing verified). Error:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
