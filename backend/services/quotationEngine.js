// services/quotationEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Module B — Merchant Quotation Engine
// Multi-criteria ranking, itemized quote calculation, counter-offers,
// revisions, and conversion to confirmed orders.
// ─────────────────────────────────────────────────────────────────────────────
const BuyerRequest = require('../models/BuyerRequest');
const MerchantQuotation = require('../models/MerchantQuotation');
const Order = require('../models/Order');

/**
 * Validates line items and calculates subtotals & grand totals
 */
function validateAndCalculateQuote(lineItems = [], deliveryCharge = 0, tax = 0) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('At least one itemized line item is required');
  }

  const calculatedItems = lineItems.map((item, idx) => {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);

    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Invalid quantity "${item.quantity}" for item #${idx + 1}`);
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new Error(`Invalid unit price "${item.unitPrice}" for item #${idx + 1}`);
    }

    const lineTotal = Math.round(qty * unitPrice * 100) / 100;

    return {
      itemIndex: idx,
      productName: String(item.productName || item.name || `Item ${idx + 1}`).trim(),
      quantity: qty,
      unit: String(item.unit || 'kg').trim(),
      unitPrice,
      lineTotal,
      inStock: item.inStock !== false,
      brandOffered: String(item.brandOffered || '').trim(),
      notes: String(item.notes || '').trim()
    };
  });

  const itemsSubtotal = Math.round(calculatedItems.reduce((acc, it) => acc + it.lineTotal, 0) * 100) / 100;
  const dCharge = Math.max(0, Number(deliveryCharge) || 0);
  const tAmount = Math.max(0, Number(tax) || 0);
  const grandTotal = Math.round((itemsSubtotal + dCharge + tAmount) * 100) / 100;

  return {
    lineItems: calculatedItems,
    itemsSubtotal,
    deliveryCharge: dCharge,
    tax: tAmount,
    grandTotal
  };
}

/**
 * Multi-criteria ranking of quotations based on customer's selected priority
 * Priorities:
 *  - 'lowest_price'    : Pure lowest grand total (items + delivery + tax)
 *  - 'fastest_delivery': Earliest proposed delivery date/time
 *  - 'highest_rated'   : Store rating and transaction trust
 *  - 'balanced'        : 50% price competitiveness, 30% delivery speed, 20% merchant trust
 */
function rankQuotations(quotations = [], priority = 'lowest_price', targetBudget = null) {
  if (!Array.isArray(quotations) || quotations.length === 0) {
    return [];
  }

  // Find min/max for normalization in balanced mode
  const grandTotals = quotations.map(q => q.grandTotal);
  const minPrice = Math.min(...grandTotals);
  const maxPrice = Math.max(...grandTotals);

  const deliveryTimes = quotations.map(q => new Date(q.proposedDeliveryDate).getTime());
  const earliestDelivery = Math.min(...deliveryTimes);
  const latestDelivery = Math.max(...deliveryTimes);

  const scoredQuotes = quotations.map(q => {
    // Clone or convert to object
    const quoteObj = typeof q.toObject === 'function' ? q.toObject() : { ...q };
    const price = quoteObj.grandTotal;
    const deliveryMs = new Date(quoteObj.proposedDeliveryDate).getTime();
    
    // Store metrics
    const store = quoteObj.store || {};
    const storeRating = (store.ratings && !isNaN(store.ratings.average)) ? Number(store.ratings.average) : ((store.rating && !isNaN(store.rating)) ? Number(store.rating) : 4.5);
    const storeReviews = (store.ratings && !isNaN(store.ratings.count)) ? Number(store.ratings.count) : ((store.totalReviews && !isNaN(store.totalReviews)) ? Number(store.totalReviews) : 12);

    let score = 0;
    let badge = '';

    // Budget savings indicator
    if (targetBudget && targetBudget > 0) {
      const diff = targetBudget - price;
      if (diff >= 0) {
        quoteObj.budgetStatus = `Within Budget (Saves ₹${diff.toFixed(0)})`;
      } else {
        quoteObj.budgetStatus = `₹${Math.abs(diff).toFixed(0)} Above Target`;
      }
    }

    if (priority === 'lowest_price') {
      // Invert price: lower price = higher score
      score = 1000000 - price;
      if (price === minPrice) {
        badge = 'Lowest Total Price';
      }
    } else if (priority === 'fastest_delivery') {
      // Invert delivery timestamp: earlier = higher score
      score = 2000000000000 - deliveryMs;
      if (deliveryMs === earliestDelivery) {
        badge = 'Fastest Delivery';
      }
    } else if (priority === 'highest_rated') {
      score = (storeRating * 1000) + Math.min(storeReviews, 100);
      badge = 'Top Rated Store';
    } else {
      // 'balanced' composite score (0 - 100 points)
      // 1. Price Score (0 - 50 pts):
      let priceScore = 50;
      if (maxPrice > minPrice) {
        priceScore = 50 * (1 - (price - minPrice) / (maxPrice - minPrice));
      }
      // Bonus if under budget
      if (targetBudget && price <= targetBudget) {
        priceScore = Math.min(50, priceScore + 5);
      }

      // 2. Delivery Speed Score (0 - 30 pts):
      let deliveryScore = 30;
      if (latestDelivery > earliestDelivery) {
        deliveryScore = 30 * (1 - (deliveryMs - earliestDelivery) / (latestDelivery - earliestDelivery));
      }

      // 3. Store Rating Score (0 - 20 pts):
      const ratingScore = (storeRating / 5) * 20;

      score = Math.round((priceScore + deliveryScore + ratingScore) * 10) / 10;
      if (price === minPrice && deliveryMs === earliestDelivery) {
        badge = 'Best Overall Match';
      } else if (score >= 80) {
        badge = 'Recommended Deal';
      }
    }

    quoteObj.rankScore = Math.round(score * 100) / 100;
    quoteObj.rankBadge = badge;

    return quoteObj;
  });

  // Sort descending by rank score
  scoredQuotes.sort((a, b) => b.rankScore - a.rankScore);

  // If no badge assigned to top quote, give top priority badge
  if (scoredQuotes.length > 0 && !scoredQuotes[0].rankBadge) {
    if (priority === 'lowest_price') scoredQuotes[0].rankBadge = 'Lowest Total Price';
    else if (priority === 'fastest_delivery') scoredQuotes[0].rankBadge = 'Fastest Delivery';
    else if (priority === 'highest_rated') scoredQuotes[0].rankBadge = 'Top Rated Store';
    else scoredQuotes[0].rankBadge = 'Best Overall Value';
  }

  return scoredQuotes;
}

/**
 * Customer applies a counter-offer to a quotation
 */
async function applyCounterOffer(quotationId, customerId, proposedGrandTotal, customerNote = '') {
  const quote = await MerchantQuotation.findOne({
    $or: [{ _id: quotationId }, { quotationId }]
  }).populate('request');

  if (!quote) {
    throw new Error('Quotation not found');
  }

  if (quote.request.customer.toString() !== customerId.toString()) {
    throw new Error('Unauthorized: You are not the owner of this request');
  }

  if (['accepted', 'rejected', 'expired'].includes(quote.status)) {
    throw new Error(`Cannot counter-offer on quote with status "${quote.status}"`);
  }

  const propTotal = Number(proposedGrandTotal);
  if (isNaN(propTotal) || propTotal <= 0) {
    throw new Error('Please enter a valid counter offer price');
  }

  quote.counterOffer = {
    proposedGrandTotal: propTotal,
    customerNote: String(customerNote).trim(),
    counteredAt: new Date()
  };
  quote.status = 'customer_countered';
  await quote.save();

  // Update request status to negotiating
  await BuyerRequest.findByIdAndUpdate(quote.request._id, {
    status: 'negotiating'
  });

  return quote;
}

/**
 * Merchant revises quotation (e.g. In response to counter-offer)
 */
async function reviseQuotation(quotationId, merchantId, updateData = {}) {
  const quote = await MerchantQuotation.findOne({
    $or: [{ _id: quotationId }, { quotationId }]
  }).populate('request');

  if (!quote) {
    throw new Error('Quotation not found');
  }

  if (quote.merchant.toString() !== merchantId.toString()) {
    throw new Error('Unauthorized: You are not the owner merchant of this quotation');
  }

  if (['accepted', 'rejected'].includes(quote.status)) {
    throw new Error(`Cannot revise quote with status "${quote.status}"`);
  }

  // 1. Archive current version to revisionHistory
  quote.revisionHistory.push({
    revisedAt: new Date(),
    itemsSubtotal: quote.itemsSubtotal,
    deliveryCharge: quote.deliveryCharge,
    tax: quote.tax,
    grandTotal: quote.grandTotal,
    merchantNote: updateData.merchantNote || 'Quotation revised by merchant',
    lineItems: quote.lineItems
  });

  // 2. Calculate updated values
  const lineItems = updateData.lineItems || quote.lineItems;
  const dCharge = updateData.deliveryCharge !== undefined ? updateData.deliveryCharge : quote.deliveryCharge;
  const tAmount = updateData.tax !== undefined ? updateData.tax : quote.tax;

  const calculated = validateAndCalculateQuote(lineItems, dCharge, tAmount);

  quote.lineItems = calculated.lineItems;
  quote.itemsSubtotal = calculated.itemsSubtotal;
  quote.deliveryCharge = calculated.deliveryCharge;
  quote.tax = calculated.tax;
  quote.grandTotal = calculated.grandTotal;
  quote.status = 'merchant_revised';

  if (updateData.proposedDeliveryDate) {
    quote.proposedDeliveryDate = new Date(updateData.proposedDeliveryDate);
  }
  if (updateData.expiresAt) {
    quote.expiresAt = new Date(updateData.expiresAt);
  }
  if (updateData.stockConfirmed !== undefined) {
    quote.stockConfirmed = Boolean(updateData.stockConfirmed);
  }

  await quote.save();
  return quote;
}

/**
 * Customer accepts quotation -> Creates confirmed order & updates all quotes
 */
async function acceptQuotationAndCreateOrder(quotationId, customerId, deliveryDetails = {}, paymentMethod = 'cod') {
  const quote = await MerchantQuotation.findOne({
    $or: [{ _id: quotationId }, { quotationId }]
  }).populate('request').populate('store');

  if (!quote) {
    throw new Error('Quotation not found');
  }

  const reqObj = quote.request;
  if (reqObj.customer.toString() !== customerId.toString()) {
    throw new Error('Unauthorized: You do not own this request');
  }

  if (new Date(quote.expiresAt) < new Date()) {
    quote.status = 'expired';
    await quote.save();
    throw new Error('This quotation has expired');
  }

  if (['accepted', 'rejected'].includes(quote.status)) {
    throw new Error(`This quotation is already ${quote.status}`);
  }

  // 1. Mark this quote accepted
  quote.status = 'accepted';
  await quote.save();

  // 2. Reject all other competitor quotes for this request
  await MerchantQuotation.updateMany(
    { request: reqObj._id, _id: { $ne: quote._id } },
    { $set: { status: 'rejected' } }
  );

  // 3. Convert itemized line items to Order items
  const orderItems = quote.lineItems.map(item => ({
    product: null,
    name: `${item.productName}${item.brandOffered ? ` (${item.brandOffered})` : ''}`,
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.lineTotal
  }));

  // Determine delivery address
  let resolvedAddress = 'Customer Address';
  let lat = 24.817;
  let lng = 93.937;

  if (typeof deliveryDetails.address === 'string' && deliveryDetails.address.trim()) {
    resolvedAddress = deliveryDetails.address.trim();
  } else if (reqObj.deliveryAddress) {
    resolvedAddress = [reqObj.deliveryAddress.street, reqObj.deliveryAddress.area, reqObj.deliveryAddress.city]
      .filter(Boolean)
      .join(', ') || 'Imphal, Manipur';
    lat = reqObj.deliveryAddress.lat || 24.817;
    lng = reqObj.deliveryAddress.lng || 93.937;
  }

  // 4. Create confirmed Order
  const order = new Order({
    customer: customerId,
    store: quote.store._id,
    items: orderItems,
    pricing: {
      subtotal: quote.itemsSubtotal,
      deliveryFee: quote.deliveryCharge,
      discount: 0,
      total: quote.grandTotal
    },
    status: 'placed',
    statusHistory: [
      {
        status: 'placed',
        note: `Order converted from Accepted RFQ Quotation #${quote.quotationId}`
      }
    ],
    delivery: {
      address: resolvedAddress,
      lat,
      lng,
      estimatedTime: 60
    },
    payment: {
      method: ['cod', 'online', 'wallet'].includes(paymentMethod) ? paymentMethod : 'cod',
      status: 'pending'
    },
    ai: {
      recommendedByAI: true,
      deliveryOptimized: true
    }
  });

  await order.save();

  // 5. Update BuyerRequest with accepted quotation and created order
  reqObj.status = 'accepted';
  reqObj.selectedQuotation = quote._id;
  reqObj.convertedOrderId = order._id;
  await reqObj.save();

  return {
    quotation: quote,
    order
  };
}

module.exports = {
  validateAndCalculateQuote,
  rankQuotations,
  applyCounterOffer,
  reviseQuotation,
  acceptQuotationAndCreateOrder
};
