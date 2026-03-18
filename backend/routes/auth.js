// routes/auth.js
const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Store  = require('../models/Store');
const { auth } = require('../middleware/auth');

const sign = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'grodeaz_secret_2024', { expiresIn: '7d' });

// ─── REGISTER ────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, dietary, storeName, storeArea } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    // Create the user first
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'customer',
      profile: {
        preferences: {
          dietary: dietary || 'all'
        }
      }
    });

    // If registering as owner → auto-create a store for them
    if (role === 'owner') {
      const store = await Store.create({
        name:     storeName || `${name}'s Store`,
        owner:    user._id,
        emoji:    '🏪',
        location: {
          area:    storeArea || 'Imphal',
          city:    'Imphal',
          address: storeArea || 'Imphal, Manipur',
          lat:     24.817,
          lng:     93.937
        },
        hours: {
          open:   '07:00',
          close:  '22:00',
          isOpen: true
        },
        categories: ['vegetables', 'fruits', 'dairy', 'staples'],
        ratings:    { average: 0, count: 0 },
        stats:      { totalOrders: 0, todayOrders: 0, todayRevenue: 0, avgDelivery: 30 },
        isActive:   true
      });

      // Link store back to user
      user.storeId = store._id;
      await user.save();

      console.log(`🏪 Auto-created store "${store.name}" for owner ${user.name}`);
    }

    const token = sign(user._id);
    res.status(201).json({ token, user });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match)  return res.status(401).json({ message: 'Invalid email or password' });

    // If owner but has no store yet (edge case) → create one now
    if (user.role === 'owner' && !user.storeId) {
      const existingStore = await Store.findOne({ owner: user._id });
      if (existingStore) {
        user.storeId = existingStore._id;
        await user.save();
      } else {
        const store = await Store.create({
          name:     `${user.name}'s Store`,
          owner:    user._id,
          emoji:    '🏪',
          location: { area: 'Imphal', city: 'Imphal', lat: 24.817, lng: 93.937 },
          hours:    { open: '07:00', close: '22:00', isOpen: true },
          categories: ['vegetables', 'fruits', 'dairy', 'staples'],
          isActive: true
        });
        user.storeId = store._id;
        await user.save();
        console.log(`🏪 Created missing store for owner ${user.name} on login`);
      }
    }

    const token = sign(user._id);
    res.json({ token, user });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── GET CURRENT USER ────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── UPDATE PREFERENCES ──────────────────────────────────────────────────────
router.put('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 'profile.preferences': req.body },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;