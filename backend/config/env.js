require("dotenv").config({ quiet: true });
const { z } = require("zod");

// blank or missing means "not configured": the server still runs, but photo uploads are disabled
const optionalText = z.string().trim().optional().transform((v) => v || undefined);
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().min(1).default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  CLOUDINARY_CLOUD_NAME: optionalText,
  CLOUDINARY_API_KEY: optionalText,
  CLOUDINARY_API_SECRET: optionalText,
  SLA_INTERVAL_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const env = parsed.data;

if (
  env.NODE_ENV === "production" &&
  (env.JWT_SECRET.length < 32 || /generate|change-this|example|placeholder/i.test(env.JWT_SECRET))
) {
  throw new Error("JWT_SECRET must be a random value of at least 32 characters in production");
}

env.CLOUDINARY_ENABLED = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
);
if (env.NODE_ENV === "production" && !env.CLOUDINARY_ENABLED) {
  console.warn("Cloudinary is not configured: photo uploads are disabled");
}

module.exports = env;