
const paginate = async (model, query = {}, options = {}) => {
    const page = Math.max(parseInt(options.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(options.limit) || 10, 1), 100);
    const sort = options.sort || { createdAt: -1 };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        model.find(query).sort(sort).skip(skip).limit(limit),
        model.countDocuments(query),
    ]);

    return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
};

module.exports = { paginate };
