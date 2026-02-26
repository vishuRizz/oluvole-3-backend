const express = require("express");
const router = express.Router();
const { submitSurvey, getAllSurveys, getSurveyByBookingId } = require("../services/survey.service");

router.post("/submit", submitSurvey);
router.get("/all", getAllSurveys);
router.get("/:bookingId", getSurveyByBookingId);

module.exports = router;
