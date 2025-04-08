const mongoose = require('mongoose');

const BookingLogSchema = new mongoose.Schema({
    bookingId: { type: String, required: true },
    userId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['success', 'failed', 'incomplete', 'payment_success_booking_failed'],
        required: true
    },
    paymentStatus: { type: String, enum: ['success', 'failed', 'pending', 'refunded'] },
    paymentGateway: String,
    paymentId: String,
    amount: Number,
    currency: String,
    bookingDetails: mongoose.Schema.Types.Mixed,
    errorDetails: {
        errorCode: String,
        errorMessage: String,
        stackTrace: String,
        failedStep: String
    },
    requestPayload: mongoose.Schema.Types.Mixed,
    responsePayload: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    retryAttempts: { type: Number, default: 0 },
    resolved: { type: Boolean, default: false }
});

module.exports = mongoose.model('BookingLog', BookingLogSchema);