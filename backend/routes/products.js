// routes/products.js
const router  = require('express').Router();
const Product = require('../models/Product');
const Store   = require('../models/Store');
const { auth, ownerOnly }   = require('../middleware/auth');
const { recordInteraction } = require('../ai/recommendationEngine');

// GET all products (with filters, search, sort, pagination)
router.get('/', async (req, res) => {
  try {
    const { category, store, search, sort = 'popular', page = 1, limit = 20, dietary } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (store)    filter.store     = store;
    if (dietary === 'veg')   filter['dietary.isVeg']   = true;
    if (dietary === 'vegan') filter['dietary.isVegan']  = true;

    let query = search
      ? Product.find({ ...filter, $text: { $search: search } }, { score: { $meta: 'textScore' } })
      : Product.find(filter);

    const sortMap = {
      popular:    { orderCount: -1 },
      newest:     { createdAt: -1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      discount:   { discount: -1 }
    };

    query = query
      .sort(sortMap[sort] || { orderCount: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const [products, total] = await Promise.all([
      query.lean(),
      Product.countDocuments(filter)
    ]);

    res.json({ products, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('store', 'name location hours ratings')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST record view interaction for AI recommendation engine
router.post('/:id/view', auth, async (req, res) => {
  try {
    await Promise.all([
      Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }),
      recordInteraction(req.user._id, req.params.id, 'view')
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create a new product (store owner only)
router.post('/', auth, ownerOnly, async (req, res) => {
  try {
    const {
      name, category, price, mrp,
      discount, unit, emoji,
      description, dietary, stock
    } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({ message: 'name, category and price are required' });
    }

    // Find the store that belongs to this owner
    const store = await Store.findOne({ owner: req.user._id });
    if (!store) {
      return res.status(404).json({ message: 'No store found for this owner. Please create a store first.' });
    }

    const product = await Product.create({
      name,
      category,
      price:       parseFloat(price),
      mrp:         parseFloat(mrp || price),
      discount:    parseInt(discount || 0),
      unit:        unit || '1 pc',
      emoji:       emoji || '🛒',
      description: description || `Fresh ${name}`,
      store:       store._id,
      dietary: {
        isVeg:   dietary === 'veg' || dietary === 'vegan',
        isVegan: dietary === 'vegan'
      },
      stock: {
        quantity:    parseInt(stock || 100),
        isAvailable: true
      },
      ai: {
        demandScore:     50,
        predictedDemand: 0,
        trendTag:        'new'
      },
      tags:        [category, name.toLowerCase()],
      orderCount:  0,
      viewCount:   0,
      isActive:    true
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE (soft delete) a product (store owner only)
router.delete('/:id', auth, ownerOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Make sure this product belongs to the owner's store
    const store = await Store.findOne({ owner: req.user._id });
    if (!store || product.store.toString() !== store._id.toString()) {
      return res.status(403).json({ message: 'You can only remove products from your own store' });
    }

    await Product.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Product removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;