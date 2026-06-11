const express = require('express');
const router = express.Router();
const { getActivePlans } = require('../controllers/planController');

router.get('/active', getActivePlans);

module.exports = router;
