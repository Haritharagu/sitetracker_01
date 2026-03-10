export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'worker';
  department?: string;
}

export interface Asset {
  id: number;
  code: string;
  name: string;
  category: string;
  homeSite: string;
  status: 'available' | 'in-use' | 'maintenance';
  currentUser?: string;
  currentUserId?: number;
  currentLocation?: string;
  checkedOutAt?: string;
  purpose?: string;
}

export interface Site {
  id: number;
  name: string;
  address?: string;
  description?: string;
}

export interface CheckoutLog {
  id: number;
  assetId: number;
  assetCode: string;
  userId: number;
  userName: string;
  action: 'checkout' | 'checkin';
  location: string;
  timestamp: string;
  purpose?: string;
}
