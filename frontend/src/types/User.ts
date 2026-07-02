export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'USER'; 
}