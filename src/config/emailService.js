const nodemailer = require("nodemailer");
const { email } = require("../config/email.config");
const logger = require("../utils/logger");

async function createEmailTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email.user,
      pass: email.pass,
    },
  });
}

async function sendEmailNotification(subject, body, attachments = []) {
  try {
    const transporter = await createEmailTransporter();

    const mailOptions = {
      from: email.user,
      to: email.recipient,
      subject: subject,
      html: body,
      attachments: attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    logger.error("Error sending email:", error);
    return false;
  }
}

module.exports = {
  sendEmailNotification,
};
