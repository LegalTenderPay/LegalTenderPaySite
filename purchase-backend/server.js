import express from "express";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const codes = {}; // store codes in memory

app.post("/api/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = code;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: `"Purchase App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Verification Code",
      text: `Your verification code is ${code}. It expires in 5 minutes.`
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.post("/api/verify-code", (req, res) => {
  const { email, code } = req.body;
  if (codes[email] === code) {
    delete codes[email];
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Invalid code" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
