import React, { useEffect, useState } from 'react';
import {
  FileText,
  TrendingUp,
  ShoppingCart,
  ArrowRight,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Activity,
  BarChart3,
  Users,
  Calculator,
  ClipboardList,
  UserCheck,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileBarChart,
  Building2,
  RefreshCw,
  Landmark,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format, subMonths } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  pending:     'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  confirmed:   'bg-blue-500/10   text-blue-600   border-blue-500/20',
  in_progress: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  completed:   'bg-green-500/10  text-green-600  border-green-500/20',
  cancelled:   'bg-red-500/10    text-red-600    border-red-500/20',
};

const badge = (status: string) =>
  `text-[10px] px-1.5 py-0.5 rounded border capitalize ${statusColor[status] ?? 'bg-muted text-muted-foreground'}`;

// ─── Component ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { profile, role } = useAuth();

  // ── Raw data ──
  const [inquiries,   setInquiries]   = useState<any[]>([]);
  const [selections,  setSelections]  = useState<any[]>([]);
  const [quotations,  setQuotations]  = useState<any[]>([]);
  const [companies,   setCompanies]   = useState<any[]>([]);
  const [architects,  setArchitects]  = useState<any[]>([]);
  const [calculations,setCalculations]= useState<any[]>([]);
  const [attendance,  setAttendance]  = useState<any>({ present:0, absent:0, late:0, avgHours:0 });
  const [loading,     setLoading]     = useState(true);

  const isAdmin = role === 'super_admin' || role === 'admin_hr';

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const calls: Promise<any>[] = [
          api.get('/inquiries'),
          api.get('/selections'),
          api.get('/quotations'),
          api.get('/companies'),
          api.get('/architects'),
          api.get('/calculations'),
        ];
        if (isAdmin) calls.push(api.get('/attendance/analytics'));

        const results = await Promise.allSettled(calls);

        const safe = (r: PromiseSettledResult<any>) =>
          r.status === 'fulfilled' ? (r.value.data ?? []) : [];

        setInquiries(safe(results[0]));
        setSelections(safe(results[1]));
        setQuotations(safe(results[2]));
        setCompanies(safe(results[3]));
        setArchitects(safe(results[4]));
        setCalculations(safe(results[5]));
        if (isAdmin && results[6]) {
          const att = safe(results[6]);
          if (!Array.isArray(att)) setAttendance(att);
        }
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [isAdmin]);

  // ─── Derived Stats ────────────────────────────────────────────────────────

  const now      = new Date();
  const thisMonth = format(now, 'yyyy-MM');
  const lastMonth = format(subMonths(now, 1), 'yyyy-MM');

  const thisMonthInq  = inquiries.filter(i => format(new Date(i.created_at), 'yyyy-MM') === thisMonth).length;
  const lastMonthInq  = inquiries.filter(i => format(new Date(i.created_at), 'yyyy-MM') === lastMonth).length;
  const inquiryTrend  = lastMonthInq > 0 ? Math.round(((thisMonthInq - lastMonthInq) / lastMonthInq) * 100) : (thisMonthInq > 0 ? 100 : 0);

  const pendingSelections  = selections.filter(s => s.status === 'pending').length;
  const completedSelections= selections.filter(s => s.status === 'completed').length;
  const conversionRate     = inquiries.length > 0 ? Math.round((selections.length / inquiries.length) * 100) : 0;

  const totalQuotations    = quotations.length;
  const thisMonthQuotes    = quotations.filter(q => format(new Date(q.created_at ?? q.createdAt ?? Date.now()), 'yyyy-MM') === thisMonth).length;

  // Catalog inventory
  let curtains = 0, blinds = 0, rugs = 0;
  companies.forEach((c: any) => {
    (c.catalogs ?? []).forEach((cat: any) => {
      const t = (cat.type || '').toLowerCase();
      if (t.includes('curtain')) curtains++;
      else if (t.includes('blind')) blinds++;
      else if (t.includes('rug')) rugs++;
    });
  });
  const totalCatalogs = curtains + blinds + rugs;

  // Monthly activity – last 6 months
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    const key = format(d, 'yyyy-MM');
    return {
      month:      format(d, 'MMM'),
      inquiries:  inquiries.filter(x => format(new Date(x.created_at), 'yyyy-MM') === key).length,
      selections: selections.filter(x => format(new Date(x.created_at), 'yyyy-MM') === key).length,
      quotations: quotations.filter(x => format(new Date((x.created_at ?? x.createdAt) || Date.now()), 'yyyy-MM') === key).length,
    };
  });

  // Selections by status
  const selByStatus = ['pending','confirmed','in_progress','completed','cancelled'].map(s => ({
    label: s.replace('_', ' '),
    count: selections.filter(x => x.status === s).length,
    color: s === 'completed' ? '#22c55e' : s === 'cancelled' ? '#ef4444' : s === 'in_progress' ? '#a855f7' : s === 'confirmed' ? '#3b82f6' : '#f59e0b',
  }));

const maxBar = Math.max(...last6Months.map(d => Math.max(d.inquiries, d.selections, d.quotations, 1))) * 1.25;
  // Recent items
  const recentInquiries  = [...inquiries].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  const recentSelections = [...selections].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  const recentQuotations = [...quotations].sort((a,b) => new Date((b.created_at??b.createdAt)||0).getTime() - new Date((a.created_at??a.createdAt)||0).getTime()).slice(0, 4);

  // ─── Stat Cards Config ────────────────────────────────────────────────────

  const statCards = [
    {
      title: 'Total Inquiries',
      value: inquiries.length,
      icon: FileText,
      colorClass: 'text-blue-500',
      bgClass: 'bg-blue-500/10',
      glowClass: 'bg-blue-500',
      link: '/inquiries',
      sub: `${thisMonthInq} this month`,
      trend: inquiryTrend,
    },
    {
      title: 'Total Selections',
      value: selections.length,
      icon: ShoppingCart,
      colorClass: 'text-amber-500',
      bgClass: 'bg-amber-500/10',
      glowClass: 'bg-amber-500',
      link: '/selections',
      sub: `${pendingSelections} pending`,
    },
    {
      title: 'Quotations',
      value: totalQuotations,
      icon: ClipboardList,
      colorClass: 'text-violet-500',
      bgClass: 'bg-violet-500/10',
      glowClass: 'bg-violet-500',
      link: '/quotations',
      sub: `${thisMonthQuotes} this month`,
    },
    {
      title: 'Conversion Rate',
      value: `${conversionRate}%`,
      icon: Activity,
      colorClass: 'text-emerald-500',
      bgClass: 'bg-emerald-500/10',
      glowClass: 'bg-emerald-500',
      link: '/selections',
      sub: 'Inquiry → Selection',
    },
    {
      title: 'Calculations',
      value: calculations.length,
      icon: Calculator,
      colorClass: 'text-cyan-500',
      bgClass: 'bg-cyan-500/10',
      glowClass: 'bg-cyan-500',
      link: '/calculations',
      sub: 'All records',
    },
    {
      title: 'Architects',
      value: architects.length,
      icon: Building2,
      colorClass: 'text-pink-500',
      bgClass: 'bg-pink-500/10',
      glowClass: 'bg-pink-500',
      link: '/architects',
      sub: 'Registered partners',
    },
    {
      title: 'Catalog Items',
      value: totalCatalogs,
      icon: BookOpen,
      colorClass: 'text-orange-500',
      bgClass: 'bg-orange-500/10',
      glowClass: 'bg-orange-500',
      link: '/catalogs',
      sub: `${companies.length} companies`,
    },
    {
      title: 'Completed Jobs',
      value: completedSelections,
      icon: CheckCircle2,
      colorClass: 'text-green-500',
      bgClass: 'bg-green-500/10',
      glowClass: 'bg-green-500',
      link: '/selections',
      sub: 'Selections done',
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-7xl mx-auto space-y-6 md:space-y-8 pb-12">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview for <span className="font-semibold text-foreground">{format(now, 'MMMM d, yyyy')}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/inquiries/new">
              <Button className="h-9 gap-2 shadow-sm"><Plus className="h-4 w-4" /> New Inquiry</Button>
            </Link>
            <Link to="/selections/new">
              <Button variant="outline" className="h-9 gap-2"><ShoppingCart className="h-4 w-4" /> New Selection</Button>
            </Link>
          </div>
        </div>

        {/* ── 8-Card Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((stat, idx) => (
            <Link
              key={stat.title}
              to={stat.link}
              className="card-premium p-4 md:p-5 animate-fade-in group hover:-translate-y-1 transition-all duration-300 hover:shadow-lg border border-border/50 relative overflow-hidden"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex justify-between items-start mb-3">
                <div className={`${stat.bgClass} p-2 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.colorClass}`} />
                </div>
                {stat.trend !== undefined && (
                  <span className={`flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${stat.trend >= 0 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                    {stat.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(stat.trend)}%
                  </span>
                )}
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold text-foreground">
                  {loading ? <span className="animate-pulse bg-muted h-6 w-12 inline-block rounded" /> : stat.value}
                </p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{stat.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
              </div>
              <div className={`absolute -right-4 -bottom-4 h-20 w-20 rounded-full ${stat.glowClass} opacity-5 blur-2xl group-hover:opacity-10 transition-opacity`} />
            </Link>
          ))}
        </div>

        {/* ── Main 2-column Grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* LEFT: Charts + Inquiries (2/3) */}
          <div className="xl:col-span-2 space-y-6">

            {/* Performance Chart – Inquiries / Selections / Quotations */}
            <div className="card-premium p-6 border border-border/50">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" /> Performance History
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Last 6 months — Inquiries · Selections · Quotations</p>
                </div>
                {/* Legend */}
                <div className="hidden sm:flex items-center gap-4 text-[10px] font-medium">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary inline-block" /> Inquiries</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Selections</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500 inline-block" /> Quotations</span>
                </div>
              </div>

              <div className="w-full overflow-x-auto pb-2">
                <div className="h-52 min-w-[420px] w-full flex items-end justify-between gap-1 md:gap-3 mt-6 pt-10">
                  {last6Months.map((d, i) => {
                    const inqH  = Math.max((d.inquiries  / maxBar) * 100, 4);
                    const selH  = Math.max((d.selections / maxBar) * 100, 4);
                    const quoH  = Math.max((d.quotations / maxBar) * 100, 4);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                        <div className="w-full flex justify-center gap-0.5 md:gap-1 items-end h-full">
                          {/* Inquiry Bar */}
                          <div style={{ height: `${inqH}%` }} className="w-3 md:w-5 bg-gradient-to-t from-primary to-primary/60 rounded-t-md transition-all duration-500 relative group/bar hover:scale-x-110">
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-popover text-[10px] font-bold py-1 px-2 rounded shadow-lg opacity-0 group-hover/bar:opacity-100 transition whitespace-nowrap border border-border z-20 pointer-events-none">
                              {d.inquiries} Inq.
                            </div>
                          </div>
                          {/* Selection Bar */}
                          <div style={{ height: `${selH}%` }} className="w-3 md:w-5 bg-gradient-to-t from-emerald-500 to-emerald-400/60 rounded-t-md transition-all duration-500 relative group/bar hover:scale-x-110">
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-popover text-[10px] font-bold py-1 px-2 rounded shadow-lg opacity-0 group-hover/bar:opacity-100 transition whitespace-nowrap border border-border z-20 pointer-events-none">
                              {d.selections} Sel.
                            </div>
                          </div>
                          {/* Quotation Bar */}
                          <div style={{ height: `${quoH}%` }} className="w-3 md:w-5 bg-gradient-to-t from-violet-500 to-violet-400/60 rounded-t-md transition-all duration-500 relative group/bar hover:scale-x-110">
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-popover text-[10px] font-bold py-1 px-2 rounded shadow-lg opacity-0 group-hover/bar:opacity-100 transition whitespace-nowrap border border-border z-20 pointer-events-none">
                              {d.quotations} Quo.
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-semibold">{d.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selections Status Breakdown */}
            <div className="card-premium p-6 border border-border/50">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-5">
                <Layers className="h-5 w-5 text-primary" /> Selection Status Breakdown
              </h2>
              <div className="space-y-3">
                {selByStatus.map(s => {
                  const pct = selections.length > 0 ? Math.round((s.count / selections.length) * 100) : 0;
                  return (
                    <div key={s.label} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="capitalize text-foreground">{s.label}</span>
                        <span className="text-muted-foreground">{s.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: s.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Inquiries */}
            <div className="card-premium p-0 border border-border/50 overflow-hidden">
              <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/20">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> Recent Inquiries
                </h2>
                <Link to="/inquiries"><Button variant="ghost" size="sm" className="text-xs h-7">View All</Button></Link>
              </div>
              {recentInquiries.length === 0 && !loading ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No inquiries yet.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {recentInquiries.map(inq => (
                    <div key={inq.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {inq.client_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{inq.client_name}</p>
                          <p className="text-xs text-muted-foreground">{inq.inquiry_number} · {format(new Date(inq.created_at), 'MMM d')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] hidden sm:block text-muted-foreground">{inq.location || 'Local'}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Quotations */}
            <div className="card-premium p-0 border border-border/50 overflow-hidden">
              <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/20">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-violet-500" /> Recent Quotations
                </h2>
                <Link to="/quotations"><Button variant="ghost" size="sm" className="text-xs h-7">View All</Button></Link>
              </div>
              {recentQuotations.length === 0 && !loading ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No quotations yet.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {recentQuotations.map(q => (
                    <Link key={q.id} to={`/quotations/${q.id}`} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group block">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 font-bold text-sm shrink-0">
                          {(q.clientName || q.client_name || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{q.clientName || q.client_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{q.quotation_number} · {q.created_at || q.createdAt ? format(new Date(q.created_at ?? q.createdAt), 'MMM d') : '—'}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: Sidebar (1/3) */}
          <div className="space-y-6">

            {/* Quick KPIs */}
            <div className="card-premium p-5 border border-border/50 space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> Key KPIs
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'This Month', value: thisMonthInq, icon: FileText, color: 'text-blue-500' },
                  { label: 'Pending',    value: pendingSelections, icon: Clock, color: 'text-amber-500' },
                  { label: 'Completed',  value: completedSelections, icon: CheckCircle2, color: 'text-green-500' },
                  { label: 'Conversion', value: `${conversionRate}%`, icon: Activity, color: 'text-emerald-500' },
                ].map(k => (
                  <div key={k.label} className="bg-muted/30 rounded-xl p-3 flex flex-col gap-1 border border-border/30">
                    <k.icon className={`h-4 w-4 ${k.color}`} />
                    <p className="text-base font-bold text-foreground">{loading ? '—' : k.value}</p>
                    <p className="text-[10px] text-muted-foreground">{k.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Catalog / Inventory Mix */}
            <div className="card-premium p-5 border border-border/50">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> Inventory Mix
              </h2>
              {/* Donut Ring */}
              <div className="flex justify-center mb-4">
                <div className="relative h-32 w-32">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-muted/30" />
                    {totalCatalogs > 0 && (
                      <>
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f97316" strokeWidth="12"
                          strokeDasharray={`${(curtains / totalCatalogs) * 239} 239`} strokeDashoffset="0" />
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#3b82f6" strokeWidth="12"
                          strokeDasharray={`${(blinds / totalCatalogs) * 239} 239`}
                          strokeDashoffset={`${-(curtains / totalCatalogs) * 239}`} />
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#22c55e" strokeWidth="12"
                          strokeDasharray={`${(rugs / totalCatalogs) * 239} 239`}
                          strokeDashoffset={`${-((curtains + blinds) / totalCatalogs) * 239}`} />
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{totalCatalogs}</span>
                    <span className="text-[9px] text-muted-foreground">Catalogs</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Curtains', count: curtains, color: 'bg-orange-500' },
                  { label: 'Blinds',   count: blinds,   color: 'bg-blue-500'   },
                  { label: 'Rugs',     count: rugs,     color: 'bg-green-500'  },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="font-medium text-foreground">{item.label}</span>
                    </div>
                    <span className="font-bold text-foreground">{loading ? '—' : item.count}</span>
                  </div>
                ))}
              </div>
              <Link to="/catalogs" className="mt-3 block text-center text-xs text-primary hover:underline">
                View All Catalogs →
              </Link>
            </div>

            {/* Attendance Analytics (Admin only) */}
            {isAdmin && (
              <div className="card-premium p-5 border border-border/50">
                <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" /> Today's Attendance
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Present',   value: attendance.present,  color: 'text-green-500',  bg: 'bg-green-500/10',  icon: Users },
                    { label: 'Absent',    value: attendance.absent,   color: 'text-red-500',    bg: 'bg-red-500/10',    icon: AlertCircle },
                    { label: 'Late',      value: attendance.late,     color: 'text-amber-500',  bg: 'bg-amber-500/10',  icon: Clock },
                    { label: 'Avg Hrs',   value: attendance.avgHours, color: 'text-blue-500',   bg: 'bg-blue-500/10',   icon: TrendingUp },
                  ].map(a => (
                    <div key={a.label} className={`${a.bg} rounded-xl p-3 flex flex-col gap-1`}>
                      <a.icon className={`h-4 w-4 ${a.color}`} />
                      <p className={`text-lg font-bold ${a.color}`}>{loading ? '—' : a.value}</p>
                      <p className="text-[10px] text-muted-foreground">{a.label}</p>
                    </div>
                  ))}
                </div>
                <Link to="/attendance" className="mt-3 block text-center text-xs text-primary hover:underline">
                  View Full Attendance →
                </Link>
              </div>
            )}

            {/* Architects Summary */}
            <div className="card-premium p-5 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-pink-500" /> Architects
                </h2>
                <Link to="/architects"><Button variant="ghost" size="sm" className="text-xs h-7">View All</Button></Link>
              </div>
              {architects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No architects registered.</p>
              ) : (
                <div className="space-y-2">
                  {architects.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500 font-bold text-xs shrink-0">
                        {(a.name || '?').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{a.company || a.email || '—'}</p>
                      </div>
                    </div>
                  ))}
                  {architects.length > 4 && (
                    <p className="text-[10px] text-center text-muted-foreground pt-1">+ {architects.length - 4} more</p>
                  )}
                </div>
              )}
            </div>

            {/* Latest Selections */}
            <div className="card-premium p-5 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-amber-500" /> Latest Selections
                </h2>
              </div>
              {recentSelections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No active selections.</p>
              ) : (
                <div className="space-y-3">
                  {recentSelections.map(sel => (
                    <Link
                      key={sel.id}
                      to={`/selections/${sel.id}`}
                      className="flex items-start gap-2 group"
                    >
                      <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${sel.status === 'pending' ? 'bg-amber-500' : sel.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} />
                      <div className="flex-1 min-w-0 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                            {sel.inquiry?.client_name || '—'}
                          </p>
                          <span className={badge(sel.status)}>{sel.status?.replace('_', ' ')}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{sel.selection_number}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <Link to="/selections" className="mt-3 block text-center text-xs text-primary hover:underline">
                View All Selections →
              </Link>
            </div>

            {/* Quick Links */}
            <div className="card-premium p-5 border border-border/50">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" /> Quick Links
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Pipeline',      to: '/pipeline',      icon: RefreshCw,    color: 'text-sky-500',    bg: 'bg-sky-500/10' },
                  { label: 'Calculations',  to: '/calculations',  icon: Calculator,   color: 'text-cyan-500',   bg: 'bg-cyan-500/10' },
                  { label: 'Measurements',  to: '/measurements',  icon: FileBarChart, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                  { label: 'Attendance',    to: '/attendance',    icon: UserCheck,    color: 'text-green-500',  bg: 'bg-green-500/10' },
                ].map(l => (
                  <Link
                    key={l.label}
                    to={l.to}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl ${l.bg} hover:opacity-80 transition-opacity border border-border/20`}
                  >
                    <l.icon className={`h-5 w-5 ${l.color}`} />
                    <span className="text-[10px] font-semibold text-foreground text-center">{l.label}</span>
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;