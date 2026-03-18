// routes/chatbot.js
const router  = require('express').Router();
const { auth } = require('../middleware/auth');
const { processMessage } = require('../ai/nlpChatbot');

router.post('/message', auth, async (req, res) => {
  try {
    const { message, storeId } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });
    const result = await processMessage(message, req.user._id, storeId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;