import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ruler, ArrowRight, Search, Plus, Calendar, User } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const MeasurementsList: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInquiryId, setSelectedInquiryId] = useState('');

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        const { data } = await api.get('/inquiries');
        setInquiries(data);
      } catch (error) {
        console.error('Error fetching inquiries:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInquiries();
  }, []);

  const filteredInquiries = inquiries.filter((inquiry) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inquiry.client_name?.toLowerCase().includes(query) ||
      inquiry.inquiry_number?.toLowerCase().includes(query)
    );
  });

  const handleNewMeasurement = () => {
    if (!selectedInquiryId) {
      toast({ title: 'Select Inquiry', description: 'Please select an inquiry', variant: 'destructive' });
      return;
    }
    navigate(`/measurements/new/${selectedInquiryId}`);
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Measurements</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Select an inquiry to start measuring</p>
          </div>
          <Button variant="accent" size="lg" onClick={() => setIsDialogOpen(true)} className="w-full md:w-auto gap-2 shadow-md">
            <Plus className="h-5 w-5" /> New Measurement
          </Button>
        </div>

        {/* Search */}
        <div className="card-premium p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search Client or Inquiry Number..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-10" 
            />
          </div>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden space-y-4">
          {loading ? (
             <div className="text-center p-8">Loading...</div>
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
                         <h3 className="font-bold text-lg mt-1 text-foreground">{inquiry.client_name}</h3>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 text-sm text-muted-foreground border-b border-border/50 pb-3">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(inquiry.inquiry_date), 'dd MMM yyyy')}
                   </div>
                   <Link to={`/measurements/${inquiry.id}`} className="w-full">
                      <Button variant="outline" className="w-full gap-2">
                        <Ruler className="h-4 w-4" /> Open Sheet
                      </Button>
                   </Link>
                </div>
             ))
          )}
        </div>

        {/* DESKTOP TABLE VIEW (>= md) */}
        <div className="hidden md:block card-premium overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-4 font-medium text-muted-foreground">Inquiry #</th>
                <th className="text-left px-6 py-4 font-medium text-muted-foreground">Client Name</th>
                <th className="text-left px-6 py-4 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-6 py-4 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center">Loading...</td></tr>
              ) : filteredInquiries.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No inquiries found.</td></tr>
              ) : (
                filteredInquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{inquiry.inquiry_number}</td>
                    <td className="px-6 py-4">{inquiry.client_name}</td>
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      {format(new Date(inquiry.inquiry_date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/measurements/${inquiry.id}`}>
                        <Button size="sm" variant="default" className="gap-2 shadow-sm">
                          <Ruler className="h-4 w-4" /> Open Sheet <ArrowRight className="h-3 w-3 opacity-50" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Measurement</DialogTitle>
              <DialogDescription>Select an inquiry to create a measurement form</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Inquiry</label>
                <Select value={selectedInquiryId} onValueChange={setSelectedInquiryId}>
                  <SelectTrigger><SelectValue placeholder="Choose an inquiry..." /></SelectTrigger>
                  <SelectContent>
                    {inquiries.map((inq) => (
                      <SelectItem key={inq.id} value={inq.id}>{inq.inquiry_number} - {inq.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button variant="accent" onClick={handleNewMeasurement} disabled={!selectedInquiryId}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default MeasurementsList;