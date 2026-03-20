# 🏙️ Smart Civic Management Portal

A full-stack civic complaint management system built for citizens and administrators. Citizens can submit geo-tagged complaints with photos, track resolution status in real time, and view a live heatmap of issues across the city. Admins get a full dashboard with stats, filters, and instant status updates.

**Live Demo:** [civic-frontend.vercel.app](https://smart-civic-system.vercel.app/)

---

## 📸 Screenshots

> Add screenshots here after deployment — login page, map view, admin dashboard

---

## ✨ Features

### Citizens
- 📝 Submit complaints with title, description, category and photo
- 📍 Auto-detected GPS location pinned on map
- 🗺️ View all your complaints on an interactive map
- 🔔 Real-time status updates via Socket.IO
- 👤 Profile page with complaint history and stats
- ✏️ Edit your display name

### Admins
- 📊 Dashboard with live stats — total, pending, in progress, resolved
- 📈 Category breakdown bar chart + resolution rate
- 🔍 Search, filter by status/category, sort complaints
- ⚡ Real-time new complaint notifications
- 🔄 One-click status updates (Pending → In Progress → Resolved)
- 🗺️ Full city-wide complaint heatmap

### General
- 🔐 JWT authentication with role-based access (user / admin)
- 📱 Fully responsive — works on mobile, tablet and desktop
- ☁️ Image uploads via Cloudinary
- 🔴 Live updates via Socket.IO (no page refresh needed)

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Vite | Build tool |
| Tailwind CSS v4 | Styling |
| React Router v6 | Client-side routing |
| Axios | API requests |
| Socket.IO Client | Real-time updates |
| React Leaflet | Interactive maps |
| Leaflet.heat | Heatmap layer |
| React Hot Toast | Notifications |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express | Server framework |
| MongoDB + Mongoose | Database |
| JWT | Authentication |
| bcryptjs | Password hashing |
| Socket.IO | Real-time events |
| Multer | File upload handling |
| Cloudinary | Image storage |

### Deployment
| Service | Purpose |
|---|---|
| Vercel | Frontend hosting |
| Render | Backend hosting |
| MongoDB Atlas | Cloud database |
| Cloudinary | Image CDN |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Cloudinary account (free tier)

### 1. Clone the repository
```bash
git clone https://github.com/raj-balram/civic-backend.git
git clone https://github.com/raj-balram/civic-frontend.git
```

### 2. Backend setup
```bash
cd civic-backend
npm install
```

Create a `.env` file in the backend root:
```env
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/civic?retryWrites=true&w=majority
JWT_SECRET=your_long_random_jwt_secret
ADMIN_SECRET=your_chosen_admin_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
PORT=5000
```

Start the server:
```bash
node server.js
# Server running on port 5000 🚀
```

### 3. Frontend setup
```bash
cd civic-frontend
npm install
```

Create a `.env` file in the frontend root:
```env
VITE_BACKEND_URL=http://localhost:5000
```

Start the dev server:
```bash
npm run dev
# http://localhost:5173
```

---

## 📁 Project Structure
```
civic-backend/
├── config/
│   ├── db.js               # MongoDB connection
│   └── cloudinary.js       # Cloudinary config
├── controllers/
│   ├── authController.js   # Register, login
│   └── complaintController.js  # CRUD + stats
├── middlewares/
│   ├── authMiddleware.js   # JWT protect
│   └── upload.js           # Multer config
├── models/
│   ├── User.js             # User schema
│   └── Complaint.js        # Complaint schema
├── routes/
│   ├── authRoutes.js       # /api/auth/*
│   └── complaintRoutes.js  # /api/complaints/*
├── utils/
│   ├── generateToken.js    # JWT generator
│   └── cloudinaryUpload.js # Stream upload
└── server.js               # Entry point

civic-frontend/
├── src/
│   ├── components/
│   │   ├── Layout.jsx      # Sidebar + topbar shell
│   │   └── Map.jsx         # Location picker map
│   ├── context/
│   │   └── AuthContext.jsx # Auth + socket state
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── ComplaintForm.jsx
│   │   ├── MapView.jsx
│   │   ├── Profile.jsx
│   │   └── AdminDashboard.jsx
│   ├── utils/
│   │   └── api.js          # Axios instance
│   ├── App.jsx             # Routes
│   └── index.css           # Tailwind v4 theme
```

---

## 🔑 API Reference

### Auth
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/auth/me` | Get current user | Yes |
| PUT | `/api/auth/me` | Update display name | Yes |

### Complaints
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/complaints` | Submit complaint | User |
| GET | `/api/complaints` | Get my complaints | User |
| GET | `/api/complaints/all` | Get all complaints | Admin |
| GET | `/api/complaints/stats` | Get dashboard stats | Admin |
| PUT | `/api/complaints/:id/status` | Update status | Admin |

---

## 🔴 Real-time Events (Socket.IO)

| Event | Direction | Payload |
|---|---|---|
| `newComplaint` | Server → All clients | New complaint object |
| `statusUpdate_<userId>` | Server → Specific user | Updated complaint object |

---

## 🌍 Deployment

### Frontend → Vercel
1. Push `civic-frontend` to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add env variable: `VITE_BACKEND_URL=https://your-render-url.onrender.com`
4. Deploy — auto-redeploys on every push

### Backend → Render
1. Push `civic-backend` to GitHub
2. New Web Service on [render.com](https://render.com)
3. Build command: `npm install` | Start command: `node server.js`
4. Add all 6 environment variables
5. Deploy

---

## 👤 Default Roles

| Role | Access |
|---|---|
| `user` | Submit complaints, view own complaints, profile |
| `admin` | All user access + admin dashboard, status updates, all complaints |

To register as admin — use the "Admin registration" option on the register page and enter the `ADMIN_SECRET` value from your env.

---

## 🐛 Known Limitations

- Render free tier sleeps after 15 min of inactivity — first request may take ~30 seconds
- No email notifications yet (planned feature)
- No pagination on admin table (planned for large datasets)

---

## 🗺️ Roadmap

- [ ] Email notifications when complaint status changes
- [ ] Edit / delete own complaints
- [ ] Comments and admin replies per complaint
- [ ] Export complaints as PDF / Excel
- [ ] Complaint priority levels (Low / Medium / High)
- [ ] Profile photo upload
- [ ] Pagination on admin dashboard

---

## 📄 License

MIT License — free to use and modify.

---

## 🙏 Acknowledgements

- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- [Leaflet.js](https://leafletjs.com/) — map library
- [Cloudinary](https://cloudinary.com/) — image hosting
- [Socket.IO](https://socket.io/) — real-time engine
