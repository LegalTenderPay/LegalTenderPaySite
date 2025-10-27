// ==========================
// LegalTenderPay Backend
// ==========================

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config(); // ✅ Load secret key from .env file

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Get secret key from environment variables
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

// ✅ Root route (check server status)
app.get("/", (req, res) => {
  res.send("✅ LegalTenderPay backend is active and running!");
});

// ✅ Create transaction endpoint
app.post("/create-transaction", async (req, res) => {
  try {
    const { email, name, amount, currency, tx_ref, recipient } = req.body;

    if (!email || !amount || !currency) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Send payment request to Flutterwave
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref,
        amount,
        currency,
        redirect_url: "https://your-frontend.com/payment-success.html", // Change this later
        customer: { email, name },
        customizations: {
          title: "LegalTenderPay Transaction",
          description: `Payment to ${recipient || "LegalTenderPay user"}`,
          logo: "https://your-frontend.com/logo.png",
        },
      }),
    });

    const data = await response.json();
    console.log("🔹 Flutterwave response:", data);

    if (data.status === "success" && data.data && data.data.link) {
      res.json({ link: data.data.link });
    } else {
      res.status(400).json({
        error: data.message || "Failed to create payment link",
        fullResponse: data,
      });
    }
  } catch (err) {
    console.error("❌ Error creating transaction:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 LegalTenderPay backend running on port ${PORT}`)
);
