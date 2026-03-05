const BookingLog = require('../models/bookingLog.schema.js');
const { paymentModel } = require('../models');
const { overnightBooking, daypassBooking } = require('../models/overnight.booking.schema');
const { sendEmail } = require('../config/mail.config');
const Guest = require('../models/guest.schema');
const { Survey } = require('../models/survey.schema');
const mongoose = require('mongoose');

const getPublicBaseUrl = () => String(process.env.BASE_URL || '').replace(/\/+$/, '');

const toAbsolutePhotoUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const normalizedPath = trimmed.replace(/^\/+/, '');
    const baseUrl = getPublicBaseUrl();
    if (!baseUrl) return normalizedPath;

    if (normalizedPath.startsWith('uploads/')) {
        return `${baseUrl}/${normalizedPath}`;
    }
    return `${baseUrl}/${normalizedPath}`;
};

class BookingLogger {
    static async _resolveCanonicalRef(ref) {
        const rawRef = String(ref || '').trim();
        if (!rawRef) return rawRef;

        if (!mongoose.Types.ObjectId.isValid(rawRef)) {
            return rawRef;
        }

        const [paymentById, overnightById, daypassById, bookingLogById, bookingLogByBookingId] = await Promise.all([
            paymentModel.findById(rawRef).select('ref').lean(),
            overnightBooking.findById(rawRef).select('shortId').lean(),
            daypassBooking.findById(rawRef).select('shortId').lean(),
            BookingLog.findById(rawRef).select('bookingId').lean(),
            BookingLog.findOne({ bookingId: rawRef }).sort({ timestamp: -1 }).select('bookingId').lean(),
        ]);

        if (paymentById?.ref) return paymentById.ref;
        if (overnightById?.shortId) return overnightById.shortId;
        if (daypassById?.shortId) return daypassById.shortId;

        const logBookingId = bookingLogById?.bookingId || bookingLogByBookingId?.bookingId;
        if (!logBookingId) return rawRef;
        if (!mongoose.Types.ObjectId.isValid(logBookingId)) return logBookingId;

        const paymentFromLogId = await paymentModel.findById(logBookingId).select('ref').lean();
        return paymentFromLogId?.ref || logBookingId;
    }

    static async logBookingAttempt(bookingData) {
        try {
            const logEntry = new BookingLog({
                bookingId: bookingData.bookingId,
                userId: bookingData.userId,
                status: bookingData.status,
                paymentStatus: bookingData.paymentStatus,
                paymentGateway: bookingData.paymentGateway,
                paymentId: bookingData.paymentId,
                amount: bookingData.amount,
                currency: bookingData.currency,
                bookingDetails: bookingData.bookingDetails,
                errorDetails: bookingData.errorDetails,
                requestPayload: bookingData.requestPayload,
                responsePayload: bookingData.responsePayload,
                ipAddress: bookingData.ipAddress,
                userAgent: bookingData.userAgent
            });

            await logEntry.save();
            return logEntry;
        } catch (error) {
            console.error('Failed to log booking attempt:', error);
            throw error;
        }
    }

    static async logPaymentSuccessBookingFailure(paymentData, bookingError) {
        try {
            const logEntry = new BookingLog({
                bookingId: paymentData.bookingId,
                userId: paymentData.userId,
                status: 'payment_success_booking_failed',
                paymentStatus: 'success',
                paymentGateway: paymentData.paymentGateway,
                paymentId: paymentData.paymentId,
                amount: paymentData.amount,
                currency: paymentData.currency,
                errorDetails: {
                    errorCode: bookingError.code || 'UNKNOWN',
                    errorMessage: bookingError.message,
                    stackTrace: bookingError.stack,
                    failedStep: 'booking_creation'
                },
                ipAddress: paymentData.ipAddress,
                userAgent: paymentData.userAgent
            });

            await logEntry.save();
            return logEntry;
        } catch (error) {
            console.error('Failed to log payment success/booking failure:', error);
            throw error;
        }
    }

    static async updateOrCreateBookingLog(bookingData) {
        try {
            const filter = { bookingId: bookingData.bookingId };
            const update = {
                $set: {
                    userId: bookingData.userId,
                    status: bookingData.status,
                    paymentStatus: bookingData.paymentStatus,
                    paymentGateway: bookingData.paymentGateway,
                    paymentId: bookingData.paymentId,
                    amount: bookingData.amount,
                    currency: bookingData.currency,
                    bookingDetails: bookingData.bookingDetails,
                    errorDetails: bookingData.errorDetails,
                    requestPayload: bookingData.requestPayload,
                    responsePayload: bookingData.responsePayload,
                    ipAddress: bookingData.ipAddress,
                    userAgent: bookingData.userAgent
                }
            };
            const options = {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            };

            const logEntry = await BookingLog.findOneAndUpdate(filter, update, options);
            return logEntry;
        } catch (error) {
            console.error('Failed to update/create booking log:', error);
            throw error;
        }
    }

    static async getFailedBookingsWithSuccessfulPayments() {
        return BookingLog.find({
            status: 'payment_success_booking_failed',
            resolved: false
        }).sort({ timestamp: -1 });
    }

    // ─── Get all booking logs ───
    static async getAllBookingLogs() {

        return BookingLog.find().sort({ timestamp: -1 });
    }

    // ─── Get paginated booking logs ───
    static async getPaginatedBookingLogs(page = 1, limit = 10, filter = 'all', timeRange = null) {
        page = Math.max(parseInt(page) || 1, 1);
        limit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        // Build query based on filter
        const query = {};

        // Status filter
        if (filter === 'successful') {
            // paymentStatus success but exclude any cancelled bookings
            query.paymentStatus = 'success';
            query.status = { $nin: ['cancelled_by_admin', 'cancelled'] };
        } else if (filter === 'pending') {
            query.paymentStatus = 'pending';
        } else if (filter === 'cancelled') {
            // Match both 'cancelled_by_admin' and 'cancelled' status values
            query.status = { $in: ['cancelled_by_admin', 'cancelled'] };
        }
        // 'all' = no status filter

        // Time range filter
        if (timeRange === 'weekly') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            query.timestamp = { $gte: weekAgo };
        } else if (timeRange === 'monthly') {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            query.timestamp = { $gte: monthAgo };
        }

        const [data, total] = await Promise.all([
            BookingLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit),
            BookingLog.countDocuments(query),
        ]);

        const normalizedData = await Promise.all(
            data.map(async (logDoc) => {
                const log = logDoc.toObject();
                const canonicalRef = await this._resolveCanonicalRef(log.bookingId);
                return {
                    ...log,
                    bookingId: canonicalRef || log.bookingId,
                };
            })
        );

        return {
            data: normalizedData,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ─── Resolve issue ───
    static async resolveIssue(id) {
        const logEntry = await BookingLog.findByIdAndUpdate(
            id,
            { resolved: true },
            { new: true }
        );
        return logEntry;
    }

    // ─── Check-in ───
    static async checkInBooking(id) {
        const logEntry = await BookingLog.findByIdAndUpdate(
            id,
            {
                checkedIn: true,
                checkedInAt: new Date()
            },
            { new: true }
        );
        return logEntry;
    }

    // ─── Check-out (with survey email) ───
    static async checkOutBooking(id) {
        const logEntry = await BookingLog.findByIdAndUpdate(
            id,
            {
                checkedOut: true,
                checkedOutAt: new Date()
            },
            { new: true }
        );

        if (!logEntry) return null;

        // Send instant survey email on checkout
        try {
            const payment = await paymentModel.findOne({ ref: logEntry.bookingId });
            const guestDetails = payment?.guestDetails
                ? (typeof payment.guestDetails === 'string'
                    ? JSON.parse(payment.guestDetails)
                    : payment.guestDetails)
                : null;

            const recipient = guestDetails?.email || logEntry?.userId || null;
            if (recipient) {
                const frontendUrl = process.env.FRONTEND_URL || 'https://booking.jarabeachresort.com';
                const surveyLink = `${frontendUrl}/survey/${logEntry.bookingId}`;

                await sendEmail(
                    recipient,
                    'Share Your Jara Beach Resort Experience',
                    'survey_email',
                    {
                        name: payment?.name || guestDetails?.firstname || 'Valued Guest',
                        surveyLink,
                    }
                );
                console.log(`Survey email sent to ${recipient} for booking ${logEntry.bookingId}`);
            } else {
                console.warn(`Survey email skipped: no recipient found for booking ${logEntry.bookingId}`);
            }
        } catch (emailErr) {
            console.error('Failed to send checkout survey email:', emailErr.message);
        }

        return logEntry;
    }

    // ─── Cancel booking ───
    static async cancelBooking(bookingRef) {
        let booking = await overnightBooking.findOne({ shortId: bookingRef });
        let bookingType = 'overnight';

        if (!booking) {
            booking = await daypassBooking.findOne({ shortId: bookingRef });
            bookingType = 'daypass';
        }

        const payment = await paymentModel.findOne({ ref: bookingRef });
        const existingLog = await BookingLog.findOne({ bookingId: bookingRef });

        if (!booking && !payment && !existingLog) {
            throw new Error('Booking not found');
        }

        if (!booking) bookingType = 'payment_only';

        if (booking) {
            booking.status = 'Cancelled';
            await booking.save();
        }

        await BookingLog.findOneAndUpdate(
            { bookingId: bookingRef },
            { $set: { status: 'cancelled_by_admin' } },
            { new: true, upsert: true }
        );

        await paymentModel.findOneAndUpdate(
            { ref: bookingRef },
            { $set: { previousPaymentStatus: 'Cancelled by Admin', status: 'Cancelled by Admin' } },
            { new: true, upsert: false }
        );

        try {
            const parseMaybeJson = (value) => {
                if (!value) return null;
                if (typeof value !== 'string') return value;
                try { return JSON.parse(value); } catch (e) { return null; }
            };

            const logDetails = parseMaybeJson(existingLog?.bookingDetails);
            const logGuest = logDetails?.guestDetails || logDetails?.guestInfo || logDetails?.metadata?.guestInfo || null;
            const logRoom = logDetails?.roomDetails || logDetails?.availablity || logDetails?.metadata?.availablity || null;
            const logBookingInfo = logDetails?.bookingInfo || logDetails?.metadata?.bookingInfo || null;

            const guestDetails = payment?.guestDetails
                ? parseMaybeJson(payment.guestDetails)
                : (booking?.guestDetails || logGuest || null);
            const roomDetails = payment?.roomDetails
                ? parseMaybeJson(payment.roomDetails)
                : (booking?.bookingDetails || logRoom || null);
            const bookingInfo = payment?.bookingInfo
                ? parseMaybeJson(payment.bookingInfo)
                : logBookingInfo;

            const formatDate = (dateString) => {
                const date = new Date(dateString);
                const day = date.getDate();
                const v = day % 100;
                const suffix = (v - 20) % 10 === 1 ? 'st' : (v - 20) % 10 === 2 ? 'nd' : (v - 20) % 10 === 3 ? 'rd' : v === 1 ? 'st' : v === 2 ? 'nd' : v === 3 ? 'rd' : 'th';
                const month = date.toLocaleString('en-US', { month: 'long' });
                const year = date.getFullYear();
                return `${day}${suffix}, ${month.toLowerCase()} ${year}`;
            };
            const formatPrice = (price) => Number(price).toLocaleString();
            const isValidNumber = (val) => !isNaN(parseFloat(val)) && isFinite(val);

            const counting = (guestCount) => {
                const numChildren = guestCount?.ages?.filter((age) => age.includes('child')).length || 0;
                const numToddlers = guestCount?.ages?.filter((age) => age.includes('toddler')).length || 0;
                const numInfants = guestCount?.ages?.filter((age) => age.includes('infant')).length || 0;
                return { adults: guestCount?.adults || 0, children: numChildren, toddlers: numToddlers, infants: numInfants };
            };

            const calculateNumberOfNights = (visitDate, endDate) => {
                return Math.floor((new Date(endDate) - new Date(visitDate)) / (1000 * 60 * 60 * 24));
            };

            const totalGuests = roomDetails?.visitDate
                ? (roomDetails?.selectedRooms?.[0]?.guestCount?.adults || 0) +
                counting(roomDetails?.selectedRooms?.[0]?.guestCount).children +
                counting(roomDetails?.selectedRooms?.[0]?.guestCount).toddlers +
                counting(roomDetails?.selectedRooms?.[0]?.guestCount).infants
                : (bookingInfo?.adultsAlcoholic || 0) + (bookingInfo?.adultsNonAlcoholic || 0) +
                (bookingInfo?.Nanny || 0) + (bookingInfo?.childTotal || 0);

            const emailContext = {
                name: payment?.name || guestDetails?.firstname || 'N/A',
                email: guestDetails?.email || existingLog?.userId || 'N/A',
                id: payment?.ref || bookingRef,
                bookingType: roomDetails?.selectedRooms?.map((room) => ` ${room.title}`).join(',') || 'Day Pass',
                checkIn: roomDetails?.visitDate
                    ? `${formatDate(roomDetails.visitDate)}, (2pm)`
                    : roomDetails?.startDate
                        ? `${formatDate(roomDetails.startDate)}, (12noon)`
                        : 'N/A',
                checkOut: roomDetails?.endDate
                    ? `${formatDate(roomDetails.endDate)}, (11am)`
                    : roomDetails?.startDate
                        ? `${formatDate(roomDetails.startDate)}, (6pm)`
                        : 'N/A',
                numberOfGuests: roomDetails?.visitDate && roomDetails?.selectedRooms?.[0]?.guestCount
                    ? `${roomDetails.selectedRooms[0].guestCount.adults ?? 0} Adults, ${counting(roomDetails.selectedRooms[0].guestCount).children} Children, ${counting(roomDetails.selectedRooms[0].guestCount).toddlers} Toddlers, ${counting(roomDetails.selectedRooms[0].guestCount).infants} Infants`
                    : bookingInfo
                        ? `${bookingInfo.adultsAlcoholic ?? 0} Adults Alcoholic, ${bookingInfo.adultsNonAlcoholic ?? 0} Adults Non Alcoholic, ${bookingInfo.Nanny ?? 0} Nanny, ${bookingInfo.childTotal ?? 0} Child`
                        : `${roomDetails?.adultsCount ?? 0} Adults, ${roomDetails?.childrenCount ?? 0} Children`,
                numberOfNights: roomDetails?.visitDate
                    ? calculateNumberOfNights(roomDetails.visitDate, roomDetails.endDate)
                    : 'Day Pass',
                extras: roomDetails?.visitDate && roomDetails?.finalData?.length > 0
                    ? roomDetails.finalData.map((e) => ` ${e.title}`).join(', ')
                    : roomDetails?.startDate && roomDetails?.extras?.length > 0
                        ? roomDetails.extras.map((e) => ` ${e.title}`).join(', ')
                        : 'No Extras',
                subTotal: isValidNumber(payment?.subTotal) ? formatPrice(payment.subTotal) : 'N/A',
                multiNightDiscount: isValidNumber(payment?.discount) ? formatPrice(payment.discount) : 'N/A',
                clubMemberDiscount: isValidNumber(payment?.voucher) ? formatPrice(payment.voucher) : 'N/A',
                vat: isValidNumber(payment?.vat) ? formatPrice(payment.vat) : 'N/A',
                totalCost: isValidNumber(payment?.totalCost) ? formatPrice(payment.totalCost) : 'N/A',
                roomsPrice: payment?.roomsPrice ? (payment.roomsPrice === 'Daypass' ? payment.roomsPrice : formatPrice(payment.roomsPrice)) : 'N/A',
                extrasPrice: isValidNumber(payment?.extrasPrice) ? formatPrice(payment.extrasPrice) : 'N/A',
                roomsDiscount: isValidNumber(payment?.roomsDiscount) ? formatPrice(payment.roomsDiscount) : 'N/A',
                discountApplied: payment?.discountApplied ? (payment.discountApplied === 'true' ? 'Yes' : 'No') : 'N/A',
                voucherApplied: payment?.voucherApplied ? (payment.voucherApplied === 'true' ? 'Yes' : 'No') : 'N/A',
                priceAfterVoucher: isValidNumber(payment?.priceAfterVoucher) ? formatPrice(payment.priceAfterVoucher) : 'N/A',
                priceAfterDiscount: isValidNumber(payment?.priceAfterDiscount) ? formatPrice(payment.priceAfterDiscount) : 'N/A',
                totalGuests: isValidNumber(totalGuests) ? totalGuests : 'N/A',
            };

            const recipient = guestDetails?.email || existingLog?.userId || null;
            if (recipient) {
                await sendEmail(recipient, 'Your Booking Has Been Cancelled', 'cancellation', emailContext);
                await sendEmail('bookings@jarabeachresort.com', 'Booking Cancelled by Admin', 'cancellation', emailContext);
                console.log(`Cancellation email sent to ${recipient} for booking ${bookingRef}`);
            } else {
                console.warn(`Cancellation email skipped: no recipient found for booking ${bookingRef}`);
            }
        } catch (emailErr) {
            console.error('Failed to send admin cancellation email:', emailErr.message);
        }

        return { message: 'Booking cancelled by admin successfully', bookingType };
    }

    // ─── Get complete booking status by reference ───
    static async getBookingStatus(ref, options = {}) {
        const { skipAutoVerify = false } = options;
        const normalizedRef = String(ref || '').trim();
        const canonicalRef = await this._resolveCanonicalRef(normalizedRef);
        const effectiveRef = canonicalRef || normalizedRef;

        // Fetch all data in parallel
        const [paymentResult, overnightResult, daypassResult, bookingLogResult] = await Promise.allSettled([
            paymentModel.findOne({ ref: effectiveRef }),
            overnightBooking.findOne({ shortId: effectiveRef }),
            daypassBooking.findOne({ shortId: effectiveRef }),
            BookingLog.findOne({ bookingId: effectiveRef }).sort({ timestamp: -1 }),
        ]);

        const payment = paymentResult.status === 'fulfilled' ? paymentResult.value : null;
        const overnightBookingData = overnightResult.status === 'fulfilled' ? overnightResult.value : null;
        const daypassBookingData = daypassResult.status === 'fulfilled' ? daypassResult.value : null;
        const bookingLog = bookingLogResult.status === 'fulfilled' ? bookingLogResult.value : null;

        // Auto-heal stale Squad records:
        // if we only have a pending booking log (no payment/booking doc yet), trigger verify by ref once.
        const paymentStatusLower = (payment?.status || '').toLowerCase();
        const paymentMethodLower = (payment?.method || '').toLowerCase();
        const bookingLogGatewayLower = (bookingLog?.paymentGateway || '').toLowerCase();
        const bookingLogPaymentStatusLower = (bookingLog?.paymentStatus || '').toLowerCase();

        const isSquadPendingFromPayment =
            payment &&
            paymentMethodLower === 'squad' &&
            paymentStatusLower === 'pending';

        const isSquadPendingFromLog =
            bookingLog &&
            bookingLogGatewayLower === 'squad' &&
            bookingLogPaymentStatusLower === 'pending';

        const shouldAutoVerifySquad =
            !skipAutoVerify &&
            (isSquadPendingFromPayment || isSquadPendingFromLog) &&
            !overnightBookingData &&
            !daypassBookingData;

        if (shouldAutoVerifySquad) {
            try {
                const squadService = require('./squad.service');
                await squadService.verifyTransaction(effectiveRef);
                return this.getBookingStatus(effectiveRef, { skipAutoVerify: true });
            } catch (verifyError) {
                console.error('Auto Squad verification failed in getBookingStatus:', verifyError.message);
            }
        }

        // Determine booking type and data
        let booking = null;
        let bookingType = 'payment_only';

        if (overnightBookingData) {
            booking = overnightBookingData;
            bookingType = 'overnight';
        } else if (daypassBookingData) {
            booking = daypassBookingData;
            bookingType = 'daypass';
        }

        // Parse payment's stringified fields
        let parsedGuestDetails = null;
        let parsedRoomDetails = null;
        let parsedBookingInfo = null;

        if (payment) {
            try { parsedGuestDetails = payment.guestDetails ? JSON.parse(payment.guestDetails) : null; } catch (e) { parsedGuestDetails = payment.guestDetails; }
            try { parsedRoomDetails = payment.roomDetails ? JSON.parse(payment.roomDetails) : null; } catch (e) { parsedRoomDetails = payment.roomDetails; }
            try { parsedBookingInfo = payment.bookingInfo ? JSON.parse(payment.bookingInfo) : null; } catch (e) { parsedBookingInfo = payment.bookingInfo; }
        }

        // Parse booking log details as fallback (supports both direct and metadata-nested shapes)
        let logDetails = null;
        let logMetadata = null;
        let logGuestInfo = null;
        let logRoomInfo = null;
        let logBookingInfo = null;
        let logGuestCount = null;
        let logCostBreakDown = null;

        if (bookingLog?.bookingDetails) {
            try {
                logDetails = typeof bookingLog.bookingDetails === 'string'
                    ? JSON.parse(bookingLog.bookingDetails)
                    : bookingLog.bookingDetails;
            } catch (e) {
                logDetails = bookingLog.bookingDetails;
            }

            logMetadata = logDetails?.metadata || null;
            logGuestInfo = logDetails?.guestDetails || logDetails?.guestInfo || logMetadata?.guestInfo || null;
            logRoomInfo = logDetails?.roomDetails || logDetails?.availablity || logMetadata?.availablity || null;
            logBookingInfo = logDetails?.bookingInfo || logMetadata?.bookingInfo || null;
            logGuestCount = logDetails?.guestCount || logRoomInfo?.groups || null;
            logCostBreakDown = logDetails?.costBreakDown || logMetadata?.costBreakDown || null;
        }

        // Build unified guest details (prefer booking, then payment, then booking log)
        const guestInfo = booking?.guestDetails || parsedGuestDetails || logGuestInfo || {};
        const guestNameFromLog = logDetails?.name || '';
        const guestEmailFromLog = logDetails?.email || '';

        // Resolve guest email for fetching the guest profile
        const guestEmail = guestInfo.email || guestEmailFromLog || '';

        // Fetch guest profile and survey in parallel
        const [guestProfileResult, surveyResult] = await Promise.allSettled([
            guestEmail ? Guest.findOne({ email: guestEmail }) : Promise.resolve(null),
            Survey.findOne({ bookingId: effectiveRef }),
        ]);

        const guestProfile = guestProfileResult.status === 'fulfilled' ? guestProfileResult.value : null;
        const surveyData = surveyResult.status === 'fulfilled' ? surveyResult.value : null;

        // Unified group normalization helper
        const normalizeGroup = (groupData) => {
            if (!groupData) return { adults: 0, children: 0 };
            if (typeof groupData !== 'object') return { adults: 0, children: 0, _raw: groupData };

            // Handle daypass keys
            const adults = (groupData.adults || 0) + (groupData.adultsAlcoholic || 0) + (groupData.adultsNonAlcoholic || 0);
            const children = (groupData.children || 0) + (groupData.childTotal || 0) + (groupData.Nanny || 0) + (groupData.toddlers || 0) + (groupData.infants || 0);

            return { adults, children };
        };

        const group = normalizeGroup(
            booking?.totalGuest ||
            parsedRoomDetails?.totalGuest ||
            logGuestCount ||
            logRoomInfo?.totalGuest ||
            logRoomInfo?.groups ||
            logMetadata?.availablity?.totalGuest ||
            logMetadata?.availablity?.groups ||
            null
        );

        return {
            ref: effectiveRef,
            bookingType,
            found: !!(payment || booking || bookingLog),

            guest: {
                firstName: guestInfo.firstname || guestInfo.firstName || guestInfo.name?.split(' ')[0] || guestNameFromLog?.split(' ')[0] || payment?.name?.split(' ')[0] || 'N/A',
                lastName: guestInfo.lastname || guestInfo.lastName || guestInfo.name?.split(' ').slice(1).join(' ') || guestNameFromLog?.split(' ').slice(1).join(' ') || payment?.name?.split(' ').slice(1).join(' ') || 'N/A',
                email: guestInfo.email || guestEmailFromLog || 'N/A',
                phone: guestInfo.mobile || guestInfo.phone || guestInfo.phoneNumber || 'N/A',
                dob: guestInfo.dob || guestInfo.dateOfBirth || null,
                keepInfo: guestInfo.keepInfo ?? false,
                howDidYouFindUs: guestInfo.howDidYouFindUs || guestInfo.referral || guestInfo.aboutUs || 'N/A',
                photo: toAbsolutePhotoUrl(guestInfo.photo || guestProfile?.photo || null),
                preferredCommunicationChannel: guestProfile?.preferredCommunicationChannel || guestInfo.preferredCommunicationChannel || guestInfo.communicationPreference || '',
                gender: guestInfo.gender || guestProfile?.gender || '',
            },

            payment: payment ? {
                _id: payment._id,
                method: payment.method || 'N/A',
                status: payment.status || 'N/A',
                amount: payment.amount || '0',
                discount: payment.discount || 0,
                voucher: payment.voucher || 0,
                multiNightDiscount: payment.multiNightDiscount || 0,
                subTotal: payment.subTotal || logCostBreakDown?.subTotal || logCostBreakDown?.roomsPrice || '0',
                vat: payment.vat || logCostBreakDown?.vat || '0',
                totalCost: payment.totalCost || '0',
                roomsPrice: payment.roomsPrice || '0',
                extrasPrice: payment.extrasPrice || '0',
                roomsDiscount: payment.roomsDiscount || '',
                discountApplied: payment.discountApplied || '',
                voucherApplied: payment.voucherApplied || '',
                priceAfterVoucher: payment.priceAfterVoucher || '',
                priceAfterDiscount: payment.priceAfterDiscount || '',
                createdAt: payment.createdAt,
            } : (bookingLog ? {
                method: bookingLog.paymentGateway || 'N/A',
                status: bookingLog.paymentStatus || 'Pending',
                amount: bookingLog.amount || '0',
                currency: bookingLog.currency || 'NGN',
                subTotal: logCostBreakDown?.subTotal || logCostBreakDown?.roomsPrice || '0',
                vat: logCostBreakDown?.vat || '0',
                totalCost: logCostBreakDown?.totalCost || bookingLog.amount || '0',
                discount: logCostBreakDown?.discount || 0,
                voucher: logCostBreakDown?.voucher || 0,
                createdAt: bookingLog.timestamp,
            } : null),

            stay: {
                arrivalDate: booking?.bookingDetails?.visitDate || booking?.bookingDetails?.startDate ||
                    parsedRoomDetails?.visitDate || parsedRoomDetails?.startDate ||
                    logRoomInfo?.visitDate || logRoomInfo?.startDate ||
                    logMetadata?.availablity?.visitDate || logMetadata?.availablity?.startDate || null,
                departureDate: booking?.bookingDetails?.endDate || parsedRoomDetails?.endDate ||
                    logRoomInfo?.endDate ||
                    logMetadata?.availablity?.endDate || null,
                group: group,
                rooms: booking?.bookingDetails?.selectedRooms || parsedRoomDetails?.selectedRooms || parsedRoomDetails?.option ||
                    logRoomInfo?.selectedRooms || logRoomInfo?.option ||
                    logMetadata?.availablity?.selectedRooms || logMetadata?.availablity?.option || null,
                extras: booking?.bookingDetails?.extras || parsedRoomDetails?.extras ||
                    logRoomInfo?.extras ||
                    logMetadata?.availablity?.extras || null,
            },

            bookingInfo: {
                bookingId: booking?.shortId || payment?.ref || bookingLog?.bookingId || effectiveRef,
                bookingDate: booking?.createdAt || payment?.createdAt || bookingLog?.timestamp || null,
                bookingStatus: this._resolveBookingStatus(booking, bookingLog, payment),
            },

            bookingLog: bookingLog ? {
                _id: bookingLog._id,
                status: bookingLog.status,
                paymentStatus: bookingLog.paymentStatus,
                paymentGateway: bookingLog.paymentGateway,
                checkedIn: bookingLog.checkedIn,
                checkedInAt: bookingLog.checkedInAt,
                checkedOut: bookingLog.checkedOut,
                checkedOutAt: bookingLog.checkedOutAt,
                resolved: bookingLog.resolved,
                timestamp: bookingLog.timestamp,
            } : null,

            // Guest profile data for admin fields
            guestProfile: guestProfile ? {
                _id: guestProfile._id,
                preferredCommunicationChannel: guestProfile.preferredCommunicationChannel || '',
                guestPersona: guestProfile.guestPersona || '',
                specialOccasionNotes: guestProfile.specialOccasionNotes || '',
                theUsual: guestProfile.theUsual || '',
                lastInteractionSummary: guestProfile.lastInteractionSummary || '',
            } : null,

            // Survey / Post-checkout review data
            survey: surveyData ? {
                bookingId: surveyData.bookingId,
                feedback: surveyData.feedback || '',
                ratings: surveyData.ratings || {},
                submittedAt: surveyData.submittedAt,
            } : null,

            _raw: {
                payment,
                booking,
                bookingLog,
                parsedGuestDetails,
                parsedRoomDetails,
                parsedBookingInfo,
            }
        };
    }

    // ─── Update guest notes/preferences from admin page ───
    static async updateGuestNotes(email, updates) {
        if (!email) throw new Error('Guest email is required');

        const allowedFields = [
            'lastInteractionSummary',
            'specialOccasionNotes',
            'theUsual',
            'guestPersona',
            'preferredCommunicationChannel',
        ];

        const updateData = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateData[field] = updates[field];
            }
        }

        const guest = await Guest.findOneAndUpdate(
            { email },
            { $set: updateData },
            { new: true, upsert: false }
        );

        return guest;
    }

    // ─── Helper: Resolve booking status from multiple sources ───
    static _resolveBookingStatus(booking, bookingLog, payment) {
        const normalizedPaymentStatus = (payment?.status || '').toLowerCase();
        const normalizedBookingLogPaymentStatus = (bookingLog?.paymentStatus || '').toLowerCase();

        // 1. Check if cancelled via booking model (overnight has status field)
        if (booking?.status === 'Cancelled') return 'Cancelled by Admin';

        // 2. Check if cancelled via booking log (works for both daypass and overnight)
        if (bookingLog?.status === 'cancelled_by_admin' || bookingLog?.status === 'cancelled') return 'Cancelled by Admin';

        // 3. Check payment status - if it's Success, we should treat it as Confirmed 
        // regardless of what the booking model says (which might be default 'Pending')
        if (normalizedPaymentStatus === 'success' || normalizedBookingLogPaymentStatus === 'success') return 'Confirmed';
        if (normalizedPaymentStatus === 'cancelled by admin') return 'Cancelled by Admin';

        // 4. Check booking model status (Confirmed, Checked In, etc.)
        if (booking?.status && booking.status !== 'Pending') return booking.status;

        return booking?.status || 'Pending';
    }
}

module.exports = BookingLogger;

