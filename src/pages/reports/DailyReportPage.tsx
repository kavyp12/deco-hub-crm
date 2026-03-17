// [FILE: src/pages/reports/DailyReportPage.tsx]

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ClipboardList, Send, AlertTriangle, CheckCircle2,
  Clock, Eye, Pencil, Info,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

const STATUSES = [
  { value: 'contacted',         label: '📞 Contacted' },
  { value: 'follow_up',         label: '🔄 Follow-up' },
  { value: 'meeting_scheduled', label: '📅 Meeting Scheduled' },
  { value: 'proposal_sent',     label: '📄 Proposal Sent' },
  { value: 'negotiation',       label: '🤝 Negotiation' },
  { value: 'closed_won',        label: '✅ Closed Won' },
  { value: 'closed_lost',       label: '❌ Closed Lost' },
  { value: 'no_response',       label: '🔇 No Response' },
  { value: 'on_hold',           label: '⏸️ On Hold' },
];

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

interface InquiryOption {
  id: string;
  inquiry_number: string;
  client_name: string;
  stage: string;
  address: string;
  lastStatus: string | null;
  lastUpdatedAt: string | null;
  isInactive: boolean;
}

interface InquiryEntry {
  inquiryId: string;
  status: string;
  workDone: string;
}

// ─── Window: 6 PM → 6 PM (next day) ─────────────────────────────────────────
// The reporting window opens at 6 PM and stays open for 24 hours until next 6 PM.
// This means an employee can ALWAYS file a report — the window is rolling.
// Example: report filed at 8 PM on Monday = counts for Tuesday's report.
//          report filed at 2 PM on Tuesday = counts for Tuesday's report.

const getWindowInfo = () => {
  const now = new Date();

  const todayAt6PM = new Date(now);
  todayAt6PM.setHours(18, 0, 0, 0);

  const isPast6PM = now >= todayAt6PM;

  // Window end = next 6PM
  const windowEnd = new Date(todayAt6PM);
  if (isPast6PM) windowEnd.setDate(windowEnd.getDate() + 1);

  const msLeft    = windowEnd.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const minsLeft  = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));

  // The "report day" label
  const reportDayDate = isPast6PM
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    : now;

  return {
    reportLabel:  format(reportDayDate, 'EEEE, dd MMM yyyy'),
    hoursLeft,
    minsLeft,
    closesAt:     format(windowEnd, 'h:mm a, dd MMM'),
    isPast6PM,
  };
};

// ─── Component ───────────────────────────────────────────────────────────────

const DailyReportPage: React.FC = () => {
  const { toast } = useToast();
  const win = getWindowInfo();

  const [inquiries, setInquiries]           = useState<InquiryOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [editMode, setEditMode]             = useState(false);
  const [entries, setEntries]               = useState<Record<string, InquiryEntry>>({});
  const [savedEntries, setSavedEntries]     = useState<any[]>([]);
  const [previewOpen, setPreviewOpen]       = useState(false);
  const [previewItem, setPreviewItem]       = useState<{ entry: any; inq: InquiryOption | undefined } | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/daily-reports/my-today');
        const inqs: InquiryOption[] = data.inquiries || [];
        setInquiries(inqs);

        if (data.existingReport?.entries?.length) {
          setSubmitted(true);
          setSavedEntries(data.existingReport.entries);
          // Pre-fill from saved
          const map: Record<string, InquiryEntry> = {};
          data.existingReport.entries.forEach((e: any) => {
            map[e.inquiryId] = { inquiryId: e.inquiryId, status: e.status, workDone: e.workDone };
          });
          // Also init inquiries not in saved report as empty
          inqs.forEach(inq => {
            if (!map[inq.id]) map[inq.id] = { inquiryId: inq.id, status: '', workDone: '' };
          });
          setEntries(map);
        } else {
          // Init all as empty
          const map: Record<string, InquiryEntry> = {};
          inqs.forEach(inq => { map[inq.id] = { inquiryId: inq.id, status: '', workDone: '' }; });
          setEntries(map);
        }
      } catch {
        toast({ title: 'Error', description: 'Could not load data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const updateEntry = (id: string, field: 'status' | 'workDone', val: string) =>
    setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const filledCount = Object.values(entries).filter(e => e.status && e.workDone.trim()).length;

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const toSubmit = Object.values(entries).filter(e => e.status || e.workDone.trim());

    if (toSubmit.length === 0) {
      toast({ title: 'Nothing to submit', description: 'Please update at least one inquiry.', variant: 'destructive' });
      return;
    }
    for (const e of toSubmit) {
      const inq = inquiries.find(i => i.id === e.inquiryId);
      if (!e.status)          { toast({ title: inq?.inquiry_number || 'Inquiry', description: 'Select a status.',    variant: 'destructive' }); return; }
      if (!e.workDone.trim()) { toast({ title: inq?.inquiry_number || 'Inquiry', description: 'Describe work done.', variant: 'destructive' }); return; }
    }

    setSubmitting(true);
    try {
      await api.post('/daily-reports', { entries: toSubmit });
      const { data } = await api.get('/daily-reports/my-today');
      setSavedEntries(data.existingReport?.entries || []);
      setSubmitted(true);
      setEditMode(false);
      toast({ title: '✅ Report Submitted', description: `${toSubmit.length} ${toSubmit.length === 1 ? 'inquiry' : 'inquiries'} updated.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => { setEditMode(true); setSubmitted(false); };

  const inactiveCount = inquiries.filter(i => i.isInactive).length;

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading your inquiries...
      </div>
    </DashboardLayout>
  );

  // ─── SUBMITTED VIEW ───────────────────────────────────────────────────────

  if (submitted && !editMode) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto animate-fade-in">

          {/* Header */}
          <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-accent" /> Daily Report
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{win.reportLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-sm font-medium border border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
              </span>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </div>

          {/* Window timer */}
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg mb-5 w-fit">
            <Clock className="h-3.5 w-3.5" />
            Window closes {win.closesAt} · {win.hoursLeft}h {win.minsLeft}m left to edit
          </div>

          {/* Saved inquiry cards */}
          <div className="space-y-3">
            {savedEntries.map((entry: any, idx: number) => {
              const inq = inquiries.find(i => i.id === entry.inquiryId);
              const num   = inq?.inquiry_number || entry.inquiry?.inquiry_number || '—';
              const name  = inq?.client_name    || entry.inquiry?.client_name    || '—';
              const label = STATUSES.find(s => s.value === entry.status)?.label || entry.status;
              return (
                <div key={entry.id || idx} className="card-premium p-4 flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{num}</span>
                      <span className="text-sm font-semibold">{name}</span>
                    </div>
                    <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium inline-block mb-2', STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border')}>
                      {label}
                    </span>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-1">{entry.workDone}</p>
                  </div>
                  <button
                    onClick={() => { setPreviewItem({ entry, inq }); setPreviewOpen(true); }}
                    className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-5">
            ✅ {savedEntries.length} {savedEntries.length === 1 ? 'inquiry' : 'inquiries'} updated · Visible to your manager
          </p>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-accent" />
                {previewItem?.inq?.inquiry_number || previewItem?.entry?.inquiry?.inquiry_number} — {previewItem?.inq?.client_name || previewItem?.entry?.inquiry?.client_name}
              </DialogTitle>
            </DialogHeader>
            {previewItem && (
              <div className="space-y-4 pt-1">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
                  <span className={cn('text-sm px-3 py-1.5 rounded-full border font-medium inline-block', STATUS_COLORS[previewItem.entry.status] || 'bg-muted border-border')}>
                    {STATUSES.find(s => s.value === previewItem.entry.status)?.label || previewItem.entry.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Work Done</p>
                  <p className="text-sm bg-muted/40 rounded-xl p-4 whitespace-pre-wrap leading-relaxed min-h-[80px]">
                    {previewItem.entry.workDone}
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ─── FORM VIEW ───────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto animate-fade-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-accent" /> Daily Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{win.reportLabel}</p>
          </div>
          <span className="flex items-center gap-1.5 text-yellow-600 bg-yellow-50 px-3 py-1.5 rounded-full text-sm font-medium border border-yellow-200 w-fit">
            <Clock className="h-4 w-4" /> Pending Submission
          </span>
        </div>

        {/* Window info */}
        <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg mb-5 w-fit">
          <Clock className="h-3.5 w-3.5" />
          Window: 6:00 PM → 6:00 PM · Closes {win.closesAt} · <strong>{win.hoursLeft}h {win.minsLeft}m left</strong>
        </div>

        {/* Inactive warning */}
        {inactiveCount > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">🚨 {inactiveCount} Inactive {inactiveCount === 1 ? 'Inquiry' : 'Inquiries'}</p>
              <p className="text-red-600 mt-0.5">No update for 3+ days. Please update these today.</p>
            </div>
          </div>
        )}

        {inquiries.length === 0 ? (
          <div className="card-premium p-12 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">No inquiries assigned to you</p>
            <p className="text-sm mt-1 opacity-70">Contact your manager to get inquiries assigned.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Update all your assigned inquiries below. You can skip any inquiry with no activity today.
            </p>

            {/* ── One card per assigned inquiry ── */}
            <div className="space-y-4">
              {inquiries.map((inq, idx) => {
                const entry = entries[inq.id] || { inquiryId: inq.id, status: '', workDone: '' };
                const isFilled = !!(entry.status && entry.workDone.trim());

                return (
                  <div
                    key={inq.id}
                    className={cn(
                      'card-premium overflow-hidden transition-all duration-200',
                      isFilled
                        ? 'border-l-4 border-l-green-400'
                        : inq.isInactive
                          ? 'border-l-4 border-l-red-400'
                          : 'border-l-4 border-l-transparent'
                    )}
                  >
                    {/* ── Card header: inquiry info ── */}
                    <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/25 border-b border-border/50">
                      {/* Number badge */}
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>

                      {/* Inquiry name */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {inq.inquiry_number}
                          </span>
                          <span className="text-sm font-semibold">{inq.client_name}</span>
                          {inq.isInactive && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                              🚨 Inactive
                            </span>
                          )}
                        </div>
                        {inq.address && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{inq.address}</p>
                        )}
                      </div>

                      {/* Last status + filled checkmark */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {inq.lastStatus && (
                          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Info className="h-3 w-3" />
                            <span className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', STATUS_COLORS[inq.lastStatus])}>
                              {STATUSES.find(s => s.value === inq.lastStatus)?.label || inq.lastStatus}
                            </span>
                          </div>
                        )}
                        {isFilled
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                        }
                      </div>
                    </div>

                    {/* ── Card body: status + work done ── */}
                    <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-start">

                      {/* Status dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Today's Status
                        </label>
                        <Select
                          value={entry.status || undefined}
                          onValueChange={val => updateEntry(inq.id, 'status', val)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select status..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Last status — mobile only */}
                        {inq.lastStatus && (
                          <p className="sm:hidden text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Info className="h-3 w-3" />
                            Last: <span className={cn('px-1.5 py-0.5 rounded-full ml-1', STATUS_COLORS[inq.lastStatus])}>
                              {STATUSES.find(s => s.value === inq.lastStatus)?.label || inq.lastStatus}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Work done textarea */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Work Done Today
                        </label>
                        <Textarea
                          placeholder="What did you do on this inquiry today? e.g. called client, sent samples, visited site..."
                          rows={3}
                          value={entry.workDone}
                          onChange={e => updateEntry(inq.id, 'workDone', e.target.value)}
                          className="resize-none text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit bar */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                <span className={cn('font-semibold', filledCount > 0 ? 'text-green-600' : 'text-foreground')}>
                  {filledCount}
                </span>
                <span className="text-muted-foreground">/{inquiries.length} filled</span>
              </p>
              <Button
                variant="accent"
                size="lg"
                onClick={handleSubmit}
                disabled={submitting || filledCount === 0}
                className="gap-2 px-8"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Submitting...' : editMode ? 'Update Report' : 'Submit Report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DailyReportPage;