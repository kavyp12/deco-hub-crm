// [FILE: src/components/layout/NotificationBell.tsx]

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, Info, Clock, RefreshCw, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  severity: 'error' | 'warning' | 'info';
  createdAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  error: {
    dot: 'bg-red-500',
    icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
    badge: 'bg-red-50 border-red-100',
    label: 'bg-red-500',
    ring: 'ring-red-200',
  },
  warning: {
    dot: 'bg-yellow-500',
    icon: <Clock className="h-4 w-4 text-yellow-500" />,
    badge: 'bg-yellow-50 border-yellow-100',
    label: 'bg-yellow-500',
    ring: 'ring-yellow-200',
  },
  info: {
    dot: 'bg-blue-500',
    icon: <Info className="h-4 w-4 text-blue-500" />,
    badge: 'bg-blue-50 border-blue-100',
    label: 'bg-blue-500',
    ring: 'ring-blue-200',
  },
};

const TYPE_EMOJI: Record<string, string> = {
  missing_report:    '📋',
  inactive_inquiry:  '🚨',
  leave_request:     '🏖️',
  birthday:          '🎂',
  anniversary:       '💍',
  pending_selection: '🛒',
  draft_quotation:   '📄',
};

// ─── Component ───────────────────────────────────────────────────────────────

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [dismissed, setDismissed]         = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched]     = useState<Date | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef  = useRef<HTMLButtonElement>(null);

  // ─── Fetch ─────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
      setLastFetched(new Date());
    } catch {
      // silently fail — don't show errors for background polling
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling every 3 minutes
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(true), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Computed ──────────────────────────────────────────────────────────

  const visible = notifications.filter(n => !dismissed.has(n.id));
  const errorCount   = visible.filter(n => n.severity === 'error').length;
  const warningCount = visible.filter(n => n.severity === 'warning').length;

  // Bell badge: red if any errors, yellow if only warnings, blue otherwise
  const badgeColor = errorCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-yellow-500' : 'bg-blue-500';

  const dismissOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(prev => new Set([...prev, id]));
  };

  const dismissAll = () => setDismissed(new Set(notifications.map(n => n.id)));

  const handleNotificationClick = (n: Notification) => {
    setOpen(false);
    navigate(n.link);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* ── Bell Button ── */}
      <button
        ref={bellRef}
        onClick={() => setOpen(p => !p)}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200',
          open
            ? 'bg-accent/15 text-accent'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
        title="Notifications"
      >
        <Bell className={cn('h-5 w-5', visible.length > 0 && 'animate-[wiggle_0.4s_ease-in-out]')} />

        {/* Badge */}
        {visible.length > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold leading-none transition-all',
            visible.length > 9 ? 'w-5 h-5 text-[9px]' : 'w-4 h-4 text-[10px]',
            badgeColor
          )}>
            {visible.length > 9 ? '9+' : visible.length}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ── */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-11 w-[340px] sm:w-[380px] rounded-2xl border border-border bg-background shadow-2xl shadow-black/10 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent" />
              <span className="font-semibold text-sm">Notifications</span>
              {visible.length > 0 && (
                <span className={cn('text-xs font-bold text-white px-1.5 py-0.5 rounded-full', badgeColor)}>
                  {visible.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Refresh */}
              <button
                onClick={() => fetchNotifications()}
                disabled={loading}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
              {/* Dismiss all */}
              {visible.length > 0 && (
                <button
                  onClick={dismissAll}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Dismiss all"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Close */}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 opacity-30" />
                </div>
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs mt-0.5 opacity-70">No pending notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {visible.map((n) => {
                  const cfg = SEVERITY_CONFIG[n.severity];
                  const emoji = TYPE_EMOJI[n.type] || '🔔';
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        'group relative flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors',
                        'hover:bg-muted/40',
                        cfg.badge
                      )}
                    >
                      {/* Severity dot */}
                      <div className={cn('flex-shrink-0 w-2 h-2 rounded-full mt-1.5', cfg.dot)} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground leading-tight">
                            {emoji} {n.title}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                          <span className={cn('inline-block w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {n.severity === 'error' ? 'Urgent' : n.severity === 'warning' ? 'Action needed' : 'Info'}
                          <span className="mx-1">·</span>
                          Tap to go →
                        </p>
                      </div>

                      {/* Dismiss button */}
                      <button
                        onClick={(e) => dismissOne(n.id, e)}
                        className="flex-shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {lastFetched && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/10 text-center">
              <p className="text-[10px] text-muted-foreground/60">
                Updated {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}Auto-refreshes every 3 min
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;