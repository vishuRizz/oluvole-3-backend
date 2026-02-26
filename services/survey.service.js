const { Survey } = require("../models/survey.schema");
const {
    ErrorResponse,
    asyncErrorHandler,
} = require("../middlewares/error/error");

const submitSurvey = asyncErrorHandler(async (req, res) => {
    const { bookingId, guestEmail, ratings, feedback } = req.body;

    if (!bookingId || !guestEmail || !ratings) {
        throw new ErrorResponse("Missing required fields: bookingId, guestEmail, ratings", 400);
    }

    // Check if survey already submitted for this booking
    const existingSurvey = await Survey.findOne({ bookingId });
    if (existingSurvey) {
        throw new ErrorResponse("Survey already submitted for this booking.", 409);
    }

    const newSurvey = await Survey.create({
        bookingId,
        guestEmail,
        ratings,
        feedback: feedback || "",
    });

    res.status(201).json({ message: "Survey submitted successfully!", survey: newSurvey });
});

const getAllSurveys = asyncErrorHandler(async (req, res) => {
    const surveys = await Survey.find({}).sort({ createdAt: -1 });
    res.status(200).json(surveys);
});

const getSurveyByBookingId = asyncErrorHandler(async (req, res) => {
    const { bookingId } = req.params;
    const survey = await Survey.findOne({ bookingId });
    if (!survey) {
        throw new ErrorResponse("Survey not found for this booking.", 404);
    }
    res.status(200).json(survey);
});

module.exports = { submitSurvey, getAllSurveys, getSurveyByBookingId };
