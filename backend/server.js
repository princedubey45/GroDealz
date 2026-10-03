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
const aiRoutes              = require('./routes/ai');
const ticketRoutes          = require('./routes/tickets');

const { runDemandPrediction } = require('./ai/demandPrediction');

const app    = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

// 1. CORS — must be first
app.use(cors({
  origin: true,
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
app.use('/api/ai',              aiRoutes);
app.use('/api/tickets',         ticketRoutes);

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

  socket.on('join_ticket', (ticketId) => {
    socket.join(`ticket_${ticketId}`);
    console.log(`🎫 Client joined ticket chat: ${ticketId}`);
  });

  socket.on('send_message', async (data) => {
    const { ticketId, text, sender } = data;
    // Broadcast the message to all users in the ticket room
    io.to(`ticket_${ticketId}`).emit('receive_message', { ticketId, text, sender, createdAt: new Date() });
    
    // In a real scenario, this is where you'd save it to the DB if not already saved via REST,
    // or you just emit and let the client know it arrived.
    const Message = require('./models/Message');
    try {
      const newMsg = new Message({ ticket: ticketId, sender, text });
      await newMsg.save();
    } catch (e) {
      console.error('Error saving socket message', e);
    }
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
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://princedubey01011_db_user:o03WjMGGiszgzh5e@cluster1.vdvzsvt.mongodb.net/grodeaz?retryWrites=true&w=majority&appName=Cluster1';

const connectWithRetry = () => {
  console.log('Connecting to MongoDB (URI:', MONGO_URI.replace(/:([^@]+)@/, ':****@'), ')...');
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  })
    .then(() => {
      console.log('✅ MongoDB connected successfully');
    })
    .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      console.log('🔄 Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));