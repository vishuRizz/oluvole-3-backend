const Guest = require('../models/guest.schema');
const { Survey } = require('../models/survey.schema');
const { sendEmail } = require('../config/mail.config');
const logger = require('./logger');

const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [String(value)];
};

const normalizePhoto = (guestData) => {
    const directPhoto = guestData?.photo;
    if (typeof directPhoto === 'string' && directPhoto.trim()) return directPhoto.trim();

    const fileField = guestData?.file;
    if (typeof fileField === 'string' && fileField.trim() && fileField !== 'ID ON FILE') {
        return fileField.trim();
    }
    return '';
};

const normalizePreferredChannel = (guestData) => {
    return (
        guestData?.preferredCommunicationChannel ||
        guestData?.communicationPreference ||
        guestData?.preferredCommunication ||
        ''
    );
};

/**
 * Process a guest profile from booking and optionally count the visit.
 */
async function processGuestVisit(guestData, isOvernight = false, options = {}) {
    try {
        const { email, firstname, lastname, name, phone, mobile, gender, dateOfBirth, anniversary, para, drinkPreferences } = guestData;
        const { incrementVisit = true } = options;
        const guestEmail = email;
        if (!guestEmail) return null;

        const fullName = name || `${firstname || ''} ${lastname || ''}`.trim() || 'N/A';
        const phoneNumber = mobile || phone || 'N/A';
        const dietaryValues = toArray(guestData?.preferences?.dietaryRequirements || para);
        const drinkValues = toArray(guestData?.preferences?.drinkPreferences || drinkPreferences);
        const photo = normalizePhoto(guestData);
        const preferredCommunicationChannel = normalizePreferredChannel(guestData);
        const howDidYouFindUs = guestData?.howDidYouFindUs || guestData?.aboutUs || guestData?.referral || '';
        const keepInfo = !!guestData?.keepInfo;
        const dob = guestData?.keyDates?.dob || dateOfBirth || null;
        const anniv = guestData?.keyDates?.anniversary || anniversary || null;

        let guest = await Guest.findOne({ email: guestEmail });

        if (guest) {
            // Increment visit metrics only for successful/confirmed visit events
            if (incrementVisit) {
                if (isOvernight) {
                    guest.visitMetrics.overnightStays = (guest.visitMetrics.overnightStays || 0) + 1;
                } else {
                    guest.visitMetrics.dayVisits = (guest.visitMetrics.dayVisits || 0) + 1;
                }
            }

            const totalVisits = (guest.visitMetrics.dayVisits || 0) + (guest.visitMetrics.overnightStays || 0);
            logger.info(`Processing returning guest: ${guestEmail}, Total Visits: ${totalVisits}`);

            // Update basic info if provided
            if (fullName && fullName !== 'N/A') guest.name = fullName;
            if (phoneNumber && phoneNumber !== 'N/A') guest.mobile = phoneNumber;
            if (gender) guest.gender = gender;
            if (firstname) guest.firstName = firstname;
            if (lastname) guest.lastName = lastname;
            if (dob) guest.keyDates.dob = dob;
            if (anniv) guest.keyDates.anniversary = anniv;
            if (preferredCommunicationChannel) guest.preferredCommunicationChannel = preferredCommunicationChannel;
            if (howDidYouFindUs) guest.howDidYouFindUs = howDidYouFindUs;
            if (photo) guest.photo = photo;
            guest.keepInfo = keepInfo;
            if (Array.isArray(guestData?.guests)) guest.guests = guestData.guests;
            if (guestData?.guestPersona) guest.guestPersona = guestData.guestPersona;
            if (guestData?.specialOccasionNotes) guest.specialOccasionNotes = guestData.specialOccasionNotes;
            if (guestData?.theUsual) guest.theUsual = guestData.theUsual;
            if (guestData?.lastInteractionSummary) guest.lastInteractionSummary = guestData.lastInteractionSummary;

            // Update preferences if provided
            for (const dietary of dietaryValues) {
                if (!guest.preferences.dietaryRequirements.includes(dietary)) {
                    guest.preferences.dietaryRequirements.push(dietary);
                }
            }
            for (const drink of drinkValues) {
                if (!guest.preferences.drinkPreferences.includes(drink)) {
                    guest.preferences.drinkPreferences.push(drink);
                }
            }

            await guest.save();

            // Notify Admin for returning guests (Count >= 2)
            if (incrementVisit && totalVisits >= 2) {
                console.log(`[GuestManager] Triggering returning guest alert for ${guest.email} (Visit #${totalVisits})`);
                await notifyAdminReturningGuest(guest, totalVisits);
            } else if (incrementVisit) {
                console.log(`[GuestManager] Guest ${guest.email} has ${totalVisits} visits - alert not required yet.`);
            }

            return guest;
        } else {
            logger.info(`Creating new guest record: ${guestEmail}`);
            // Create new guest
            guest = await Guest.create({
                name: fullName,
                gender: gender || 'N/A',
                email: guestEmail,
                mobile: phoneNumber,
                member: false,
                birthdayReminded: false,
                photo,
                keepInfo,
                howDidYouFindUs,
                firstName: firstname || '',
                lastName: lastname || '',
                guests: Array.isArray(guestData?.guests) ? guestData.guests : [],
                visitMetrics: {
                    dayVisits: incrementVisit ? (isOvernight ? 0 : 1) : 0,
                    overnightStays: incrementVisit ? (isOvernight ? 1 : 0) : 0,
                },
                preferences: {
                    dietaryRequirements: dietaryValues,
                    drinkPreferences: drinkValues,
                    pastExtras: [],
                },
                keyDates: {
                    dob: dob || undefined,
                    anniversary: anniv || undefined,
                },
                preferredCommunicationChannel: preferredCommunicationChannel || '',
                guestPersona: guestData?.guestPersona || '',
                specialOccasionNotes: guestData?.specialOccasionNotes || '',
                theUsual: guestData?.theUsual || '',
                lastInteractionSummary: guestData?.lastInteractionSummary || '',
            });
            return guest;
        }
    } catch (error) {
        console.error('Error in processGuestVisit:', error);
        throw error;
    }
}


async function notifyAdminReturningGuest(guest, visitCount) {
    try {
        const milestones = [2, 3, 5];
        let previousFeedback = 'No previous feedback recorded.';
        let preferencesSummary = 'None recorded.';

        if (milestones.includes(visitCount)) {
            // Fetch latest survey
            const latestSurvey = await Survey.findOne({ guestEmail: guest.email }).sort({ createdAt: -1 });
            if (latestSurvey) {
                previousFeedback = `"${latestSurvey.feedback}" (Submitted: ${new Date(latestSurvey.submittedAt).toLocaleDateString()})`;
            }

            const dietary = guest.preferences?.dietaryRequirements?.join(', ') || 'None';
            const drinks = guest.preferences?.drinkPreferences?.join(', ') || 'None';
            preferencesSummary = `Dietary: ${dietary} | Drinks: ${drinks}`;
        }

        const emailContext = {
            guestName: guest.name,
            guestEmail: guest.email,
            visitCount: visitCount,
            isMilestone: milestones.includes(visitCount),
            preferences: preferencesSummary,
            feedback: previousFeedback,
            lastVisit: guest.updatedAt ? new Date(guest.updatedAt).toLocaleDateString() : 'N/A'
        };

      
        await sendEmail(
            'bookings@jarabeachresort.com',
            `Returning Guest Alert: ${guest.name} (${visitCount} visits)`,
            'admin_returning_guest',
            emailContext
        );

        console.log(`[GuestManager] Admin notified successfully for: ${guest.email}`);
        logger.info(`Admin notified for returning guest: ${guest.email} (Visit #${visitCount})`);
    } catch (error) {
        console.error('[GuestManager] CRITICAL ERROR in notifyAdminReturningGuest:', error);
    }
}

module.exports = {
    processGuestVisit
};
