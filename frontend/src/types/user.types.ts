export interface User {
  user_id: number;
  name: string;
  last_name: string | null;
  email: string;
  role_id: number;
  role_name: string;
  active: boolean;
  profile_picture_url: string | null;
  created_at: string;
}
 