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

  return {
    users,
    loading,
    fetchUsers
  };
};