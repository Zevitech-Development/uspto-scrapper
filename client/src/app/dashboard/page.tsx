'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import AdminOverView from '@/components/dashboard/admin-overview';
import UserOverView from '@/components/dashboard/user-dashboard/user-overview';


export default function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout title={user.role === 'admin' ? 'Admin Dashboard' : 'My Dashboard'}>
      {user.role === 'admin' ? <AdminOverView /> : <UserOverView />}
    </DashboardLayout>
  );
}