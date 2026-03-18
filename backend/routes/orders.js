// routes/orders.js
const router  = require('express').Router();
const Order   = require('../models/Order');
const Product = require('../models/Product');
const User    = require('../models/User');
const Store   = require('../models/Store');
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
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    order.statusHistory.push({ status, note });
    await order.save();

    if (global.io) {
      global.io.to(`order_${order._id}`).emit('order_update', { status, orderId: order.orderId, note });
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
