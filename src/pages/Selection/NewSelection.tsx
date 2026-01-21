import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

const NewSelection: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState('');
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');

  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  
  // Catalog & Type State
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [selectedCatalogType, setSelectedCatalogType] = useState<string>(''); // Stores 'Curtains', 'Rugs', etc.

  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: 1, price: 0, areaName: '' });
  const [items, setItems] = useState<any[]>([]);

  // 1. Fetch Inquiries and Companies
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [inquiriesRes, companiesRes] = await Promise.all([
          api.get('/inquiries'),
          api.get('/companies')
        ]);
        setInquiries(inquiriesRes.data);
        setCompanies(companiesRes.data);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    fetchData();
  }, []);

  // 2. Handle Company Change
  useEffect(() => {
    if (selectedCompanyId) {
      const comp = companies.find(c => c.id === selectedCompanyId);
      setCatalogs(comp ? comp.catalogs : []);
      // Reset downstream selections
      setSelectedCatalogId('');
      setSelectedCatalogType('');
      setProducts([]);
      setSelectedProduct(null);
    }
  }, [selectedCompanyId, companies]);

  // 3. Handle Catalog Change (Fetch Products & Set Type)
  useEffect(() => {
    if (selectedCatalogId) {
      // Find the catalog object to get its type
      const catalog = catalogs.find(c => c.id === selectedCatalogId);
      if (catalog) {
        setSelectedCatalogType(catalog.type || 'Generic'); // Set the type (Curtains/Rugs/etc)
      }

      // Fetch products for this catalog
      api.get(`/catalogs/${selectedCatalogId}/products`).then(({ data }) => {
        setProducts(data);
      });
    } else {
      setProducts([]);
      setSelectedCatalogType('');
    }
  }, [selectedCatalogId, catalogs]);

  // 4. Handle Inquiry Change
  useEffect(() => {
    if (selectedInquiryId) {
      const inq = inquiries.find(i => i.id === selectedInquiryId);
      setSelectedInquiry(inq);
    } else {
      setSelectedInquiry(null);
    }
  }, [selectedInquiryId, inquiries]);

  const handleProductSelect = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setSelectedProduct(prod);
      const priceValue = typeof prod.price === 'string' 
        ? parseFloat(prod.price.replace(/,/g, '')) 
        : prod.price;
      
      setCurrentItem(prev => ({ ...prev, productId: prod.id, quantity: 1, price: priceValue }));
    }
  };

  const handleAddItem = () => {
    if (!selectedProduct) return;
    if (!currentItem.areaName.trim()) {
      toast({ title: 'Error', description: 'Please enter Area Name', variant: 'destructive' });
      return;
    }

    const catalog = catalogs.find(c => c.id === selectedCatalogId);
    
    setItems([...items, {
      id: selectedProduct.id,
      name: selectedProduct.name,
      catalogName: catalog?.name || '',
      catalogType: selectedCatalogType, // Store the type with the item for reference
      areaName: currentItem.areaName,
      attributes: selectedProduct.attributes,
      quantity: currentItem.quantity,
      price: currentItem.price,
      total: currentItem.quantity * currentItem.price
    }]);

    // Reset current item input but keep Company/Catalog selected for faster entry
    setSelectedProduct(null);
    setCurrentItem(prev => ({ ...prev, productId: '', quantity: 1, price: 0 })); 
    // Kept areaName? Usually users might want to add multiple items to same area, 
    // but if not, uncomment next line:
    // setCurrentItem({ productId: '', quantity: 1, price: 0, areaName: '' });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiryId) {
      toast({ title: 'Error', description: 'Please select an inquiry', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Error', description: 'Please add at least one product', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        inquiryId: selectedInquiryId,
        delivery_date: deliveryDate || null,
        notes,
        status,
        items
      };
      const { data } = await api.post('/selections', payload);
      toast({ title: 'Selection Created', description: `Selection ${data.selection_number} created.` });
      navigate('/selections');
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Helper for badge color
  const getTypeBadgeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'curtains': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'rugs': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'blinds': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl animate-fade-in pb-20">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">New Selection</h1>
            <p className="text-muted-foreground mt-1">Create a selection from an existing inquiry</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Inquiry Selection Section */}
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Select Inquiry</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Inquiry *</Label>
                <Select value={selectedInquiryId} onValueChange={setSelectedInquiryId}>
                  <SelectTrigger><SelectValue placeholder="Select an inquiry" /></SelectTrigger>
                  <SelectContent>
                    {inquiries.map((inq) => (
                      <SelectItem key={inq.id} value={inq.id}>{inq.inquiry_number} - {inq.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedInquiry && (
                <div className="md:col-span-2 p-4 bg-muted/30 rounded-lg">
                  <h3 className="font-semibold mb-2">Inquiry Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Client:</span> <span className="font-medium">{selectedInquiry.client_name}</span></div>
                    <div><span className="text-muted-foreground">Address:</span> <span className="font-medium">{selectedInquiry.address}</span></div>
                    <div><span className="text-muted-foreground">Mobile:</span> <span className="font-medium">{selectedInquiry.mobile_number}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Product Selection Section */}
           <div className="card-premium p-6 border-2 border-primary/10">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
              <Plus className="h-5 w-5 text-accent" /> Add Products
            </h2>
            
            <div className="bg-muted/30 p-4 rounded-lg space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 
                 {/* 1. Company Select */}
                 <div className="space-y-2">
                   <Label>Company</Label>
                   <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                     <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                     <SelectContent>
                       {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>

                 {/* 2. Collection/Catalog Select with Type Badge */}
                 <div className="space-y-2">
                   <div className="flex justify-between items-center">
                     <Label>Collection</Label>
                     {selectedCatalogType && (
                       <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getTypeBadgeColor(selectedCatalogType)}`}>
                         Type: {selectedCatalogType}
                       </span>
                     )}
                   </div>
                   <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId} disabled={!selectedCompanyId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select" />
                     </SelectTrigger>
                     <SelectContent>
                       {catalogs.map(c => (
                         <SelectItem key={c.id} value={c.id}>
                           {c.name} <span className="text-muted-foreground opacity-70">({c.type || 'Generic'})</span>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>

                 {/* 3. Product Select */}
                 <div className="space-y-2">
                   <Label>Product</Label>
                   <Select value={currentItem.productId} onValueChange={handleProductSelect} disabled={!selectedCatalogId}>
                     <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                     <SelectContent>
                       {products.map(p => (
                         <SelectItem key={p.id} value={p.id}>{p.name} - ₹{p.price}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               </div>

               {selectedProduct && (
                 <div className="mt-4 p-4 bg-background border border-border rounded-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="space-y-1 flex-1 w-full">
                        <Label>Area Name *</Label>
                        <Input 
                          placeholder="e.g. Living Room" 
                          value={currentItem.areaName} 
                          onChange={(e) => setCurrentItem({...currentItem, areaName: e.target.value})} 
                        />
                      </div>
                      <div className="space-y-1 w-full md:w-32">
                        <Label>Price</Label>
                        <Input 
                          type="number" 
                          value={currentItem.price} 
                          onChange={(e) => setCurrentItem({...currentItem, price: parseFloat(e.target.value)})} 
                        />
                      </div>
                      <div className="space-y-1 w-full md:w-24">
                        <Label>Qty</Label>
                        <Input 
                          type="number" 
                          value={currentItem.quantity} 
                          onChange={(e) => setCurrentItem({...currentItem, quantity: parseFloat(e.target.value)})} 
                        />
                      </div>
                      <Button type="button" onClick={handleAddItem} variant="accent" className="w-full md:w-auto">
                        Add Item
                      </Button>
                    </div>
                 </div>
               )}
            </div>

            {/* Added Items List */}
             {items.length > 0 && (
              <div className="mt-6 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left py-2 px-4">Area</th>
                      <th className="text-left py-2 px-4">Catalog / Type</th>
                      <th className="text-left py-2 px-4">Product</th>
                      <th className="text-center py-2 px-4">Qty</th>
                      <th className="text-right py-2 px-4">Price</th>
                      <th className="text-right py-2 px-4">Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2 px-4 font-medium">{item.areaName}</td>
                        <td className="py-2 px-4">
                          {item.catalogName}
                          {item.catalogType && (
                            <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded border">
                              {item.catalogType}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4">{item.name}</td>
                        <td className="py-2 px-4 text-center">{item.quantity}</td>
                        <td className="py-2 px-4 text-right">₹{item.price}</td>
                        <td className="py-2 px-4 text-right font-medium">₹{item.total}</td>
                        <td className="py-2 px-4 text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive hover:bg-destructive/10" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
           </div>

           {/* Final Submission Buttons */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" variant="accent" size="lg" disabled={loading}>
              {loading ? 'Creating...' : 'Create Selection'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default NewSelection;