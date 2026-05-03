// [FILE: src/pages/reports/AdminDailyReports.tsx]

import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import {
  BarChart3, XCircle, ChevronDown, ChevronUp,
  Search, RefreshCw, CalendarDays, User, Filter, X,
  Download, FileOutput, ListTodo, IndianRupee,
  CheckCircle2
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportCalendar from './ReportCalendar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OtherWorkEntry {
  id: string;
  startHour: string;
  endHour: string;
  description: string;
}

interface Report {
  id: string;
  userId: string;
  reportDate: string;
  submittedAt: string;
  user: { id: string; name: string; role: string };
  otherWorkEntries: OtherWorkEntry[];
}

interface MissingUser { id: string; name: string; role: string; }

// ─── Filter Pill ──────────────────────────────────────────────────────────────

const FilterPill: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-medium">
    {label}
    <button onClick={onRemove} className="hover:text-red-500 transition-colors">
      <X className="h-3 w-3" />
    </button>
  </span>
);


// --- HELPER FUNCTION (Add to both DailyReportPage.tsx and AdminDailyReports.tsx) ---
const getFileUrl = (path: string | undefined) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const baseUrl = api.defaults.baseURL || '';
  const rootUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
  return `${rootUrl}${path}`;
};


// ─── Component ────────────────────────────────────────────────────────────────

const AdminDailyReports: React.FC = () => {
  const { toast } = useToast();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [date, setDate] = useState('');
  const [filterUser, setFilterUser] = useState('__all__');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<Report[]>([]);
  const [missingUsers, setMissingUsers] = useState<MissingUser[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'reports' | 'calendar' | 'todo' | 'payments'>('reports');

  // Add state for payments
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ── PDF export ────────────────────────────────────────────────────────────
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  // ─── Fetch ────────────────────────────────────────────────────────────────


  const [todoItems, setTodoItems] = useState<any[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);

  // Add these near your other useState declarations
const [paymentSearch, setPaymentSearch] = useState('');
const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'collected'>('all');

const [todoFilter, setTodoFilter] = useState<'all' | 'overdue'>('all');

  const fetchTodoItems = async () => {
    setTodoLoading(true);
    try {
      const { data } = await api.get('/pipeline/todo-items');
      setTodoItems(data);
      // Mark mentions as read when checking the list
      await api.put('/notifications/mentions/read-all');
    } catch {
      toast({ title: 'Error fetching pipeline tasks', variant: 'destructive' });
    } finally {
      setTodoLoading(false);
    }
  };

  const fetchPendingPayments = async () => {
    setPaymentsLoading(true);
    try {
      const { data } = await api.get('/payments/pending');
      setPendingPayments(data);
    } catch {
      toast({ title: 'Error', description: 'Could not load payments', variant: 'destructive' });
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleCompleteTodo = async (id: string, type: string) => {
    try {
      await api.put(`/pipeline/todo-items/${type}/${id}/complete`);
      toast({ title: 'Task Completed', description: 'Task has been marked as complete.' });
      fetchTodoItems(); // refresh
    } catch {
      toast({ title: 'Error', description: 'Failed to complete task', variant: 'destructive' });
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (date) params.date = date;
      if (filterUser !== '__all__') params.userId = filterUser;
      const res = await api.get('/daily-reports/admin', { params });
      setReports(res.data.reports || []);
      setMissingUsers(res.data.missingUsers || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load reports', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [date, filterUser]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    api.get('/users/all').then(r => setUsers(r.data)).catch(() => { });
  }, []);

  // ─── Filtering ────────────────────────────────────────────────────────────

  const filteredReports = reports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.user.name.toLowerCase().includes(q) ||
      r.otherWorkEntries?.some(e => e.description.toLowerCase().includes(q))
    );
  });

  const activeFilterCount = [filterUser !== '__all__'].filter(Boolean).length;

  // ─── Expand helpers ───────────────────────────────────────────────────────

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => setExpandedIds(new Set(filteredReports.map(r => r.id)));
  const collapseAll = () => setExpandedIds(new Set());

  // ─── PDF ─────────────────────────────────────────────────────────────────

  const buildPDF = (data: Report[], title: string, subtitle: string) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    doc.setFillColor(24, 24, 27);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('DECO HUB · Daily Work Logs', margin, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, margin, 19);
    doc.text(subtitle, pageW - margin, 19, { align: 'right' });

    doc.setFillColor(245, 245, 250);
    doc.rect(0, 28, pageW, 16, 'F');
    doc.setTextColor(24, 24, 27);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, 39);

    let startY = 48;

    if (data.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text('No data available.', margin, startY + 10);
      doc.save(`WorkLog_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
      return;
    }

    data.forEach((report, rIdx) => {
      if (rIdx > 0) startY += 6;
      doc.setFillColor(63, 63, 70);
      doc.roundedRect(margin, startY, pageW - margin * 2, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${report.user.name.toUpperCase()}  (${report.user.role.replace('_', ' ')})`, margin + 4, startY + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        `Report Date: ${format(new Date(report.reportDate), 'dd MMM yyyy')}`,
        pageW - margin - 4, startY + 7, { align: 'right' }
      );
      startY += 13;

      const rows = (report.otherWorkEntries || []).map(e => [
        `${e.startHour} – ${e.endHour}`,
        doc.splitTextToSize(e.description, 120).join('\n'),
      ]);

      if (rows.length > 0) {
        autoTable(doc, {
          startY,
          margin: { left: margin, right: margin },
          head: [['Time Block', 'Activity / Description']],
          body: rows,
          styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
          alternateRowStyles: { fillColor: [248, 248, 252] },
          columnStyles: {
            0: { cellWidth: 32, fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
          },
        });
        startY = (doc as any).lastAutoTable.finalY + 4;
      } else {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('No work entries recorded.', margin + 4, startY + 4);
        startY += 10;
      }

      if (startY > pageH - 20 && rIdx < data.length - 1) {
        doc.addPage();
        startY = 14;
      }
    });

    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 180);
      doc.text(`Page ${i} of ${pageCount}  ·  Deco Hub CRM`, pageW / 2, pageH - 6, { align: 'center' });
    }
    return doc;
  };

  const downloadByDate = () => {
    if (!date) { toast({ title: 'Select a date first', variant: 'destructive' }); return; }
    buildPDF(
      filteredReports,
      `Work Logs for ${format(new Date(date), 'dd MMMM yyyy')}`,
      `Date: ${format(new Date(date), 'dd MMM yyyy')}`
    )?.save(`WorkLogs_${format(new Date(date), 'dd_MMM_yyyy')}.pdf`);
  };

  const downloadCurrentView = () => {
    buildPDF(filteredReports, `Work Logs — Current View (${filteredReports.length} reports)`, 'Filtered View')
      ?.save(`WorkLogs_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
  };

  const downloadSelected = () => {
    if (selectedEmpIds.size === 0) { toast({ title: 'Select at least one employee', variant: 'destructive' }); return; }
    const subset = filteredReports.filter(r => selectedEmpIds.has(r.userId));
    buildPDF(subset, `Selected Employees (${subset.length})`, subset.map(r => r.user.name).join(', ').slice(0, 50))
      ?.save(`WorkLogs_Selected_${format(new Date(), 'dd_MMM_yyyy')}.pdf`);
    setDownloadMenuOpen(false);
  };

  const toggleEmpSelect = (id: string) =>
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ─── Calendar data ────────────────────────────────────────────────────────

  const calendarReports = filteredReports.map(r => ({
    ...r,
    reportDate: r.reportDate,
    otherWork: r.otherWorkEntries?.map(e => `${e.startHour}–${e.endHour}: ${e.description}`).join('\n') || '',
    entries: [],
  }));

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
              Employee work logs — what they did, hour by hour
            </p>
          </div>
          <div className="flex gap-2">
            {/* Download dropdown */}
            <DropdownMenu open={downloadMenuOpen} onOpenChange={setDownloadMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download
                  {selectedEmpIds.size > 0 && (
                    <span className="bg-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ml-0.5">
                      {selectedEmpIds.size}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-0" onInteractOutside={() => setDownloadMenuOpen(false)}>
                <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                  <FileOutput className="h-3.5 w-3.5 text-accent" />
                  <span className="text-xs font-semibold text-foreground">Export as PDF</span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <button onClick={() => { downloadByDate(); setDownloadMenuOpen(false); }}
                    className="w-full flex flex-col items-start gap-0 px-3 py-2 rounded-md hover:bg-muted/60 transition-colors text-left">
                    <span className="text-sm font-medium">📅 By Selected Date</span>
                    <span className="text-[11px] text-muted-foreground">
                      {date ? format(new Date(date), 'dd MMM yyyy') : 'Pick a date from filter first'}
                    </span>
                  </button>
                  <button onClick={() => { downloadCurrentView(); setDownloadMenuOpen(false); }}
                    className="w-full flex flex-col items-start gap-0 px-3 py-2 rounded-md hover:bg-muted/60 transition-colors text-left">
                    <span className="text-sm font-medium">📋 Current View</span>
                    <span className="text-[11px] text-muted-foreground">{filteredReports.length} reports visible</span>
                  </button>
                </div>

                {filteredReports.length > 0 && (
                  <>
                    <div className="border-t border-border/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Employees</span>
                      <div className="flex gap-2 text-[11px]">
                        <button className="text-accent hover:underline font-medium"
                          onClick={e => { e.stopPropagation(); setSelectedEmpIds(new Set(filteredReports.map(r => r.userId))); }}>All</button>
                        <span className="text-muted-foreground">·</span>
                        <button className="text-muted-foreground hover:underline"
                          onClick={e => { e.stopPropagation(); setSelectedEmpIds(new Set()); }}>None</button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto px-1.5 space-y-0.5 pb-1">
                      {filteredReports.map(report => {
                        const checked = selectedEmpIds.has(report.userId);
                        return (
                          <label key={report.id}
                            className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors select-none',
                              checked ? 'bg-accent/10 border border-accent/25' : 'hover:bg-muted/60')}
                            onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={checked} onChange={() => toggleEmpSelect(report.userId)}
                              className="rounded accent-accent w-4 h-4 cursor-pointer shrink-0" />
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-accent/60 text-white text-xs font-bold flex items-center justify-center shrink-0">
                              {report.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate leading-tight">{report.user.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(report.reportDate), 'dd MMM')} · {report.otherWorkEntries?.length || 0} blocks
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="border-t border-border/50 p-2">
                      <button onClick={downloadSelected}
                        disabled={selectedEmpIds.size === 0}
                        className={cn('w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all',
                          selectedEmpIds.size > 0
                            ? 'bg-accent text-white hover:bg-accent/90 cursor-pointer'
                            : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60')}>
                        <Download className="h-4 w-4" />
                        {selectedEmpIds.size > 0 ? `Download (${selectedEmpIds.size})` : 'Select employees above'}
                      </button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={fetchAll}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit mb-5">
          {(['reports', 'calendar'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t === 'reports' ? '📋 Reports' : '📅 Calendar'}
            </button>
          ))}
          <button
            onClick={() => { setTab('todo'); fetchTodoItems(); }}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              tab === 'todo' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <ListTodo className="h-4 w-4" /> Pipeline Tasks
          </button>
          <button
            onClick={() => { setTab('payments'); fetchPendingPayments(); }}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              tab === 'payments' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            💳 Payments
          </button>
        </div>

        {/* ════════ TAB: REPORTS ════════ */}
        {tab === 'reports' && (
          <>
            {/* Filter bar */}
            <div className="card-premium p-4 mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Date picker */}
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm w-40" />
                </div>

                {/* Quick dates */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: 'All Time', val: '' },
                    { label: 'Today', val: format(new Date(), 'yyyy-MM-dd') },
                    { label: 'Yesterday', val: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
                  ].map(q => (
                    <button key={q.label} onClick={() => setDate(q.val)}
                      className={cn('text-xs px-2.5 py-1.5 rounded-md transition-colors font-medium',
                        date === q.val ? 'bg-accent text-white shadow-sm' : 'bg-muted/60 hover:bg-muted text-muted-foreground')}>
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search employee, activity…" className="pl-9 h-9 text-sm"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>

                {/* Filters toggle */}
                <Button variant={showFilters ? 'default' : 'outline'} size="sm" className="gap-2 h-9 flex-shrink-0"
                  onClick={() => setShowFilters(p => !p)}>
                  <Filter className="h-4 w-4" /> Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-accent text-accent-foreground text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>

              {showFilters && (
                <div className="pt-2 border-t border-border/50 max-w-xs">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" /> Employee
                  </label>
                  <Select value={filterUser} onValueChange={setFilterUser}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Employees</SelectItem>
                      {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-xs text-muted-foreground">Active filters:</span>
                  {filterUser !== '__all__' && (
                    <FilterPill
                      label={`Employee: ${users.find(u => u.id === filterUser)?.name || filterUser}`}
                      onRemove={() => setFilterUser('__all__')}
                    />
                  )}
                  <button onClick={() => setFilterUser('__all__')}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors underline">
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Missing users banner */}
            {missingUsers.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="font-semibold text-red-700 flex items-center gap-2 mb-2 text-sm">
                  <XCircle className="h-4 w-4" />
                  {missingUsers.length} {missingUsers.length === 1 ? 'employee has' : 'employees have'} not submitted a report
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

            {/* Summary + expand controls */}
            {!loading && filteredReports.length > 0 && (
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{filteredReports.length}</span> report{filteredReports.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={expandAll} className="text-xs text-accent hover:underline">Expand all</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button onClick={collapseAll} className="text-xs text-accent hover:underline">Collapse all</button>
                </div>
              </div>
            )}

            {/* Reports list */}
            {loading ? (
              <div className="text-center py-20 text-muted-foreground text-sm">Loading reports…</div>
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No reports found</p>
                <p className="text-sm mt-1 opacity-70">Try a different date or clear filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map(report => {
                  const isExpanded = expandedIds.has(report.id);
                  return (
                    <div key={report.id} className="card-premium overflow-hidden">
                      {/* Report header */}
                      <div
                        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => toggleExpand(report.id)}
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent/60 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                          {report.user.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{report.user.name}</p>
                            <span className="text-xs text-muted-foreground capitalize bg-muted/60 px-2 py-0.5 rounded-full">
                              {report.user.role.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {format(new Date(report.reportDate), 'dd MMM yyyy')}
                            </span>
                          </div>
                          {!isExpanded && report.otherWorkEntries?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {report.otherWorkEntries.map(e => `${e.startHour}–${e.endHour}`).join(' · ')}
                            </p>
                          )}
                        </div>

                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(report.submittedAt), 'h:mm a')}
                          </span>
                          <span className="text-xs bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full font-medium">
                            {report.otherWorkEntries?.length || 0} blocks
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

                      {/* Expanded entries */}
                      {isExpanded && (
                        <div className="border-t border-border/50">
                          {report.otherWorkEntries?.length > 0 ? (
                            <>
                              <div className="hidden sm:grid grid-cols-[120px_1fr] gap-4 px-5 py-2.5 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                <span>Time Block</span>
                                <span>Activity</span>
                              </div>
                              <div className="divide-y divide-border/30">
                                {report.otherWorkEntries.map((entry, i) => (
                                  <div key={entry.id || i} className="flex gap-4 px-5 py-4 hover:bg-muted/10 transition-colors">
                                    <div className="flex-shrink-0 w-24 text-center">
                                      <span className="text-xs font-bold text-accent block">{entry.startHour}</span>
                                      <div className="my-1 h-5 w-px bg-border mx-auto" />
                                      <span className="text-xs font-bold text-muted-foreground block">{entry.endHour}</span>
                                    </div>
                                    <p className="flex-1 text-sm text-foreground/80 bg-muted/30 rounded-lg px-3 py-2.5 whitespace-pre-wrap leading-relaxed">
                                      {entry.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="p-6 text-center text-sm text-muted-foreground italic">
                              No work entries recorded for this report.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════ TAB: CALENDAR ════════ */}
        {tab === 'calendar' && (
          <ReportCalendar
            reports={calendarReports}
            loading={loading}
            showUserName
          />
        )}

        {tab === 'todo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-accent" /> All Stage & Comment Due Dates
              </h2>
              <div className="flex gap-2 items-center">
                <Select value={todoFilter} onValueChange={(v: any) => setTodoFilter(v)}>
                  <SelectTrigger className="h-8 text-xs w-32 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="overdue">Overdue Only</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={fetchTodoItems} className="h-7 text-xs gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>
            </div>

            {todoLoading ? (
              <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
            ) : todoItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">No pipeline tasks found.</div>
            ) : (() => {
              let filteredTodos = todoItems;
              if (todoFilter === 'overdue') {
                filteredTodos = todoItems.filter(t => t.dueDateStatus === 'overdue');
              }
              return (
              <div className="space-y-3">
                {filteredTodos.map((item: any) => (
                  <div key={item.id} className={cn(
                    'rounded-xl border p-4 space-y-2',
                    item.dueDateStatus === 'overdue' && 'border-red-200 bg-red-50/50',
                    item.dueDateStatus === 'today' && 'border-orange-200 bg-orange-50/50',
                    item.dueDateStatus === 'upcoming' && 'border-blue-100 bg-blue-50/30',
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.inquiry?.client_name}</p>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                          {item.inquiry?.inquiry_number}
                        </span>
                        <span className={cn(
                          'ml-2 text-[10px] px-2 py-0.5 rounded-full border font-medium',
                          item.type === 'stage' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {item.type === 'stage' ? '📌 Stage Task' : '💬 Comment Task'}
                        </span>
                      </div>
                      <div className={cn(
                        'shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border',
                        item.dueDateStatus === 'overdue' && 'bg-red-100 text-red-600 border-red-200',
                        item.dueDateStatus === 'today' && 'bg-orange-100 text-orange-600 border-orange-200',
                        item.dueDateStatus === 'upcoming' && 'bg-blue-100 text-blue-600 border-blue-200',
                      )}>
                        <CalendarDays className="h-3 w-3 inline mr-1" />
                        {format(new Date(item.dueDate), 'dd MMM yyyy')}
                        {item.dueDateStatus === 'overdue' && ' · Overdue'}
                        {item.dueDateStatus === 'today' && ' · Today'}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80 bg-white/60 rounded px-3 py-2 border border-border/40">
                      {item.content}
                    </p>

                    {/* ADDED: Show Attachments in Admin Todo (Images added to comments) */}
                    {(() => {
                      const attachments = item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []);
                      if (attachments.length === 0) return null;

                      return (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {attachments.map((url: string, idx: number) => (
                            <a key={idx} href={getFileUrl(url)} target="_blank" rel="noopener noreferrer" className="group/img cursor-pointer max-w-[150px]">
                              <div className="rounded-md overflow-hidden border border-border relative">
                                <img src={getFileUrl(url)} alt={`Attachment ${idx + 1}`} className="w-full h-auto object-contain bg-muted/20" />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors"></div>
                              </div>
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>Assigned to: <strong>{item.user?.name}</strong></span>
                        <span className="bg-muted px-2 py-0.5 rounded-full">{item.inquiry?.stage}</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs gap-1 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                        onClick={() => handleCompleteTodo(item.id, item.type)}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )})()}
          </div>
        )}

        {/* ══════════ TAB: PAYMENTS ══════════ */}
        {tab === 'payments' && (() => {
  // 1. Filter the payments based on search and status
  const filteredPayments = pendingPayments.filter((payment: any) => {
    const matchesSearch = 
      payment.inquiry?.client_name?.toLowerCase().includes(paymentSearch.toLowerCase()) ||
      payment.inquiry?.inquiry_number?.toLowerCase().includes(paymentSearch.toLowerCase());
    const matchesStatus = paymentFilter === 'all' || payment.status === paymentFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in space-y-5">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-accent" /> Payments Ledger
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Track and manage all scheduled and collected payments</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchPendingPayments} className="h-8 text-xs gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 bg-muted/20 p-3 rounded-xl border border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by client or inquiry number..." 
            className="pl-9 h-9 text-sm bg-background"
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'collected'].map((f) => (
            <button
              key={f}
              onClick={() => setPaymentFilter(f as any)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border",
                paymentFilter === f 
                  ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* PAYMENTS GRID */}
      {paymentsLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading payments…</div>
      ) : filteredPayments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-sm">No payments found</p>
          <p className="text-xs mt-1 opacity-70">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPayments.map((payment: any) => {
            const isOverdue = new Date(payment.date) < new Date(new Date().setHours(0,0,0,0)) && payment.status !== 'collected';
            const isToday = new Date(payment.date).toDateString() === new Date().toDateString() && payment.status !== 'collected';
            const isCollected = payment.status === 'collected';

            return (
              <div 
                key={payment.id} 
                className={cn(
                  'rounded-xl border p-4 flex flex-col justify-between h-full space-y-4 shadow-sm hover:shadow-md transition-all',
                  isCollected ? 'bg-muted/30 border-border/50' : 
                  isOverdue ? 'border-red-200 bg-red-50/30' : 
                  isToday ? 'border-orange-200 bg-orange-50/30' : 
                  'bg-background border-border hover:border-primary/40'
                )}
              >
                {/* Top Half: Details */}
                <div>
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <p className={cn("text-sm font-bold truncate", isCollected && "text-muted-foreground")}>
                      {payment.inquiry?.client_name || "Unknown Client"}
                    </p>
                    {isCollected ? (
                       <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold uppercase shrink-0 border border-green-200">
                         Collected
                       </span>
                    ) : (
                       <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase shrink-0 border border-amber-200">
                         Pending
                       </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono bg-muted/80 px-1.5 py-0.5 rounded border text-muted-foreground">
                      {payment.inquiry?.inquiry_number}
                    </span>
                    <span className="text-[10px] bg-muted/50 px-2 py-0.5 rounded-full font-medium text-muted-foreground">
                      {payment.inquiry?.stage}
                    </span>
                  </div>
                </div>

                {/* Bottom Half: Amount and Date */}
                <div className="pt-3 border-t border-border/50 flex items-end justify-between">
                  <div className={cn(
                    'text-[11px] font-semibold flex items-center gap-1',
                    isCollected ? 'text-muted-foreground' :
                    isOverdue ? 'text-red-600' : 
                    isToday ? 'text-orange-600' : 'text-blue-600'
                  )}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    <div className="flex flex-col">
                      <span>{format(new Date(payment.date), 'dd MMM yyyy')}</span>
                      {!isCollected && (isOverdue ? <span>(Overdue)</span> : isToday ? <span>(Due Today)</span> : null)}
                    </div>
                  </div>

                  <div className={cn(
                    "font-bold text-xl flex items-center",
                    isCollected ? "text-muted-foreground opacity-60 line-through" : "text-green-600"
                  )}>
                    ₹{payment.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
})()}
      </div>
    </DashboardLayout>
  );
};

export default AdminDailyReports;