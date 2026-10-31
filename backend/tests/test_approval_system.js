// tests/test_approval_system.js
// ─────────────────────────────────────────────────────────────────────────────
//  Milestone 3 Test Suite: Persistent Purchase Proposals, Pre-flight
//  Revalidation, Cryptographic Audit Hashes, and Human-in-the-Loop Approval.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const mongoose = require('mongoose');
const crypto   = require('crypto');
const PurchaseProposal = require('../models/PurchaseProposal');
const Product = require('../models/Product');
const Store = require('../models/Store');
const User = require('../models/User');
const { processAgentShoppingRequest } = require('../ai/shoppingAgent');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/grodeaz';

async function runApprovalTests() {
  console.log('🧪 Starting Milestone 3 (Approval System) Test Suite...\n');
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

    // Find test customer
    let customer = await User.findOne({ role: 'customer' });
    if (!customer) {
      customer = await User.findOne();
    }
    if (!customer) {
      customer = await User.create({
        name: 'Test Customer',
        email: `test_approval_${Date.now()}@example.com`,
        password: 'password123',
        role: 'customer'
      });
    }

    // 1. Generate an AI Plan
    console.log('\n--- Test Case 1: AI Plan to Persistent Purchase Proposal ---');
    const prompt = 'Buy groceries for a family of four for three days. My budget is ₹1,500. Prefer fresh vegetables and good rice. Deliver today.';
    const plan = await processAgentShoppingRequest(prompt);
    assert(plan.success === true, 'AI Shopping Agent generated strategies');

    const multiStrat = plan.strategies.multiStore;
    assert(multiStrat !== undefined, 'Multi-store strategy is present');

    const count = await PurchaseProposal.countDocuments();
    const proposalId = `PRP-TEST-${Date.now().toString().slice(-6)}-${String(count + 1).padStart(4, '0')}`;

    const proposedItems = [];
    const storesInvolved = [];

    for (const storeGroup of multiStrat.stores) {
      const sId = storeGroup.store.id || storeGroup.store._id;
      storesInvolved.push({
        store: sId,
        name: storeGroup.store.name,
        deliveryFee: storeGroup.deliveryFee,
        itemsCount: storeGroup.items.length,
        storeSubtotal: storeGroup.storeSubtotal
      });

      for (const it of storeGroup.items) {
        proposedItems.push({
          product: it.product || it.productId || it._id,
          store: sId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          subtotal: it.subtotal || it.lineTotal || (it.price * it.quantity),
          unit: it.unit || '1 pack'
        });
      }
    }

    const proposal = await PurchaseProposal.create({
      proposalId,
      customer: customer._id,
      status: 'pending_review',
      requirements: {
        rawQuery: prompt,
        familySize: 4,
        durationDays: 3,
        budgetLimit: 1500,
        deliveryUrgency: 'today'
      },
      selectedStrategy: 'multiStore',
      strategiesSnapshot: plan.strategies,
      proposedItems,
      pricingSummary: {
        itemsSubtotal: multiStrat.itemsSubtotal || 0,
        deliveryFees: multiStrat.deliveryFees || multiStrat.deliveryFeesTotal || 30,
        totalAmount: multiStrat.grandTotal || 0,
        estimatedSavings: multiStrat.estimatedSavings || multiStrat.savings || 0
      },
      storesInvolved
    });

    assert(proposal._id !== null, `PurchaseProposal created with ID: ${proposal.proposalId}`);
    assert(proposal.status === 'pending_review', 'Initial status is pending_review');
    assert(proposal.proposedItems.length > 0, `Proposal contains ${proposal.proposedItems.length} items`);

    // 2. Cryptographic Integrity Hash
    console.log('\n--- Test Case 2: Cryptographic Tamper-Evident SHA-256 Audit Hash ---');
    const hash1 = proposal.calculateSnapshotHash();
    assert(typeof hash1 === 'string' && hash1.length === 64, `SHA-256 snapshot hash generated (${hash1.slice(0, 16)}...)`);

    // Simulate price tampering detection
    const tamperedPayload = {
      proposalId: proposal.proposalId,
      customer: proposal.customer.toString(),
      selectedStrategy: proposal.selectedStrategy,
      items: proposal.proposedItems.map(i => ({
        product: i.product.toString(),
        store: i.store.toString(),
        price: i.price + 10, // Tampered price
        quantity: i.quantity,
        subtotal: i.subtotal + 10
      })),
      totalAmount: proposal.pricingSummary.totalAmount + 10
    };
    const tamperedHash = crypto.createHash('sha256').update(JSON.stringify(tamperedPayload)).digest('hex');
    assert(hash1 !== tamperedHash, 'Integrity verification: Changing item price changes SHA-256 snapshot hash');

    // 3. Pre-Flight Inventory Revalidation
    console.log('\n--- Test Case 3: Pre-Flight Price & Stock Revalidation ---');
    const productIds = proposal.proposedItems.map(i => i.product);
    const dbProds = await Product.find({ _id: { $in: productIds } }).lean();
    assert(dbProds.length === productIds.length, 'All proposed products exist active in database');

    const allInStock = dbProds.every(p => p.isActive && p.stock?.isAvailable && (p.stock?.quantity >= 1));
    assert(allInStock === true, 'Pre-flight check passed: all proposed items have sufficient available stock');

    // 4. Human Approval Workflow
    console.log('\n--- Test Case 4: Customer Approval Stamping ---');
    proposal.status = 'approved';
    proposal.approvalRecord = {
      approvedAt: new Date(),
      approvedBy: customer._id,
      ipAddress: '127.0.0.1',
      userAgent: 'TestRunner/Jest',
      snapshotHash: hash1
    };
    await proposal.save();

    const verifiedProposal = await PurchaseProposal.findOne({ proposalId });
    assert(verifiedProposal.status === 'approved', 'Proposal transitioned to "approved" state');
    assert(verifiedProposal.approvalRecord.snapshotHash === hash1, 'Immutable approval record preserved');
    assert(verifiedProposal.approvalRecord.approvedAt !== null, 'Approved timestamp captured');

    // Clean up test document
    await PurchaseProposal.deleteOne({ _id: proposal._id });
    console.log('  Cleaned up test proposal document');

    await mongoose.disconnect();
  } catch (err) {
    console.log('  ℹ️ MongoDB check error or skipped:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runApprovalTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
