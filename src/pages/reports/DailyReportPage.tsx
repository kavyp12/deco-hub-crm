import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ClipboardList, Send, AlertTriangle, CheckCircle2,
  Clock, Eye, Pencil, Info, Search, CalendarDays,
  FileText
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  daysInactive: number;
}

interface InquiryEntry {
  inquiryId: string;
  status: string;
  workDone: string;
}

const getWindowInfo = () => {
  const now = new Date();
  const todayAt6PM = new Date(now);
  todayAt6PM.setHours(18, 0, 0, 0);

  const isPast6PM = now >= todayAt6PM;
  const windowEnd = new Date(todayAt6PM);
  if (isPast6PM) windowEnd.setDate(windowEnd.getDate() + 1);

  const msLeft    = windowEnd.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const minsLeft  = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));

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

 // Tabs
  const [activeTab, setActiveTab]           = useState<'today' | 'other_work' | 'history'>('today');

  // Today State
  const [inquiries, setInquiries]           = useState<InquiryOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [editMode, setEditMode]             = useState(false);
  const [entries, setEntries]               = useState<Record<string, InquiryEntry>>({});
  const [savedEntries, setSavedEntries]     = useState<any[]>([]);
  
  // NEW: State for Other Work
  const [otherWork, setOtherWork]           = useState('');
  const [savedOtherWork, setSavedOtherWork] = useState('');

  
  // History State
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch]   = useState('');

  // Dialog States
  const [previewOpen, setPreviewOpen]       = useState(false);
  const [previewItem, setPreviewItem]       = useState<{ entry: any; inq: InquiryOption | undefined } | null>(null);
  const [timelineOpen, setTimelineOpen]     = useState(false);
  const [timelineData, setTimelineData]     = useState<any>(null);
  const [timelineLoading, setTimelineLoading]= useState(false);

  // ─── Fetch Today's Data ──────────────────────────────────────────────────

 useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/daily-reports/my-today');
        const inqs: InquiryOption[] = data.inquiries || [];
        setInquiries(inqs);

        // Check if existingReport exists
        if (data.existingReport) {
          setSubmitted(true);
          
          // Set saved other work
          setSavedOtherWork(data.existingReport.otherWork || '');
          setOtherWork(data.existingReport.otherWork || '');
          
          // Process inquiries if they exist
          if (data.existingReport.entries?.length) {
            setSavedEntries(data.existingReport.entries);
            const map: Record<string, InquiryEntry> = {};
            data.existingReport.entries.forEach((e: any) => {
              map[e.inquiryId] = { inquiryId: e.inquiryId, status: e.status, workDone: e.workDone };
            });
            inqs.forEach(inq => {
              if (!map[inq.id]) map[inq.id] = { inquiryId: inq.id, status: '', workDone: '' };
            });
            setEntries(map);
          } else {
            // If they only submitted otherWork, setup empty inquiry map
            const map: Record<string, InquiryEntry> = {};
            inqs.forEach(inq => { map[inq.id] = { inquiryId: inq.id, status: '', workDone: '' }; });
            setEntries(map);
          }
        } else {
          // Completely new day
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
  }, [toast]);

  // ─── Fetch History Data ──────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'history' && historyEntries.length === 0) {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/daily-reports/my-history');
      setHistoryEntries(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Could not load history', variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredHistory = historyEntries.filter(entry => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      entry.inquiry?.inquiry_number?.toLowerCase().includes(q) ||
      entry.inquiry?.client_name?.toLowerCase().includes(q) ||
      entry.workDone?.toLowerCase().includes(q) ||
      (STATUSES.find(s => s.value === entry.status)?.label || '').toLowerCase().includes(q)
    );
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const updateEntry = (id: string, field: 'status' | 'workDone', val: string) =>
    setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const filledCount = Object.values(entries).filter(e => e.status && e.workDone.trim()).length;

 const handleSubmit = async () => {
    const toSubmit = Object.values(entries).filter(e => e.status || e.workDone.trim());
    const hasOtherWork = otherWork.trim().length > 0;

    if (toSubmit.length === 0 && !hasOtherWork) {
      toast({ title: 'Nothing to submit', description: 'Please update an inquiry or log your other work.', variant: 'destructive' });
      return;
    }

    for (const e of toSubmit) {
      const inq = inquiries.find(i => i.id === e.inquiryId);
      if (!e.status)          { toast({ title: inq?.inquiry_number || 'Inquiry', description: 'Select a status.',    variant: 'destructive' }); return; }
      if (!e.workDone.trim()) { toast({ title: inq?.inquiry_number || 'Inquiry', description: 'Describe work done.', variant: 'destructive' }); return; }
    }

    setSubmitting(true);
    try {
      await api.post('/daily-reports', { entries: toSubmit, otherWork });
      
      const { data } = await api.get('/daily-reports/my-today');
      setSavedEntries(data.existingReport?.entries || []);
      setSavedOtherWork(data.existingReport?.otherWork || '');
      setSubmitted(true);
      setEditMode(false);
      
      const historyData = await api.get('/daily-reports/my-history');
      setHistoryEntries(historyData.data);
      
      toast({ title: '✅ Report Submitted', description: `Your daily activity has been logged.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => { setEditMode(true); setSubmitted(false); };

  const openTimeline = async (inquiryId: string) => {
    setTimelineLoading(true);
    setTimelineOpen(true);
    setTimelineData(null);
    try {
      const { data } = await api.get(`/daily-reports/inquiry/${inquiryId}/timeline`);
      setTimelineData(data);
    } catch {
      toast({ title: 'Error', description: 'Could not load history', variant: 'destructive' });
    } finally {
      setTimelineLoading(false);
    }
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading your data...
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">

        {/* ── Page Header & Tabs ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-accent" /> Daily Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage and track your daily updates</p>
          </div>
        </div>

        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit mb-5">
          <button
            onClick={() => setActiveTab('today')}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors', activeTab === 'today' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            📋 Today's Report
          </button>
          <button
            onClick={() => setActiveTab('other_work')}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors', activeTab === 'other_work' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            📝 Other Work
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors', activeTab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            📜 My History
          </button>
        </div>

        {/* ════════════════════════════════════════
            TAB 1: TODAY'S REPORT
        ════════════════════════════════════════ */}
        {activeTab === 'today' && (
          <div className="animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg w-fit">
                <Clock className="h-3.5 w-3.5" />
                <span>{win.reportLabel}</span>
                <span className="mx-1 text-blue-300">|</span>
                <span>Closes {win.closesAt} · <strong>{win.hoursLeft}h {win.minsLeft}m left</strong></span>
              </div>
              
              {submitted && !editMode ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-sm font-medium border border-green-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
                  </span>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-yellow-600 bg-yellow-50 px-3 py-1.5 rounded-full text-sm font-medium border border-yellow-200 w-fit">
                  <Clock className="h-4 w-4" /> Pending Submission
                </span>
              )}
            </div>

            {/* View Mode: Already Submitted */}
            {submitted && !editMode ? (
              <>
                <div className="space-y-3 mt-6">
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
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openTimeline(entry.inquiryId)}>
                            <Clock className="h-3 w-3" /> History
                          </Button>
                          <button
                            onClick={() => { setPreviewItem({ entry, inq }); setPreviewOpen(true); }}
                            className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-muted-foreground mt-5">
                  ✅ {savedEntries.length} {savedEntries.length === 1 ? 'inquiry' : 'inquiries'} updated · Visible to your manager
                </p>
              </>
            ) : (
              /* Edit Mode / New Submission */
              <>
                {/* Warnings */}
                {inquiries.filter(i => i.daysInactive >= 3).length > 0 && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-3 text-sm">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-700">🚨 {inquiries.filter(i => i.daysInactive >= 3).length} Critical Inquiries</p>
                      <p className="text-red-600 mt-0.5">No update for 3+ days. Action required immediately.</p>
                    </div>
                  </div>
                )}
                {inquiries.filter(i => i.daysInactive === 2).length > 0 && (
                  <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5 text-sm">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-yellow-700">⚠️ {inquiries.filter(i => i.daysInactive === 2).length} Warning Inquiries</p>
                      <p className="text-yellow-700 mt-0.5">No update for 2 days. Please follow up today.</p>
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

                    <div className="space-y-4">
                      {inquiries.map((inq, idx) => {
                        const entry = entries[inq.id] || { inquiryId: inq.id, status: '', workDone: '' };
                        const isFilled = !!(entry.status && entry.workDone.trim());

                        let borderClass = 'border-l-transparent';
                        if (isFilled) borderClass = 'border-l-green-400';
                        else if (inq.daysInactive >= 3) borderClass = 'border-l-red-500 bg-red-50/40';
                        else if (inq.daysInactive === 2) borderClass = 'border-l-yellow-400 bg-yellow-50/40';

                        return (
                          <div
                            key={inq.id}
                            className={cn(
                              'card-premium overflow-hidden transition-all duration-200 border-l-4',
                              borderClass
                            )}
                          >
                            <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/25 border-b border-border/50">
                              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                                {idx + 1}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                                    {inq.inquiry_number}
                                  </span>
                                  <span className="text-sm font-semibold">{inq.client_name}</span>
                                  
                                  {inq.daysInactive >= 3 && (
                                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                                      🚨 3+ Days Inactive
                                    </span>
                                  )}
                                  {inq.daysInactive === 2 && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold border border-yellow-200">
                                      ⚠️ 2 Days Inactive
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex-shrink-0 flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openTimeline(inq.id)}>
                                  <Clock className="h-3 w-3" /> History
                                </Button>
                                
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

                            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-start">
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
                              </div>

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

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        <span className={cn('font-semibold', filledCount > 0 ? 'text-green-600' : 'text-foreground')}>
                          {filledCount}
                        </span>
                        <span className="text-muted-foreground">/{inquiries.length} filled</span>
                      </p>
                      <Button
                        variant="default"
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
              </>
            )}
          </div>
        )}
         
         {/* ════════════════════════════════════════
            TAB: OTHER WORK
        ════════════════════════════════════════ */}
        {activeTab === 'other_work' && (
          <div className="animate-fade-in space-y-4">
            <div className="card-premium p-6">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-accent" />
                General Activities & Assisting Others
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Did you assist another employee, do site visits, or perform general office work today? Log it here.
              </p>

              {submitted && !editMode ? (
                <div className="bg-muted/40 border border-border/50 rounded-xl p-4 min-h-[150px] whitespace-pre-wrap text-sm leading-relaxed">
                  {savedOtherWork ? savedOtherWork : <span className="text-muted-foreground italic">No other work logged for today.</span>}
                </div>
              ) : (
                <Textarea
                  placeholder="Example: Went on site visit with Rahul for Inquiry #1024, completed weekly inventory check..."
                  className="min-h-[150px] resize-none text-sm p-4"
                  value={otherWork}
                  onChange={(e) => setOtherWork(e.target.value)}
                />
              )}
            </div>

            {(!submitted || editMode) && (
              <div className="flex justify-end">
                <Button
                  variant="default"
                  onClick={handleSubmit}
                  disabled={submitting || (filledCount === 0 && otherWork.trim().length === 0)}
                  className="gap-2 px-8 h-10"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : editMode ? 'Update Report' : 'Submit Report'}
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* ════════════════════════════════════════
            TAB 2: MY HISTORY
        ════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="animate-fade-in">
            {/* Search Bar */}
            <div className="card-premium p-4 mb-4 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by inquiry number, client name, status, or work done..."
                  className="pl-9 h-9 text-sm"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
            </div>

            {historyLoading ? (
              <div className="text-center py-20 text-muted-foreground text-sm">
                Loading your history...
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="card-premium p-12 text-center text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium">No history found</p>
                <p className="text-sm mt-1 opacity-70">
                  {historySearch ? "No records match your search." : "You haven't submitted any daily reports yet."}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Showing {filteredHistory.length} recorded entries
                </p>
                
                {/* 🚨 COMPACT LIST LAYOUT 🚨 */}
                <div className="card-premium overflow-hidden divide-y divide-border/50">
                  {filteredHistory.map((entry) => {
                    const label = STATUSES.find((s) => s.value === entry.status)?.label || entry.status;
                    return (
                      <div key={entry.id} className="p-4 hover:bg-muted/20 transition-colors flex flex-col sm:flex-row gap-4 sm:items-start">
                        
                        {/* Left Side: Metadata (Inquiry, Date, Status) */}
                        <div className="sm:w-64 flex-shrink-0 space-y-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                              {entry.inquiry?.inquiry_number}
                            </span>
                            <span className="text-sm font-semibold truncate">{entry.inquiry?.client_name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap', STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border')}>
                              {label}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                              <CalendarDays className="h-3 w-3 opacity-70" />
                              {format(new Date(entry.createdAt), 'dd MMM yyyy')}
                            </span>
                          </div>
                        </div>

                        {/* Right Side: Work Done Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {entry.workDone}
                          </p>
                        </div>
                        
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Dialogs ── */}
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

        <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" />
                {timelineData?.inquiry
                  ? `${timelineData.inquiry.inquiry_number} — ${timelineData.inquiry.client_name}`
                  : 'Activity Timeline'}
              </DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 pr-1 mt-2">
              {timelineLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">Loading history...</div>
              ) : !timelineData || timelineData.timeline.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No history recorded yet.</div>
              ) : (
                <div className="relative pb-2">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-5">
                    {timelineData.timeline.map((entry: any, i: number) => (
                      <div key={entry.id} className="flex gap-4 pl-10 relative">
                        <div className={cn(
                          'absolute left-[13px] w-3 h-3 rounded-full border-2 border-background mt-1',
                          i === 0 ? 'bg-accent' : 'bg-muted-foreground/40'
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{entry.dailyReport?.user?.name || "You"}</span>
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {format(new Date(entry.createdAt), 'dd MMM yyyy')}
                            </span>
                          </div>
                          <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium inline-block mb-2', STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border')}>
                            {STATUSES.find((s: any) => s.value === entry.status)?.label || entry.status}
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

      </div>
    </DashboardLayout>
  );
};

export default DailyReportPage;