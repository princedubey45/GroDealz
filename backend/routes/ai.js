// routes/ai.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Routes
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

const aiController = require('../controllers/aiController');

// Optional auth middleware so guests can also use AI copilot
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grodeaz_secret_2024');
      const user = await User.findById(decoded.id).select('-password');
      if (user && user.isActive) req.user = user;
    }
  } catch (err) {
    // Ignore token errors for optional auth
  }
  next();
};

// Endpoints
router.post('/copilot', optionalAuth, aiController.copilot);
router.post('/plan-groceries', optionalAuth, aiController.planGroceries);
router.post('/basket-completion', optionalAuth, aiController.basketCompletion);
router.post('/optimize-budget', optionalAuth, aiController.optimizeBudget);
router.get('/semantic-search', aiController.semanticSearch);
router.post('/semantic-search', aiController.semanticSearch);
router.get('/recurring-plan', optionalAuth, aiController.recurringPlan);
router.get('/store-comparison', aiController.storeComparison);
router.post('/store-comparison', aiController.storeComparison);
router.post('/validate-basket', aiController.validateBasket);

module.exports = router;
