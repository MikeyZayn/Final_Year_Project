import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = sessionStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return;
    }

    api.get("/accounts/api/me/")
      .then(({ data }) => {
        if (
          !cancelled &&
          sessionStorage.getItem("token") === token
        ) {
          setUser(data);
        }
      })
      .catch((error) => {
        if (
          !cancelled &&
          sessionStorage.getItem("token") === token &&
          [401, 403].includes(error.response?.status)
        ) {
          sessionStorage.removeItem("token");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (phone, password) => {
    const { data } = await api.post("/accounts/api/login/", {
      phone,
      password,
    });

    sessionStorage.setItem("token", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (path, payload) => {
    const { data } = await api.post(path, payload);

    sessionStorage.setItem("token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    sessionStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);