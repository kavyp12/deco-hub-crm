// [FILE: src/pages/reports/EmployeeActivityReport.tsx]

import React, { useEffect, useState } from 'react';
import {
  Users, Activity, ChevronDown, ChevronRight, RefreshCw,
  PlusCircle, RefreshCcw, Trash2, LogIn, Calendar, Search,
  FileText, ShieldAlert, UserCheck, ClipboardList, Package,
  Building2, ArrowRightLeft, Filter, Printer, FileOutput
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import api from '@/lib/api';

interface EmployeeSummary {
  userId: string;
  userName: string;
  userRole: string;
  totalActions: number;
  creates: number;
  updates: number;
  deletes: number;
  logins: number;
  lastActive: string | null;
  activeDays: number;
}

interface LogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string;
  createdAt: string;
}

interface DayTimeline {
  date: string;
  totalActions: number;
  creates: number;
  updates: number;
  deletes: number;
  logins: number;
  entries: LogEntry[];
}

interface EmployeeDetail {
  user: { id: string; name: string; role: string; email: string };
  timeline: DayTimeline[];
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-green-50 text-green-700 border-green-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  LOGIN:  'bg-purple-50 text-purple-700 border-purple-200',
};

const ACTION_ICON = (action: string) => {
  switch (action) {
    case 'CREATE': return <PlusCircle className="h-3 w-3" />;
    case 'UPDATE': return <RefreshCcw className="h-3 w-3" />;
    case 'DELETE': return <Trash2 className="h-3 w-3" />;
    case 'LOGIN':  return <LogIn className="h-3 w-3" />;
    default:       return <Activity className="h-3 w-3" />;
  }
};

// Map entity to an icon + label + color for the "what happened" context chip
const ENTITY_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  INQUIRY:         { icon: <FileText className="h-3 w-3" />,       color: 'bg-indigo-50 text-indigo-700',  label: 'Inquiry' },
  INQUIRY_STAGE:   { icon: <ArrowRightLeft className="h-3 w-3" />, color: 'bg-indigo-50 text-indigo-600',  label: 'Stage Change' },
  INQUIRY_MEMBERS: { icon: <Users className="h-3 w-3" />,          color: 'bg-sky-50 text-sky-700',        label: 'Members' },
  INQUIRY_OWNER:   { icon: <UserCheck className="h-3 w-3" />,      color: 'bg-sky-50 text-sky-700',        label: 'Ownership' },
  QUOTATION:       { icon: <FileText className="h-3 w-3" />,       color: 'bg-amber-50 text-amber-700',    label: 'Quotation' },
  QUOTATION_STAGE: { icon: <ArrowRightLeft className="h-3 w-3" />, color: 'bg-amber-50 text-amber-600',    label: 'Quote Stage' },
  SELECTION:       { icon: <ClipboardList className="h-3 w-3" />,  color: 'bg-teal-50 text-teal-700',      label: 'Selection' },
  PRODUCT:         { icon: <Package className="h-3 w-3" />,        color: 'bg-orange-50 text-orange-700',  label: 'Product' },
  COMPANY:         { icon: <Building2 className="h-3 w-3" />,      color: 'bg-slate-50 text-slate-600',    label: 'Company' },
  EMPLOYEE:        { icon: <Users className="h-3 w-3" />,          color: 'bg-pink-50 text-pink-700',      label: 'Employee' },
  DAILY_REPORT:    { icon: <ClipboardList className="h-3 w-3" />,  color: 'bg-emerald-50 text-emerald-700',label: 'Daily Report' },
  LEAVE:           { icon: <Calendar className="h-3 w-3" />,       color: 'bg-yellow-50 text-yellow-700',  label: 'Leave' },
  AUTH:            { icon: <ShieldAlert className="h-3 w-3" />,    color: 'bg-purple-50 text-purple-700',  label: 'Auth' },
  CALCULATION:     { icon: <Activity className="h-3 w-3" />,       color: 'bg-cyan-50 text-cyan-700',      label: 'Calculation' },
  ARCHITECT:       { icon: <UserCheck className="h-3 w-3" />,      color: 'bg-rose-50 text-rose-700',      label: 'Architect' },
};

// Build a plain-English summary sentence from entity + action + details
const buildSummary = (entry: LogEntry): { headline: string; subtext: string | null } => {
  const d = entry.details;
  const entity = entry.entity;
  const action = entry.action;

  // For LOGIN just show login message cleanly
  if (entity === 'AUTH') return { headline: d, subtext: null };

  // For daily reports — split the inquiry list onto subtext
  if (entity === 'DAILY_REPORT') {
    const match = d.match(/^(.+?—.+?):(.+)$/);
    if (match) return { headline: match[1].trim(), subtext: match[2].trim() };
    return { headline: d, subtext: null };
  }

  return { headline: d, subtext: null };
};

const getRoleColor = (role: string) => {
  switch (role) {
    case 'super_admin': return 'bg-red-100 text-red-700';
    case 'sales':       return 'bg-blue-100 text-blue-700';
    case 'accounting':  return 'bg-green-100 text-green-700';
    default:            return 'bg-gray-100 text-gray-700';
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

const EmployeeActivityReport = () => {
  const [summary, setSummary] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('ALL');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [filterAction, setFilterAction] = useState<string>('ALL');

  // ── Printable Report Modal ───────────────────────────────────────────────
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState<{ summary: EmployeeSummary; detail: EmployeeDetail } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get('/logs/employees-summary', { params: { startDate, endDate } });
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to fetch employee summary', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeDetail = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setDetail(null);
      return;
    }
    setExpandedUser(userId);
    setDetail(null);
    setExpandedDays(new Set());
    setDetailLoading(true);
    try {
      const res = await api.get(`/logs/employee/${userId}`, { params: { startDate, endDate } });
      setDetail(res.data);
      // Auto-expand the first (most recent) day
      if (res.data.timeline?.length > 0) {
        setExpandedDays(new Set([res.data.timeline[0].date]));
      }
    } catch (err) {
      console.error('Failed to fetch employee detail', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGenerateReport = async (emp: EmployeeSummary) => {
    setIsGenerating(true);
    try {
      const res = await api.get(`/logs/employee/${emp.userId}`, { params: { startDate, endDate } });
      setReportData({ summary: emp, detail: res.data });
      setReportModalOpen(true);
    } catch (err) {
      console.error('Failed to generate report', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  useEffect(() => { fetchSummary(); }, []);

  // Filter logic — search by name/role AND dropdown filter
  const filtered = summary.filter(e => {
    const matchesSearch =
      e.userName.toLowerCase().includes(search.toLowerCase()) ||
      e.userRole.toLowerCase().includes(search.toLowerCase());
    const matchesDropdown = selectedEmployee === 'ALL' || e.userId === selectedEmployee;
    return matchesSearch && matchesDropdown;
  });

  // Filter day entries by action
  const filterEntries = (entries: LogEntry[]) => {
    if (filterAction === 'ALL') return entries;
    return entries.filter(e => e.action === filterAction);
  };

  return (
    <div className="flex flex-col gap-4">

      {/* ── Controls bar ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        
        {/* Search */}
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search name / role..."
            className="pl-9 border-slate-200 h-9 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Employee dropdown filter */}
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-48 h-9 text-sm border-slate-200">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <SelectValue placeholder="All Employees" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {summary.map(e => (
              <SelectItem key={e.userId} value={e.userId}>{e.userName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action type filter */}
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-40 h-9 text-sm border-slate-200">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Actions</SelectItem>
            <SelectItem value="CREATE">Creates only</SelectItem>
            <SelectItem value="UPDATE">Updates only</SelectItem>
            <SelectItem value="DELETE">Deletes only</SelectItem>
            <SelectItem value="LOGIN">Logins only</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex items-center gap-2 ml-auto">
          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-700 h-9"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-700 h-9"
          />
          <Button onClick={fetchSummary} variant="outline" size="sm" className="gap-1.5 h-9">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Apply
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="text-sm text-slate-500">Employees</div>
            <div className="text-2xl font-bold text-slate-800">{summary.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100 bg-green-50/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="text-sm text-green-600">Total Creates</div>
            <div className="text-2xl font-bold text-green-700">{summary.reduce((s, e) => s + e.creates, 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-blue-100 bg-blue-50/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="text-sm text-blue-600">Total Updates</div>
            <div className="text-2xl font-bold text-blue-700">{summary.reduce((s, e) => s + e.updates, 0)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="text-sm text-slate-500">Most Active</div>
            <div className="text-sm font-bold text-slate-800 truncate">{summary[0]?.userName || '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Employee List ── */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading employee activity...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No employees found.</div>
        ) : (
          filtered.map(emp => (
            <div key={emp.userId} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

              {/* ── Employee header row ── */}
              <button
                onClick={() => fetchEmployeeDetail(emp.userId)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {emp.userName.slice(0, 2).toUpperCase()}
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">{emp.userName}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block ${getRoleColor(emp.userRole)}`}>
                    {emp.userRole.replace('_', ' ')}
                  </span>
                </div>

                {/* Stats strip */}
                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-center">
                    <div className="font-bold text-slate-800 text-sm">{emp.totalActions}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Total</div>
                  </div>
                  <div className="w-px h-8 bg-slate-100" />
                  <div className="text-center">
                    <div className="font-bold text-green-600 text-sm">{emp.creates}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Creates</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-blue-600 text-sm">{emp.updates}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Updates</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-red-500 text-sm">{emp.deletes}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Deletes</div>
                  </div>
                  <div className="w-px h-8 bg-slate-100" />
                  <div className="text-center">
                    <div className="font-bold text-slate-600 text-sm">{emp.activeDays}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Active Days</div>
                  </div>
                  <div className="text-center hidden xl:block">
                    <div className="text-xs text-slate-500 font-medium">
                      {emp.lastActive ? format(new Date(emp.lastActive), 'dd MMM, HH:mm') : '—'}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Last Active</div>
                  </div>
                </div>

                {/* Report Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-4 h-8 gap-1.5 z-10 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGenerateReport(emp);
                  }}
                >
                  {isGenerating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileOutput className="h-3.5 w-3.5" />
                  )}
                  Report
                </Button>

                {/* Chevron */}
                <div className="ml-3 text-slate-300">
                  {expandedUser === emp.userId
                    ? <ChevronDown className="h-5 w-5" />
                    : <ChevronRight className="h-5 w-5" />
                  }
                </div>
              </button>

              {/* ── Expanded: day-by-day timeline ── */}
              {expandedUser === emp.userId && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 flex flex-col gap-2.5">
                  {detailLoading ? (
                    <div className="text-center py-10 text-slate-400 text-sm">Loading activity timeline...</div>
                  ) : !detail || detail.timeline.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">No activity in this date range.</div>
                  ) : (
                    detail.timeline.map(day => {
                      const visibleEntries = filterEntries(day.entries);
                      if (visibleEntries.length === 0) return null;
                      const isOpen = expandedDays.has(day.date);

                      return (
                        <div key={day.date} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">

                          {/* Day header */}
                          <button
                            onClick={() => toggleDay(day.date)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
                          >
                            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-700 text-sm flex-1">
                              {format(new Date(day.date), 'EEEE, dd MMMM yyyy')}
                            </span>

                            {/* Day stat pills */}
                            <div className="flex items-center gap-2 text-xs shrink-0">
                              <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-semibold">
                                {visibleEntries.length} actions
                              </span>
                              {day.creates > 0 && (
                                <span className="bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                                  +{day.creates} created
                                </span>
                              )}
                              {day.updates > 0 && (
                                <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                                  {day.updates} updated
                                </span>
                              )}
                              {day.deletes > 0 && (
                                <span className="bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                                  {day.deletes} deleted
                                </span>
                              )}
                            </div>

                            {isOpen
                              ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
                              : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
                            }
                          </button>

                          {/* ── Log entries ── */}
                          {isOpen && (
                            <div className="border-t border-slate-100 divide-y divide-slate-50">
                              {visibleEntries.map((entry, idx) => {
                                const entityMeta = ENTITY_META[entry.entity] || {
                                  icon: <Activity className="h-3 w-3" />,
                                  color: 'bg-slate-50 text-slate-600',
                                  label: entry.entity
                                };
                                const { headline, subtext } = buildSummary(entry);

                                return (
                                  <div
                                    key={entry.id}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors"
                                  >
                                    {/* Timeline dot + time */}
                                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                                      <div className="text-[10px] font-mono text-slate-400 w-14 text-center">
                                        {format(new Date(entry.createdAt), 'HH:mm')}
                                      </div>
                                    </div>

                                    {/* Action badge */}
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${ACTION_STYLES[entry.action] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                      {ACTION_ICON(entry.action)}
                                      {entry.action}
                                    </span>

                                    {/* Entity chip */}
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${entityMeta.color}`}>
                                      {entityMeta.icon}
                                      {entityMeta.label}
                                    </span>

                                    {/* Description — the actual detail */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-slate-700 font-medium leading-snug">
                                        {headline}
                                      </p>
                                      {subtext && (
                                        <p className="text-xs text-slate-400 mt-0.5 truncate" title={subtext}>
                                          {subtext}
                                        </p>
                                      )}
                                      {entry.entityId && (
                                        <span className="text-[10px] font-mono text-slate-300 mt-0.5 block">
                                          ref: {entry.entityId.slice(0, 8)}…
                                        </span>
                                      )}
                                    </div>

                                    {/* Full timestamp on hover */}
                                    <div className="text-[10px] text-slate-300 shrink-0 hidden lg:block pt-1">
                                      {format(new Date(entry.createdAt), 'HH:mm:ss')}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {/* ── Printable Report Dialog ── */}
      <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          {reportData && (
            <div className="space-y-6">

              {/* Header */}
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">Employee Activity Report</h1>
                  <p className="text-slate-500 mt-1">
                    Period: {format(new Date(startDate), 'dd MMM yyyy')} to {format(new Date(endDate), 'dd MMM yyyy')}
                  </p>
                </div>
                <Button
                  className="gap-2"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" /> Print / Save as PDF
                </Button>
              </div>

              {/* Employee Info */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{reportData.summary.userName}</h2>
                  <p className="text-sm text-slate-500 capitalize">{reportData.summary.userRole.replace('_', ' ')}</p>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{reportData.summary.totalActions}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Actions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{reportData.summary.creates}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Creates</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{reportData.summary.updates}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Updates</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{reportData.summary.deletes}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Deletes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-600">{reportData.summary.activeDays}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Active Days</p>
                  </div>
                </div>
              </div>

              {/* Month-wise Grouped Activity */}
              <div className="space-y-6">
                {(() => {
                  const groupedByMonth: Record<string, DayTimeline[]> = {};
                  reportData.detail.timeline.forEach(day => {
                    const monthName = format(new Date(day.date), 'MMMM yyyy');
                    if (!groupedByMonth[monthName]) groupedByMonth[monthName] = [];
                    groupedByMonth[monthName].push(day);
                  });

                  if (Object.keys(groupedByMonth).length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400 text-sm">
                        No activity found for this period.
                      </div>
                    );
                  }

                  return Object.entries(groupedByMonth).map(([month, days]) => (
                    <div key={month}>
                      <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2 mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {month}
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          — {days.reduce((s, d) => s + d.entries.length, 0)} actions
                        </span>
                      </h3>
                      <div className="space-y-4">
                        {days.map(day => (
                          <div key={day.date} className="pl-4 border-l-2 border-slate-100">
                            <p className="font-semibold text-sm text-slate-700 mb-2">
                              {format(new Date(day.date), 'EEEE, dd MMM yyyy')}
                              <span className="text-slate-400 font-normal ml-2 text-xs">
                                ({day.entries.length} actions)
                              </span>
                              {day.creates > 0 && (
                                <span className="ml-2 text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">
                                  +{day.creates}
                                </span>
                              )}
                              {day.updates > 0 && (
                                <span className="ml-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full">
                                  ~{day.updates}
                                </span>
                              )}
                              {day.deletes > 0 && (
                                <span className="ml-1 text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-full">
                                  -{day.deletes}
                                </span>
                              )}
                            </p>
                            <div className="space-y-1.5">
                              {day.entries.map((entry) => {
                                const entityMeta = ENTITY_META[entry.entity] || {
                                  icon: <Activity className="h-3 w-3" />,
                                  color: 'bg-slate-50 text-slate-600',
                                  label: entry.entity,
                                };
                                const { headline } = buildSummary(entry);
                                return (
                                  <div key={entry.id} className="flex gap-3 text-sm items-start">
                                    <span className="text-slate-400 font-mono text-[10px] w-12 shrink-0 pt-0.5">
                                      {format(new Date(entry.createdAt), 'HH:mm')}
                                    </span>
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ACTION_STYLES[entry.action] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                      {ACTION_ICON(entry.action)}
                                      {entry.action}
                                    </span>
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${entityMeta.color}`}>
                                      {entityMeta.icon}
                                      {entityMeta.label}
                                    </span>
                                    <span className="text-slate-700 flex-1 text-xs">{headline}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default EmployeeActivityReport;