process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/placeholder"; // tests start their own in-memory MongoDB
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";