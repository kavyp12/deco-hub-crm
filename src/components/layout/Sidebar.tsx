import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Plus,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const Sidebar: React.FC = () => {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inquiries', href: '/inquiries', icon: FileText },
    { name: 'New Inquiry', href: '/inquiries/new', icon: Plus },
  ];

  // Only show employee management to super_admin and admin_hr
  if (role === 'super_admin' || role === 'admin_hr') {
    navigation.push({ name: 'Employees', href: '/employees', icon: Users });
  }

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'sales':
        return 'Sales';
      case 'accounting':
        return 'Accounting';
      case 'admin_hr':
        return 'Admin / HR';
      default:
        return 'User';
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <span className="text-sm font-bold text-accent-foreground">SN</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">Sulit Name</span>
              <span className="text-xs text-sidebar-foreground/60">Deco Hub</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && 'active'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.name || 'User'}
              </p>
              <p className="text-xs text-sidebar-foreground/60">
                {getRoleLabel(role)}
              </p>
            </div>
          </div>
          
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
