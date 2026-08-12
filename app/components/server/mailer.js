const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendResetEmail(toEmail, resetLink) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "no-reply@opencost.local",
    to: toEmail,
    subject: "Password Reset Request",
    text: `You requested a password reset. Use this link within 30 minutes:\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
    html: `<p>You requested a password reset. Use this link within 30 minutes:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, ignore this email.</p>`,
  });
}

module.exports = { sendResetEmail };
