const multer = require("multer");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_IMAGE_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new AppError(400, "Only JPEG, PNG or WebP images are allowed"));
  },
});

// The type the browser declares can be faked, so also check the file's first bytes.
function hasImageSignature(buf) {
  if (buf.length < 12) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  return jpeg || png || webp;
}

const verifyImage = (req, res, next) => {
  if (req.file && !hasImageSignature(req.file.buffer)) {
    throw new AppError(400, "File content is not a valid image");
  }
  next();
};

module.exports = { upload, verifyImage };