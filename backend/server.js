// ─── server.js ────────────────────────────────────────────────────────────────
require('dotenv').config();
const express       = require('express');
const mongoose      = require('mongoose');
const cors          = require('cors');
const morgan        = require('morgan');
const http          = require('http');
const { Server }    = require('socket.io');
const rateLimit     = require('express-rate-limit');
const cron          = require('node-cron');

const authRoutes            = require('./routes/auth');
const productRoutes         = require('./routes/products');
const orderRoutes           = require('./routes/orders');
const recommendationRoutes  = require('./routes/recommendations');
const chatbotRoutes         = require('./routes/chatbot');
const storeRoutes           = require('./routes/stores');
const demandRoutes          = require('./routes/demand');

const { runDemandPrediction } = require('./ai/demandPrediction');

const app    = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:60763",
      process.env.CLIENT_URL
    ],
    methods: ["GET", "POST"]
  }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

// 1. CORS — must be first
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:60763",   // your current port
    process.env.CLIENT_URL
  ],
  credentials: true
}));

// 2. Body parsers — THIS IS WHAT WAS MISSING, fixes "req.body is undefined"
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Logger
app.use(morgan('dev'));

// 4. Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// 5. Attach io to every request
app.use((req, _res, next) => { req.io = io; next(); });

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/products',        productRoutes);
app.use('/api/orders',          orderRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/chatbot',         chatbotRoutes);
app.use('/api/stores',          storeRoutes);
app.use('/api/demand',          demandRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── SOCKET.IO – Real-time order tracking ────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('track_order', (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`📦 Client tracking order: ${orderId}`);
  });

  socket.on('join_store', (storeId) => {
    socket.join(`store_${storeId}`);
  });

  socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

// Expose io globally for use in routes
global.io = io;

// ─── CRON – Demand prediction runs every hour ────────────────────────────────
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running hourly demand prediction...');
  try { await runDemandPrediction(); }
  catch (e) { console.error('Demand prediction error:', e.message); }
});

// ─── DB + START ───────────────────────────────────────────────────────────────
const PORT      = process.env.PORT      || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://princedubey01011_db_user:o03WjMGGiszgzh5e@cluster1.vdvzsvt.mongodb.net/?appName=Cluster1';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });