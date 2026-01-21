import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  TrendingUp, 
  Calendar, 
  ShoppingCart, 
  ArrowRight, 
  MoreHorizontal,
  BookOpen
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface DashboardStats {
  totalInquiries: number;
  totalSelections: number;
  curtainsCount: number;
  blindsCount: number;
  rugsCount: number;
  thisMonthInquiries: number;
  pendingSelections: number;
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
    pendingSelections: 0,
  });
  const [recentInquiries, setRecentInquiries] = useState<any[]>([]);
  const [recentSelections, setRecentSelections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [inquiriesRes, selectionsRes, companiesRes] = await Promise.all([
          api.get('/inquiries'),
          api.get('/selections'),
          api.get('/companies')
        ]);

        const inquiries = inquiriesRes.data;
        const selections = selectionsRes.data;
        const companies = companiesRes.data;
        const thisMonth = format(new Date(), 'yyyy-MM');

        let curtains = 0;
        let blinds = 0;
        let rugs = 0;

        if (companies && Array.isArray(companies)) {
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

        const thisMonthInquiriesCount = inquiries?.filter((i: any) => 
          format(new Date(i.created_at), 'yyyy-MM') === thisMonth
        ).length || 0;
        
        const pendingSelectionsCount = selections?.filter((s: any) => 
          s.status === 'pending'
        ).length || 0;

        setStats({
          totalInquiries: inquiries?.length || 0,
          totalSelections: selections?.length || 0,
          curtainsCount: curtains,
          blindsCount: blinds,
          rugsCount: rugs,
          thisMonthInquiries: thisMonthInquiriesCount,
          pendingSelections: pendingSelectionsCount,
        });

        setRecentInquiries(inquiries?.slice(0, 5) || []);
        setRecentSelections(selections?.slice(0, 5) || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const statCards = [
    { title: 'Total Inquiries', value: stats.totalInquiries, icon: FileText, color: 'bg-primary', shadow: 'shadow-primary/20', link: '/inquiries' },
    { title: 'Total Selections', value: stats.totalSelections, icon: ShoppingCart, color: 'bg-success', shadow: 'shadow-success/20', link: '/selections' },
    { title: 'Pending Selections', value: stats.pendingSelections, icon: Calendar, color: 'bg-accent', shadow: 'shadow-accent/20', link: '/selections' },
    { title: 'This Month', value: stats.thisMonthInquiries, icon: TrendingUp, color: 'bg-foreground/80', shadow: 'shadow-foreground/20', link: '/inquiries' },
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
      <div className="animate-fade-in max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Welcome back, <span className="font-semibold text-foreground">{profile?.name?.split(' ')[0] || 'User'}</span>. Here's your daily overview.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-xs md:text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-border/50">
              {format(new Date(), 'EEEE, MMMM do, yyyy')}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {statCards.map((stat, index) => (
            <Link 
              to={stat.link} 
              key={stat.title}
              className="card-premium p-4 md:p-6 animate-fade-in group hover:-translate-y-1 transition-all duration-300 hover:shadow-lg border border-border/50 cursor-pointer"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl md:text-4xl font-bold text-foreground mt-2 tracking-tight">
                    {loading ? (
                      <span className="animate-pulse bg-muted h-8 w-12 block rounded"/>
                    ) : stat.value}
                  </p>
                </div>
                <div className={`${stat.color} ${stat.shadow} p-2 md:p-3 rounded-2xl shadow-lg transition-transform group-hover:scale-110`}>
                  <stat.icon className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Inquiries */}
          <div className="card-premium p-4 md:p-6 border border-border/50 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Recent Inquiries
              </h2>
              <Link to="/inquiries" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />)}
              </div>
            ) : recentInquiries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No inquiries found.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {recentInquiries.map((inquiry) => (
                  <Link
                    to={`/inquiries`}
                    key={inquiry.id}
                    className="group flex items-center justify-between p-3 md:p-4 rounded-xl bg-card hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <div className="flex-shrink-0 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shadow-sm">
                        {inquiry.client_name?.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{inquiry.client_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{inquiry.inquiry_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(inquiry.created_at), 'MMM d')}
                      </span>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden md:block" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Selections */}
          <div className="card-premium p-4 md:p-6 border border-border/50 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-success" />
                Recent Selections
              </h2>
              <Link to="/selections" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />)}
              </div>
            ) : recentSelections.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No selections found.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {recentSelections.map((selection) => (
                  <Link
                    to={`/selections/${selection.id}`}
                    key={selection.id}
                    className="group flex items-center justify-between p-3 md:p-4 rounded-xl bg-card hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <div className="flex-shrink-0 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full bg-success/10 text-success font-bold text-sm shadow-sm">
                        {selection.items?.length || 0}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{selection.inquiry?.client_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{selection.selection_number}</p>
                      </div>
                    </div>
                    <span className={`badge-category border px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium capitalize ${getStatusBadge(selection.status)}`}>
                      {selection.status?.replace('_', ' ')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Catalog Inventory Distribution */}
        <div className="card-premium p-4 md:p-6 border border-border/50">
          <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Catalog Inventory
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Curtains */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Curtains</span>
                <span className="text-muted-foreground">
                  {stats.curtainsCount} <span className="text-xs opacity-70">
                  ({totalCompanies ? Math.round((stats.curtainsCount / totalCompanies) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden ring-1 ring-border/20">
                <div
                  className="h-full bg-orange-500 transition-all duration-1000 ease-out rounded-r-full"
                  style={{ width: `${totalCompanies ? (stats.curtainsCount / totalCompanies) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Blinds */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Blinds</span>
                <span className="text-muted-foreground">
                  {stats.blindsCount} <span className="text-xs opacity-70">
                    ({totalCompanies ? Math.round((stats.blindsCount / totalCompanies) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden ring-1 ring-border/20">
                <div
                  className="h-full bg-blue-500 transition-all duration-1000 ease-out rounded-r-full"
                  style={{ width: `${totalCompanies ? (stats.blindsCount / totalCompanies) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Rugs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Rugs</span>
                <span className="text-muted-foreground">
                  {stats.rugsCount} <span className="text-xs opacity-70">
                    ({totalCompanies ? Math.round((stats.rugsCount / totalCompanies) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden ring-1 ring-border/20">
                <div
                  className="h-full bg-green-500 transition-all duration-1000 ease-out rounded-r-full"
                  style={{ width: `${totalCompanies ? (stats.rugsCount / totalCompanies) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;