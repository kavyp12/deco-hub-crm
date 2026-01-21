import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { z } from 'zod';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

const inquirySchema = z.object({
  client_name: z.string().min(2, 'Client name is required').max(100),
  architect_id_name: z.string().max(100).optional(),
  mobile_number: z.string().min(10, 'Valid mobile number required').max(20),
  inquiry_date: z.string().min(1, 'Date is required'),
  address: z.string().min(5, 'Address is required').max(500),
  sales_person_id: z.string().min(1, 'Please select a sales person'),
  expected_final_date: z.string().optional(),
});

interface SalesPerson {
  id: string;
  name: string;
}

const NewInquiry: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    client_name: '',
    architect_id_name: '',
    mobile_number: '',
    inquiry_date: new Date().toISOString().split('T')[0],
    address: '',
    sales_person_id: '',
    expected_final_date: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: salesData } = await api.get('/users/sales-people');
        setSalesPeople(salesData);

        if (user?.id && !formData.sales_person_id) {
           const isSales = salesData.some((p: SalesPerson) => p.id === user.id);
           if (isSales) {
             setFormData(prev => ({ ...prev, sales_person_id: user.id }));
           }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };

    fetchData();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const result = inquirySchema.safeParse(formData);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
        });
        setErrors(fieldErrors);
        setLoading(false);
        window.scrollTo(0,0);
        return;
      }

      const { data } = await api.post('/inquiries', formData);

      toast({
        title: 'Inquiry Created',
        description: `Inquiry ${data.inquiry_number} created successfully.`,
      });

      navigate('/inquiries');
    } catch (error: any) {
      console.error('Error creating inquiry:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create inquiry.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl animate-fade-in">
        <div className="flex items-center gap-4 mb-6 md:mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">New Inquiry</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Create a new customer inquiry</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
          <div className="card-premium p-4 md:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 md:mb-6">Client Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="space-y-2">
                <Label htmlFor="client_name">Client Name *</Label>
                <Input id="client_name" name="client_name" placeholder="Enter client name" value={formData.client_name} onChange={handleChange} className={errors.client_name ? 'border-destructive' : ''} />
                {errors.client_name && <p className="text-sm text-destructive">{errors.client_name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="architect_id_name">Architect / ID Name</Label>
                <Input id="architect_id_name" name="architect_id_name" placeholder="Enter architect name" value={formData.architect_id_name} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile_number">Mobile Number *</Label>
                <Input id="mobile_number" name="mobile_number" type="tel" placeholder="Mobile Number" value={formData.mobile_number} onChange={handleChange} className={errors.mobile_number ? 'border-destructive' : ''} />
                {errors.mobile_number && <p className="text-sm text-destructive">{errors.mobile_number}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="inquiry_date">Inquiry Date *</Label>
                <Input id="inquiry_date" name="inquiry_date" type="date" value={formData.inquiry_date} onChange={handleChange} className={errors.inquiry_date ? 'border-destructive' : ''} />
                {errors.inquiry_date && <p className="text-sm text-destructive">{errors.inquiry_date}</p>}
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Textarea id="address" name="address" placeholder="Full address" rows={3} value={formData.address} onChange={handleChange} className={errors.address ? 'border-destructive' : ''} />
                {errors.address && <p className="text-sm text-destructive">{errors.address}</p>}
              </div>
            </div>
          </div>

          <div className="card-premium p-4 md:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 md:mb-6">Inquiry Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              
              <div className="space-y-2">
                <Label>Sales Person *</Label>
                <Select value={formData.sales_person_id} onValueChange={(value) => handleSelectChange('sales_person_id', value)}>
                  <SelectTrigger className={errors.sales_person_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select sales person" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesPeople.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.sales_person_id && <p className="text-sm text-destructive">{errors.sales_person_id}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expected_final_date">Expected Final Date</Label>
                <Input id="expected_final_date" name="expected_final_date" type="date" value={formData.expected_final_date} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full md:w-auto">
              <Save className="h-5 w-5 mr-2" />
              {loading ? 'Creating...' : 'Create Inquiry'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default NewInquiry;