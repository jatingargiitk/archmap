import { formatDate } from '../utils/helpers';

export interface User {
  id: string;
  name: string;
  createdAt: Date;
}

export function getCurrentUser(): User | null {
  return {
    id: '1',
    name: 'John Doe',
    createdAt: new Date(),
  };
}

export function formatUserCreatedAt(user: User): string {
  return formatDate(user.createdAt);
}
