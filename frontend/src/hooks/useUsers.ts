// hooks/useUsers.ts

import { useCallback, useEffect, useState } from "react";
import { User } from "../types/user.types";
import { userService } from "../services/auth.service";

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const data = await userService.getUsers();

      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Borra la cuenta y refresca la lista — así, si el backend rechaza el
  // pedido (ej. CANNOT_TARGET_SELF), la lista queda igual que antes sin
  // que quien llama tenga que reconciliar el estado a mano.
  const deleteUser = useCallback(async (userId: number) => {
    await userService.deleteUser(userId);
    await fetchUsers();
  }, [fetchUsers]);

  const setUserActive = useCallback(async (userId: number, active: boolean) => {
    await userService.setUserActive(userId, active);
    await fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    fetchUsers,
    deleteUser,
    setUserActive,
  };
};
