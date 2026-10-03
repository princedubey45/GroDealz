const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');

router.post('/create-order', auth, paymentController.createRazorpayOrder);
router.post('/verify', auth, paymentController.verifyPayment);
router.post('/refund', auth, paymentController.initiateRefund);
// Webhook doesn't use standard auth middleware since it's called by Razorpay
router.post('/webhook', paymentController.webhook);

module.exports = router;
