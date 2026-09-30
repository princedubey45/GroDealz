// tests/test_ai_engine.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Accuracy & Business Logic Test Suite
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const { extractIntentAndEntities } = require('../ai/intentExtractor');
const { generateGroceryPlan }      = require('../ai/groceryPlanner');
const { validateAndVerifyBasket }  = require('../controllers/aiController');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/grodeaz';

async function runTests() {
  console.log('🧪 Starting GroDealz AI Accuracy & Business-Logic Test Suite...\n');
  
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB for AI Verification\n');

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

  // TEST CASE 1: Hinglish Query Parsing & Entity Extraction
  console.log('--- Test Case 1: Hinglish NLP Intent & Entity Extraction ---');
  const sampleQuery = 'Mujhe 4 log ke liye 3 din ka grocery chahiye under ₹1000.';
  const extracted = extractIntentAndEntities(sampleQuery);
  console.log('  Query:', sampleQuery);
  console.log('  Extracted:', extracted);

  assert(extracted.intent === 'shopping_plan', 'Intent extracted as shopping_plan');
  assert(extracted.familySize === 4, 'Family size extracted as 4');
  assert(extracted.durationDays === 3, 'Duration days extracted as 3');
  assert(extracted.budget === 1000, 'Budget extracted as 1000');
  assert(['family_shopping', 'budget_shopping'].includes(extracted.shoppingGoal), 'Valid shoppingGoal assigned');

  // TEST CASE 2: DB Grounding & Budget Enforcement
  console.log('\n--- Test Case 2: Grounded Grocery Planning & Budget Enforcement ---');
  const plan = await generateGroceryPlan({
    familySize: extracted.familySize,
    durationDays: extracted.durationDays,
    budget: extracted.budget,
    dietary: extracted.dietary,
    shoppingGoal: extracted.shoppingGoal
  });

  assert(plan.success === true, 'Grocery plan generation reported success');
  assert(plan.basket.length > 0, 'Basket contains products');
  assert(plan.totalPrice <= 1000, `Total basket price (₹${plan.totalPrice}) <= ₹1000 budget`);

  // Verify DB Grounding for every product in basket
  for (const item of plan.basket) {
    const dbProd = await Product.findById(item.product).lean();
    assert(dbProd !== null, `Product "${item.name}" exists in MongoDB`);
    assert(dbProd.isActive === true, `Product "${item.name}" is active (isActive === true)`);
    assert(dbProd.stock?.isAvailable === true, `Product "${item.name}" stock is available`);
    assert(dbProd.stock?.quantity >= item.quantity, `Product "${item.name}" stock (${dbProd.stock?.quantity}) >= recommended quantity (${item.quantity})`);
    assert(item.quantity > 0, `Quantity for "${item.name}" is valid (> 0)`);
  }

  // TEST CASE 3: 1-Click Cart Addition & Safety Validation Layer
  console.log('\n--- Test Case 3: Safety & Reliability Validation (1-Click Cart Ready) ---');
  const validation = await validateAndVerifyBasket(plan.action.items);
  assert(validation.valid === true, 'Basket passed safety and inventory validation');
  assert(validation.verifiedItems.length === plan.basket.length, 'Verified items count matches basket count');
  assert(validation.totalPrice === plan.totalPrice, 'Calculated total price matches plan total');

  console.log(`\n==================================================`);
  console.log(`🎉 Test Run Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`==================================================\n`);

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
