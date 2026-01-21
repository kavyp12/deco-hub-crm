import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  LogOut,
  ShoppingCart,
  BookOpen,
  Ruler,
  Calculator
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inquiries', href: '/inquiries', icon: FileText },
    { name: 'Selections', href: '/selections', icon: ShoppingCart },
    { name: 'Measurements', href: '/measurements', icon: Ruler },
    { name: 'Calculations', href: '/calculations', icon: Calculator },
    // UPDATED: Point to the list view, not preview directly
    { name: 'Quotations', href: '/quotations', icon: FileText }, 
  ];

  if (role === 'super_admin' || role === 'admin_hr') {
    navigation.push({
      name: 'Employees',
      href: '/employees',
      icon: Users,
    });
  }

  navigation.push({
    name: 'Catalogs',
    href: '/catalogs',
    icon: BookOpen,
  });

  const getRoleLabel = (role: string | null | undefined) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'sales': return 'Sales';
      case 'accounting': return 'Accounting';
      case 'admin_hr': return 'Admin / HR';
      default: return 'User';
    }
  };

  return (
    <aside className="h-full w-full bg-sidebar border-r border-sidebar-border shadow-sm flex flex-col">
      {/* Logo Section */}
      <div className="flex h-20 items-center justify-center border-b border-sidebar-border bg-sidebar-accent/10 flex-shrink-0 px-6">
        <div className="flex items-center justify-center w-full">
          <img 
            src="/sulit-logo.svg" 
            alt="Sulit Logo" 
            className="h-12 w-auto object-contain"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = item.href === '/dashboard' 
            ? location.pathname === '/dashboard'
            : location.pathname.startsWith(item.href);

          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={({ isActive: routerActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-accent text-accent shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )
              }
            >
              <item.icon
                className={cn(
                  'h-5 w-5 transition-colors',
                  isActive
                    ? 'text-accent'
                    : 'text-sidebar-foreground/70 group-hover:text-sidebar-foreground'
                )}
              />
              <span>{item.name}</span>

              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-accent" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-sidebar-border p-4 bg-sidebar-accent/5 flex-shrink-0">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3 border border-sidebar-border/50 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/80 text-sm font-bold text-white shadow-sm">
            {profile?.name?.charAt(0).toUpperCase() || 'U'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-bold text-sidebar-foreground">
              {profile?.name || 'User'}
            </p>
            <p className="text-xs text-sidebar-foreground/60 font-medium">
              {getRoleLabel(role)}
            </p>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-100"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;