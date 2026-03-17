// [FILE: src/components/layout/DashboardLayout.tsx]

import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationBell from './Notificationbell'
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col z-50">
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* ── Main Content Area ── */}
      <div className="lg:pl-64 flex flex-col flex-1 min-h-screen w-full">

        {/* ── Top Bar ── */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur px-4 sm:px-6 shadow-sm">

          {/* Left: hamburger (mobile only) + logo (mobile only) */}
          <div className="flex items-center gap-3">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-foreground -ml-2 hover:bg-muted h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px] border-r-0">
                <Sidebar onClose={() => setIsSidebarOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="lg:hidden flex items-center">
              <img src="/sulitblack-logo.svg" alt="Logo" className="h-7 w-auto dark:hidden" />
              <img src="/sulit-logo.svg"      alt="Logo" className="h-7 w-auto hidden dark:block" />
            </div>
          </div>

          {/* Right: bell only */}
          <NotificationBell />
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;