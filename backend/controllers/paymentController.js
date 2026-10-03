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
    const { orderId } = req.body;
    
    // Find the order in GroDealz DB
    const order = await Order.findById(orderId).populate('customer');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    // Authorization check
    if (order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Razorpay amount is in paise (multiply by 100)
    const options = {
      amount: Math.round(order.pricing.total * 100),
      currency: 'INR',
      receipt: `receipt_${order.orderId}`
    };

    const rzpOrder = await razorpay.orders.create(options);
    
    // Save razorpayOrderId to our DB
    order.payment.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'
    });
  } catch (error) {
    console.error('Razorpay Create Order Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Verify Payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Update order status in DB
      const order = await Order.findById(orderId);
      order.payment.status = 'paid';
      order.payment.razorpayPaymentId = razorpay_payment_id;
      order.payment.transactionId = razorpay_payment_id;
      order.statusHistory.push({ status: order.status, note: 'Payment successful' });
      await order.save();

      res.json({ success: true, message: 'Payment verified successfully' });
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
      
      const order = await Order.findOne({ 'payment.razorpayOrderId': paymentEntity.order_id });
      
      if (!order) {
         return res.status(404).send('Order not found');
      }

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
