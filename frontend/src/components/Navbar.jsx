import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-gray-800 text-white p-4 flex justify-between items-center">
      <h1 className="font-bold text-lg">🏙️ Smart Civic System</h1>

      {user ? (
        <div className="flex gap-4 items-center">
          {user.role === "admin" && (
            <Link to="/admin" className="hover:underline">
              Admin
            </Link>
          )}
          <Link to="/map" className="hover:underline">
            Map
          </Link>
          <Link to="/complaint" className="hover:underline">
            Submit
          </Link>
          <button
            onClick={logout}
            className="bg-red-500 px-4 py-1 rounded hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link to="/login" className="hover:underline">Login</Link>
          <Link to="/register" className="hover:underline">Register</Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;