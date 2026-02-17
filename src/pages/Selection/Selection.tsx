import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Pencil, 
  Trash2, 
  X, 
  RefreshCw,
  Calculator,
  PlusCircle, 
  History,
  Clock
} from 'lucide-react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import api from '@/lib/api';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge'; 

interface SelectionItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  details: any;
  areaName?: string;
  catalogName?: string;
  catalogType?: string; 
  version?: number; // ✅ Version is crucial here
  
  // Measurement fields
  unit?: string;
  width?: number;
  height?: number;
  type?: string;
  motorizationMode?: string;
  opsType?: string;
  pelmet?: number;
  openingType?: string;
}

interface Selection {
  id: string;
  selection_number: string;
  inquiry: {
    client_name: string;
    inquiry_number: string;
  };
  status: string;
  version: number; 
  selection_date: string;
  delivery_date: string | null;
  notes: string | null;
  items: SelectionItem[];
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

const Selections: React.FC = () => {
  const { toast } = useToast();
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Edit/Delete States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  
  // New Version Mode Flag
  const [isNewVersionMode, setIsNewVersionMode] = useState(false);

  const [editForm, setEditForm] = useState({
    status: '',
    delivery_date: '',
    notes: '',
  });

  // Product selection states
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [selectedCatalogType, setSelectedCatalogType] = useState<string>(''); 
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [currentItem, setCurrentItem] = useState({ 
    productId: '', 
    quantity: 1, 
    price: 0, 
    areaName: '' 
  });
  const [editedItems, setEditedItems] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Handle Company Selection
  useEffect(() => {
    if (selectedCompanyId) {
      const comp = companies.find(c => c.id === selectedCompanyId);
      setCatalogs(comp ? comp.catalogs : []);
      setSelectedCatalogId('');
      setSelectedCatalogType(''); 
      setProducts([]);
      setSelectedProduct(null);
    }
  }, [selectedCompanyId, companies]);

  // Handle Catalog Selection
  useEffect(() => {
    if (selectedCatalogId) {
      const catalog = catalogs.find(c => c.id === selectedCatalogId);
      if (catalog) setSelectedCatalogType(catalog.type || 'Generic');

      api.get(`/catalogs/${selectedCatalogId}/products`).then(({ data }) => {
        setProducts(data);
      });
    } else {
      setProducts([]);
      setSelectedCatalogType('');
    }
  }, [selectedCatalogId, catalogs]);

  const fetchCompanies = async () => {
    try {
      const { data } = await api.get('/companies');
      setCompanies(data);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
        const { data: allSelections } = await api.get('/selections');
        let filtered = allSelections;
        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter((s: any) => s.status === statusFilter);
        }
        setTotalCount(filtered.length);
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE;
        const paginatedData = filtered.slice(from, to);
        setSelections(paginatedData);
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to load selections', variant: 'destructive' });
    } finally {
        setLoading(false);
    }
  };

  const handleEditOpen = (selection: Selection) => {
    setSelectedSelection(selection);
    setIsNewVersionMode(false); 
    setEditForm({
      status: selection.status,
      delivery_date: selection.delivery_date ? new Date(selection.delivery_date).toISOString().split('T')[0] : '',
      notes: selection.notes || '',
    });
    mapItemsToTable(selection.items);
    setEditingItemIndex(null);
    setIsEditOpen(true);
  };

  const handleNewVersionOpen = (selection: Selection) => {
    setSelectedSelection(selection);
    setIsNewVersionMode(true); 
    setEditForm({
      status: selection.status,
      delivery_date: selection.delivery_date ? new Date(selection.delivery_date).toISOString().split('T')[0] : '',
      notes: selection.notes || '',
    });
    setEditedItems([]); // Start empty for new version
    setEditingItemIndex(null);
    setIsEditOpen(true);
  };

  const mapItemsToTable = (items: SelectionItem[]) => {
    setEditedItems(items.map(item => {
        const details = item.details || {};
        return {
          id: item.id, 
          productId: item.productId,
          name: item.productName || 'Custom Item',
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          areaName: details.areaName || item.areaName || '', 
          catalogName: details.catalogName || item.catalogName || '',
          catalogType: details.catalogType || item.catalogType || '',
          companyId: details.companyId || '',
          unit: item.unit,
          width: item.width,
          height: item.height,
          type: item.type,
          motorizationMode: item.motorizationMode,
          opsType: item.opsType,
          pelmet: item.pelmet,
          openingType: item.openingType,
          attributes: details
        };
      }));
  }

  const handleProductSelect = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setSelectedProduct(prod);
      const priceValue = typeof prod.price === 'string' ? parseFloat(prod.price.replace(/,/g, '')) : prod.price;
      setCurrentItem(prev => ({ ...prev, productId: prod.id, price: priceValue }));
    }
  };

  const handleAddItemOrUpdate = () => {
    if (!selectedProduct) return;
    const catalog = catalogs.find(c => c.id === selectedCatalogId);
    const newItemData = {
        name: selectedProduct.name,
        catalogName: catalog?.name || '',
        catalogType: selectedCatalogType,
        companyId: selectedCompanyId,
        price: currentItem.price,
        attributes: selectedProduct.attributes,
    };

    if (editingItemIndex !== null) {
        const newItems = [...editedItems];
        const existingItem = newItems[editingItemIndex];
        newItems[editingItemIndex] = {
            ...existingItem,
            ...newItemData,
            productId: selectedProduct.id,
            total: existingItem.quantity * currentItem.price
        };
        setEditedItems(newItems);
        setEditingItemIndex(null);
        toast({ title: 'Updated', description: 'Product updated' });
    } else {
        if (!currentItem.areaName.trim()) {
            toast({ title: 'Error', description: 'Area Name is required', variant: 'destructive' });
            return;
        }
        setEditedItems([...editedItems, {
            id: selectedProduct.id, 
            productId: selectedProduct.id,
            ...newItemData,
            quantity: currentItem.quantity,
            total: currentItem.quantity * currentItem.price,
            areaName: currentItem.areaName,
            unit: 'mm',
            width: null, height: null
        }]);
    }
    setSelectedProduct(null);
    setCurrentItem({ productId: '', quantity: 1, price: 0, areaName: '' });
  };

  const handleEditRowProduct = (index: number) => {
      setEditingItemIndex(index);
      toast({ title: 'Edit Mode', description: 'Select product above to replace.' });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...editedItems];
    newItems.splice(index, 1);
    setEditedItems(newItems);
  };

  const handleUpdateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...editedItems];
    newItems[index].quantity = quantity;
    newItems[index].total = quantity * newItems[index].price;
    setEditedItems(newItems);
  };

  const handleUpdateItemPrice = (index: number, price: number) => {
    const newItems = [...editedItems];
    newItems[index].price = price;
    newItems[index].total = newItems[index].quantity * price;
    setEditedItems(newItems);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSelection) return;
    if (editedItems.length === 0) {
      toast({ title: 'Error', description: 'Please add items', variant: 'destructive' });
      return;
    }
    setFormLoading(true);
    try {
      const itemsToSave = editedItems.map(item => ({
        productId: item.productId || item.id,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        unit: item.unit,
        width: item.width, height: item.height,
        type: item.type, motorizationMode: item.motorizationMode, opsType: item.opsType, pelmet: item.pelmet, openingType: item.openingType,
        areaName: item.areaName,
        catalogName: item.catalogName,
        catalogType: item.catalogType, 
        details: {
            ...(item.attributes || {}),
            areaName: item.areaName,
            catalogName: item.catalogName,
            catalogType: item.catalogType, 
            companyId: item.companyId      
        }
      }));

      await api.put(`/selections/${selectedSelection.id}`, {
        ...editForm,
        items: itemsToSave,
        createNewVersion: isNewVersionMode
      });
      
      toast({ title: isNewVersionMode ? 'Version Created' : 'Updated', description: 'Success' });
      setIsEditOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteOpen = (selection: Selection) => {
    setSelectedSelection(selection);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedSelection) return;
    setFormLoading(true);
    try {
      await api.delete(`/selections/${selectedSelection.id}`);
      toast({ title: 'Deleted', description: 'Selection deleted' });
      setIsDeleteOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    } finally {
      setFormLoading(false);
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

  // Helper to group historical items
  const getGroupedHistory = () => {
    if (!selectedSelection || !selectedSelection.items) return {};
    return selectedSelection.items.reduce((acc, item) => {
      const ver = item.version || 1;
      if (!acc[ver]) acc[ver] = [];
      acc[ver].push(item);
      return acc;
    }, {} as Record<number, SelectionItem[]>);
  };

  const filteredSelections = selections.filter((selection) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      selection.inquiry?.client_name?.toLowerCase().includes(query) ||
      selection.selection_number.toLowerCase().includes(query) ||
      selection.inquiry?.inquiry_number?.toLowerCase().includes(query)
    );
  });
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <DashboardLayout>
      <div className="animate-fade-in pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Selections</h1>
            <p className="text-muted-foreground mt-1">Manage and track all selections</p>
          </div>
          <Link to="/selections/new">
            <Button variant="accent" size="lg"><Plus className="h-5 w-5" /> New Selection</Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="card-premium p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
                  <th className="table-header text-left px-6 py-4">Selection #</th>
                  <th className="table-header text-left px-6 py-4">Client</th>
                  <th className="table-header text-left px-6 py-4">Status</th>
                  <th className="table-header text-left px-6 py-4">Ver</th>
                  <th className="table-header text-left px-6 py-4">Date</th>
                  <th className="table-header text-left px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-6 py-4"><div className="h-5 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : filteredSelections.map((selection) => (
                    <tr key={selection.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4"><span className="font-medium">{selection.selection_number}</span></td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{selection.inquiry?.client_name}</p>
                        <p className="text-xs text-muted-foreground">{selection.inquiry?.inquiry_number}</p>
                      </td>
                      <td className="px-6 py-4"><span className={`badge-category border ${getStatusBadge(selection.status)}`}>{selection.status.replace('_', ' ')}</span></td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="flex w-fit items-center gap-1">
                             <History className="h-3 w-3" /> v{selection.version || 1}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(selection.selection_date), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Link to={`/calculations/edit/${selection.id}`}>
                             <Button variant="ghost" size="icon" title="Calculate Requirements" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50">
                               <Calculator className="h-4 w-4" />
                             </Button>
                          </Link>

                          <Link to={`/selections/${selection.id}`}>
                            <Button variant="ghost" size="icon" title="View Details"><Eye className="h-4 w-4 text-muted-foreground hover:text-primary" /></Button>
                          </Link>
                          
                          <Button variant="ghost" size="icon" onClick={() => handleEditOpen(selection)} title="Edit Existing Items"><Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" /></Button>

                          <Button 
                             variant="ghost" 
                             size="icon" 
                             onClick={() => handleNewVersionOpen(selection)} 
                             title="Add New Version"
                             className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            <PlusCircle className="h-4 w-4" />
                          </Button>

                          <Button variant="ghost" size="icon" onClick={() => handleDeleteOpen(selection)} title="Delete Selection"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} results</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>

        {/* Edit / New Version Modal */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                 {isNewVersionMode ? (
                    <>
                      <PlusCircle className="h-5 w-5 text-blue-600" />
                      <span>Create New Version (v{(selectedSelection?.version || 1) + 1})</span>
                    </>
                 ) : (
                    <>
                      <Pencil className="h-5 w-5" />
                      <span>Edit Selection - {selectedSelection?.selection_number}</span>
                    </>
                 )}
              </DialogTitle>
              <DialogDescription>
                  {isNewVersionMode 
                    ? "Adding new items below will create a new version. Old items are preserved."
                    : "Update status, notes, or modify existing items in the current version."}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleUpdate} className="space-y-6">
              
              {/* ✅ SHOW HISTORY ONLY IN NEW VERSION MODE */}
              {isNewVersionMode && selectedSelection && (
                <div className="bg-slate-50 border rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Previous Version History
                  </h3>
                  <Accordion type="single" collapsible className="w-full">
                    {Object.entries(getGroupedHistory()).map(([version, items]) => (
                      <AccordionItem key={version} value={`v-${version}`}>
                        <AccordionTrigger className="text-sm font-medium hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                             <span>Version {version} ({items.length} items)</span>
                             <span className="text-xs text-muted-foreground font-normal">
                               Total: ₹{items.reduce((s, i) => s + i.total, 0).toLocaleString()}
                             </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="border rounded-md overflow-hidden bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="py-2 px-3 text-left">Area</th>
                                  <th className="py-2 px-3 text-left">Product</th>
                                  <th className="py-2 px-3 text-center">Qty</th>
                                  <th className="py-2 px-3 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 px-3 text-slate-600">{item.details?.areaName}</td>
                                    <td className="py-2 px-3 font-medium">{item.productName}</td>
                                    <td className="py-2 px-3 text-center">{item.quantity}</td>
                                    <td className="py-2 px-3 text-right">₹{item.total}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}

              {/* Banner for New Version Mode */}
              {isNewVersionMode && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md text-sm flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Current Version: <strong>{selectedSelection?.version}</strong>. You are creating <strong>Version {(selectedSelection?.version || 1) + 1}</strong>.
                  </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({...editForm, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Delivery Date</Label>
                  <Input type="date" value={editForm.delivery_date} onChange={(e) => setEditForm({...editForm, delivery_date: e.target.value})} />
                </div>
                <div className="col-span-3 space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} rows={2} />
                </div>
              </div>

              {/* Product Selector */}
              <div className={`border-t pt-4 ${editingItemIndex !== null ? 'bg-blue-50/50 p-4 rounded border-blue-200' : ''}`}>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  {editingItemIndex !== null ? (
                      <span className="text-blue-700 flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" /> Changing Product for Row {editingItemIndex + 1}
                      </span>
                  ) : (
                      <span className="flex items-center gap-2"><Plus className="h-5 w-5 text-accent" /> Add New Product</span>
                  )}
                </h3>
                
                <div className="bg-muted/30 p-4 rounded-lg space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {/* COMPANY SELECTION */}
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                        <SelectTrigger><SelectValue placeholder="Select Company" /></SelectTrigger>
                        <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {/* CATALOG SELECTION */}
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
                        <SelectTrigger><SelectValue placeholder={catalogs.length ? "Select" : "No collections"} /></SelectTrigger>
                        <SelectContent>
                          {catalogs.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name} <span className="text-muted-foreground opacity-70">({c.type || 'Generic'})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* PRODUCT SELECTION */}
                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select value={currentItem.productId} onValueChange={handleProductSelect} disabled={!selectedCatalogId}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                       <SelectContent>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} - ₹{p.price}</SelectItem>)}
                      </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedProduct && (
                    <div className="p-3 bg-background border rounded-lg animate-in fade-in">
                      <div className="flex flex-col gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-sm text-primary mb-1">{selectedProduct.name}</p>
                          <p className="text-xs text-muted-foreground">Base Price: ₹{selectedProduct.price}</p>
                        </div>
                        <div className="flex gap-4 items-end">
                            {editingItemIndex === null && (
                                <div className="space-y-1 flex-1">
                                  <Label className="text-xs">Area Name *</Label>
                                  <Input 
                                    list="selection-area-options"
                                    placeholder="e.g. Master Bedroom" 
                                    value={currentItem.areaName} 
                                    onChange={(e) => setCurrentItem({...currentItem, areaName: e.target.value})} 
                                    className="h-9" 
                                  />
                                  <datalist id="selection-area-options">
                                     {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance"].map(area => (
                                        <option key={area} value={area} />
                                     ))}
                                  </datalist>
                                </div>
                            )}
                            <div className="space-y-1 w-28">
                                <Label className="text-xs">Price</Label>
                                <Input type="number" value={currentItem.price} onChange={(e) => setCurrentItem({...currentItem, price: parseFloat(e.target.value)})} className="h-9" />
                            </div>
                            {editingItemIndex === null && (
                                <div className="space-y-1 w-20">
                                    <Label className="text-xs">Qty</Label>
                                    <Input type="number" value={currentItem.quantity} onChange={(e) => setCurrentItem({...currentItem, quantity: parseFloat(e.target.value)})} className="h-9" />
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button type="button" onClick={handleAddItemOrUpdate} size="sm" variant="accent" className="h-9">
                                    {editingItemIndex !== null ? 'Update Row' : 'Add Item'}
                                </Button>
                                {editingItemIndex !== null && (
                                    <Button 
                                        type="button" 
                                        onClick={() => {
                                            setEditingItemIndex(null);
                                            setSelectedProduct(null);
                                            setSelectedCompanyId('');
                                            setSelectedCatalogId('');
                                        }} 
                                        size="sm" 
                                        variant="outline" className="h-9"
                                    >
                                        Cancel Edit
                                    </Button>
                                )}
                            </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">
                    {isNewVersionMode ? "New Items to Add" : "Selection Items"} ({editedItems.length})
                </h3>
                {editedItems.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                     <p className="text-sm text-muted-foreground">
                        {isNewVersionMode ? "No new items added yet." : "No items in selection."}
                     </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-2 px-3">Area</th>
                          <th className="text-left py-2 px-3">Catalog / Type</th>
                          <th className="text-left py-2 px-3">Product</th>
                          <th className="text-center py-2 px-3">Qty</th>
                          <th className="text-right py-2 px-3">Price</th>
                          <th className="text-right py-2 px-3">Total</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {editedItems.map((item, idx) => (
                          <tr key={idx} className={editingItemIndex === idx ? 'bg-blue-50' : ''}>
                            <td className="py-2 px-3">
                              <Input 
                                list={`edit-area-${idx}`}
                                value={item.areaName || ''}
                                onChange={(e) => {
                                  const newItems = [...editedItems];
                                  newItems[idx].areaName = e.target.value;
                                  setEditedItems(newItems);
                                }}
                                className="h-8 w-full text-xs font-medium"
                                placeholder="Area"
                              />
                            </td>
                            <td className="py-2 px-3 text-xs">
                                <div className="flex flex-col gap-1">
                                   <span className="text-muted-foreground">{item.catalogName || '-'}</span>
                                   {item.catalogType && (
                                     <span className={`w-fit text-[9px] px-1.5 py-0.5 rounded border ${getTypeBadgeColor(item.catalogType)}`}>
                                       {item.catalogType}
                                     </span>
                                   )}
                                </div>
                            </td>
                            <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium truncate max-w-[120px]" title={item.name}>
                                        {item.name}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost" size="icon" className="h-6 w-6 text-blue-600 hover:text-blue-800"
                                        title="Change Product"
                                        onClick={() => handleEditRowProduct(idx)}
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </div>
                            </td>
                            <td className="py-2 px-3">
                              <Input 
                                type="number" 
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseFloat(e.target.value))}
                                className="h-8 w-16 mx-auto text-center"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input 
                                type="number" 
                                value={item.price}
                                onChange={(e) => handleUpdateItemPrice(idx, parseFloat(e.target.value))}
                                className="h-8 w-24 ml-auto text-right"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-bold">₹{item.total.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveItem(idx)}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/20 border-t">
                        <tr>
                          <td colSpan={5} className="py-2 px-3 text-right font-bold">Grand Total:</td>
                          <td className="py-2 px-3 text-right font-bold text-lg text-accent">
                            ₹{editedItems.reduce((sum, i) => sum + i.total, 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" variant="accent" disabled={formLoading}>
                    {formLoading ? 'Saving...' : (isNewVersionMode ? 'Save New Version' : 'Save Changes')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Modal */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Selection</DialogTitle></DialogHeader>
            <DialogDescription>Are you sure you want to delete selection <span className="font-bold">{selectedSelection?.selection_number}</span>? This will also delete all items. This action cannot be undone.</DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={formLoading}>{formLoading ? 'Deleting...' : 'Delete Selection'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Selections;