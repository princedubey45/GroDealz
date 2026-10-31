// routes/orders.js
const router  = require('express').Router();
const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const Store   = require('../models/Store');
const PurchaseProposal = require('../models/PurchaseProposal');
const { auth, ownerOnly }  = require('../middleware/auth');
const { recordInteraction } = require('../ai/recommendationEngine');

// Place order
router.post('/', auth, async (req, res) => {
  try {
    const { items, storeId, deliveryAddress, paymentMethod } = req.body;

    // Fetch product details and calculate totals
    const productIds   = items.map(i => i.productId);
    const products     = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap   = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const orderItems = items.map(i => {
      const p = productMap[i.productId];
      return { product: i.productId, name: p.name, price: p.price, quantity: i.quantity, subtotal: p.price * i.quantity };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
    const total    = subtotal + 30; // delivery fee

    const order = await Order.create({
      customer:   req.user._id,
      store:      storeId,
      items:      orderItems,
      pricing:    { subtotal, deliveryFee: 30, total },
      delivery:   { address: deliveryAddress, estimatedTime: 30 },
      payment:    { method: paymentMethod || 'cod' },
      statusHistory: [{ status: 'placed' }],
      ai:         { estimatedPrepTime: Math.ceil(orderItems.length * 2 + 10) }
    });

    // Update product order counts
    await Promise.all([
      ...items.map(i => Product.findByIdAndUpdate(i.productId, { $inc: { orderCount: i.quantity } })),
      Store.findByIdAndUpdate(storeId, { $inc: { 'stats.totalOrders': 1, 'stats.todayOrders': 1, 'stats.todayRevenue': total } }),
      User.findByIdAndUpdate(req.user._id, { $push: { 'profile.orderHistory': order._id }, $set: { cart: [] } }),
      ...items.map(i => recordInteraction(req.user._id, i.productId, 'purchase'))
    ]);

    // Real-time notification
    if (global.io) {
      global.io.to(`store_${storeId}`).emit('new_order', { orderId: order.orderId, total, itemCount: items.length });
    }

    const populated = await order.populate('items.product', 'name emoji');
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Place AI Agent Multi-Store Checkout
router.post('/agent-checkout', auth, async (req, res) => {
  try {
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    const { items, deliveryAddress, paymentMethod, deliveryNotes, proposalId } = req.body;

    // 1. Idempotency Check: if this key has already processed, return existing order set immediately
    if (idempotencyKey) {
      const existingOrders = await Order.find({ idempotencyKey, customer: req.user._id })
        .populate('store', 'name emoji location')
        .populate('items.product', 'name emoji price unit');

      if (existingOrders.length > 0) {
        const overallSubtotal = existingOrders.reduce((s, o) => s + (o.pricing?.subtotal || 0), 0);
        const overallDeliveryFee = existingOrders.reduce((s, o) => s + (o.pricing?.deliveryFee || 0), 0);
        const overallTotal = existingOrders.reduce((s, o) => s + (o.pricing?.total || 0), 0);
        return res.json({
          success: true,
          isIdempotentReplay: true,
          groupId: existingOrders[0].groupId,
          isMultiStore: existingOrders.length > 1,
          totalStores: existingOrders.length,
          overallSubtotal,
          overallDeliveryFee,
          overallTotal,
          orders: existingOrders
        });
      }
    }

    if (!items || !items.length) {
      return res.status(400).json({ message: 'No items provided for checkout' });
    }

    // Fetch product details
    const productIds = items.map(i => i.productId || i.product || i._id);
    const products = await Product.find({ _id: { $in: productIds } }).populate('store').lean();
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    // Group items by store
    const storeGroups = {};
    for (const item of items) {
      const pId = (item.productId || item.product || item._id).toString();
      const p = productMap[pId];
      if (!p) continue;

      const storeId = (p.store?._id || p.store || item.storeId || item.store).toString();
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = {
          store: p.store,
          items: []
        };
      }

      const qty = Math.max(1, parseInt(item.quantity || item.qty || 1, 10));
      storeGroups[storeId].items.push({
        product: p._id,
        name: p.name,
        price: p.price,
        quantity: qty,
        subtotal: p.price * qty,
        unit: p.unit,
        emoji: p.emoji
      });
    }

    const storeIds = Object.keys(storeGroups);
    if (!storeIds.length) {
      return res.status(400).json({ message: 'No valid products found for stores' });
    }

    const isMultiStore = storeIds.length > 1;
    const count = await Order.countDocuments();
    const groupId = `GRD-GRP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

    let overallTotal = 0;
    let overallSubtotal = 0;
    let overallDeliveryFee = 0;
    const createdOrders = [];
    const storeDeliveryFee = 30;

    for (const sId of storeIds) {
      const grp = storeGroups[sId];
      const subtotal = grp.items.reduce((s, i) => s + i.subtotal, 0);
      const deliveryFee = storeDeliveryFee;
      const total = subtotal + deliveryFee;

      overallSubtotal += subtotal;
      overallDeliveryFee += deliveryFee;
      overallTotal += total;

      const orderData = {
        customer: req.user._id,
        store: sId,
        groupId,
        proposalId: proposalId || null,
        idempotencyKey: idempotencyKey || null,
        isGroupOrder: isMultiStore,
        groupSummary: {
          totalStores: storeIds.length,
          totalGroupAmount: 0 // populated below
        },
        items: grp.items.map(i => ({
          product: i.product,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.subtotal
        })),
        pricing: {
          subtotal,
          deliveryFee,
          total
        },
        delivery: {
          address: deliveryAddress || '123 Main Street, Paona Bazar, Imphal',
          estimatedTime: 30,
          notes: deliveryNotes
        },
        payment: {
          method: paymentMethod || 'cod',
          status: 'pending'
        },
        statusHistory: [{
          status: 'placed',
          note: isMultiStore ? `Part of multi-store AI basket (${groupId})` : 'AI Shopping Agent order'
        }],
        ai: {
          recommendedByAI: true,
          deliveryOptimized: true,
          estimatedPrepTime: Math.ceil(grp.items.length * 2 + 10)
        }
      };

      const order = await Order.create(orderData);
      createdOrders.push(order);

      // Update product order counts, store stats, interactions
      await Promise.all([
        ...grp.items.map(i => Product.findByIdAndUpdate(i.product, { $inc: { orderCount: i.quantity } })),
        Store.findByIdAndUpdate(sId, { $inc: { 'stats.totalOrders': 1, 'stats.todayOrders': 1, 'stats.todayRevenue': total } }),
        ...grp.items.map(i => recordInteraction(req.user._id, i.product, 'purchase'))
      ]);

      // Emit socket notification to store
      const io = global.io || req.io;
      if (io) {
        io.to(`store_${sId}`).emit('new_order', {
          orderId: order.orderId,
          groupId,
          total,
          itemCount: grp.items.length
        });
      }
    }

    // Update totalGroupAmount on all created orders
    await Order.updateMany({ groupId }, { $set: { 'groupSummary.totalGroupAmount': overallTotal } });

    // Link and convert purchase proposal if provided
    if (proposalId) {
      await PurchaseProposal.findOneAndUpdate(
        { proposalId, customer: req.user._id },
        {
          $set: {
            status: 'converted_to_order',
            convertedGroupId: groupId,
            convertedOrderId: createdOrders[0]._id
          }
        }
      );
    }

    // Update user history & clear cart
    await User.findByIdAndUpdate(req.user._id, {
      $push: { 'profile.orderHistory': { $each: createdOrders.map(o => o._id) } },
      $set: { cart: [] }
    });

    const populatedOrders = await Order.find({ _id: { $in: createdOrders.map(o => o._id) } })
      .populate('store', 'name emoji location')
      .populate('items.product', 'name emoji price unit');

    res.status(201).json({
      success: true,
      groupId,
      isMultiStore,
      totalStores: storeIds.length,
      overallSubtotal,
      overallDeliveryFee,
      overallTotal,
      orders: populatedOrders
    });
  } catch (err) {
    console.error('Agent Checkout Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get multi-store group order details with store-by-store tracking
router.get('/group/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const orders = await Order.find({ groupId, customer: req.user._id })
      .populate('store', 'name emoji location hours stats')
      .populate('items.product', 'name emoji price unit')
      .sort({ createdAt: 1 });

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Group order not found' });
    }

    const totalStores = orders.length;
    const overallSubtotal = orders.reduce((sum, o) => sum + (o.pricing?.subtotal || 0), 0);
    const overallDeliveryFee = orders.reduce((sum, o) => sum + (o.pricing?.deliveryFee || 0), 0);
    const overallTotal = orders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

    const statuses = orders.map(o => o.status);
    let overallProgress = 'in_progress';
    if (statuses.every(s => s === 'delivered')) {
      overallProgress = 'completed';
    } else if (statuses.some(s => s === 'cancelled') && !statuses.some(s => s === 'delivered')) {
      overallProgress = 'cancelled';
    } else if (statuses.some(s => s === 'out_for_delivery')) {
      overallProgress = 'out_for_delivery';
    } else if (statuses.some(s => s === 'preparing')) {
      overallProgress = 'preparing';
    } else if (statuses.every(s => s === 'placed')) {
      overallProgress = 'placed';
    }

    res.json({
      success: true,
      groupId,
      totalStores,
      overallProgress,
      pricing: {
        subtotal: overallSubtotal,
        deliveryFee: overallDeliveryFee,
        total: overallTotal
      },
      payment: orders[0].payment,
      deliveryAddress: orders[0].delivery?.address,
      orders
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get user's orders
router.get('/my', auth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate('store', 'name emoji')
      .populate('items.product', 'name emoji')
      .lean();
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get single order
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      $or: [{ _id: req.params.id }, { orderId: req.params.id }],
      customer: req.user._id
    }).populate('store', 'name location').populate('items.product', 'name emoji price').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Update order status (owner)
router.patch('/:id/status', auth, ownerOnly, async (req, res) => {
  try {
    const { status, note, riderName, riderPhone, estimatedTime } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (status) {
      order.status = status;
      order.statusHistory.push({ status, note });
    }
    
    if (riderName) order.delivery.riderName = riderName;
    if (riderPhone) order.delivery.riderPhone = riderPhone;
    if (estimatedTime) order.delivery.estimatedTime = estimatedTime;

    await order.save();

    if (global.io) {
      global.io.to(`order_${order._id}`).emit('order_update', { 
        status: order.status, 
        orderId: order.orderId, 
        note,
        riderName: order.delivery.riderName,
        riderPhone: order.delivery.riderPhone,
        estimatedTime: order.delivery.estimatedTime
      });
    }
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Store owner — get all store orders
router.get('/store/:storeId', auth, ownerOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { store: req.params.storeId };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit))
        .populate('customer', 'name').populate('items.product', 'name emoji').lean(),
      Order.countDocuments(filter)
    ]);
    res.json({ orders, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
