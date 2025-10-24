// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // npm install node-fetch@2
require('dotenv').config(); // For storing your secret key in .env

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// In-memory storage for demo purposes (use DB in production)
let transactions = {};

// Create transaction endpoint
app.post('/create-transaction', (req, res) => {
  const { amount, recipientEmail, currency } = req.body;

  if (!amount || !recipientEmail || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Generate a unique transaction reference
  const tx_ref = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Save transaction temporarily
  transactions[tx_ref] = { recipientEmail, amount, currency, status: 'pending' };

  res.json({ tx_ref, recipientEmail });
});

// Confirm transaction endpoint
app.post('/confirm-transaction', async (req, res) => {
  const { tx_ref, status } = req.body;

  if (!tx_ref || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Update status in memory
  if (transactions[tx_ref]) {
    transactions[tx_ref].status = status;
  }

  res.json({ success: true });
});

// Optional: Endpoint to verify transaction from Flutterwave server-side
app.post('/verify-transaction', async (req, res) => {
  const { tx_ref } = req.body;

  if (!tx_ref) return res.status(400).json({ error: 'Missing tx_ref' });

  try {
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify transaction', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
