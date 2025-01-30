require("dotenv").config();

module.exports = {
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    recipient: process.env.EMAIL_RECIPIENT,
  },
};
