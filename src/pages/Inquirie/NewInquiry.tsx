// [FILE: src/pages/Inquiries/NewInquiry.tsx]
// REPLACE THE EXISTING FILE CONTENT WITH THIS:

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { z } from 'zod';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch'; // Ensure you have this or use a checkbox
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

// Updated Schema
const inquirySchema = z.object({
  client_name: z.string().min(2, 'Client name is required').max(100),
  mobile_number: z.string().min(10, 'Valid mobile number required').max(20),
  inquiry_date: z.string().min(1, 'Date is required'),
  address: z.string().min(5, 'Address is required').max(500),
  sales_person_id: z.string().min(1, 'Please select a sales person'),
  
  // Optional fields
  architect_id_name: z.string().optional(),
  architectId: z.string().optional(),
  
  expected_final_date: z.string().optional(),
  client_birth_date: z.string().optional(),
  client_anniversary_date: z.string().optional(),
});

interface SalesPerson { id: string; name: string; }
interface Architect { id: string; name: string; }

const NewInquiry: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [architects, setArchitects] = useState<Architect[]>([]); // New State
  const [useArchDb, setUseArchDb] = useState(true); // Toggle State
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    client_name: '',
    mobile_number: '',
    inquiry_date: new Date().toISOString().split('T')[0],
    address: '',
    sales_person_id: '',
    expected_final_date: '',
    
    // Architect Fields
    architect_id_name: '', // Manual string
    architectId: '',       // Database ID

    // New Client Dates
    client_birth_date: '',
    client_anniversary_date: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesRes, archRes] = await Promise.all([
           api.get('/users/sales-people'),
           api.get('/architects') // Fetch architects
        ]);
        
        setSalesPeople(salesRes.data);
        setArchitects(archRes.data);

        if (user?.id && !formData.sales_person_id) {
           const isSales = salesRes.data.some((p: SalesPerson) => p.id === user.id);
           if (isSales) setFormData(prev => ({ ...prev, sales_person_id: user.id }));
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    fetchData();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // If using DB, clear manual name. If Manual, clear DB ID.
    const finalData = { ...formData };
    if (useArchDb) {
        finalData.architect_id_name = ''; 
    } else {
        finalData.architectId = '';
    }

    try {
      const result = inquirySchema.safeParse(finalData);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
        });
        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      const { data } = await api.post('/inquiries', finalData);
      toast({ title: 'Inquiry Created', description: `Inquiry ${data.inquiry_number} created.` });
      navigate('/inquiries');
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl animate-fade-in">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold">New Inquiry</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* CLIENT INFO */}
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold mb-4">Client Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client Name *</Label>
                <Input name="client_name" value={formData.client_name} onChange={handleChange} className={errors.client_name ? 'border-destructive' : ''} />
                {errors.client_name && <p className="text-sm text-destructive">{errors.client_name}</p>}
              </div>

              <div className="space-y-2">
                <Label>Mobile Number *</Label>
                <Input name="mobile_number" value={formData.mobile_number} onChange={handleChange} className={errors.mobile_number ? 'border-destructive' : ''} />
                {errors.mobile_number && <p className="text-sm text-destructive">{errors.mobile_number}</p>}
              </div>

              <div className="space-y-2">
                <Label>Client Birth Date</Label>
                <Input type="date" name="client_birth_date" value={formData.client_birth_date} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label>Client Anniversary Date</Label>
                <Input type="date" name="client_anniversary_date" value={formData.client_anniversary_date} onChange={handleChange} />
              </div>
              
              <div className="md:col-span-2 space-y-2">
                <Label>Address *</Label>
                <Textarea name="address" rows={2} value={formData.address} onChange={handleChange} className={errors.address ? 'border-destructive' : ''} />
              </div>
            </div>
          </div>

          {/* ARCHITECT INFO (TOGGLE) */}
          <div className="card-premium p-6">
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Architect / Designer</h2>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{useArchDb ? 'Select Existing' : 'Enter Manually'}</span>
                    <Switch checked={useArchDb} onCheckedChange={setUseArchDb} />
                </div>
             </div>

             {useArchDb ? (
                <div className="space-y-2">
                    <Label>Select Architect</Label>
                    <Select value={formData.architectId} onValueChange={(val) => setFormData(p => ({...p, architectId: val}))}>
                        <SelectTrigger><SelectValue placeholder="Choose from database..." /></SelectTrigger>
                        <SelectContent>
                            {architects.map(arch => (
                                <SelectItem key={arch.id} value={arch.id}>{arch.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
             ) : (
                <div className="space-y-2">
                    <Label>Architect Name (Manual)</Label>
                    <Input name="architect_id_name" placeholder="Type Name..." value={formData.architect_id_name} onChange={handleChange} />
                </div>
             )}
          </div>

          {/* INQUIRY DETAILS */}
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold mb-4">Inquiry Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sales Person *</Label>
                <Select value={formData.sales_person_id} onValueChange={(val) => setFormData(p => ({...p, sales_person_id: val}))}>
                  <SelectTrigger className={errors.sales_person_id ? 'border-destructive' : ''}><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{salesPeople.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                 <Label>Inquiry Date</Label>
                 <Input type="date" name="inquiry_date" value={formData.inquiry_date} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label>Expected Final Date</Label>
                <Input type="date" name="expected_final_date" value={formData.expected_final_date} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={loading}><Save className="mr-2 h-4 w-4" /> Create Inquiry</Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default NewInquiry;