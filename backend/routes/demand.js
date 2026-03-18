// routes/demand.js
const router = require('express').Router();
const { auth, ownerOnly } = require('../middleware/auth');
const { predictDemandForProduct, getStoreDemandSummary, runDemandPrediction } = require('../ai/demandPrediction');
const Product = require('../models/Product');

// Get demand summary for a store
router.get('/store/:storeId', auth, ownerOnly, async (req, res) => {
  try {
    const summary = await getStoreDemandSummary(req.params.storeId);
    res.json(summary);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get demand prediction for a product
router.get('/product/:productId', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const prediction = await predictDemandForProduct(product._id, product.store);
    res.json(prediction);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Manual trigger for admin/testing
router.post('/run', auth, async (req, res) => {
  try {
    const result = await runDemandPrediction();
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get trending + demand-scored products
router.get('/trending-products', async (_req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ 'ai.demandScore': -1, 'ai.predictedDemand': -1 })
      .limit(12).lean();
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
