const {
    asyncErrorHandler,
    ErrorResponse,
} = require("../middlewares/error/error");
const RetreatDaypassOption = require("../models/retreatDaypassOption.schema");
const { statusCode } = require("../utils/statusCode");

const create = asyncErrorHandler(async (req, res) => {
    const created = await RetreatDaypassOption.create(req.body);
    if (created) {
        res.status(statusCode.accepted).json(created);
    } else {
        throw new ErrorResponse("Failed To Create Retreat Daypass Option", 404);
    }
});

const update = asyncErrorHandler(async (req, res) => {
    const { adultsAlcoholic, adultsNonAlcoholic, nanny, childTotal } = req.body;
    const existing = await RetreatDaypassOption.findById(req.params.id);

    if (!existing) {
        throw new ErrorResponse("Retreat Daypass Option not found", 404);
    }

    const updatedBody = {
        adultsAlcoholic: {
            weekDayPrice:
                adultsAlcoholic?.weekDayPrice ??
                existing.adultsAlcoholic.weekDayPrice,
            weekendPrice:
                adultsAlcoholic?.weekendPrice ??
                existing.adultsAlcoholic.weekendPrice,
            seasonalPrice:
                adultsAlcoholic?.seasonalPrice ??
                existing.adultsAlcoholic.seasonalPrice,
        },
        adultsNonAlcoholic: {
            weekDayPrice:
                adultsNonAlcoholic?.weekDayPrice ??
                existing.adultsNonAlcoholic.weekDayPrice,
            weekendPrice:
                adultsNonAlcoholic?.weekendPrice ??
                existing.adultsNonAlcoholic.weekendPrice,
            seasonalPrice:
                adultsNonAlcoholic?.seasonalPrice ??
                existing.adultsNonAlcoholic.seasonalPrice,
        },
        nanny: {
            weekDayPrice: nanny?.weekDayPrice ?? existing.nanny.weekDayPrice,
            weekendPrice: nanny?.weekendPrice ?? existing.nanny.weekendPrice,
            seasonalPrice: nanny?.seasonalPrice ?? existing.nanny.seasonalPrice,
        },
        childTotal: {
            weekDayPrice:
                childTotal?.weekDayPrice ?? existing.childTotal.weekDayPrice,
            weekendPrice:
                childTotal?.weekendPrice ?? existing.childTotal.weekendPrice,
            seasonalPrice:
                childTotal?.seasonalPrice ?? existing.childTotal.seasonalPrice,
        },
    };

    const updatedData = await RetreatDaypassOption.findByIdAndUpdate(
        req.params.id,
        updatedBody,
        { new: true }
    );
    if (updatedData) {
        res.status(statusCode.accepted).json(updatedData);
    } else {
        throw new ErrorResponse("Failed To Update Retreat Daypass Option", 404);
    }
});

const getAll = asyncErrorHandler(async (req, res) => {
    const allOptions = await RetreatDaypassOption.find({});
    if (allOptions.length > 0) {
        res.status(statusCode.accepted).json(allOptions);
    } else {
        throw new ErrorResponse("No Retreat Daypass Options Found", 404);
    }
});

const del = asyncErrorHandler(async (req, res) => {
    const deleted = await RetreatDaypassOption.findByIdAndDelete(req.params.id);
    if (deleted) {
        res.status(statusCode.accepted).json({ msg: "Deleted" });
    } else {
        throw new ErrorResponse("No Retreat Daypass Option Found", 404);
    }
});

module.exports = { create, getAll, del, update };
