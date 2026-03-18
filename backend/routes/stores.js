// routes/stores.js
const router  = require('express').Router();
const Store   = require('../models/Store');
const Product = require('../models/Product');
const { auth, ownerOnly } = require('../middleware/auth');

router.get('/', async (_req, res) => {
  try {
    const stores = await Store.find({ isActive: true }).lean();
    res.json(stores);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const store = await Store.findById(req.params.id).lean();
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json(store);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth, ownerOnly, async (req, res) => {
  try {
    const store = await Store.create({ ...req.body, owner: req.user._id });
    res.status(201).json(store);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
