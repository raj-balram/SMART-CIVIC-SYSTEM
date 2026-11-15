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

    // citizens only ever receive this for their OWN complaints (the server sends it to the owner's room)
    const onSupported = (c) => {
      if (user.role === "admin") return;
      toast.success(
        `${c.supportCount} ${c.supportCount === 1 ? "person supports" : "people support"} your complaint "${c.title}"`
      );
    };

    socket.on("complaint:updated", onUpdated);
    socket.on("complaint:supported", onSupported);
    return () => {
      socket.off("complaint:updated", onUpdated);
      socket.off("complaint:supported", onSupported);
    };
  }, [socket, user]);

  return null;
};

export default RealtimeNotifications;