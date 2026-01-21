import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, Phone, Calendar, User } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface Inquiry {
  id: string;
  inquiry_number: string;
  client_name: string;
  architect_id_name: string | null;
  mobile_number: string;
  inquiry_date: string;
  address: string;
  expected_final_date: string | null;
  sales_person_id: string;
  created_at: string;
  profiles: { name: string } | null;
  selections: any[];
}

const ITEMS_PER_PAGE = 10;

const Inquiries: React.FC = () => {
  const { toast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [salesPeople, setSalesPeople] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  
  const [editForm, setEditForm] = useState({
      client_name: '',
      architect_id_name: '',
      mobile_number: '',
      inquiry_date: '',
      address: '',
      sales_person_id: '',
      expected_final_date: '',
  });

  useEffect(() => {
    fetchData();
  }, [currentPage]);

  const fetchData = async () => {
    setLoading(true);
    try {
        const { data: allInquiries } = await api.get('/inquiries');
        const { data: people } = await api.get('/users/sales-people');
        setSalesPeople(people);

        const filtered = allInquiries; 
        setTotalCount(filtered.length);

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE;
        const paginatedData = filtered.slice(from, to);

        setInquiries(paginatedData);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        setLoading(false);
    }
  };

  const handleEditOpen = (inquiry: Inquiry) => {
      setSelectedInquiry(inquiry);
      setEditForm({
          client_name: inquiry.client_name,
          architect_id_name: inquiry.architect_id_name || '',
          mobile_number: inquiry.mobile_number,
          inquiry_date: new Date(inquiry.inquiry_date).toISOString().split('T')[0],
          address: inquiry.address,
          sales_person_id: inquiry.sales_person_id,
          expected_final_date: inquiry.expected_final_date ? new Date(inquiry.expected_final_date).toISOString().split('T')[0] : '',
      });
      setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedInquiry) return;
      setFormLoading(true);
      try {
          await api.put(`/inquiries/${selectedInquiry.id}`, editForm);
          toast({ title: 'Success', description: 'Inquiry updated.' });
          setIsEditOpen(false);
          fetchData();
      } catch (err: any) {
          toast({ title: 'Error', description: err.response?.data?.error || 'Failed', variant: 'destructive' });
      } finally {
          setFormLoading(false);
      }
  };

  const handleDeleteOpen = (inquiry: Inquiry) => {
      setSelectedInquiry(inquiry);
      setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
      if (!selectedInquiry) return;
      setFormLoading(true);
      try {
          await api.delete(`/inquiries/${selectedInquiry.id}`);
          toast({ title: 'Deleted', description: 'Inquiry removed.' });
          setIsDeleteOpen(false);
          fetchData();
      } catch (err: any) {
          toast({ title: 'Error', description: err.response?.data?.error || 'Failed', variant: 'destructive' });
      } finally {
          setFormLoading(false);
      }
  };

  const filteredInquiries = inquiries.filter((inquiry) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inquiry.client_name.toLowerCase().includes(query) ||
      inquiry.inquiry_number.toLowerCase().includes(query) ||
      inquiry.mobile_number.includes(query)
    );
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Responsive Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Inquiries</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Track customer inquiries</p>
          </div>
          <Link to="/inquiries/new" className="w-full md:w-auto">
            <Button variant="accent" size="lg" className="w-full md:w-auto"><Plus className="h-5 w-5 mr-2" /> New Inquiry</Button>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="card-premium p-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search client, number, or mobile..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-10" 
            />
          </div>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden space-y-4 mb-6">
          {loading ? (
             Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-premium p-4 h-32 animate-pulse bg-muted/20" />
             ))
          ) : filteredInquiries.length === 0 ? (
             <div className="text-center p-8 text-muted-foreground bg-muted/20 rounded-lg">No inquiries found.</div>
          ) : (
            filteredInquiries.map((inquiry) => (
              <div key={inquiry.id} className="card-premium p-4 flex flex-col gap-3">
                 <div className="flex justify-between items-start">
                    <div>
                       <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                         {inquiry.inquiry_number}
                       </span>
                       <h3 className="font-bold text-lg mt-1">{inquiry.client_name}</h3>
                    </div>
                    <div className="flex gap-1">
                       <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditOpen(inquiry)}>
                         <Pencil className="h-4 w-4 text-muted-foreground" />
                       </Button>
                       <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteOpen(inquiry)}>
                         <Trash2 className="h-4 w-4 text-destructive" />
                       </Button>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                       <Phone className="h-3 w-3" /> {inquiry.mobile_number}
                    </div>
                    <div className="flex items-center gap-2">
                       <User className="h-3 w-3" /> {inquiry.profiles?.name || '—'}
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                       <Calendar className="h-3 w-3" /> {format(new Date(inquiry.inquiry_date), 'MMM d, yyyy')}
                    </div>
                 </div>

                 {inquiry.selections?.length > 0 && (
                   <div className="mt-1 pt-2 border-t text-xs font-medium text-primary">
                      {inquiry.selections.length} Selection(s) Created
                   </div>
                 )}
              </div>
            ))
          )}
        </div>

        {/* DESKTOP TABLE VIEW (>= md) */}
        <div className="hidden md:block card-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header text-left px-6 py-4">Inquiry #</th>
                  <th className="table-header text-left px-6 py-4">Client</th>
                  <th className="table-header text-left px-6 py-4">Sales Person</th>
                  <th className="table-header text-left px-6 py-4">Date</th>
                  <th className="table-header text-left px-6 py-4">Selections</th>
                  <th className="table-header text-left px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-6 py-4"><div className="h-5 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : filteredInquiries.map((inquiry) => (
                    <tr key={inquiry.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4"><span className="font-medium">{inquiry.inquiry_number}</span></td>
                      <td className="px-6 py-4">
                        <div><p className="font-medium">{inquiry.client_name}</p><p className="text-sm text-muted-foreground">{inquiry.mobile_number}</p></div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{inquiry.profiles?.name || '—'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(inquiry.inquiry_date), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-primary">{inquiry.selections?.length || 0}</span>
                      </td>
                      <td className="px-6 py-4">
                          <div className="flex gap-2">
                             <Button variant="ghost" size="icon" onClick={() => handleEditOpen(inquiry)}><Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" /></Button>
                             <Button variant="ghost" size="icon" onClick={() => handleDeleteOpen(inquiry)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></Button>
                          </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Pagination (Common) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 md:px-6 py-4 mt-4 bg-card rounded-lg border border-border">
            <p className="text-xs md:text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* Edit Dialog - Responsive */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
           <DialogContent className="max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Inquiry</DialogTitle></DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                 <div className="col-span-1 space-y-2"><Label>Client Name</Label><Input value={editForm.client_name} onChange={e => setEditForm({...editForm, client_name: e.target.value})} /></div>
                 <div className="col-span-1 space-y-2"><Label>Mobile</Label><Input value={editForm.mobile_number} onChange={e => setEditForm({...editForm, mobile_number: e.target.value})} /></div>
                 <div className="col-span-1 space-y-2"><Label>Architect/ID</Label><Input value={editForm.architect_id_name} onChange={e => setEditForm({...editForm, architect_id_name: e.target.value})} /></div>
                 <div className="col-span-1 space-y-2"><Label>Inquiry Date</Label><Input type="date" value={editForm.inquiry_date} onChange={e => setEditForm({...editForm, inquiry_date: e.target.value})} /></div>
                 <div className="col-span-1 space-y-2"><Label>Expected Date</Label><Input type="date" value={editForm.expected_final_date} onChange={e => setEditForm({...editForm, expected_final_date: e.target.value})} /></div>
                 <div className="col-span-1 space-y-2"><Label>Sales Person</Label>
                    <Select value={editForm.sales_person_id} onValueChange={v => setEditForm({...editForm, sales_person_id: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{salesPeople.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                 </div>
                 <div className="col-span-1 md:col-span-2 space-y-2"><Label>Address</Label><Textarea value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} /></div>
                 <div className="col-span-1 md:col-span-2 flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                    <Button type="submit" variant="accent" disabled={formLoading}>Save Changes</Button>
                 </div>
              </form>
           </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
           <DialogContent className="max-w-[90vw] md:max-w-md">
              <DialogHeader><DialogTitle>Delete Inquiry</DialogTitle></DialogHeader>
              <DialogDescription>Are you sure you want to delete this inquiry? This cannot be undone.</DialogDescription>
              <DialogFooter className="gap-2 sm:gap-0">
                 <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                 <Button variant="destructive" onClick={handleDelete} disabled={formLoading}>Delete</Button>
              </DialogFooter>
           </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Inquiries;