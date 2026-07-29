const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');

router.get('/insights/:projectId', authenticate, aiController.getInsights);
router.get('/risks/:projectId', authenticate, aiController.getRisks);
router.post('/chat', authenticate, aiController.chat);

module.exports = router;
