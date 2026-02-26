const { Newsletter } = require("../models/newsletter.schema");
const guestModel = require("../models/guest.schema");
const { paymentModel } = require("../models");
const { sendEmail } = require("../config/mail.config");
const {
    ErrorResponse,
    asyncErrorHandler,
} = require("../middlewares/error/error");

const parseAudienceFilter = (source = {}) => {
    const audienceType = source.audienceType || "all";
    const parsedDays = Number(source.lookbackDays);

    const presetMap = {
        all: null,
        last_30_days: 30,
        last_90_days: 90,
        last_180_days: 180,
    };

    let lookbackDays = presetMap[audienceType];

    if (audienceType === "custom_days") {
        if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
            throw new ErrorResponse("lookbackDays must be a positive number for custom_days", 400);
        }
        lookbackDays = Math.floor(parsedDays);
    }

    if (lookbackDays === undefined) {
        throw new ErrorResponse("Invalid audienceType. Use all, last_30_days, last_90_days, last_180_days, or custom_days", 400);
    }

    return { audienceType, lookbackDays };
};

const buildSinceDate = (lookbackDays) => {
    if (!lookbackDays) return null;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    return since;
};

const collectRecipients = async ({ audienceType, lookbackDays }) => {
    const sinceDate = buildSinceDate(lookbackDays);

    const guestQuery = sinceDate ? { createdAt: { $gte: sinceDate } } : {};
    const paymentQuery = { status: "Success" };
    if (sinceDate) paymentQuery.createdAt = { $gte: sinceDate };

    const guests = await guestModel.find(guestQuery, "email name");
    const guestEmails = guests.map((g) => ({ email: g.email, name: g.name }));

    const payments = await paymentModel.find(paymentQuery, "name guestDetails");
    const paymentEmails = payments
        .map((p) => {
            try {
                const details = typeof p.guestDetails === "string" ? JSON.parse(p.guestDetails) : p.guestDetails;
                return { email: details?.email, name: p.name };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .filter((e) => e.email);

    const emailMap = new Map();
    [...guestEmails, ...paymentEmails].forEach((entry) => {
        if (entry.email && !emailMap.has(entry.email.toLowerCase())) {
            emailMap.set(entry.email.toLowerCase(), entry);
        }
    });

    return {
        recipients: Array.from(emailMap.values()),
        audienceType,
        lookbackDays: lookbackDays || null,
    };
};

const sendNewsletter = asyncErrorHandler(async (req, res) => {
    const { subject, body } = req.body;
    const { audienceType, lookbackDays } = parseAudienceFilter(req.body);

    if (!subject || !body) {
        throw new ErrorResponse("Subject and body are required", 400);
    }

    // Create newsletter record
    const newsletter = await Newsletter.create({
        subject,
        body,
        audienceType,
        lookbackDays,
        status: "sending",
    });

    const { recipients: emails } = await collectRecipients({ audienceType, lookbackDays });

    if (emails.length === 0) {
        newsletter.status = "failed";
        await newsletter.save();
        throw new ErrorResponse("No recipients found to send newsletter to.", 404);
    }

    let successCount = 0;
    let failCount = 0;

    // Send emails in batches to avoid rate limits
    const BATCH_SIZE = 10;
    const DELAY_MS = 1000; // 1 second between batches

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (recipient) => {
            try {
                await sendEmail(
                    recipient.email,
                    subject,
                    "newsletter",
                    {
                        name: recipient.name || "Valued Guest",
                        content: body,
                    }
                );
                successCount++;
            } catch (err) {
                console.error(`Failed to send newsletter to ${recipient.email}:`, err);
                failCount++;
            }
        });

        await Promise.all(promises);

        // Delay between batches
        if (i + BATCH_SIZE < emails.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
    }

    newsletter.recipientCount = successCount;
    newsletter.status = failCount === emails.length ? "failed" : "sent";
    newsletter.sentAt = new Date();
    await newsletter.save();

    res.status(200).json({
        message: `Newsletter sent to ${successCount} recipients. ${failCount} failed.`,
        newsletter,
    });
});

const getAllNewsletters = asyncErrorHandler(async (req, res) => {
    const newsletters = await Newsletter.find({}).sort({ createdAt: -1 });
    res.status(200).json(newsletters);
});

const getNewsletterById = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const newsletter = await Newsletter.findById(id);
    if (!newsletter) {
        throw new ErrorResponse("Newsletter not found", 404);
    }
    res.status(200).json(newsletter);
});

const getRecipientCount = asyncErrorHandler(async (req, res) => {
    const { audienceType, lookbackDays } = parseAudienceFilter(req.query);
    const { recipients } = await collectRecipients({ audienceType, lookbackDays });
    res.status(200).json({ count: recipients.length, audienceType, lookbackDays });
});

module.exports = { sendNewsletter, getAllNewsletters, getNewsletterById, getRecipientCount };
