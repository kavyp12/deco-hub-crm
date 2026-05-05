import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  ClipboardList, Send, Search, CalendarDays,
  Plus, Trash2, CheckCircle2, ChevronDown, Pencil,
  ListTodo, Clock, Users, AtSign, AlertCircle, IndianRupee,
  RefreshCw, XCircle
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import ReportCalendar from './ReportCalendar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeBlock {
  id: string;
  startHour: string;
  endHour: string;
  description: string;
}

const HOUR_OPTIONS: string[] = [];
for (let i = 0; i < 24; i++) {
  const h = String(i).padStart(2, '0');
  HOUR_OPTIONS.push(`${h}:00`);
  HOUR_OPTIONS.push(`${h}:15`);
  HOUR_OPTIONS.push(`${h}:30`);
  HOUR_OPTIONS.push(`${h}:45`);
}
HOUR_OPTIONS.push('24:00');

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const emptyBlock = (): TimeBlock => ({
  id: uid(),
  startHour: '09:00',
  endHour: '10:00',
  description: '',
});


const getFileUrl = (path: string | undefined) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const baseUrl = api.defaults.baseURL || '';
  const rootUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
  return `${rootUrl}${path}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

const DailyReportPage: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'log' | 'history' | 'calendar' | 'todo' | 'payments'>('todo');

  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ── Todo / Due-Date State ─────────────────────────────────────────────────
  const [todoItems, setTodoItems] = useState<any[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);

  // ── Log Work State ────────────────────────────────────────────────────────
  const [blocks, setBlocks] = useState<TimeBlock[]>([emptyBlock()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedBlocks, setSavedBlocks] = useState<any[]>([]);
  
  // NEW: Date Selection & Drag State
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isToday = selectedDate === todayStr;
  const [resizingBlockId, setResizingBlockId] = useState<string | null>(null);

  // Todo filter
  const [todoFilter, setTodoFilter] = useState<'all' | 'overdue'>('all');

  // ── History State ─────────────────────────────────────────────────────────
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // ── Payments State ────────────────────────────────────────────────────────
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'collected'>('all');

  // ── Timeline Edit State ──────────────────────────────────────────────────
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Load entries for the selected date ────────────────────────────────────
  useEffect(() => {
    fetchTodayLog(selectedDate);
  }, [selectedDate]);

  const fetchTodayLog = async (dateStr: string) => {
    try {
      const { data } = await api.get(`/daily-reports/my-today?date=${dateStr}`);
      if (data.existingReport?.otherWorkEntries?.length) {
        setSavedBlocks(data.existingReport.otherWorkEntries);
        setSubmitted(true);
      } else {
        setSavedBlocks([]);
        setBlocks([emptyBlock()]);
        setSubmitted(false);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if ((activeTab === 'history' || activeTab === 'calendar') && historyEntries.length === 0) {
      fetchHistory();
    }
    if (activeTab === 'todo') {
      fetchTodoItems();
    }
    if (activeTab === 'payments') {
      fetchPendingPayments();
    }
  }, [activeTab]);

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

  const fetchTodoItems = async () => {
    setTodoLoading(true);
    try {
      const { data } = await api.get('/pipeline/todo-items');
      setTodoItems(data);
      await api.put('/notifications/mentions/read-all');
    } catch {
      toast({ title: 'Error', description: 'Could not load todo items', variant: 'destructive' });
    } finally {
      setTodoLoading(false);
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

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/daily-reports/my-history');
      setHistoryEntries(data);
    } catch {
      toast({ title: 'Error', description: 'Could not load history', variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Group flat history into per-day reports
  const groupedReports = useMemo(() => {
    if (!historyEntries || historyEntries.length === 0) return [];
    if ('otherWorkEntries' in (historyEntries[0] || {})) return historyEntries;
    const map = new Map<string, any>();
    historyEntries.forEach((entry: any) => {
      const dateStr = entry.dailyReport?.reportDate || format(new Date(entry.createdAt), 'yyyy-MM-dd');
      if (!map.has(dateStr)) {
        map.set(dateStr, {
          id: entry.dailyReport?.id || dateStr,
          reportDate: dateStr,
          createdAt: entry.createdAt,
          otherWorkEntries: [],
        });
      }
      map.get(dateStr).otherWorkEntries.push(entry);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime()
    );
  }, [historyEntries]);

  const filteredHistory = groupedReports.filter((report: any) => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    const matchDate = format(new Date(report.reportDate || report.createdAt), 'dd MMM yyyy').toLowerCase().includes(q);
    const matchEntries = report.otherWorkEntries?.some((e: any) => e.description?.toLowerCase().includes(q));
    return matchDate || matchEntries;
  });

  // ── Block helpers ──────────────────────────────────────────────────────────
  const removeBlock = (id: string) =>
    setBlocks(prev => prev.filter(b => b.id !== id));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const valid = blocks.filter(b => b.description.trim());
    if (valid.length === 0) {
      toast({ title: 'Nothing to submit', description: 'Add at least one activity.', variant: 'destructive' });
      return;
    }
    for (const b of valid) {
      if (b.startHour >= b.endHour) {
        toast({ title: 'Invalid time', description: 'End time must be after start time.', variant: 'destructive' });
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.post('/daily-reports/other-work', {
        date: selectedDate, // Send selected date
        entries: valid.map(b => ({
          startHour: b.startHour,
          endHour: b.endHour,
          description: b.description,
        })),
      });
      fetchTodayLog(selectedDate); // Refresh data
      const hist = await api.get('/daily-reports/my-history');
      setHistoryEntries(hist.data);
      toast({ title: '✅ Submitted', description: 'Your work log has been saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = () => {
    setSubmitted(false);
    setBlocks(savedBlocks.length ? savedBlocks.map(b => ({ ...b, id: uid() })) : [emptyBlock()]);
  };

  // ── Drag Handlers ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!resizingBlockId) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    
    // 60px = 1 hour. Calculate the decimal hour the mouse is at.
    const draggedHourDecimal = Math.max(0, Math.min(24, y / 60));
    
    // Snap to 15-minute intervals (0.25)
    const snappedHour = Math.round(draggedHourDecimal * 4) / 4;
    
    const h = Math.floor(snappedHour);
    const m = Math.round((snappedHour % 1) * 60);
    const newEndHour = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // Ensure end time doesn't go backwards past start time
    setBlocks(prev => prev.map(b => {
      if (b.id === resizingBlockId && b.startHour < newEndHour) {
        return { ...b, endHour: newEndHour };
      }
      return b;
    }));
  };

  const handleMouseUp = () => {
    setResizingBlockId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto animate-fade-in">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-accent" /> Daily Reports
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Log your daily activities by time slot</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit mb-5 flex-wrap">
          {([
            { key: 'todo', label: '✅ To-Do' },
            { key: 'calendar', label: '📅 Calendar' },
            { key: 'log', label: '🕐 Log Work' },
            { key: 'payments', label: '💳 Payments' },
            { key: 'history', label: '📜 My History' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeTab === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════ TAB: LOG WORK ══════════ */}
        {activeTab === 'log' && (
          <div className="animate-fade-in space-y-3">
            {/* Date Picker + submitted badge */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 text-sm w-44 font-medium text-blue-700 bg-blue-50 border-blue-200"
                />
              </div>
              <div className="flex items-center gap-3">
                {submitted && (
                  <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-xs font-medium border border-green-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
                  </span>
                )}
                {!submitted && isToday && (
                  <Button onClick={handleSubmit} disabled={submitting} size="sm" className="gap-2">
                    <Send className="h-4 w-4" />
                    {submitting ? 'Submitting…' : 'Submit Work Log'}
                  </Button>
                )}
                {submitted && isToday && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Report
                  </Button>
                )}
              </div>
            </div>

            {!isToday && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl mb-4 text-sm flex items-center gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                You are viewing a past date. You can only add or edit logs for today.
              </div>
            )}

            {/* ── Google Calendar Style Day Grid ── */}
            <div 
              className={cn("bg-card rounded-xl border shadow-sm overflow-hidden", submitted && "opacity-80")}
            >
              <div 
                className="h-[600px] overflow-y-auto custom-scrollbar relative bg-white select-none"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp} 
              >
                <div className="flex">
                  {/* Time Axis (Left Side) */}
                  <div className="w-16 flex-shrink-0 border-r border-border/50 bg-muted/10 relative select-none">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="h-[60px] relative border-b border-border/20">
                        <span className="absolute -top-2.5 right-2 text-[10px] font-medium text-muted-foreground">
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Grid Area (Right Side) */}
                  <div 
                    className="flex-1 relative"
                    onClick={(e) => {
                      if (submitted || resizingBlockId || !isToday) return; // Prevent click when dragging or not today
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top + e.currentTarget.scrollTop;
                      
                      // Snap click to 30 min increments for new blocks
                      const clickedHour = Math.floor((y / 60) * 2) / 2;
                      const h1 = Math.floor(clickedHour);
                      const m1 = (clickedHour % 1) * 60;
                      
                      const h2 = Math.floor(clickedHour + 1);
                      const m2 = m1; // 1 hour block by default
                      
                      const start = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
                      const end = `${String(Math.min(h2, 24)).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
                      
                      const newBlock = { id: uid(), startHour: start, endHour: end, description: '' };
                      setEditingBlock(newBlock);
                      setIsModalOpen(true);
                    }}
                  >
                    {/* Horizontal Grid Lines */}
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="h-[60px] border-b border-border/20 w-full" />
                    ))}

                    {/* Rendered Time Blocks */}
                    {(submitted ? savedBlocks : blocks).filter(b => b.description?.trim() !== '').map((block: any) => {
                      const [startH, startM] = block.startHour.split(':').map(Number);
                      const [endH, endM] = block.endHour.split(':').map(Number);
                      const top = (startH + (startM || 0) / 60) * 60;
                      let height = ((endH + (endM || 0) / 60) - (startH + (startM || 0) / 60)) * 60;
                      if (height <= 0) height = 60;

                      return (
                        <div
                          key={block.id}
                          onClick={(e) => {
                            e.stopPropagation(); 
                            if (!submitted && !resizingBlockId && isToday) {
                              setEditingBlock(block);
                              setIsModalOpen(true);
                            }
                          }}
                          className={cn(
                            "absolute left-2 right-4 rounded-md p-2 overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-blue-400 bg-blue-50 border border-blue-200 border-l-4 border-l-blue-600 text-blue-900 shadow-sm flex flex-col group",
                            resizingBlockId === block.id && "ring-2 ring-blue-500 opacity-90 z-10"
                          )}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold truncate">
                              {block.startHour} - {block.endHour}
                            </span>
                          </div>
                          <p className="text-[11px] leading-tight mt-1 opacity-90 line-clamp-3 whitespace-pre-wrap flex-1">
                            {block.description || "No description (Click to edit)"}
                          </p>

                          {/* ⬇️ DRAG HANDLE FOR RESIZING ⬇️ */}
                          {!submitted && isToday && (
                            <div 
                              className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-blue-200/50 to-transparent"
                              onMouseDown={(e) => {
                                e.stopPropagation(); // Stop click from opening the edit modal
                                setResizingBlockId(block.id);
                              }}
                            >
                               <div className="w-8 h-1 bg-blue-400 rounded-full" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB: HISTORY ══════════ */}
        {activeTab === 'history' && (
          <div className="animate-fade-in space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search history…"
                className="pl-9 h-9 text-sm"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
            </div>

            {historyLoading ? (
              <div className="text-center py-16 text-sm text-muted-foreground">Loading…</div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No history yet.</div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((report: any) => (
                  <div key={report.id} className="card-premium overflow-hidden">
                    <div className="px-4 py-3 bg-muted/30 border-b border-border/50 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-accent" />
                      <span className="font-semibold text-sm">
                        {format(new Date(report.reportDate || report.createdAt), 'EEEE, dd MMM yyyy')}
                      </span>
                      {report.otherWorkEntries?.length > 0 && (
                        <span className="ml-auto text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">
                          {report.otherWorkEntries.length} block{report.otherWorkEntries.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {report.otherWorkEntries?.length > 0 ? (
                      <div className="divide-y divide-border/30">
                        {report.otherWorkEntries.map((b: any, i: number) => (
                          <div key={b.id || i} className="flex gap-4 px-4 py-3 hover:bg-muted/10 transition-colors">
                            <div className="flex-shrink-0 text-center w-16">
                              <span className="text-xs font-bold text-accent block">{b.startHour}</span>
                              <div className="my-0.5 h-4 w-px bg-border mx-auto" />
                              <span className="text-xs text-muted-foreground block">{b.endHour}</span>
                            </div>
                            <p className="flex-1 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed pt-0.5">
                              {b.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground italic text-center">No activity recorded.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════ TAB: CALENDAR ══════════ */}
        {activeTab === 'calendar' && (
          <ReportCalendar reports={groupedReports} loading={historyLoading} />
        )}

        {/* ══════════ TAB: TO-DO LIST ══════════ */}
        {activeTab === 'todo' && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-accent" /> To-Do Items from Pipeline
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Tasks assigned to you via pipeline card comments with due dates</p>
              </div>
              <div className="flex gap-2 items-center">
                <Select value={todoFilter} onValueChange={(v: any) => setTodoFilter(v)}>
                  <SelectTrigger className="h-8 text-xs w-36 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Active Tasks</SelectItem>
                    <SelectItem value="overdue">Overdue Only</SelectItem>
                    <SelectItem value="completed">Completed Tasks</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={fetchTodoItems} className="h-8 text-xs gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>
            </div>

            {todoLoading ? (
              <div className="text-center py-16 text-sm text-muted-foreground">Loading…</div>
            ) : todoItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">No tasks assigned yet</p>
                <p className="text-xs mt-1 opacity-70">Set a due date on a pipeline card comment to create tasks</p>
              </div>
            ) : (() => {
              let filteredTodos = todoItems;
              if (todoFilter === 'all') {
                filteredTodos = todoItems.filter(t => t.dueDateStatus !== 'completed');
              } else if (todoFilter === 'overdue') {
                filteredTodos = todoItems.filter(t => t.dueDateStatus === 'overdue');
              } else if (todoFilter === 'completed') {
                filteredTodos = todoItems.filter(t => t.dueDateStatus === 'completed');
              }
              const overdue = filteredTodos.filter(t => t.dueDateStatus === 'overdue');
              const today = filteredTodos.filter(t => t.dueDateStatus === 'today');
              const upcoming = filteredTodos.filter(t => t.dueDateStatus === 'upcoming');
              const completed = filteredTodos.filter(t => t.dueDateStatus === 'completed');

              const TodoGroup = ({ items, title, accent }: { items: any[]; title: string; accent: string }) =>
                items.length === 0 ? null : (
                  <div className="space-y-3">
                    <p className={`text-xs font-bold uppercase tracking-wide ${accent}`}>{title} ({items.length})</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((item: any) => (
                      <div key={item.id} className={cn(
                        'rounded-lg border p-3 flex flex-col gap-2 relative shadow-sm hover:shadow-md transition-shadow',
                        item.dueDateStatus === 'overdue' ? 'border-red-200 bg-red-50/40' :
                        item.dueDateStatus === 'today' ? 'border-orange-200 bg-orange-50/40' :
                        item.dueDateStatus === 'completed' ? 'border-green-200 bg-green-50/40 opacity-75' :
                        'border-blue-100 bg-blue-50/20',
                      )}>
                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                          <div className="flex items-center gap-2 truncate">
                            <p className="text-[13px] font-semibold truncate">{item.inquiry?.client_name}</p>
                            <span className="text-[9px] font-mono bg-background/50 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                              {item.inquiry?.inquiry_number}
                            </span>
                          </div>
                          <div className={cn(
                            'shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
                            item.dueDateStatus === 'overdue' ? 'bg-red-100 text-red-600 border-red-200' :
                            item.dueDateStatus === 'today' ? 'bg-orange-100 text-orange-600 border-orange-200' :
                            item.dueDateStatus === 'completed' ? 'bg-green-100 text-green-600 border-green-200' :
                            'bg-blue-100 text-blue-600 border-blue-200',
                          )}>
                            {item.dueDateStatus === 'completed' ? 'Completed' : format(new Date(item.dueDate), 'dd MMM')}
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <div className="flex-1 bg-background/60 rounded px-2 py-1.5 border border-border/40">
                            <div className="flex justify-between items-center mb-1">
                              <span className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded-full border font-medium',
                                item.type === 'stage' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                              )}>
                                {item.type === 'stage' ? '📌 Stage' : '💬 Comment'}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/90 line-clamp-2" title={item.content}>
                              {item.content}
                            </p>
                            
                            {/* Attachments */}
                            {(() => {
                              const attachments = item.attachmentUrls || (item.attachmentUrl ? [item.attachmentUrl] : []);
                              if (attachments.length === 0) return null;

                              return (
                                <div className="mt-1.5 flex gap-1.5">
                                  {attachments.slice(0, 3).map((url: string, idx: number) => (
                                    <a key={idx} href={getFileUrl(url)} target="_blank" rel="noopener noreferrer" className="group/img">
                                      <div className="h-8 w-8 rounded overflow-hidden border border-border bg-background">
                                        <img src={getFileUrl(url)} alt="Attachment" className="w-full h-full object-cover" />
                                      </div>
                                    </a>
                                  ))}
                                  {attachments.length > 3 && (
                                    <div className="h-8 w-8 rounded border border-border bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                                      +{attachments.length - 3}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          
                          {item.dueDateStatus !== 'completed' && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-xs px-2 shrink-0 hover:bg-green-50 hover:text-green-600 hover:border-green-200 bg-background"
                              onClick={() => handleCompleteTodo(item.id, item.type)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                            </Button>
                          )}
                        </div>

                        <div className="text-[10px] text-muted-foreground flex items-center justify-between px-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground/70">👤 {item.user?.name}</span>
                            <span className="opacity-50">•</span>
                            <span>{item.inquiry?.stage}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                );

              return (
                <div className="space-y-6">
                  {todoFilter === 'completed' ? (
                    <TodoGroup items={completed} title="✅ Completed" accent="text-green-600" />
                  ) : (
                    <>
                      <TodoGroup items={overdue} title="⚠️ Overdue" accent="text-red-500" />
                      <TodoGroup items={today} title="🔥 Due Today" accent="text-orange-500" />
                      <TodoGroup items={upcoming} title="📋 Upcoming" accent="text-blue-500" />
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

       {/* ══════════ TAB: PAYMENTS ══════════ */}
       {activeTab === 'payments' && (() => {
          const filteredPayments = pendingPayments.filter((payment: any) => {
            const matchesSearch = 
              payment.inquiry?.client_name?.toLowerCase().includes(paymentSearch.toLowerCase()) ||
              payment.inquiry?.inquiry_number?.toLowerCase().includes(paymentSearch.toLowerCase());
            const matchesStatus = paymentFilter === 'all' || payment.status === paymentFilter;
            return matchesSearch && matchesStatus;
          });

          return (
            <div className="animate-fade-in space-y-5">
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

      {/* ── Add / Edit Block Modal ── */}
      {isModalOpen && editingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-background w-full max-w-md rounded-xl shadow-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
              <h3 className="font-semibold text-sm">Edit Work Log</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Start Time</label>
                  <Select 
                    value={editingBlock.startHour} 
                    onValueChange={v => setEditingBlock({ ...editingBlock, startHour: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {HOUR_OPTIONS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span className="mt-5 text-muted-foreground">→</span>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">End Time</label>
                  <Select 
                    value={editingBlock.endHour} 
                    onValueChange={v => setEditingBlock({ ...editingBlock, endHour: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {HOUR_OPTIONS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">What did you do?</label>
                <Textarea
                  rows={4}
                  placeholder="E.g., Client meeting, server deployment, etc..."
                  value={editingBlock.description}
                  onChange={e => setEditingBlock({ ...editingBlock, description: e.target.value })}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-muted/30 border-t flex justify-between">
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => {
                  removeBlock(editingBlock.id);
                  setIsModalOpen(false);
                }}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    if (editingBlock.startHour >= editingBlock.endHour) {
                      toast({ title: 'Invalid time', description: 'End time must be after start.', variant: 'destructive' });
                      return;
                    }
                    if (!editingBlock.description.trim()) {
                      toast({ title: 'Missing description', description: 'Please enter what you did.', variant: 'destructive' });
                      return;
                    }

                    setBlocks(prev => {
                      const exists = prev.find(b => b.id === editingBlock.id);
                      if (exists) {
                        return prev.map(b => b.id === editingBlock.id ? editingBlock : b);
                      } else {
                        const filtered = prev.filter(b => b.description.trim() !== '');
                        return [...filtered, editingBlock];
                      }
                    });
                    
                    setIsModalOpen(false);
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default DailyReportPage;