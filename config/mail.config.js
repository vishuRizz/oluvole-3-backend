const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const handlebars = require("handlebars");

const transportConfig = process.env.SMTP_HOST
  ? {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    }
  : {
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    };

const transporter = nodemailer.createTransport(transportConfig);

const verifyMailer = async () => {
  try {
    await transporter.verify();
    console.log("[mail] transporter verify success", {
      userConfigured: Boolean(process.env.EMAIL_USER),
      usingHost: process.env.SMTP_HOST || "gmail-service",
    });
    return true;
  } catch (error) {
    console.error("[mail] transporter verify failed", {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      userConfigured: Boolean(process.env.EMAIL_USER),
      passConfigured: Boolean(process.env.EMAIL_PASS),
      usingHost: process.env.SMTP_HOST || "gmail-service",
    });
    return false;
  }
};

const sendEmail = async (to, subject, templateName, replacements) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../templates",
      `${templateName}.html`
    );
    const source = fs.readFileSync(templatePath, "utf8");
    const template = handlebars.compile(source);

    // Inject baseUrl so templates can reference uploaded images via {{baseUrl}}/uploads/...
    const baseUrl = (process.env.BASE_URL || '').replace(/\/+$/, ''); // remove trailing slash
    const contextWithBase = { ...replacements, baseUrl };

    const htmlToSend = template(contextWithBase);

    const mailOptions = {
      from: `"Jara Beach Resort" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlToSend,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("[mail] send failed", {
      to,
      subject,
      templateName,
      message: error?.message,
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
    });
    throw error;
  }
};

module.exports = { sendEmail, verifyMailer };
