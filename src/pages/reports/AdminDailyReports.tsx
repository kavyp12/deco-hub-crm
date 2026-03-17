// [FILE: src/pages/reports/AdminDailyReports.tsx]

import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  BarChart3, Users, AlertTriangle, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronUp, Search, TrendingUp,
  Activity, FileWarning, Eye, Filter, X, RefreshCw,
  CalendarDays, User, Hash, Tag, ChevronRight,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  contacted:         '📞 Contacted',
  follow_up:         '🔄 Follow-up',
  meeting_scheduled: '📅 Meeting Scheduled',
  proposal_sent:     '📄 Proposal Sent',
  negotiation:       '🤝 Negotiation',
  closed_won:        '✅ Closed Won',
  closed_lost:       '❌ Closed Lost',
  no_response:       '🔇 No Response',
  on_hold:           '⏸️ On Hold',
};

const STATUS_COLORS: Record<string, string> = {
  contacted:         'bg-blue-100 text-blue-700 border-blue-200',
  follow_up:         'bg-yellow-100 text-yellow-700 border-yellow-200',
  meeting_scheduled: 'bg-purple-100 text-purple-700 border-purple-200',
  proposal_sent:     'bg-indigo-100 text-indigo-700 border-indigo-200',
  negotiation:       'bg-orange-100 text-orange-700 border-orange-200',
  closed_won:        'bg-green-100 text-green-700 border-green-200',
  closed_lost:       'bg-red-100 text-red-700 border-red-200',
  no_response:       'bg-gray-100 text-gray-600 border-gray-200',
  on_hold:           'bg-slate-100 text-slate-600 border-slate-200',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportEntry {
  id: string;
  inquiryId: string;
  workDone: string;
  status: string;
  createdAt: string;
  inquiry: { id: string; inquiry_number: string; client_name: string; stage: string; address?: string };
}

interface Report {
  id: string;
  userId: string;
  reportDate: string;
  status: string;
  submittedAt: string;
  user: { id: string; name: string; role: string };
  entries: ReportEntry[];
}

interface MissingUser { id: string; name: string; role: string; }

interface Analytics {
  totalEmployees: number;
  reportsSubmitted: number;
  reportsMissing: number;
  totalInquiriesWorked: number;
  totalInquiries: number;
  inactiveInquiries: any[];
  inactiveCount: number;
  statusDistribution: Record<string, number>;
  reportDate: string;
}

interface TimelineEntry {
  id: string;
  workDone: string;
  status: string;
  createdAt: string;
  dailyReport: { reportDate: string; user: { id: string; name: string } };
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: number | string; icon: React.ReactNode;
  accent: string; sub?: string; onClick?: () => void;
}> = ({ label, value, icon, accent, sub, onClick }) => (
  <div
    onClick={onClick}
    className={cn(
      'card-premium p-5 flex items-start gap-4 border-l-4 transition-all',
      accent,
      onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
    )}
  >
    <div className="p-2.5 rounded-xl bg-muted/60 flex-shrink-0">{icon}</div>
    <div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ─── Active Filter Pill ──────────────────────────────────────────────────────

const FilterPill: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-medium">
    {label}
    <button onClick={onRemove} className="hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
  </span>
);

// ─── Component ───────────────────────────────────────────────────────────────

const AdminDailyReports: React.FC = () => {
  const { toast } = useToast();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [date, setDate]                 = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterUser, setFilterUser]     = useState('__all__');
  const [filterStatus, setFilterStatus] = useState('__all__');
  const [filterInquiry, setFilterInquiry] = useState('__all__');
  const [searchQuery, setSearchQuery]   = useState('');
  const [showFilters, setShowFilters]   = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [reports, setReports]           = useState<Report[]>([]);
  const [missingUsers, setMissingUsers] = useState<MissingUser[]>([]);
  const [analytics, setAnalytics]       = useState<Analytics | null>(null);
  const [users, setUsers]               = useState<{ id: string; name: string; role: string }[]>([]);
  const [allInquiries, setAllInquiries] = useState<{ id: string; inquiry_number: string; client_name: string }[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());

  // ── UI ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'reports' | 'analytics' | 'inactive'>('reports');

  // ── Timeline ─────────────────────────────────────────────────────────────
  const [timelineOpen, setTimelineOpen]         = useState(false);
  const [timelineData, setTimelineData]         = useState<{ inquiry: any; timeline: TimelineEntry[] } | null>(null);
  const [timelineLoading, setTimelineLoading]   = useState(false);

  // ── Entry detail dialog ───────────────────────────────────────────────────
  const [entryDetailOpen, setEntryDetailOpen]   = useState(false);
  const [selectedEntry, setSelectedEntry]       = useState<ReportEntry | null>(null);
  const [selectedEntryUser, setSelectedEntryUser] = useState<string>('');

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { date };
      if (filterUser   !== '__all__') params.userId    = filterUser;
      if (filterStatus !== '__all__') params.status    = filterStatus;
      if (filterInquiry !== '__all__') params.inquiryId = filterInquiry;

      const [reportsRes, analyticsRes] = await Promise.all([
        api.get('/daily-reports/admin', { params }),
        api.get('/daily-reports/analytics', { params: { date } }),
      ]);
      setReports(reportsRes.data.reports || []);
      setMissingUsers(reportsRes.data.missingUsers || []);
      setAnalytics(analyticsRes.data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load reports', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [date, filterUser, filterStatus, filterInquiry]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get('/users/all').then(r => setUsers(r.data)).catch(() => {});
    api.get('/inquiries').then(r => setAllInquiries(r.data)).catch(() => {});
  }, []);

  // ─── Timeline ─────────────────────────────────────────────────────────────

  const openTimeline = async (inquiryId: string) => {
    setTimelineLoading(true);
    setTimelineOpen(true);
    setTimelineData(null);
    try {
      const { data } = await api.get(`/daily-reports/inquiry/${inquiryId}/timeline`);
      setTimelineData(data);
    } catch {
      toast({ title: 'Error', description: 'Could not load timeline', variant: 'destructive' });
    } finally {
      setTimelineLoading(false);
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll  = () => setExpandedIds(new Set(reports.map(r => r.id)));
  const collapseAll = () => setExpandedIds(new Set());

  // ─── Quick date shortcuts ──────────────────────────────────────────────────

  const setQuickDate = (d: Date) => setDate(format(d, 'yyyy-MM-dd'));

  // ─── Filtered reports ─────────────────────────────────────────────────────

  const filteredReports = reports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.user.name.toLowerCase().includes(q) ||
      r.entries.some(e =>
        e.inquiry.client_name.toLowerCase().includes(q) ||
        e.inquiry.inquiry_number.toLowerCase().includes(q) ||
        e.workDone.toLowerCase().includes(q)
      )
    );
  });

  // Active filters count
  const activeFilterCount = [
    filterUser !== '__all__',
    filterStatus !== '__all__',
    filterInquiry !== '__all__',
  ].filter(Boolean).length;

  // Total entries across all reports
  const totalEntries = filteredReports.reduce((sum, r) => sum + r.entries.length, 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto animate-fade-in">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-accent" /> Daily Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track employee activity across all assigned inquiries
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={fetchAll}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* ── Analytics Cards ── */}
        {analytics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Submitted"
              value={analytics.reportsSubmitted}
              icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
              accent="border-l-green-400"
              sub={`of ${analytics.totalEmployees} employees`}
              onClick={() => setTab('reports')}
            />
            <StatCard
              label="Missing Reports"
              value={analytics.reportsMissing}
              icon={<FileWarning className="h-5 w-5 text-red-500" />}
              accent="border-l-red-400"
              onClick={() => setTab('reports')}
            />
            <StatCard
              label="Inquiries Worked"
              value={analytics.totalInquiriesWorked}
              icon={<Activity className="h-5 w-5 text-blue-500" />}
              accent="border-l-blue-400"
              sub="today"
              onClick={() => setTab('analytics')}
            />
            <StatCard
              label="Inactive Inquiries"
              value={analytics.inactiveCount}
              icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
              accent="border-l-orange-400"
              sub="3+ days no update"
              onClick={() => setTab('inactive')}
            />
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit mb-5">
          {(['reports', 'analytics', 'inactive'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors relative',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'reports' ? '📋 Reports' : t === 'analytics' ? '📊 Analytics' : '🚨 Inactive'}
              {t === 'inactive' && analytics && analytics.inactiveCount > 0 && (
                <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {analytics.inactiveCount > 9 ? '9+' : analytics.inactiveCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════
            TAB: REPORTS
        ════════════════════════════════════════ */}
        {tab === 'reports' && (
          <>
            {/* ── Filter bar ── */}
            <div className="card-premium p-4 mb-4 space-y-3">
              {/* Row 1: date + search + filter toggle */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="h-9 text-sm w-40"
                  />
                </div>

                {/* Quick date buttons */}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQuickDate(new Date())} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium">Today</button>
                  <button onClick={() => setQuickDate(subDays(new Date(), 1))} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium">Yesterday</button>
                  <button onClick={() => setQuickDate(subDays(new Date(), 2))} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium">2 days ago</button>
                </div>

                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employee, client, inquiry, work done..."
                    className="pl-9 h-9 text-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>

                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2 h-9 flex-shrink-0"
                  onClick={() => setShowFilters(p => !p)}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-accent text-accent-foreground text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>

              {/* Row 2: Advanced filters (collapsible) */}
              {showFilters && (
                <div className="pt-2 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Employee filter */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <User className="h-3 w-3" /> Employee
                    </label>
                    <Select value={filterUser} onValueChange={setFilterUser}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Employees</SelectItem>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status filter */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Inquiry Status
                    </label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Statuses</SelectItem>
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Inquiry filter */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Hash className="h-3 w-3" /> Specific Inquiry
                    </label>
                    <Select value={filterInquiry} onValueChange={setFilterInquiry}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="__all__">All Inquiries</SelectItem>
                        {allInquiries.map(inq => (
                          <SelectItem key={inq.id} value={inq.id}>
                            {inq.inquiry_number} — {inq.client_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Active filter pills */}
              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-xs text-muted-foreground">Active filters:</span>
                  {filterUser !== '__all__' && (
                    <FilterPill
                      label={`Employee: ${users.find(u => u.id === filterUser)?.name || filterUser}`}
                      onRemove={() => setFilterUser('__all__')}
                    />
                  )}
                  {filterStatus !== '__all__' && (
                    <FilterPill
                      label={`Status: ${STATUS_LABELS[filterStatus] || filterStatus}`}
                      onRemove={() => setFilterStatus('__all__')}
                    />
                  )}
                  {filterInquiry !== '__all__' && (
                    <FilterPill
                      label={`Inquiry: ${allInquiries.find(i => i.id === filterInquiry)?.inquiry_number || filterInquiry}`}
                      onRemove={() => setFilterInquiry('__all__')}
                    />
                  )}
                  <button
                    onClick={() => { setFilterUser('__all__'); setFilterStatus('__all__'); setFilterInquiry('__all__'); }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Missing reports banner */}
            {missingUsers.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="font-semibold text-red-700 flex items-center gap-2 mb-2 text-sm">
                  <XCircle className="h-4 w-4" />
                  ❗ {missingUsers.length} {missingUsers.length === 1 ? 'employee has' : 'employees have'} not submitted a report
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingUsers.map(u => (
                    <span key={u.id} className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full border border-red-200 font-medium">
                      {u.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Results summary + expand controls */}
            {!loading && filteredReports.length > 0 && (
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{filteredReports.length}</span> report{filteredReports.length !== 1 ? 's' : ''} · {' '}
                  <span className="font-semibold text-foreground">{totalEntries}</span> total entries
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={expandAll}  className="text-xs text-accent hover:underline">Expand all</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button onClick={collapseAll} className="text-xs text-accent hover:underline">Collapse all</button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-20 text-muted-foreground text-sm">Loading reports...</div>
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No reports found</p>
                <p className="text-sm mt-1 opacity-70">Try a different date or clear the filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map(report => {
                  const isExpanded = expandedIds.has(report.id);
                  const submittedTime = format(new Date(report.submittedAt), 'h:mm a');
                  return (
                    <div key={report.id} className="card-premium overflow-hidden">

                      {/* ── Report Header Row ── */}
                      <div
                        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => toggleExpand(report.id)}
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent/60 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                          {report.user.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{report.user.name}</p>
                            <span className="text-xs text-muted-foreground capitalize bg-muted/60 px-2 py-0.5 rounded-full">
                              {report.user.role.replace('_', ' ')}
                            </span>
                          </div>
                          {/* Entry previews */}
                          {!isExpanded && report.entries.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {report.entries.map(e => e.inquiry.inquiry_number).join(' · ')}
                            </p>
                          )}
                        </div>

                        {/* Right meta */}
                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{submittedTime}</span>
                          <span className="text-xs bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full font-medium">
                            {report.entries.length} {report.entries.length === 1 ? 'entry' : 'entries'}
                          </span>
                          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                            ✅ Submitted
                          </span>
                        </div>

                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        }
                      </div>

                      {/* ── Expanded Entries ── */}
                      {isExpanded && (
                        <div className="border-t border-border/50">
                          {/* Table header */}
                          <div className="hidden sm:grid grid-cols-[180px_1fr_160px_100px] gap-4 px-5 py-2.5 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>Inquiry</span>
                            <span>Work Done</span>
                            <span>Status</span>
                            <span className="text-right">Actions</span>
                          </div>

                          <div className="divide-y divide-border/30">
                            {report.entries.map(entry => (
                              <div
                                key={entry.id}
                                className="flex flex-col gap-3 sm:grid sm:grid-cols-[180px_1fr_160px_100px] sm:gap-4 sm:items-start px-5 py-4 hover:bg-muted/10 transition-colors"
                              >
                                {/* Inquiry */}
                                <div className="min-w-0">
                                  <p className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded inline-block mb-1">
                                    {entry.inquiry.inquiry_number}
                                  </p>
                                  <p className="text-sm font-semibold leading-tight truncate">{entry.inquiry.client_name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{entry.inquiry.stage}</p>
                                </div>

                                {/* Work done */}
                                <div>
                                  <p className="text-sm text-foreground/80 bg-muted/30 rounded-lg px-3 py-2.5 whitespace-pre-wrap leading-relaxed line-clamp-4">
                                    {entry.workDone}
                                  </p>
                                </div>

                                {/* Status */}
                                <div className="flex items-start pt-0.5">
                                  <span className={cn(
                                    'text-xs px-2.5 py-1 rounded-full border font-medium',
                                    STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border'
                                  )}>
                                    {STATUS_LABELS[entry.status] || entry.status}
                                  </span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center sm:justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-accent"
                                    onClick={() => {
                                      setSelectedEntry(entry);
                                      setSelectedEntryUser(report.user.name);
                                      setEntryDetailOpen(true);
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" /> Detail
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-accent"
                                    onClick={() => openTimeline(entry.inquiryId)}
                                  >
                                    <Clock className="h-3.5 w-3.5" /> History
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════
            TAB: ANALYTICS
        ════════════════════════════════════════ */}
        {tab === 'analytics' && analytics && (
          <div className="space-y-5">

            {/* Date selector */}
            <div className="flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm w-44" />
              <div className="flex gap-1.5">
                <button onClick={() => setQuickDate(new Date())} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground font-medium">Today</button>
                <button onClick={() => setQuickDate(subDays(new Date(), 1))} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground font-medium">Yesterday</button>
              </div>
            </div>

            {/* Submission rate */}
            <div className="card-premium p-6">
              <h3 className="font-semibold mb-1 text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" /> Report Submission Rate
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {format(new Date(date), 'EEEE, dd MMM yyyy')}
              </p>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 bg-muted/40 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-700"
                    style={{ width: analytics.totalEmployees ? `${(analytics.reportsSubmitted / analytics.totalEmployees) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-lg font-bold text-green-600 w-14 text-right">
                  {analytics.totalEmployees ? Math.round((analytics.reportsSubmitted / analytics.totalEmployees) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-green-600"><span className="w-2 h-2 rounded-full bg-green-500" />{analytics.reportsSubmitted} submitted</span>
                <span className="flex items-center gap-1.5 text-red-500"><span className="w-2 h-2 rounded-full bg-red-400" />{analytics.reportsMissing} missing</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full bg-muted" />{analytics.totalEmployees} total</span>
              </div>
            </div>

            {/* Status distribution */}
            <div className="card-premium p-6">
              <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" /> Inquiry Status Breakdown
              </h3>
              {Object.keys(analytics.statusDistribution).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No entries recorded for this day.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(analytics.statusDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const total = Object.values(analytics.statusDistribution).reduce((a, b) => a + b, 0);
                      const pct = total ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={status} className="flex items-center gap-3">
                          <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium w-48 text-center flex-shrink-0', STATUS_COLORS[status] || 'bg-muted text-muted-foreground border-border')}>
                            {STATUS_LABELS[status] || status}
                          </span>
                          <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-bold w-6 text-right">{count}</span>
                          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Employee detail */}
            <div className="card-premium p-6">
              <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" /> Employee Performance
              </h3>
              <div className="divide-y divide-border/40">
                {reports.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                        {r.user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.user.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{r.user.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold">{r.entries.length}</p>
                        <p className="text-xs text-muted-foreground">entries</p>
                      </div>
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">✅</span>
                      <button
                        onClick={() => { setFilterUser(r.userId); setTab('reports'); setShowFilters(true); }}
                        className="text-xs text-accent hover:underline flex items-center gap-0.5"
                      >
                        View <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {missingUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 text-red-500 text-xs font-bold flex items-center justify-center">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{u.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-medium">❗ Missing</span>
                  </div>
                ))}
                {reports.length === 0 && missingUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">No data for this date.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            TAB: INACTIVE
        ════════════════════════════════════════ */}
        {tab === 'inactive' && analytics && (
          <div>
            {/* Date selector */}
            <div className="flex items-center gap-3 mb-5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm w-44" />
            </div>

            {analytics.inactiveInquiries.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium">All inquiries are active!</p>
                <p className="text-sm mt-1 opacity-70">Every inquiry has been updated within the last 3 days</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  🚨 <strong>{analytics.inactiveCount}</strong> {analytics.inactiveCount === 1 ? 'inquiry has' : 'inquiries have'} had no update for 3+ consecutive days
                </p>
                <div className="space-y-3">
                  {analytics.inactiveInquiries.map((inq: any) => {
                    const lastEntry = inq.reportEntries?.[0];
                    const daysSince = lastEntry
                      ? Math.floor((Date.now() - new Date(lastEntry.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                      : null;
                    const severity = daysSince === null ? 'extreme' : daysSince >= 7 ? 'high' : daysSince >= 5 ? 'medium' : 'low';
                    return (
                      <div key={inq.id} className={cn(
                        'card-premium p-5 border-l-4',
                        severity === 'extreme' ? 'border-l-gray-400' :
                        severity === 'high'    ? 'border-l-red-500' :
                        severity === 'medium'  ? 'border-l-orange-400' : 'border-l-yellow-400'
                      )}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{inq.inquiry_number}</span>
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{inq.stage}</span>
                              {severity === 'high' && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">🔴 Critical</span>}
                              {severity === 'medium' && <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">🟠 Warning</span>}
                            </div>
                            <p className="font-semibold">{inq.client_name}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Assigned: <span className="font-medium text-foreground">{inq.sales_person?.name || 'N/A'}</span>
                            </p>
                            {lastEntry?.status && (
                              <div className="mt-2">
                                <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', STATUS_COLORS[lastEntry.status] || 'bg-muted text-muted-foreground border-border')}>
                                  Last: {STATUS_LABELS[lastEntry.status] || lastEntry.status}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 flex-shrink-0">
                            <div className="text-right">
                              <p className={cn('text-base font-bold', daysSince === null ? 'text-muted-foreground' : daysSince >= 7 ? 'text-red-600' : daysSince >= 5 ? 'text-orange-500' : 'text-yellow-600')}>
                                {daysSince !== null ? `${daysSince} day${daysSince !== 1 ? 's' : ''} ago` : 'Never updated'}
                              </p>
                              {lastEntry && (
                                <p className="text-xs text-muted-foreground">{format(new Date(lastEntry.createdAt), 'dd MMM yyyy')}</p>
                              )}
                            </div>
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 mt-1" onClick={() => openTimeline(inq.id)}>
                              <Clock className="h-3 w-3" /> Full History
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Entry Detail Dialog ── */}
      <Dialog open={entryDetailOpen} onOpenChange={setEntryDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-accent" />
              {selectedEntry?.inquiry.inquiry_number} — {selectedEntry?.inquiry.client_name}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2.5">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Reported by:</span>
                <span className="font-semibold">{selectedEntryUser}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
                <span className={cn('text-sm px-3 py-1.5 rounded-full border font-medium inline-block', STATUS_COLORS[selectedEntry.status] || 'bg-muted border-border')}>
                  {STATUS_LABELS[selectedEntry.status] || selectedEntry.status}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Work Done</p>
                <p className="text-sm bg-muted/40 rounded-xl p-4 whitespace-pre-wrap leading-relaxed min-h-[80px]">
                  {selectedEntry.workDone}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inquiry Details</p>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p>Stage: <span className="text-foreground font-medium">{selectedEntry.inquiry.stage}</span></p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => { setEntryDetailOpen(false); openTimeline(selectedEntry.inquiryId); }}>
                <Clock className="h-4 w-4" /> View Full Timeline for this Inquiry
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Timeline Dialog ── */}
      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              {timelineData?.inquiry
                ? `${timelineData.inquiry.inquiry_number} — ${timelineData.inquiry.client_name}`
                : 'Activity Timeline'}
            </DialogTitle>
            {timelineData?.inquiry && (
              <p className="text-xs text-muted-foreground">Assigned to: {timelineData.inquiry.sales_person?.name}</p>
            )}
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-1 mt-2">
            {timelineLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
            ) : !timelineData || timelineData.timeline.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No history recorded yet.</div>
            ) : (
              <div className="relative pb-2">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-5">
                  {timelineData.timeline.map((entry, i) => (
                    <div key={entry.id} className="flex gap-4 pl-10 relative">
                      <div className={cn(
                        'absolute left-[13px] w-3 h-3 rounded-full border-2 border-background mt-1',
                        i === 0 ? 'bg-accent' : 'bg-muted-foreground/40'
                      )} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{entry.dailyReport.user.name}</span>
                            {i === 0 && <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">Latest</span>}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(entry.createdAt), 'dd MMM yyyy, h:mm a')}
                          </span>
                        </div>
                        <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium inline-block mb-2', STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border')}>
                          {STATUS_LABELS[entry.status] || entry.status}
                        </span>
                        <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2.5 whitespace-pre-wrap leading-relaxed">
                          {entry.workDone}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDailyReports;