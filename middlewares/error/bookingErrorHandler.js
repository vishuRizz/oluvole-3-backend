const BookingLogger = require('../../services/bookingLogger.service.js');

function bookingErrorHandler(err, req, res, next) {
    if (err.isBookingError) {
        // Special handling for booking errors
        const bookingData = req.bookingData || {};

        if (bookingData.paymentSuccessful) {
            // Payment succeeded but booking failed
            BookingLogger.logPaymentSuccessBookingFailure(bookingData, err)
                .catch(console.error);
        } else {
            // Regular booking error
            BookingLogger.logBookingAttempt({
                ...bookingData,
                status: 'failed',
                errorDetails: {
                    errorCode: err.code || 'UNKNOWN',
                    errorMessage: err.message,
                    stackTrace: err.stack,
                    failedStep: err.failedStep || 'unknown'
                }
            }).catch(console.error);
        }
    }

    next(err);
}

module.exports = bookingErrorHandler;