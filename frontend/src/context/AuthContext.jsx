import { createContext, useContext, useState, useEffect } from "react";
import { io } from "socket.io-client";
import API from "../utils/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isAuth, setAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔥 Load user on refresh (FIXED)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (token && storedUser) {
      const parsedUser = JSON.parse(storedUser);

      setUser(parsedUser);
      setAuth(true);

      // ✅ Initialize socket
      const socketInstance = io(
        import.meta.env.VITE_BACKEND_URL || "http://localhost:5000",
        {
          auth: {
            token: token || localStorage.getItem("token"), // ✅ safety
          },
        }
      );
      setSocket(socketInstance);
    }
    setLoading(false)
  }, []);

  // 🔥 Login
  const login = (userData, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setAuth(true);

    if (socket) socket.disconnect();

    const socketInstance = io(
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000",
      {
        auth: { token },
      }
    );

    setSocket(socketInstance);
  };

  // 🔥 Logout
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    setAuth(false);

    if (socket) socket.disconnect();
    setSocket(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuth, login, logout, socket, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);