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
// ✅ NEW — import your custom SearchableSelect
import { SearchableSelect, SelectOption } from '@/pages/Selection/Searchableselect';

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

  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [selectedCatalogType, setSelectedCatalogType] = useState<string>('');

  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedProductKey, setSelectedProductKey] = useState<string>('');

  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: 1, price: 0, areaName: '' });
  const [items, setItems] = useState<any[]>([]);

  const [selectedDesignName, setSelectedDesignName] = useState<string>('');
  const [availableSrls, setAvailableSrls] = useState<any[]>([]);

  // ── Derived option arrays for SearchableSelect ──────────────────────────

  const companyOptions: SelectOption[] = companies.map(c => ({ value: c.id, label: c.name }));

  const catalogOptions: SelectOption[] = catalogs.map(c => ({
    value: c.id,
    label: `${c.name}${c.type ? ` (${c.type})` : ''}`,
  }));

  const designOptions: SelectOption[] = Array.from(new Set(products.map(p => p.name)))
    .sort()
    .map(name => ({ value: name, label: name }));

  const srlOptions: SelectOption[] = availableSrls.map(p => ({
    value: p.uniqueKey,
    label: `SRL: ${p.srlNo}`,
  }));

  // ── Data fetching ────────────────────────────────────────────────────────

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
      setSelectedDesignName('');
      setAvailableSrls([]);
      setSelectedProductKey('');
    }
  }, [selectedCompanyId, companies]);

  useEffect(() => {
    if (selectedCatalogId) {
      const catalog = catalogs.find(c => c.id === selectedCatalogId);
      if (catalog) setSelectedCatalogType(catalog.type || 'Generic');
      api.get(`/catalogs/${selectedCatalogId}/products`).then(({ data }) => {
        setProducts(data);
      });
      setSelectedDesignName('');
      setAvailableSrls([]);
      setSelectedProductKey('');
      setSelectedProduct(null);
    } else {
      setProducts([]);
      setSelectedCatalogType('');
      setSelectedDesignName('');
      setAvailableSrls([]);
    }
  }, [selectedCatalogId, catalogs]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDesignSelect = (designName: string) => {
    setSelectedDesignName(designName);
    setSelectedProductKey('');
    setSelectedProduct(null);
    setCurrentItem(prev => ({ ...prev, productId: '', price: 0 }));
    if (designName) {
      const srls = processProductsForDropdown(products.filter(p => p.name === designName));
      setAvailableSrls(srls);
    } else {
      setAvailableSrls([]);
    }
  };

  const handleProductSelect = (uniqueKey: string) => {
    const prod = availableSrls.find(p => p.uniqueKey === uniqueKey);
    if (prod) {
      setSelectedProductKey(uniqueKey);
      setSelectedProduct(prod);
      const price = typeof prod.price === 'number'
        ? prod.price
        : parseFloat(String(prod.price).replace(/,/g, '')) || 0;
      setCurrentItem(prev => ({ ...prev, productId: prod.originalId, quantity: 1, price }));
    } else if (uniqueKey) {
      // Custom SRL
      setSelectedProductKey(uniqueKey);
      const customProd = {
        name: selectedDesignName || 'Custom Design',
        srlNo: uniqueKey,
        price: 0,
        originalId: 'manual',
        uniqueKey: uniqueKey
      };
      setSelectedProduct(customProd);
      setCurrentItem(prev => ({ ...prev, productId: 'manual', quantity: 1, price: 0 }));
    } else {
      // cleared
      setSelectedProductKey('');
      setSelectedProduct(null);
    }
  };

  const handleSrlDirectSearch = (srlTerm: string) => {
    if (!srlTerm.trim()) return;
    const processedProducts = processProductsForDropdown(products);
    const matchedProd = processedProducts.find(
      p => p.srlNo?.toString().toLowerCase() === srlTerm.trim().toLowerCase()
    );
    if (matchedProd) {
      setSelectedDesignName(matchedProd.name);
      const srls = processProductsForDropdown(products.filter(p => p.name === matchedProd.name));
      setAvailableSrls(srls);
      setSelectedProductKey(matchedProd.uniqueKey);
      setSelectedProduct(matchedProd);
      const price = typeof matchedProd.price === 'number'
        ? matchedProd.price
        : parseFloat(String(matchedProd.price).replace(/,/g, '')) || 0;
      setCurrentItem(prev => ({ ...prev, productId: matchedProd.originalId, price }));
      toast({ title: 'Product Found', description: `Auto-selected ${matchedProd.name} (SRL: ${matchedProd.srlNo})` });
    } else {
      toast({ title: 'Not Found', description: `No product found with SRL: ${srlTerm}`, variant: 'destructive' });
    }
  };

  const handleAddItem = () => {
    if (!selectedDesignName && !selectedProductKey) {
      toast({ title: "Error", description: "Please select a Design or an SRL number.", variant: "destructive" });
      return;
    }
    if (!currentItem.areaName) {
      toast({ title: "Error", description: "Please enter an Area Name.", variant: "destructive" });
      return;
    }
    
    const catalog = catalogs.find(c => c.id === selectedCatalogId);
    const catalogName = catalog?.name || selectedCatalogId || 'Unknown Collection';

    const newItem: SelectionItem = {
      productId: selectedProduct?.originalId || 'manual',
      name: selectedProduct?.name || selectedDesignName || 'Custom Product',
      catalogName: catalogName,
      catalogType: selectedCatalogType || 'Generic',
      srlNo: selectedProduct?.srlNo || selectedProductKey || '',
      areaName: currentItem.areaName,
      quantity: currentItem.quantity,
      price: currentItem.price || selectedProduct?.price || 0,
      total: (currentItem.price || selectedProduct?.price || 0) * currentItem.quantity
    };
    
    setItems([...items, newItem]);
    setSelectedDesignName('');
    setAvailableSrls([]);
    setSelectedProductKey('');
    setSelectedProduct(null);
    setCurrentItem({ productId: '', quantity: 1, price: 0, areaName: '' });
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
      const payload = { inquiryId: selectedInquiryId, delivery_date: deliveryDate || null, notes: notes || null, items };
      const { data } = await api.post('/selections', payload);
      toast({ title: 'Selection Created', description: `Selection ${data.selection_number} created.` });
      navigate('/selections');
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

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
      <div className="max-w-[1300px] w-full animate-fade-in pb-20">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">New Selection</h1>
            <p className="text-muted-foreground mt-1">Create a selection from an existing inquiry</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Inquiry Selection */}
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
              <div className="space-y-2">
                <Label>Selection Date</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Product Selection Section */}
          <div className="card-premium p-6 border-2 border-primary/10">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
              <Plus className="h-5 w-5 text-accent" /> Add Products
            </h2>

            {/* ── COMPACT SINGLE-ROW PICKER ── */}
            <div className="bg-muted/30 p-3 rounded-lg">

              {/* Labels row */}
              <div className="flex items-center gap-2 mb-1 px-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[170px] shrink-0">Area Name *</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[150px] shrink-0">Company</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[150px] shrink-0 flex items-center gap-1">
                  Collection
                  {selectedCatalogType && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${getTypeBadgeColor(selectedCatalogType)}`}>
                      {selectedCatalogType}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[130px] shrink-0">🔍 SRL Direct</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[140px] shrink-0">Design</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[110px] shrink-0">SRL No.</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[70px] shrink-0">Qty</span>
                <span className="w-[80px] shrink-0" />
              </div>

              {/* Controls row — all in one line */}
              <div className="flex items-center gap-2">

                {/* Area Name */}
                <div className="w-[170px] shrink-0">
                  <Input
                    list="common-areas-list"
                    placeholder="e.g. Living Room"
                    value={currentItem.areaName}
                    onChange={(e) => setCurrentItem({ ...currentItem, areaName: e.target.value })}
                    className="h-9 text-xs px-2"
                  />
                  <datalist id="common-areas-list">
                    {COMMON_AREAS.map(area => <option key={area} value={area} />)}
                  </datalist>
                </div>

                {/* Company */}
                <div className="w-[150px] shrink-0">
                  <SearchableSelect
                    options={companyOptions}
                    value={selectedCompanyId}
                    onChange={setSelectedCompanyId}
                    placeholder="Company…"
                    className="h-9 text-xs"
                    allowCreate={true}
                  />
                </div>

                {/* Collection */}
                <div className="w-[150px] shrink-0">
                  <SearchableSelect
                    options={catalogOptions}
                    value={selectedCatalogId}
                    onChange={setSelectedCatalogId}
                    placeholder={selectedCompanyId ? "Collection…" : "Select Company"}
                    disabled={!selectedCompanyId}
                    className="h-9 text-xs"
                    allowCreate={true}
                  />
                </div>

                {/* SRL direct search */}
                <div className="w-[130px] shrink-0">
                  <Input
                    placeholder="🔍 Type SRL + Enter"
                    disabled={!selectedCatalogId}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSrlDirectSearch(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value) {
                        handleSrlDirectSearch(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="h-9 text-xs px-2 border-green-300 bg-green-50 focus:border-green-500 text-green-900 placeholder-green-600/60"
                  />
                </div>

                {/* Design */}
                <div className="w-[140px] shrink-0">
                  <SearchableSelect
                    options={designOptions}
                    value={selectedDesignName}
                    onChange={handleDesignSelect}
                    placeholder="Search design…"
                    disabled={!selectedCatalogId}
                    className="h-9 text-xs"
                    allowCreate={true}
                  />
                </div>

                {/* SRL picker — always visible, disabled until design chosen */}
                <div className="w-[110px] shrink-0">
                  <SearchableSelect
                    options={srlOptions}
                    value={selectedProductKey}
                    onChange={handleProductSelect}
                    placeholder="SRL…"
                    colorVariant="blue"
                    className="h-9 text-xs"
                    allowCreate={true}
                  />
                </div>

                {/* Qty */}
                <div className="w-[70px] shrink-0">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={currentItem.quantity}
                    onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) || 1 })}
                    className="h-9 text-xs px-2 text-right"
                  />
                </div>

                {/* Add Item button — only when product is ready */}
                <div className="shrink-0">
                  {(selectedProduct || selectedDesignName || selectedProductKey) ? (
                    <Button
                      type="button"
                      onClick={handleAddItem}
                      variant="accent"
                      className="h-9 px-4 text-xs whitespace-nowrap"
                    >
                      Add Item
                    </Button>
                  ) : (
                    <div className="w-[80px]" />
                  )}
                </div>
              </div>

              {/* Confirmation pill — compact, below the row */}
              {(selectedProduct || selectedDesignName || selectedProductKey) && (
                <div className="mt-2 flex items-center gap-2 px-1">
                  <span className="text-xs text-muted-foreground">Selected:</span>
                  <span className="text-xs font-semibold text-primary truncate max-w-[200px]">
                    {selectedProduct?.name || selectedDesignName || 'Custom Product'}
                  </span>
                  {(selectedProduct?.srlNo || selectedProductKey) && (
                    <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                      SRL: {selectedProduct?.srlNo || selectedProductKey}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Items List */}
            {items.length > 0 && (
              <div className="mt-6 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left py-2 px-4">Area</th>
                      <th className="text-left py-2 px-4">Catalog / Type</th>
                      <th className="text-left py-2 px-4">Product</th>
                      <th className="text-left py-2 px-4 w-24">Qty</th>
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
                            <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded border">{item.catalogType}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <span className="font-medium">{item.name}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">SRL: {item.srlNo || 'N/A'}</span>
                        </td>
                        <td className="py-2 px-4">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const q = parseInt(e.target.value) || 1;
                              const next = [...items];
                              next[idx] = { ...next[idx], quantity: q, total: q * (next[idx].price || 0) };
                              setItems(next);
                            }}
                            className="h-8 w-20 text-xs text-right"
                          />
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

          {/* Notes / Remark — at end, after Add Products */}
          <div className="card-premium p-6">
            <div className="space-y-2">
              <Label>Remark / Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Overall remark for this selection..."
              />
            </div>
          </div>

          {/* Submit */}
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