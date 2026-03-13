const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: "dcflurlbw",
  api_key: "765875695614334",
  api_secret: "UmwlKhJd4kP8WuKZ_VoLvyQNc5o",
});

const uploadToCloudinary = async (filePath, options = {}) => {
  const folder =
    options.folder ||
    process.env.CLOUDINARY_UPLOAD_FOLDER ||
    'jara-resort/guest-ids';

  return cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'image',
    ...options,
  });
};

module.exports = { cloudinary, uploadToCloudinary };

