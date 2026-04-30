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
import { processProductsForDropdown } from '@/lib/utils';

const COMMON_AREAS = [
  "Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom",
  "Guest Bedroom", "Parents Bedroom", "Dining Room", "Kitchen",
  "Study Room", "Home Office", "Balcony", "Verandah",
  "Puja Room", "Staircase", "Lobby", "Entrance",
  "Bathroom", "Store Room", "Servant Room", "Utility Area"
];


interface SelectionItem {
  id?: string;
  productId: string;
  name: string;
  catalogName?: string;
  catalogType?: string;
  srlNo: string;
  quantity: number;
  price: number;
  total: number;
  areaName?: string;
}

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

  const [selectedProductKey, setSelectedProductKey] = useState<string>('');

  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: 1, price: 0, areaName: '' });
  const [items, setItems] = useState<any[]>([]);

  // ADD these 2 new states after line: const [selectedProductKey, setSelectedProductKey] = useState<string>('');
  const [selectedDesignName, setSelectedDesignName] = useState<string>('');  // ✅ Step 1: chosen design
  const [availableSrls, setAvailableSrls] = useState<any[]>([]);             // ✅ Step 2: SRL options for that design

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

  useEffect(() => {
    if (selectedCompanyId) {
      const comp = companies.find(c => c.id === selectedCompanyId);
      setCatalogs(comp ? comp.catalogs : []);
      setSelectedCatalogId('');
      setSelectedCatalogType('');
      setProducts([]);
      setSelectedProduct(null);
      setSelectedDesignName('');   // ✅ NEW
      setAvailableSrls([]);        // ✅ NEW
      setSelectedProductKey('');   // ✅ NEW
    }
  }, [selectedCompanyId, companies]);

  // 3. Handle Catalog Change (Fetch Products & Set Type)
  useEffect(() => {
    if (selectedCatalogId) {
      const catalog = catalogs.find(c => c.id === selectedCatalogId);
      if (catalog) {
        setSelectedCatalogType(catalog.type || 'Generic');
      }
      api.get(`/catalogs/${selectedCatalogId}/products`).then(({ data }) => {
        setProducts(data);
      });
      setSelectedDesignName('');   // ✅ NEW
      setAvailableSrls([]);        // ✅ NEW
      setSelectedProductKey('');   // ✅ NEW
      setSelectedProduct(null);
    } else {
      setProducts([]);
      setSelectedCatalogType('');
      setSelectedDesignName('');   // ✅ NEW
      setAvailableSrls([]);        // ✅ NEW
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

  // ✅ UPDATED: Step 2 — pick specific SRL from the design's SRL list
  const handleProductSelect = (uniqueKey: string) => {
    const prod = availableSrls.find(p => p.uniqueKey === uniqueKey);
    if (prod) {
      setSelectedProductKey(uniqueKey);
      setSelectedProduct(prod);
      const price = typeof prod.price === 'number'
        ? prod.price
        : parseFloat(String(prod.price).replace(/,/g, '')) || 0;
      setCurrentItem(prev => ({ ...prev, productId: prod.originalId, quantity: 1, price }));
    }
  };

  const handleAddItem = () => {
    if (!selectedDesignName) {
      toast({ title: "Error", description: "Please select a design.", variant: "destructive" });
      return;
    }
    if (!selectedProductKey) {
      toast({ title: "Error", description: "Please select an SRL number.", variant: "destructive" });
      return;
    }
    if (!currentItem.areaName) {
      toast({ title: "Error", description: "Please enter an Area Name.", variant: "destructive" });
      return;
    }

    const selectedVariant = availableSrls.find(p => p.uniqueKey === selectedProductKey);
    const catalog = catalogs.find(c => c.id === selectedCatalogId);

    if (!selectedVariant) return;

    const newItem: SelectionItem = {
      productId: selectedVariant.originalId,
      name: selectedVariant.name,
      catalogName: catalog?.name || '',
      catalogType: selectedCatalogType,
      srlNo: selectedVariant.srlNo,
      areaName: currentItem.areaName,
      quantity: currentItem.quantity,
      price: currentItem.price,
      total: currentItem.price * currentItem.quantity
    };

    setItems([...items, newItem]);

    // ✅ Reset all product selection states
    setSelectedDesignName('');
    setAvailableSrls([]);
    setSelectedProductKey('');
    setSelectedProduct(null);
    setCurrentItem({ productId: '', quantity: 1, price: 0, areaName: '' });
  };
  // ✅ NEW: Step 1 — employee picks design name, then SRL dropdown populates
  const handleDesignSelect = (designName: string) => {
    setSelectedDesignName(designName);
    setSelectedProductKey('');
    setSelectedProduct(null);
    setCurrentItem(prev => ({ ...prev, productId: '', price: 0 }));

    if (designName) {
      // Get all SRL variants for this design only
      const srls = processProductsForDropdown(
        products.filter(p => p.name === designName)
      );
      setAvailableSrls(srls);
    } else {
      setAvailableSrls([]);
    }
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

  const handleSrlDirectSearch = (srlTerm: string) => {
    if (!srlTerm.trim()) return;

    // Note: 'products' state is already filtered by the selected catalog in these files
    const processedProducts = processProductsForDropdown(products);

    const matchedProd = processedProducts.find(
      p => p.srlNo?.toString().toLowerCase() === srlTerm.trim().toLowerCase()
    );

    if (matchedProd) {
      // 1. Auto-select the design
      setSelectedDesignName(matchedProd.name);

      // 2. Populate available SRLs for this design
      const srls = processProductsForDropdown(
        products.filter(p => p.name === matchedProd.name)
      );
      setAvailableSrls(srls);

      // 3. Set the specific product details
      // Only call setSelectedProductKey if you are in NewSelection.tsx
      if (typeof setSelectedProductKey === 'function') {
        setSelectedProductKey(matchedProd.uniqueKey);
      }
      setSelectedProduct(matchedProd);

      const price = typeof matchedProd.price === 'number'
        ? matchedProd.price
        : parseFloat(String(matchedProd.price).replace(/,/g, '')) || 0;

      setCurrentItem(prev => ({
        ...prev,
        productId: matchedProd.originalId,
        price: price
      }));

      toast({ title: 'Product Found', description: `Auto-selected ${matchedProd.name} (SRL: ${matchedProd.srlNo})` });
    } else {
      toast({ title: 'Not Found', description: `No product found with SRL: ${srlTerm}`, variant: 'destructive' });
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

              {/* 1. MOVED TO TOP: Area Name */}
              <div className="space-y-2 mb-4">
                <Label>Area Name *</Label>
                <Input
                  list="common-areas-list"
                  placeholder="e.g. Living Room"
                  value={currentItem.areaName}
                  onChange={(e) => setCurrentItem({ ...currentItem, areaName: e.target.value })}
                />
                <datalist id="common-areas-list">
                  {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance", "Lobby", "Home Theater"].map(area => (
                    <option key={area} value={area} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Company Search */}
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    list="company-list-selection"
                    placeholder="Type to search company..."
                    onChange={(e) => {
                      const match = companies.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                      if (match) setSelectedCompanyId(match.id);
                    }}
                  />
                  <datalist id="company-list-selection">
                    {companies.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>

                {/* Collection/Catalog Search */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Collection</Label>
                    {selectedCatalogType && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getTypeBadgeColor(selectedCatalogType)}`}>
                        {selectedCatalogType}
                      </span>
                    )}
                  </div>
                  <Input
                    list="catalog-list-selection"
                    placeholder={selectedCompanyId ? "Type to search..." : "Select Company First"}
                    disabled={!selectedCompanyId}
                    value={catalogs.find(c => c.id === selectedCatalogId)?.name || ''}
                    onChange={(e) => {
                      const match = catalogs.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                      if (match) setSelectedCatalogId(match.id);
                    }}
                  />
                  <datalist id="catalog-list-selection">
                    {catalogs.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>

                {/* Product Selection — Direct SRL & Design */}
                <div className="space-y-2">
                  <Label>Product Search</Label>

                  <Input
                    placeholder="🔍 Type SRL Number & press Enter"
                    disabled={!selectedCatalogId}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSrlDirectSearch(e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => handleSrlDirectSearch(e.target.value)}
                    className="border-green-300 bg-green-50 focus:border-green-500 text-green-900 placeholder-green-700/50 font-medium"
                  />

                  <div className="text-xs text-center text-muted-foreground py-1 font-medium">- OR SEARCH BY DESIGN -</div>

                  <select
                    value={selectedDesignName}
                    onChange={(e) => handleDesignSelect(e.target.value)}
                    disabled={!selectedCatalogId}
                    className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm disabled:opacity-50"
                  >
                    <option value="">-- Select Design --</option>
                    {Array.from(new Set(products.map(p => p.name)))
                      .sort()
                      .map(name => <option key={name} value={name}>{name}</option>)}
                  </select>

                  {selectedDesignName && (
                    <div className="space-y-1 mt-2">
                      <Label className="text-xs text-muted-foreground">SRL Number</Label>
                      <select
                        value={selectedProductKey}
                        onChange={(e) => handleProductSelect(e.target.value)}
                        className="w-full h-10 px-3 border border-blue-300 bg-blue-50 rounded-md text-sm text-blue-800 font-medium"
                      >
                        <option value="">-- Select SRL --</option>
                        {availableSrls.map(p => (
                          <option key={p.uniqueKey} value={p.uniqueKey}>SRL: {p.srlNo}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Product Action Block - REMOVED PRICE & QTY */}
              {selectedProduct && (
                <div className="mt-4 p-4 bg-background border border-border rounded-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-primary">Ready to add: {selectedProduct.name}</p>
                      <p className="text-xs text-muted-foreground">SRL: {selectedProduct.srlNo}</p>
                    </div>
                    <Button type="button" onClick={handleAddItem} variant="accent" className="w-full md:w-auto">
                      Add Item to Area
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
                        <td className="py-2 px-4">
                          <span className="font-medium">{item.name}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">SRL: {item.srlNo || 'N/A'}</span>
                        </td>
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