// [FILE: src/pages/reports/ReportCalendar.tsx]
// Reusable calendar component for daily report views.
// Shows week-row layout with activity chips inside each date cell.

import React, { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isToday, getWeek, startOfWeek,
  parseISO,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Status colours (same as parent pages) ──────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKey(dateStrOrObj: string): string {
  const s = typeof dateStrOrObj === 'string' ? dateStrOrObj : '';
  return format(parseISO(s.includes('T') ? s : s + 'T00:00:00'), 'yyyy-MM-dd');
}

/**
 * Splits an array of days into week rows (Mon..Sun arrays).
 * Pads first/last rows with nulls so columns always align.
 */
function buildWeekRows(days: Date[]): Array<Array<Date | null>> {
  const weeks: Array<Array<Date | null>> = [];
  // pad front
  const firstDow = (days[0].getDay() + 6) % 7; // 0=Mon
  let week: Array<Date | null> = Array(firstDow).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  // pad last row
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReportCalendarProps {
  /** Raw grouped report objects: { reportDate, createdAt, entries[], otherWork } */
  reports: any[];
  loading?: boolean;
  /** Optional label shown when a user name is relevant (admin view) */
  showUserName?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const ReportCalendar: React.FC<ReportCalendarProps> = ({ reports, loading, showUserName }) => {
  const [month, setMonth]               = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build lookup maps from grouped report array
  const { activeDates, reportByDate } = useMemo(() => {
    const activeDates  = new Set<string>();
    const reportByDate = new Map<string, any>();
    reports.forEach((report: any) => {
      const d = report.reportDate || report.createdAt;
      if (!d) return;
      const key = toKey(d);
      const hasActivity =
        (report.entries?.length > 0) ||
        (report.otherWork && report.otherWork.trim().length > 0);
      if (hasActivity) activeDates.add(key);
      reportByDate.set(key, report);
    });
    return { activeDates, reportByDate };
  }, [reports]);

  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const weekRows   = buildWeekRows(days);

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const selectedReport   = selectedDate ? reportByDate.get(selectedDate) : null;

  return (
    <div className="animate-fade-in space-y-4">

      {/* ── Calendar Card ── */}
      <div className="card-premium overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
          <button
            onClick={() => setMonth(subMonths(month, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-sm sm:text-base">{format(month, 'MMMM yyyy')}</h2>
            <div className="flex items-center justify-center gap-3 mt-1 text-[10px] sm:text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-300 border border-red-500 inline-block" />
                Activity logged
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" />
                Today
              </span>
            </div>
          </div>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            Loading calendar…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse">
              <thead>
                <tr>
                  {/* Week-number column */}
                  <th className="w-8 sm:w-10 bg-muted/30 text-center text-[10px] font-semibold text-muted-foreground/60 py-2 border-b border-r border-border/40">
                    Wk
                  </th>
                  {DAY_LABELS.map(d => (
                    <th
                      key={d}
                      className="text-center text-[11px] sm:text-xs font-semibold text-muted-foreground py-2 border-b border-border/40 px-1"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekRows.map((week, wi) => {
                  // Get week number from first non-null day in row
                  const firstDay = week.find(Boolean) as Date;
                  const weekNum  = firstDay ? getWeek(firstDay, { weekStartsOn: 1 }) : '';
                  return (
                    <tr key={wi} className="group">
                      {/* Week number */}
                      <td className="bg-muted/20 text-center text-[10px] font-semibold text-muted-foreground/50 border-r border-border/40 border-b border-border/20 py-1">
                        {weekNum}
                      </td>

                      {week.map((day, di) => {
                        if (!day) {
                          return (
                            <td
                              key={di}
                              className="border-b border-r border-border/20 bg-muted/10"
                            />
                          );
                        }
                        const key       = format(day, 'yyyy-MM-dd');
                        const isActive  = activeDates.has(key);
                        const todayDay  = isToday(day);
                        const isSelected = selectedDate === key;
                        const report    = reportByDate.get(key);
                        const entries   = report?.entries || [];
                        const hasOther  = report?.otherWork && report.otherWork.trim().length > 0;

                        return (
                          <td
                            key={key}
                            className={cn(
                              'border-b border-r border-border/20 align-top cursor-pointer transition-colors',
                              'min-w-[48px] sm:min-w-[72px]',
                              isActive
                                ? 'bg-red-50 hover:bg-red-100'
                                : todayDay
                                  ? 'bg-accent/8 hover:bg-accent/15'
                                  : 'hover:bg-muted/30',
                              isSelected && 'ring-inset ring-2 ring-accent'
                            )}
                            onClick={() => setSelectedDate(isSelected ? null : key)}
                          >
                            <div className="p-1 sm:p-1.5">
                              {/* Date number */}
                              <div className="flex items-center justify-between mb-0.5">
                                <span className={cn(
                                  'text-[11px] sm:text-xs font-bold leading-none',
                                  isActive   ? 'text-red-700' :
                                  todayDay   ? 'text-white'   : 'text-foreground'
                                )}>
                                  {todayDay ? (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold">
                                      {format(day, 'd')}
                                    </span>
                                  ) : format(day, 'd')}
                                </span>
                              </div>

                              {/* Entry chips - visible on sm+ or collapse to dot on mobile */}
                              {isActive && (
                                <div className="space-y-0.5 mt-0.5">
                                  {/* Show up to 2 inquiry chips */}
                                  {entries.slice(0, 2).map((e: any, ei: number) => (
                                    <div
                                      key={ei}
                                      className="hidden sm:block text-[9px] bg-red-400 text-white rounded px-1 py-0.5 font-medium truncate leading-tight"
                                    >
                                      {e.inquiry?.inquiry_number || e.inquiry?.client_name || 'Inquiry'}
                                    </div>
                                  ))}
                                  {/* Mobile: just dot indicator */}
                                  <div className="sm:hidden flex gap-0.5 flex-wrap">
                                    {entries.slice(0, 3).map((_: any, ei: number) => (
                                      <span key={ei} className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                    ))}
                                  </div>
                                  {entries.length > 2 && (
                                    <div className="hidden sm:block text-[9px] text-red-600 font-semibold px-1">
                                      +{entries.length - 2} more
                                    </div>
                                  )}
                                  {hasOther && (
                                    <div className="hidden sm:block text-[9px] bg-orange-300 text-orange-900 rounded px-1 py-0.5 font-medium truncate leading-tight">
                                      + Other work
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Selected day detail panel ── */}
      {selectedDate && (
        <div className="card-premium overflow-hidden animate-fade-in">
          {selectedReport ? (
            <>
              {/* Panel header */}
              <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-2 flex-wrap">
                <CalendarDays className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="font-bold text-sm text-red-700 dark:text-red-400">
                  {format(parseISO(selectedDate), 'EEEE, dd MMM yyyy')}
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {selectedReport.entries?.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                      {selectedReport.entries.length} {selectedReport.entries.length === 1 ? 'inquiry' : 'inquiries'}
                    </span>
                  )}
                  {selectedReport.otherWork?.trim() && (
                    <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                      + Other work
                    </span>
                  )}
                  {showUserName && selectedReport.user && (
                    <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">
                      {selectedReport.user.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Inquiry entries */}
              {selectedReport.entries?.map((entry: any) => {
                const label = STATUSES.find(s => s.value === entry.status)?.label || entry.status;
                return (
                  <div
                    key={entry.id}
                    className="p-4 border-b border-border/40 flex flex-col sm:flex-row gap-3 sm:items-start hover:bg-muted/10 transition-colors"
                  >
                    <div className="sm:w-56 flex-shrink-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {entry.inquiry?.inquiry_number}
                        </span>
                        <span className="text-sm font-semibold truncate">{entry.inquiry?.client_name}</span>
                      </div>
                      <span className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border font-medium inline-block',
                        STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border'
                      )}>
                        {label}
                      </span>
                      {showUserName && entry.dailyReport?.user && (
                        <span className="text-xs text-muted-foreground block">by {entry.dailyReport.user.name}</span>
                      )}
                    </div>
                    <p className="flex-1 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-lg px-3 py-2.5">
                      {entry.workDone}
                    </p>
                  </div>
                );
              })}

              {/* Other work */}
              {selectedReport.otherWork && selectedReport.otherWork.trim().length > 0 && (
                <div className="p-4 bg-muted/10">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Other Work / General Activities
                  </p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-lg px-3 py-2.5">
                    {selectedReport.otherWork}
                  </p>
                </div>
              )}

              {(!selectedReport.entries || selectedReport.entries.length === 0) &&
               (!selectedReport.otherWork || !selectedReport.otherWork.trim()) && (
                <div className="p-6 text-center text-sm text-muted-foreground italic">
                  No activity recorded for this day.
                </div>
              )}
            </>
          ) : (
            /* Date selected but no report */
            <div className="p-8 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-25" />
              <p className="text-sm font-medium">
                No report for {format(parseISO(selectedDate), 'dd MMM yyyy')}
              </p>
              <p className="text-xs mt-1 opacity-60">No daily report was submitted on this date.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportCalendar;
