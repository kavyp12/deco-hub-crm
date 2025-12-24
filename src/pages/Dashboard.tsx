import React, { useEffect, useState } from 'react';
import { FileText, Users, TrendingUp, Calendar } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface DashboardStats {
  totalInquiries: number;
  drapesCount: number;
  blindsCount: number;
  rugsCount: number;
  thisMonthInquiries: number;
}

const Dashboard: React.FC = () => {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInquiries: 0,
    drapesCount: 0,
    blindsCount: 0,
    rugsCount: 0,
    thisMonthInquiries: 0,
  });
  const [recentInquiries, setRecentInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch all inquiries for stats
        const { data: inquiries, error } = await supabase
          .from('inquiries')
          .select('*, profiles!inquiries_sales_person_id_fkey(name)')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const now = new Date();
        const thisMonth = format(now, 'yyyy-MM');

        const drapesCount = inquiries?.filter(i => i.product_category === 'drapes').length || 0;
        const blindsCount = inquiries?.filter(i => i.product_category === 'blinds').length || 0;
        const rugsCount = inquiries?.filter(i => i.product_category === 'rugs').length || 0;
        const thisMonthInquiries = inquiries?.filter(i => 
          format(new Date(i.created_at), 'yyyy-MM') === thisMonth
        ).length || 0;

        setStats({
          totalInquiries: inquiries?.length || 0,
          drapesCount,
          blindsCount,
          rugsCount,
          thisMonthInquiries,
        });

        setRecentInquiries(inquiries?.slice(0, 5) || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const statCards = [
    {
      title: 'Total Inquiries',
      value: stats.totalInquiries,
      icon: FileText,
      color: 'bg-primary',
    },
    {
      title: 'This Month',
      value: stats.thisMonthInquiries,
      icon: Calendar,
      color: 'bg-accent',
    },
    {
      title: 'Drapes',
      value: stats.drapesCount,
      icon: TrendingUp,
      color: 'bg-foreground/80',
    },
    {
      title: 'Blinds',
      value: stats.blindsCount,
      icon: TrendingUp,
      color: 'bg-foreground/60',
    },
  ];

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      drapes: 'bg-accent/10 text-accent',
      blinds: 'bg-primary/10 text-primary',
      rugs: 'bg-success/10 text-success',
    };
    return styles[category] || 'bg-muted text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back, {profile?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your inquiries today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div
              key={stat.title}
              className="card-premium p-6 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {loading ? '—' : stat.value}
                  </p>
                </div>
                <div className={`${stat.color} p-3 rounded-xl`}>
                  <stat.icon className="h-6 w-6 text-primary-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Category Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 card-premium p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Inquiries</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentInquiries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No inquiries yet. Create your first inquiry!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentInquiries.map((inquiry) => (
                  <div
                    key={inquiry.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-sm">
                        {inquiry.inquiry_number?.slice(-3)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{inquiry.client_name}</p>
                        <p className="text-sm text-muted-foreground">{inquiry.inquiry_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`badge-category ${getCategoryBadge(inquiry.product_category)}`}>
                        {inquiry.product_category}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(inquiry.created_at), 'MMM d')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Categories</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Drapes</span>
                <span className="font-semibold text-foreground">{stats.drapesCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{
                    width: `${stats.totalInquiries ? (stats.drapesCount / stats.totalInquiries) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">Blinds</span>
                <span className="font-semibold text-foreground">{stats.blindsCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{
                    width: `${stats.totalInquiries ? (stats.blindsCount / stats.totalInquiries) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">Rugs</span>
                <span className="font-semibold text-foreground">{stats.rugsCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-success transition-all duration-500"
                  style={{
                    width: `${stats.totalInquiries ? (stats.rugsCount / stats.totalInquiries) * 100 : 0}%`,
                  }}
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
