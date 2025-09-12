export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  lastLogin?: Date;
  createdAt: Date;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

export interface DashboardStats {
  totalJobs: number;
  successRate: number;
  recordsProcessed: number;
  activeUsers: number;
}

export interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  adminOnly?: boolean;
  badge?: string | number;
}

export interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  userRole: 'admin' | 'user';
}

export interface HeaderProps {
  user: User;
  onSidebarToggle: () => void;
  onLogout: () => void;
}

export interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}


export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  newUsersThisMonth: number;
  lastLoginActivity: string | null;
}

export interface QueueStats {
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  processing: {
    rateLimitPerMinute: number;
    estimatedTimeFor100Records: string;
    currentQueueLength: number;
  };
}