// routes/recommendations.js
const router  = require('express').Router();
const { auth } = require('../middleware/auth');
const { getRecommendations, recordInteraction } = require('../ai/recommendationEngine');
const Product = require('../models/Product');

router.get('/', auth, async (req, res) => {
  try {
    const { strategy = 'hybrid', limit = 20 } = req.query;
    const context = {
      hour:    parseInt(req.query.hour) || new Date().getHours(),
      dietary: req.query.dietary || req.user.profile?.preferences?.dietary || 'all'
    };
    const recs = await getRecommendations(req.user._id, { limit: parseInt(limit), strategy, context });
    res.json({ recommendations: recs, strategy, count: recs.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Trending products (no auth needed)
router.get('/trending', async (_req, res) => {
  try {
    const products = await Product.find({ isActive: true, 'ai.trendTag': 'trending' })
      .sort({ 'ai.demandScore': -1, orderCount: -1 }).limit(10).lean();
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/interact', auth, async (req, res) => {
  try {
    const { productId, action } = req.body;
    await recordInteraction(req.user._id, productId, action);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
