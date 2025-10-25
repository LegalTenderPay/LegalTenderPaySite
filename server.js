// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // npm install node-fetch@2
require('dotenv').config(); // Load .env for secret key

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// In-memory transaction storage (for demo/testing)
let transactions = {};

// ✅ 1️⃣ Create Flutterwave transaction
app.post('/create-transaction', async (req, res) => {
  const { email, name, amount, currency, tx_ref, recipient } = req.body;

  if (!email || !amount || !currency || !tx_ref) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref,
        amount,
        currency,
        redirect_url: "https://yourfrontenddomain.com/payment-success.html", // ✅ change this to your frontend success page
        customer: {
          email,
          name,
        },
        customizations: {
          title: "LegalTenderPay Transaction",
          description: `Payment to ${recipient}`,
          logo: "https://yourwebsite.com/logo.png", // optional logo
        },
      }),
    });

    const data = await response.json();

    if (!data || !data.status || data.status !== "success") {
      console.error("Flutterwave API error:", data);
      return res.status(500).json({ error: "Failed to create payment link", details: data });
    }

    // Save transaction temporarily
    transactions[tx_ref] = {
      email,
      name,
      amount,
      currency,
      recipient,
      status: "pending",
    };

    // Send link to frontend
    res.json({ link: data.data.link });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ 2️⃣ Confirm transaction after successful payment (optional)
app.post('/confirm-transaction', (req, res) => {
  const { tx_ref, status } = req.body;

  if (!tx_ref || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (transactions[tx_ref]) {
    transactions[tx_ref].status = status;
  }

  res.json({ success: true });
});

// ✅ 3️⃣ Verify transaction directly with Flutterwave API
app.post('/verify-transaction', async (req, res) => {
  const { tx_ref } = req.body;
  if (!tx_ref) return res.status(400).json({ error: 'Missing tx_ref' });

  try {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify transaction', details: err.message });
  }
});

// ✅ 4️⃣ Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
