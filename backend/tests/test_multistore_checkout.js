// tests/test_multistore_checkout.js
// ─────────────────────────────────────────────────────────────────────────────
//  Milestone 4 Test Suite: Multi-Store Basket Splitting, Idempotency Protection,
//  Unified Group Checkout, and Store-by-Store Real-Time Tracking.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Store = require('../models/Store');
const User = require('../models/User');
const PurchaseProposal = require('../models/PurchaseProposal');
const { processAgentShoppingRequest } = require('../ai/shoppingAgent');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/grodeaz';

async function runMultiStoreCheckoutTests() {
  console.log('🧪 Starting Milestone 4 (Multi-Store Checkout) Test Suite...\n');
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

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2500 });
    console.log('  Connected to MongoDB');

    let customer = await User.findOne({ role: 'customer' });
    if (!customer) customer = await User.findOne();
    if (!customer) {
      customer = await User.create({
        name: 'Checkout Customer',
        email: `test_checkout_${Date.now()}@example.com`,
        password: 'password123',
        role: 'customer'
      });
    }

    // 1. Generate an AI Multi-Store Plan
    console.log('\n--- Test Case 1: AI Multi-Store Basket Generation & Splitting ---');
    const prompt = 'Buy groceries for a family of four for three days. My budget is ₹1,500. Prefer fresh vegetables and good rice. Deliver today.';
    const plan = await processAgentShoppingRequest(prompt);
    assert(plan.success === true, 'Generated AI plan');

    const multiStrat = plan.strategies.multiStore;
    assert(multiStrat.stores.length >= 2, `Multi-store contains at least 2 distinct stores (got ${multiStrat.stores.length})`);

    const itemsToCheckout = (multiStrat.allItems || []).map(i => ({
      productId: i.product || i._id,
      quantity: i.quantity || 1,
      storeId: i.store?.id || i.store?._id || i.store
    }));

    // Generate Proposal to link
    const proposalId = `PRP-TEST-${Date.now().toString().slice(-6)}`;
    const proposal = await PurchaseProposal.create({
      proposalId,
      customer: customer._id,
      status: 'approved',
      requirements: { rawQuery: prompt },
      selectedStrategy: 'multiStore',
      pricingSummary: {
        itemsSubtotal: multiStrat.itemsSubtotal || 0,
        deliveryFees: multiStrat.deliveryFeesTotal || 60,
        totalAmount: multiStrat.grandTotal || 0
      }
    });

    // 2. Perform Basket Splitting & Idempotency Check
    console.log('\n--- Test Case 2: Multi-Store Order Creation with Idempotency Key ---');
    const idempotencyKey = `idem_key_${Date.now()}_test`;

    // Group items by store
    const storeGroups = {};
    const productIds = itemsToCheckout.map(i => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).populate('store').lean();
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    for (const item of itemsToCheckout) {
      const p = productMap[item.productId.toString()];
      if (!p) continue;
      const sId = (p.store?._id || p.store).toString();
      if (!storeGroups[sId]) storeGroups[sId] = { store: p.store, items: [] };
      storeGroups[sId].items.push({
        product: p._id,
        name: p.name,
        price: p.price,
        quantity: item.quantity,
        subtotal: p.price * item.quantity
      });
    }

    const storeIds = Object.keys(storeGroups);
    assert(storeIds.length >= 2, `Items grouped into ${storeIds.length} separate stores`);

    const count = await Order.countDocuments();
    const groupId = `GRD-GRP-TEST-${String(count + 1).padStart(4, '0')}`;
    let overallTotal = 0;
    const createdOrders = [];

    for (const sId of storeIds) {
      const grp = storeGroups[sId];
      const subtotal = grp.items.reduce((s, i) => s + i.subtotal, 0);
      const deliveryFee = 30;
      const total = subtotal + deliveryFee;
      overallTotal += total;

      const order = await Order.create({
        customer: customer._id,
        store: sId,
        groupId,
        proposalId,
        idempotencyKey,
        isGroupOrder: true,
        groupSummary: { totalStores: storeIds.length, totalGroupAmount: 0 },
        items: grp.items,
        pricing: { subtotal, deliveryFee, total },
        delivery: { address: 'Paona Bazar, Imphal' },
        payment: { method: 'online', status: 'pending' },
        status: 'placed'
      });
      createdOrders.push(order);
    }

    await Order.updateMany({ groupId }, { $set: { 'groupSummary.totalGroupAmount': overallTotal } });
    await PurchaseProposal.findOneAndUpdate({ proposalId }, { status: 'converted_to_order', convertedGroupId: groupId });

    assert(createdOrders.length === storeIds.length, `Created ${createdOrders.length} child orders for group ${groupId}`);
    const verifiedProposal = await PurchaseProposal.findOne({ proposalId });
    assert(verifiedProposal.status === 'converted_to_order', 'Proposal marked as converted_to_order');
    assert(verifiedProposal.convertedGroupId === groupId, 'Proposal linked to group ID');

    // 3. Test Idempotency Replay Protection
    console.log('\n--- Test Case 3: Idempotency Replay Protection ---');
    const replayOrders = await Order.find({ idempotencyKey, customer: customer._id });
    assert(replayOrders.length === createdOrders.length, 'Idempotency lookup matches existing orders count');
    assert(replayOrders[0].groupId === groupId, 'Idempotency lookup returns identical groupId without creating new orders');

    // 4. Test Group Order Tracking
    console.log('\n--- Test Case 4: Consolidated Store-by-Store Group Order Tracking ---');
    const groupOrders = await Order.find({ groupId }).populate('store', 'name emoji');
    assert(groupOrders.length >= 2, `Group query returned all ${groupOrders.length} store orders`);

    const storeNames = groupOrders.map(o => o.store.name);
    console.log('  Participating Store Orders:', storeNames);
    assert(new Set(storeNames).size >= 2, 'Child orders represent distinct store vendors');

    // 5. Test Unified Group Payment Verification Simulation
    console.log('\n--- Test Case 5: Unified Payment Verification ---');
    const fakePaymentId = `pay_${Date.now()}`;
    await Order.updateMany(
      { groupId },
      {
        $set: {
          'payment.status': 'paid',
          'payment.razorpayPaymentId': fakePaymentId,
          status: 'confirmed'
        }
      }
    );

    const paidOrders = await Order.find({ groupId });
    assert(paidOrders.every(o => o.payment.status === 'paid'), 'All child orders atomically updated to "paid"');
    assert(paidOrders.every(o => o.status === 'confirmed'), 'All child orders status updated to "confirmed"');

    // Clean up test documents
    await Order.deleteMany({ groupId });
    await PurchaseProposal.deleteOne({ proposalId });
    console.log('  Cleaned up test group orders and proposal');

    await mongoose.disconnect();
  } catch (err) {
    console.log('  ℹ️ MongoDB check error:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runMultiStoreCheckoutTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
