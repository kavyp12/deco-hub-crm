import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Inquiry {
  id: string;
  inquiry_number: string;
  client_name: string;
  architect_id_name: string | null;
  mobile_number: string;
  inquiry_date: string;
  address: string;
  expected_final_date: string | null;
  product_category: 'drapes' | 'blinds' | 'rugs';
  created_at: string;
  profiles: { name: string } | null;
}

const ITEMS_PER_PAGE = 10;

const Inquiries: React.FC = () => {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchInquiries();
  }, [currentPage, categoryFilter]);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('inquiries')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('product_category', categoryFilter as 'drapes' | 'blinds' | 'rugs');
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Fetch sales person names
      const salesPersonIds = [...new Set(data?.map(d => d.sales_person_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', salesPersonIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.name]) || []);
      
      const inquiriesWithProfiles = data?.map(inquiry => ({
        ...inquiry,
        profiles: { name: profileMap.get(inquiry.sales_person_id) || '' }
      })) || [];

      setInquiries(inquiriesWithProfiles as Inquiry[]);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInquiries = inquiries.filter((inquiry) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inquiry.client_name.toLowerCase().includes(query) ||
      inquiry.inquiry_number.toLowerCase().includes(query) ||
      inquiry.mobile_number.includes(query) ||
      inquiry.address.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      drapes: 'bg-accent/10 text-accent border-accent/20',
      blinds: 'bg-primary/10 text-primary border-primary/20',
      rugs: 'bg-success/10 text-success border-success/20',
    };
    return styles[category] || 'bg-muted text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Inquiries</h1>
            <p className="text-muted-foreground mt-1">
              Manage and track all customer inquiries
            </p>
          </div>
          <Link to="/inquiries/new">
            <Button variant="accent" size="lg">
              <Plus className="h-5 w-5" />
              New Inquiry
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="card-premium p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client, inquiry number, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="drapes">Drapes</SelectItem>
                <SelectItem value="blinds">Blinds</SelectItem>
                <SelectItem value="rugs">Rugs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="card-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header text-left px-6 py-4">Inquiry #</th>
                  <th className="table-header text-left px-6 py-4">Client</th>
                  <th className="table-header text-left px-6 py-4">Category</th>
                  <th className="table-header text-left px-6 py-4">Sales Person</th>
                  <th className="table-header text-left px-6 py-4">Date</th>
                  <th className="table-header text-left px-6 py-4">Expected</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-5 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredInquiries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">No inquiries found</p>
                    </td>
                  </tr>
                ) : (
                  filteredInquiries.map((inquiry) => (
                    <tr
                      key={inquiry.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">
                          {inquiry.inquiry_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-foreground">{inquiry.client_name}</p>
                          <p className="text-sm text-muted-foreground">{inquiry.mobile_number}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`badge-category border ${getCategoryBadge(inquiry.product_category)}`}>
                          {inquiry.product_category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {inquiry.profiles?.name || '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(inquiry.inquiry_date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {inquiry.expected_final_date
                          ? format(new Date(inquiry.expected_final_date), 'MMM d, yyyy')
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} results
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Inquiries;
