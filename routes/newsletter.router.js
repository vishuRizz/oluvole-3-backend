const express = require("express");
const router = express.Router();
const { sendNewsletter, getAllNewsletters, getNewsletterById, getRecipientCount } = require("../services/newsletter.service");

router.post("/send", sendNewsletter);
router.get("/all", getAllNewsletters);
router.get("/recipient-count", getRecipientCount);
router.get("/:id", getNewsletterById);

module.exports = router;
