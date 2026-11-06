import { useEffect } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const RealtimeNotifications = () => {
  const { socket, user } = useAuth();

  useEffect(() => {
    if (!socket || !user) return;

    const onUpdated = (c) => {
      const ownerId = c.user?._id ?? c.user;
      if (user.role === "admin" || String(ownerId) !== String(user._id)) return;
      const note = c.statusHistory?.[c.statusHistory.length - 1]?.note;
      toast.success(`Your complaint "${c.title}" is now ${c.status}${note ? `: ${note}` : ""}`);
    };

    socket.on("complaint:updated", onUpdated);
    return () => socket.off("complaint:updated", onUpdated);
  }, [socket, user]);

  return null;
};

export default RealtimeNotifications;