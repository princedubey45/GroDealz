const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder',
});

// Create Razorpay Order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { orderId, groupId, orderIds } = req.body;
    let orders = [];

    if (groupId) {
      orders = await Order.find({ groupId, customer: req.user._id }).populate('customer');
    } else if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      orders = await Order.find({ _id: { $in: orderIds }, customer: req.user._id }).populate('customer');
    } else if (orderId) {
      const order = await Order.findById(orderId).populate('customer');
      if (order) orders = [order];
    }

    if (!orders.length) return res.status(404).json({ message: 'No orders found' });

    // Authorization check
    for (const ord of orders) {
      if (ord.customer._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    }

    // Cumulative total in INR across all stores
    const totalAmount = orders.reduce((sum, ord) => sum + (ord.pricing?.total || 0), 0);
    const receiptId = groupId || `receipt_${orders[0].orderId}`;

    // Razorpay amount is in paise (multiply by 100)
    const options = {
      amount: Math.round(totalAmount * 100),
      currency: 'INR',
      receipt: String(receiptId).substring(0, 40)
    };

    const rzpOrder = await razorpay.orders.create(options);

    // Save razorpayOrderId to all relevant orders in DB
    await Promise.all(orders.map(ord => {
      ord.payment.razorpayOrderId = rzpOrder.id;
      ord.payment.method = 'online';
      return ord.save();
    }));

    res.json({
      id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      orderCount: orders.length,
      groupId: groupId || null
    });
  } catch (error) {
    console.error('Razorpay Create Order Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Verify Payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId, groupId, orderIds } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      let filter = { 'payment.razorpayOrderId': razorpay_order_id };
      if (groupId) {
        filter = { $or: [{ groupId }, { 'payment.razorpayOrderId': razorpay_order_id }] };
      } else if (orderId) {
        filter = { $or: [{ _id: orderId }, { 'payment.razorpayOrderId': razorpay_order_id }] };
      } else if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
        filter = { $or: [{ _id: { $in: orderIds } }, { 'payment.razorpayOrderId': razorpay_order_id }] };
      }

      const orders = await Order.find(filter);
      if (!orders.length) {
        return res.status(404).json({ success: false, message: 'No orders found matching payment' });
      }

      // Update all sub-orders in DB
      await Promise.all(orders.map(async (order) => {
        order.payment.status = 'paid';
        order.payment.razorpayPaymentId = razorpay_payment_id;
        order.payment.transactionId = razorpay_payment_id;
        order.status = 'placed';
        order.statusHistory.push({ status: order.status, note: 'Payment verified successfully via Razorpay' });
        await order.save();

        const io = global.io || req.io;
        if (io) {
          io.to(`order_${order._id}`).emit('order_update', {
            status: order.status,
            orderId: order.orderId,
            paymentStatus: 'paid',
            note: 'Payment successful'
          });
          io.to(`store_${order.store}`).emit('new_order', {
            orderId: order.orderId,
            total: order.pricing.total,
            itemCount: order.items.length
          });
        }
      }));

      res.json({
        success: true,
        message: 'Payment verified successfully',
        ordersUpdated: orders.length,
        orderIds: orders.map(o => o.orderId)
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Razorpay Verify Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Webhook Handler
exports.webhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'webhook_secret_placeholder';
  const signature = req.headers['x-razorpay-signature'];
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature === signature) {
      const event = req.body.event;
      const paymentEntity = req.body.payload.payment.entity;
      
      const orders = await Order.find({ 'payment.razorpayOrderId': paymentEntity.order_id });
      
      if (!orders.length) {
         return res.status(404).send('Orders not found');
      }

      for (const order of orders) {
        if (event === 'payment.captured') {
          if (order.payment.status !== 'paid') {
            order.payment.status = 'paid';
            order.payment.razorpayPaymentId = paymentEntity.id;
            order.payment.transactionId = paymentEntity.id;
            order.statusHistory.push({ status: order.status, note: 'Webhook: Payment captured' });
            await order.save();
          }
        } else if (event === 'payment.failed') {
          order.payment.status = 'failed';
          order.statusHistory.push({ status: order.status, note: 'Webhook: Payment failed' });
          await order.save();
        } else if (event === 'refund.processed') {
          order.payment.status = 'refunded';
          order.statusHistory.push({ status: order.status, note: 'Webhook: Refund processed' });
          await order.save();
        }
      }
      
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(400).send('Invalid signature');
    }
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Webhook processing error');
  }
};

// Initiate Refund
exports.initiateRefund = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    if (order.payment.status !== 'paid') {
      return res.status(400).json({ message: 'Can only refund paid orders' });
    }

    const refund = await razorpay.payments.refund(order.payment.razorpayPaymentId, {
      amount: Math.round(order.pricing.total * 100)
    });

    order.payment.status = 'refunded';
    order.payment.razorpayRefundId = refund.id;
    order.status = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', note: 'Order cancelled and refunded' });
    await order.save();

    res.json({ success: true, message: 'Refund initiated', refund });
  } catch (error) {
    console.error('Refund Error:', error);
    res.status(500).json({ message: error.message });
  }
};
