// middleware/auth.js
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grodeaz_secret_2024');
    const user    = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid token' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Authentication failed' });
  }
};

const ownerOnly = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: 'Owner access required' });
  next();
};

module.exports = { auth, ownerOnly };
