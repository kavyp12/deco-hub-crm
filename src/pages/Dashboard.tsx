import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  TrendingUp, 
  Calendar, 
  ShoppingCart, 
  ArrowRight, 
  MoreHorizontal,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Activity,
  BarChart3,
  PieChart
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format, subMonths, isSameMonth, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface DashboardStats {
  totalInquiries: number;
  totalSelections: number;
  curtainsCount: number;
  blindsCount: number;
  rugsCount: number;
  thisMonthInquiries: number;
  lastMonthInquiries: number;
  pendingSelections: number;
  conversionRate: number;
}

interface MonthlyData {
  month: string;
  inquiries: number;
  selections: number;
}

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInquiries: 0,
    totalSelections: 0,
    curtainsCount: 0,
    blindsCount: 0,
    rugsCount: 0,
    thisMonthInquiries: 0,
    lastMonthInquiries: 0,
    pendingSelections: 0,
    conversionRate: 0,
  });
  const [recentInquiries, setRecentInquiries] = useState<any[]>([]);
  const [recentSelections, setRecentSelections] = useState<any[]>([]);
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [inquiriesRes, selectionsRes, companiesRes] = await Promise.all([
          api.get('/inquiries'),
          api.get('/selections'),
          api.get('/companies')
        ]);

        const inquiries = inquiriesRes.data || [];
        const selections = selectionsRes.data || [];
        const companies = companiesRes.data || [];
        
        const now = new Date();
        const thisMonth = format(now, 'yyyy-MM');
        const lastMonth = format(subMonths(now, 1), 'yyyy-MM');

        // --- Calculate Inventory ---
        let curtains = 0;
        let blinds = 0;
        let rugs = 0;

        if (Array.isArray(companies)) {
          companies.forEach((comp: any) => {
            if (comp.catalogs && Array.isArray(comp.catalogs)) {
              const hasCurtains = comp.catalogs.some((cat: any) => (cat.type || '').toLowerCase().includes('curtain'));
              const hasBlinds = comp.catalogs.some((cat: any) => (cat.type || '').toLowerCase().includes('blind'));
              const hasRugs = comp.catalogs.some((cat: any) => (cat.type || '').toLowerCase().includes('rug'));
              if (hasCurtains) curtains++;
              if (hasBlinds) blinds++;
              if (hasRugs) rugs++;
            }
          });
        }

        // --- Calculate Stats ---
        const thisMonthInquiriesCount = inquiries.filter((i: any) => 
          format(new Date(i.created_at), 'yyyy-MM') === thisMonth
        ).length;

        const lastMonthInquiriesCount = inquiries.filter((i: any) => 
          format(new Date(i.created_at), 'yyyy-MM') === lastMonth
        ).length;
        
        const pendingSelectionsCount = selections.filter((s: any) => 
          s.status === 'pending'
        ).length;

        const conversionRate = inquiries.length > 0 
          ? Math.round((selections.length / inquiries.length) * 100) 
          : 0;

        // --- Calculate Monthly History (Last 6 Months) ---
        const last6Months = Array.from({ length: 6 }, (_, i) => {
          const d = subMonths(now, 5 - i);
          const monthKey = format(d, 'yyyy-MM');
          const monthLabel = format(d, 'MMM');
          
          const montlyInq = inquiries.filter((item: any) => format(new Date(item.created_at), 'yyyy-MM') === monthKey).length;
          const montlySel = selections.filter((item: any) => format(new Date(item.created_at), 'yyyy-MM') === monthKey).length;
          
          return { month: monthLabel, inquiries: montlyInq, selections: montlySel };
        });

        setStats({
          totalInquiries: inquiries.length,
          totalSelections: selections.length,
          curtainsCount: curtains,
          blindsCount: blinds,
          rugsCount: rugs,
          thisMonthInquiries: thisMonthInquiriesCount,
          lastMonthInquiries: lastMonthInquiriesCount,
          pendingSelections: pendingSelectionsCount,
          conversionRate,
        });

        setMonthlyActivity(last6Months);
        setRecentInquiries(inquiries.slice(0, 5));
        setRecentSelections(selections.slice(0, 5));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Calculate trends
  const inquiryTrend = stats.lastMonthInquiries > 0 
    ? Math.round(((stats.thisMonthInquiries - stats.lastMonthInquiries) / stats.lastMonthInquiries) * 100)
    : 100;

  const statCards = [
    { 
      title: 'Total Inquiries', 
      value: stats.totalInquiries, 
      icon: FileText, 
      color: 'bg-blue-500', 
      shadow: 'shadow-blue-500/20', 
      link: '/inquiries',
      subtext: 'Lifetime Volume'
    },
    { 
      title: 'This Month', 
      value: stats.thisMonthInquiries, 
      icon: TrendingUp, 
      color: 'bg-indigo-500', 
      shadow: 'shadow-indigo-500/20', 
      link: '/inquiries',
      trend: inquiryTrend,
      subtext: 'vs last month'
    },
    { 
      title: 'Active Selections', 
      value: stats.pendingSelections, 
      icon: ShoppingCart, 
      color: 'bg-amber-500', 
      shadow: 'shadow-amber-500/20', 
      link: '/selections',
      subtext: 'Requires Attention'
    },
    { 
      title: 'Conversion Rate', 
      value: `${stats.conversionRate}%`, 
      icon: Activity, 
      color: 'bg-emerald-500', 
      shadow: 'shadow-emerald-500/20', 
      link: '/selections',
      subtext: 'Inquiry to Selection'
    },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      confirmed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      in_progress: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      completed: 'bg-green-500/10 text-green-600 border-green-500/20',
      cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const totalCompanies = stats.curtainsCount + stats.blindsCount + stats.rugsCount;

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-7xl mx-auto space-y-6 md:space-y-8 pb-10">
        
        {/* Header & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview for <span className="font-semibold text-foreground">{format(new Date(), 'MMMM d, yyyy')}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/inquiries/new">
              <Button className="h-9 gap-2 shadow-sm">
                <Plus className="h-4 w-4" /> New Inquiry
              </Button>
            </Link>
            <Link to="/selections/new">
              <Button variant="outline" className="h-9 gap-2">
                <ShoppingCart className="h-4 w-4" /> New Selection
              </Button>
            </Link>
          </div>
        </div>

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <Link 
              to={stat.link} 
              key={stat.title}
              className="card-premium p-5 animate-fade-in group hover:-translate-y-1 transition-all duration-300 hover:shadow-lg border border-border/50 relative overflow-hidden"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`${stat.color}/10 p-2.5 rounded-xl`}>
                  <stat.icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
                {stat.trend !== undefined && (
                  <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trend >= 0 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                    {stat.trend >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                    {Math.abs(stat.trend)}%
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  {loading ? <span className="animate-pulse bg-muted h-8 w-16 block rounded"/> : stat.value}
                </h3>
                <p className="text-sm text-muted-foreground font-medium mt-1">{stat.title}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{stat.subtext}</p>
              </div>
              {/* Decorative background element */}
              <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${stat.color} opacity-5 blur-2xl group-hover:opacity-10 transition-opacity`} />
            </Link>
          ))}
        </div>

        {/* Main Content Grid: Analytics + Feeds */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Left Column: Charts & Inquiries (2/3 width) */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Performance Chart */}
            <div className="card-premium p-6 border border-border/50">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Performance History
                  </h2>
                  <p className="text-sm text-muted-foreground">Inquiries vs Selections (Last 6 Months)</p>
                </div>
              </div>
              
              <div className="h-64 w-full flex items-end justify-between gap-2 md:gap-4 mt-4">
                {monthlyActivity.map((data, idx) => {
                  const maxVal = Math.max(...monthlyActivity.map(d => Math.max(d.inquiries, d.selections, 10))); // Scale
                  const inqHeight = (data.inquiries / maxVal) * 100;
                  const selHeight = (data.selections / maxVal) * 100;
                  
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group cursor-pointer">
                      <div className="w-full flex justify-center gap-1 md:gap-2 items-end h-full">
                        {/* Inquiry Bar */}
                        <div 
                          style={{ height: `${Math.max(inqHeight, 5)}%` }} 
                          className="w-3 md:w-6 bg-primary/80 rounded-t-sm transition-all duration-500 hover:bg-primary relative group/bar"
                        >
                           <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs py-1 px-2 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap shadow-md border pointer-events-none">
                              {data.inquiries} Inquiries
                           </div>
                        </div>
                        {/* Selection Bar */}
                        <div 
                          style={{ height: `${Math.max(selHeight, 5)}%` }} 
                          className="w-3 md:w-6 bg-success/80 rounded-t-sm transition-all duration-500 hover:bg-success relative group/bar"
                        >
                           <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs py-1 px-2 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap shadow-md border pointer-events-none">
                              {data.selections} Selections
                           </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">{data.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Inquiries Table (Detailed) */}
            <div className="card-premium p-0 border border-border/50 overflow-hidden">
              <div className="p-5 border-b border-border/50 flex justify-between items-center bg-muted/20">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Recent Inquiries
                </h2>
                <Link to="/inquiries">
                  <Button variant="ghost" size="sm" className="text-xs h-8">View All</Button>
                </Link>
              </div>
              <div className="p-0">
                {recentInquiries.length === 0 && !loading ? (
                  <div className="p-8 text-center text-muted-foreground">No recent inquiries.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {recentInquiries.map((inquiry) => (
                      <div key={inquiry.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {inquiry.client_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{inquiry.client_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                              {inquiry.inquiry_number}
                              <span className="w-1 h-1 rounded-full bg-border" />
                              {format(new Date(inquiry.created_at), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-foreground">{inquiry.location || 'Local'}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{inquiry.source || 'Direct'}</p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Inventory & Status (1/3 width) */}
          <div className="space-y-6">
            
            {/* Catalog Distribution (Visual Update) */}
            <div className="card-premium p-6 border border-border/50">
              <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Inventory Mix
              </h2>
              
              <div className="space-y-6 relative">
                 {/* Donut Chart Simulation with CSS Conic Gradient */}
                 <div className="flex justify-center mb-6">
                    <div className="relative h-40 w-40 rounded-full border-8 border-muted/30 flex items-center justify-center">
                        <div className="text-center">
                          <span className="block text-2xl font-bold text-foreground">{totalCompanies}</span>
                          <span className="text-xs text-muted-foreground">Catalogs</span>
                        </div>
                         {/* Simple visual indicator rings */}
                         <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-orange-500 opacity-20" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-blue-500" strokeDasharray={`${(stats.blindsCount / totalCompanies) * 251} 251`} />
                         </svg>
                    </div>
                 </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="font-medium">Curtains</span>
                    </div>
                    <span className="font-bold">{stats.curtainsCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="font-medium">Blinds</span>
                    </div>
                    <span className="font-bold">{stats.blindsCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="font-medium">Rugs</span>
                    </div>
                    <span className="font-bold">{stats.rugsCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Selections (Mini List) */}
            <div className="card-premium p-6 border border-border/50 flex flex-col h-fit">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-success" />
                  Latest Selections
                </h2>
              </div>
              <div className="space-y-4">
                {recentSelections.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No active selections.</p>
                ) : (
                  recentSelections.map((selection) => (
                    <Link
                      to={`/selections/${selection.id}`}
                      key={selection.id}
                      className="block"
                    >
                      <div className="flex items-start gap-3 group">
                        <div className={`mt-1 h-2 w-2 rounded-full ${selection.status === 'pending' ? 'bg-amber-500' : 'bg-success'}`} />
                        <div className="flex-1 space-y-1 pb-4 border-b border-border/40 group-last:border-0 group-last:pb-0">
                          <div className="flex justify-between">
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              {selection.inquiry?.client_name}
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(selection.created_at), 'MMM d')}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-muted-foreground">
                              {selection.selection_number}
                            </p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${getStatusBadge(selection.status)}`}>
                              {selection.status?.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <Link to="/selections" className="mt-4 pt-2 text-center text-xs text-primary hover:underline">
                View All Selections
              </Link>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;