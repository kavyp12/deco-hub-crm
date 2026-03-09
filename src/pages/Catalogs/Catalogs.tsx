import React, { useEffect, useState } from 'react';
import {
  Plus, Upload, Search, BookOpen, ChevronDown, ChevronRight, Loader2,
  QrCode, ArrowRightLeft, History, Printer, User, Clock, Check, Calendar, Trash2, Filter, Edit2, Save, X
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

// --- TYPES ---
interface Company { id: string; name: string; catalogs: Catalog[]; }
interface Catalog { id: string; name: string; type: string; companyId: string; company?: Company }
interface Product { id: string; name: string; price: string; attributes: Record<string, any>; description?: string; imageUrl?: string; }
interface CatalogCopy {
  id: string;
  catalogId: string;
  copyNumber: string;
  status: 'AVAILABLE' | 'ISSUED';
  catalog: Catalog;
  movements?: CatalogMovement[];
}
interface CatalogMovement {
  id: string;
  copyId: string;
  clientName: string;
  remarks: string;
  issueDate: string;
  returnDate?: string;
  status: string;
  issuedByUser: { id: string; name: string };
  inquiry?: { inquiry_number: string; client_name: string };
  architect?: { name: string };
  copy?: CatalogCopy;
}
interface Employee { id: string; name: string; }



const Catalogs: React.FC = () => {
  const { toast } = useToast();
  const { profile, role } = useAuth();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState('library');

  // Popover States for Filters
  const [isHistoryFilterOpen, setIsHistoryFilterOpen] = useState(false);
  const [isInventoryFilterOpen, setIsInventoryFilterOpen] = useState(false);
  const [isTrackingFilterOpen, setIsTrackingFilterOpen] = useState(false);

  // Tracking Filters
  const [trackingCompanyId, setTrackingCompanyId] = useState('ALL');
  const [trackingCatalogId, setTrackingCatalogId] = useState('ALL');
  const [trackingIssuedBy, setTrackingIssuedBy] = useState('ALL');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [copies, setCopies] = useState<CatalogCopy[]>([]);
  const [movements, setMovements] = useState<CatalogMovement[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [architects, setArchitects] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // --- UI STATE ---
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAddCopyOpen, setIsAddCopyOpen] = useState(false);

  // Combo Box Open States
  const [openCompanyCombo, setOpenCompanyCombo] = useState(false);
  const [openCatalogCombo, setOpenCatalogCombo] = useState(false);

  const [selectedMovementToReturn, setSelectedMovementToReturn] = useState<string | null>(null);

  // Filters for dropdowns
  const [issueCompanyId, setIssueCompanyId] = useState('');
  const [issueCatalogId, setIssueCatalogId] = useState('');

  // Inventory Filters
  const [inventoryCompanyId, setInventoryCompanyId] = useState('');
  const [inventoryCatalogId, setInventoryCatalogId] = useState('');

  // History Filters
  const [historyArchitect, setHistoryArchitect] = useState('ALL');
  const [historyInquiry, setHistoryInquiry] = useState('ALL');
  const [historyCatalogId, setHistoryCatalogId] = useState('ALL');
  const [historyCompanyId, setHistoryCompanyId] = useState('ALL');
  const [historyIssuedBy, setHistoryIssuedBy] = useState('ALL');
  const [historyDate, setHistoryDate] = useState('');

  // Library UI
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Forms
  const [newCompanyName, setNewCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedCompanyUpload, setSelectedCompanyUpload] = useState('');
  const [uploadType, setUploadType] = useState('Curtains');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [addCopyForm, setAddCopyForm] = useState({ catalogId: '', quantity: 1 });

  const [issueForm, setIssueForm] = useState({
    copyId: '', inquiryId: '', architectId: '', clientName: '', remarks: '',
    issuedByUserId: '', issueDate: '', issueTime: ''
  });

  const [returnForm, setReturnForm] = useState({
    returnDate: '', returnTime: '', type: 'now'
  });

  // Editing State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', price: '' });

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchCompanies();
    fetchInquiries();
    fetchArchitects();
    if (role === 'super_admin') fetchEmployees();
  }, [role]);

  // --- FILTER COUNTERS & RESETS ---
  const activeHistoryFilterCount = [
    historyCompanyId !== 'ALL',
    historyCatalogId !== 'ALL',
    historyArchitect !== 'ALL',
    historyInquiry !== 'ALL',
    historyIssuedBy !== 'ALL',
    historyDate !== ''
  ].filter(Boolean).length;

  const handleResetHistoryFilters = () => {
    setHistoryCompanyId('ALL');
    setHistoryCatalogId('ALL');
    setHistoryArchitect('ALL');
    setHistoryInquiry('ALL');
    setHistoryIssuedBy('ALL');
    setHistoryDate('');
  };

  const activeTrackingFilterCount = [
    trackingCompanyId !== 'ALL',
    trackingCatalogId !== 'ALL',
    trackingIssuedBy !== 'ALL'
  ].filter(Boolean).length;

  const handleResetTrackingFilters = () => {
    setTrackingCompanyId('ALL');
    setTrackingCatalogId('ALL');
    setTrackingIssuedBy('ALL');
  };

  const activeInventoryFilterCount = [
    inventoryCompanyId && inventoryCompanyId !== 'ALL',
    inventoryCatalogId && inventoryCatalogId !== 'ALL'
  ].filter(Boolean).length;

  const handleResetInventoryFilters = () => {
    setInventoryCompanyId('');
    setInventoryCatalogId('');
  };

  useEffect(() => {
    if (activeTab === 'tracking' || activeTab === 'history' || activeTab === 'inventory') {
      fetchCopies(); fetchMovements();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedCatalog) {
      setProductSearchQuery('');
      fetchProducts(selectedCatalog);
    } else {
      setProducts([]);
    }
  }, [selectedCatalog]);

  // --- API CALLS ---
  const fetchCompanies = async () => {
    try {
      const { data } = await api.get('/companies');
      setCompanies(data);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load companies', variant: 'destructive' });
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/users/sales-people');
      setEmployees(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCopies = async () => { try { const { data } = await api.get('/catalogs/copies'); setCopies(data); } catch (e) { } };
  const fetchMovements = async () => { try { const { data } = await api.get('/catalogs/tracking'); setMovements(data); } catch (e) { } };
  const fetchInquiries = async () => { try { const { data } = await api.get('/inquiries'); setInquiries(data); } catch (e) { } };
  const fetchArchitects = async () => { try { const { data } = await api.get('/architects'); setArchitects(data); } catch (e) { } };

  const fetchProducts = async (catalogId: string) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/catalogs/${catalogId}/products`);
      const uniqueProducts = data.filter((product: Product, index: number, self: Product[]) =>
        index === self.findIndex((p) => p.id === product.id)
      );
      setProducts(uniqueProducts);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- HELPERS ---
  const getCatalogsForCompany = (compId: string) => companies.find(c => c.id === compId)?.catalogs || [];
  const getAvailableCopies = (catId: string) => copies.filter(c => c.catalogId === catId && c.status === 'AVAILABLE');

 const getAttr = (product: Product, key: string) => {
  return product.attributes?.[key] ?? '-';
};

  // --- FILTER LOGIC ---
  const getFilteredInventory = () => {
    return copies.filter(copy => {
      if (inventoryCompanyId && inventoryCompanyId !== 'ALL' && copy.catalog.companyId !== inventoryCompanyId) return false;
      if (inventoryCatalogId && inventoryCatalogId !== 'ALL' && copy.catalogId !== inventoryCatalogId) return false;
      return true;
    });
  };

  const getFilteredHistory = () => {
    return movements.filter(m => {
      if (historyCompanyId !== 'ALL' && m.copy?.catalog?.companyId !== historyCompanyId) return false;
      if (historyCatalogId !== 'ALL' && m.copy?.catalogId !== historyCatalogId) return false;
      if (historyArchitect !== 'ALL' && m.architect?.name !== historyArchitect) return false;
      if (historyInquiry !== 'ALL') {
        const inqStr = `${m.inquiry?.client_name || ''} ${m.inquiry?.inquiry_number || ''}`.trim();
        if (inqStr !== historyInquiry) return false;
      }
      if (historyIssuedBy !== 'ALL') {
        if (m.issuedByUser?.name !== historyIssuedBy) return false;
      }
      if (historyDate) {
        const issueD = format(new Date(m.issueDate), 'yyyy-MM-dd');
        if (issueD !== historyDate) return false;
      }
      return true;
    });
  };

  const getFilteredTracking = () => {
    return movements.filter(m => m.status === 'ISSUED').filter(m => {
      if (trackingCompanyId !== 'ALL' && m.copy?.catalog?.companyId !== trackingCompanyId) return false;
      if (trackingCatalogId !== 'ALL' && m.copy?.catalogId !== trackingCatalogId) return false;
      if (trackingIssuedBy !== 'ALL' && m.issuedByUser?.name !== trackingIssuedBy) return false;
      return true;
    });
  };

  const filteredInventoryList = getFilteredInventory();
  const filteredHistoryList = getFilteredHistory();
  const filteredTrackingList = getFilteredTracking();

  // --- DROPDOWN DATA EXTRACTION ---
  const uniqueHistoryArchitects = Array.from(new Set(movements.map(m => m.architect?.name).filter(Boolean)));
  const uniqueHistoryInquiries = Array.from(new Set(movements.map(m => `${m.inquiry?.client_name || ''} ${m.inquiry?.inquiry_number || ''}`.trim()).filter(Boolean)));

  // Combines all fetched employees with anyone who currently exists in movements history

  const uniqueIssuedByUsers = Array.from(
    new Map<string, { id: string; name: string }>([
      ...employees.map(e => [e.name, { id: String(e.id), name: e.name }] as [string, { id: string; name: string }]),
      ...movements.filter(m => m.issuedByUser).map(m => [m.issuedByUser.name, { id: String(m.issuedByUser.id), name: m.issuedByUser.name }] as [string, { id: string; name: string }])
    ]).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredCompanies = companies.filter(company => {
    const searchLower = searchQuery.toLowerCase();
    return company.name.toLowerCase().includes(searchLower) ||
      company.catalogs.some(cat => cat.name.toLowerCase().includes(searchLower));
  });

  const filteredProducts = products.filter(product => {
    if (!productSearchQuery) return true;
    const searchLower = productSearchQuery.toLowerCase();
    const primaryMatch = product.name.toLowerCase().includes(searchLower) || product.price.toString().includes(searchLower);
    if (primaryMatch) return true;
    return Object.values(product.attributes || {}).some(val => String(val).toLowerCase().includes(searchLower));
  });



  // --- HANDLERS ---
  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      toast({ title: 'Error', description: 'Company name required', variant: 'destructive' });
      return;
    }
    try {
      await api.post('/companies', { name: newCompanyName });
      toast({ title: 'Success', description: 'Company created successfully' });
      setIsAddCompanyOpen(false);
      setNewCompanyName('');
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create company', variant: 'destructive' });
    }
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its catalogs/products? This cannot be undone.`)) return;
    try {
      await api.delete(`/companies/${id}`);
      toast({ title: 'Deleted', description: `${name} has been deleted` });
      if (expandedCompany === id) {
        setExpandedCompany(null);
        setSelectedCatalog('');
      }
      fetchCompanies();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to delete company', variant: 'destructive' });
    }
  };

  const handleUpload = async () => {
  if (!file || !selectedCompanyUpload) {
    toast({ title: 'Error', description: 'Please select file and company', variant: 'destructive' });
    return;
  }

  setIsUploading(true);
  setUploadStatus('Uploading...');

  try {
    const formData = new FormData();
    formData.append('file', file);                          // Send file directly, no pre-processing
    formData.append('companyId', selectedCompanyUpload);
    formData.append('defaultType', uploadType);

    const response = await api.post('/upload-catalog', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    const { data } = response;

    if (data.errors && data.errors.length > 0) {
      const firstError = typeof data.errors[0] === 'string' ? data.errors[0] : JSON.stringify(data.errors[0]);
      toast({
        title: 'Partial Success',
        description: `Processed ${data.productsCreated} items. ${data.errors.length} errors. First: ${firstError}`,
        variant: 'destructive'
      });
    } else {
      toast({ title: 'Success', description: data.message || 'Catalog uploaded successfully.' });
    }

    setIsUploadOpen(false);
    setFile(null);
    setSelectedCompanyUpload('');
    fetchCompanies();
    if (selectedCatalog) fetchProducts(selectedCatalog);

  } catch (error: any) {
    toast({
      title: 'Upload Failed',
      description: error.response?.data?.details || error.response?.data?.error || 'Failed to upload.',
      variant: 'destructive'
    });
  } finally {
    setIsUploading(false);
    setUploadStatus('');
  }
};

  const handleIssueCatalog = async () => {
    try {
      const combinedDate = new Date(`${issueForm.issueDate}T${issueForm.issueTime}`);

      await api.post('/catalogs/issue', {
        copyId: issueForm.copyId,
        inquiryId: issueForm.inquiryId,
        architectId: issueForm.architectId,
        clientName: issueForm.clientName,
        remarks: issueForm.remarks,
        issueDate: combinedDate.toISOString(),
        issuedByUserId: issueForm.issuedByUserId || undefined
      });

      toast({ title: 'Success', description: 'Catalogue Issued Successfully' });
      setIsIssueOpen(false);
      fetchMovements(); fetchCopies();
      setIssueForm(prev => ({ ...prev, copyId: '', clientName: '', remarks: '', inquiryId: '', architectId: '' }));
      setIssueCompanyId(''); setIssueCatalogId('');
    } catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
  };

  const handleReturnCatalog = async () => {
    if (!selectedMovementToReturn) return;
    try {
      let finalDate = new Date();
      if (returnForm.type === 'manual') {
        finalDate = new Date(`${returnForm.returnDate}T${returnForm.returnTime}`);
      }

      await api.put(`/catalogs/return/${selectedMovementToReturn}`, {
        returnDate: finalDate.toISOString()
      });

      toast({ title: 'Returned', description: 'Catalogue marked as returned' });
      setIsReturnOpen(false);
      fetchMovements(); fetchCopies();
    } catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
  };

  const handleAddCopies = async () => {
    try {
      await api.post(`/catalogs/${addCopyForm.catalogId}/copies`, { quantity: addCopyForm.quantity });
      toast({ title: 'Success', description: 'Copies generated successfully' });
      setIsAddCopyOpen(false);
      fetchCopies();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to generate copies', variant: 'destructive' });
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditForm({ name: product.name, price: product.price });
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    try {
      await api.put(`/products/${editingProduct.id}`, {
        price: editForm.price,
        name: editForm.name
      });
      toast({ title: 'Updated', description: 'Product updated successfully' });
      setEditingProduct(null);
      fetchProducts(selectedCatalog);
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const toggleCompany = (id: string) => {
    if (expandedCompany === id) {
      setExpandedCompany(null);
      setSelectedCatalog('');
      setProducts([]);
    } else {
      setExpandedCompany(id);
    }
  };

  const openIssueDialog = () => {
    const now = new Date();
    setIssueForm(prev => ({
      ...prev,
      issueDate: format(now, 'yyyy-MM-dd'),
      issueTime: format(now, 'HH:mm')
    }));
    setIsIssueOpen(true);
  };

  const openReturnDialog = (movementId: string) => {
    setSelectedMovementToReturn(movementId);
    const now = new Date();
    setReturnForm({
      type: 'now',
      returnDate: format(now, 'yyyy-MM-dd'),
      returnTime: format(now, 'HH:mm')
    });
    setIsReturnOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Catalog Manager</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Manage companies, catalogs and products</p>
          </div>
          <Button onClick={openIssueDialog} variant="accent" className="flex gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Issue Catalogue
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="library" className="gap-2"><BookOpen className="h-4 w-4" /> Library</TabsTrigger>
            <TabsTrigger value="tracking" className="gap-2"><ArrowRightLeft className="h-4 w-4" /> Active</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2"><QrCode className="h-4 w-4" /> Inventory</TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" /> History</TabsTrigger>
          </TabsList>

          {/* === LIBRARY TAB === */}
          <TabsContent value="library" className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex gap-2 flex-wrap flex-1">
                <Dialog open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1 md:flex-none">
                      <Plus className="mr-2 h-4 w-4" /> Add Company
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[90vw] md:max-w-lg">
                    <DialogHeader><DialogTitle>Add New Company</DialogTitle></DialogHeader>
                    <div className="pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Company Name</Label>
                        <Input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Enter company name" />
                      </div>
                      <Button onClick={handleAddCompany} className="w-full">Create Company</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                  <DialogTrigger asChild>
                    <Button variant="accent" className="flex-1 md:flex-none">
                      <Upload className="mr-2 h-4 w-4" /> Upload Excel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[90vw] md:max-w-lg">
                    <DialogHeader><DialogTitle>Upload Catalog Excel</DialogTitle></DialogHeader>
                    <div className="pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Select Company</Label>
                        <Select value={selectedCompanyUpload} onValueChange={setSelectedCompanyUpload}>
                          <SelectTrigger><SelectValue placeholder="Choose company" /></SelectTrigger>
                          <SelectContent>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Product Category</Label>
                        <Select value={uploadType} onValueChange={setUploadType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Curtains">Curtains</SelectItem>
                            <SelectItem value="blinds">Blinds</SelectItem>
                            <SelectItem value="rugs">Rugs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Excel File</Label>
                        <Input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={e => setFile(e.target.files?.[0] || null)}
                        />
                        {file && <p className="text-xs text-muted-foreground mt-1">Selected: {file.name}</p>}
                      </div>
<div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 flex gap-3 items-start">
  <Check className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
  <div className="text-xs">
    <p className="font-semibold text-blue-700 mb-1">Expected Format</p>
    <p className="text-muted-foreground">
      Row 1: Group headers (Delear Price, Customer Rate, Design Repeat). Row 2: Column headers (Collection, Design/ Quality, RRP, etc.). Data starts from Row 3.
    </p>
  </div>
</div>
                      <Button
                        onClick={handleUpload}
                        disabled={!file || !selectedCompanyUpload || isUploading}
                        className="w-full"
                      >
                        {isUploading ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {uploadStatus}</>
                        ) : 'Upload Catalog'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

           <div className="grid grid-cols-1 md:grid-cols-4 gap-6" style={{ height: 'calc(100vh - 280px)' }}>

  {/* Sidebar: Companies — STICKY, independently scrollable */}
  <div className="card-premium p-4 flex flex-col" style={{ height: 'calc(100vh - 280px)', overflowY: 'auto' }}>
    <h3 className="font-semibold mb-4 text-xs uppercase text-muted-foreground tracking-wider flex-shrink-0">Companies & Catalogs</h3>
    <div className="relative mb-4 flex-shrink-0">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input placeholder="Search..." className="pl-9 h-9 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
    </div>
    <div className="space-y-2 overflow-y-auto flex-1">
      {filteredCompanies.map(company => (
        <div key={company.id} className="border border-border rounded-lg overflow-hidden">
          <div className="flex justify-between items-center p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleCompany(company.id)}>
            <div className="font-medium flex items-center gap-2">
              {expandedCompany === company.id ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className="truncate text-sm">{company.name}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id, company.name); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {expandedCompany === company.id && (
            <div className="bg-background p-2 space-y-1 border-t border-border animate-in slide-in-from-top-2">
              {company.catalogs.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 text-center">No catalogs.</p>
              ) : (
                company.catalogs.map(catalog => (
                  <button
                    key={catalog.id}
                    onClick={() => setSelectedCatalog(catalog.id)}
                    className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                      selectedCatalog === catalog.id
                        ? 'bg-accent/10 text-accent font-medium border border-accent/20'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{catalog.name}</span>
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${
                      catalog.type === 'Curtains' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {catalog.type}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>


  {/* Main Area: Products — independently scrollable */}
  <div className="md:col-span-3 card-premium overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
                {selectedCatalog ? (
                  <>
                    {/* Add this ABOVE the <table> tag, inside the products panel */}
<div className="p-4 border-b border-border bg-muted/20 flex flex-col md:flex-row md:justify-between md:items-center gap-4 flex-shrink-0">
  <div className="flex items-center gap-3 flex-wrap">
    <h3 className="font-semibold text-foreground whitespace-nowrap">
      Products ({filteredProducts.length})
    </h3>
    {/* Collection badge — replaces empty Collection column in table */}
    {(() => {
      const cat = companies.flatMap(c => c.catalogs).find(c => c.id === selectedCatalog);
      const company = companies.find(c => c.catalogs.some(cl => cl.id === selectedCatalog));
      return cat ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Collection:</span>
          <span className="text-[11px] font-semibold bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full max-w-[220px] truncate block" title={`${company?.name} › ${cat.name}`}>
  {company?.name} › {cat.name}
</span>
        </div>
      ) : null;
    })()}
    {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
  </div>
  <div className="relative w-full md:w-64 flex-shrink-0">
    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
    <Input
      placeholder="Search products..."
      className="pl-9 h-9 text-sm"
      value={productSearchQuery}
      onChange={(e) => setProductSearchQuery(e.target.value)}
    />
  </div>
</div>

<div className="overflow-x-auto flex-1 overflow-y-auto">
    {loading ? (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ) : filteredProducts.length === 0 ? (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      No products found
    </div>
  ) : (
   <table className="w-full text-sm min-w-[1600px]">
<thead className="sticky top-0 z-20 shadow-sm">

    {/* ROW 1 — Group Headers */}
<tr className="border-b text-[10px] uppercase tracking-wider bg-muted">
  <th className="px-4 py-1.5 text-left" colSpan={6}></th>
      <th className="px-4 py-1.5 text-center border-l border-orange-200 bg-orange-50 text-orange-700" colSpan={4}>
        Delear Price
      </th>
      <th className="px-4 py-1.5 text-center border-l border-blue-200 bg-blue-50 text-blue-700" colSpan={4}>
        Customer Rate
      </th>
      <th className="px-4 py-1.5 text-center border-l border-purple-200 bg-purple-50 text-purple-700" colSpan={2}>
        Design Repeat
      </th>
      <th className="px-4 py-1.5 text-left border-l border-border" colSpan={3}></th>
    </tr>

   {/* ROW 2 — Column Headers */}
<tr className="border-b text-xs bg-muted">
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground w-12">Sr. No</th>
      {/* <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Collection</th> */}
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Design/ Quality</th>
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">SRL No</th>
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Width (CM)</th>
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Gsm</th>
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">HSN</th>

      {/* Delear Price group */}
      <th className="text-left px-4 py-2 font-semibold text-orange-700 border-l border-orange-200 bg-orange-50/50">CL Rate</th>
      <th className="text-left px-4 py-2 font-semibold text-orange-700 bg-orange-50/50">RL Rate</th>
      <th className="text-left px-4 py-2 font-semibold text-orange-700 bg-orange-50/50">CL Landing Cost</th>
      <th className="text-left px-4 py-2 font-semibold text-orange-700 bg-orange-50/50">RL Landing Cost</th>

      {/* Customer Rate group */}
      <th className="text-left px-4 py-2 font-semibold text-blue-700 border-l border-blue-200 bg-blue-50/50">RRP</th>
      <th className="text-left px-4 py-2 font-semibold text-blue-700 bg-blue-50/50">GST %</th>
      <th className="text-left px-4 py-2 font-semibold text-blue-700 bg-blue-50/50">GST Amount</th>
      <th className="text-left px-4 py-2 font-semibold text-blue-700 bg-blue-50/50">MRP</th>

      {/* Design Repeat group */}
      <th className="text-left px-4 py-2 font-semibold text-purple-700 border-l border-purple-200 bg-purple-50/50">Vertical</th>
      <th className="text-left px-4 py-2 font-semibold text-purple-700 bg-purple-50/50">Horizontal</th>

      <th className="text-left px-4 py-2 font-semibold text-muted-foreground border-l border-border">Martindale</th>
      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Price Code</th>
      <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Actions</th>
    </tr>
  </thead>

  <tbody>
    {filteredProducts.map((product) => {
      // Fix GST: Excel stores as 0.05, display as "5%"
      const rawGst = getAttr(product, 'GST');
      const gstDisplay = rawGst !== '-'
        ? (parseFloat(rawGst) <= 1
          ? `${(parseFloat(rawGst) * 100).toFixed(0)}%`
          : `${parseFloat(rawGst).toFixed(0)}%`)
        : '-';

      // CL Landing Cost & RL Landing Cost are formula-based, compute if missing
      const clRate = parseFloat(getAttr(product, 'CL Rate')) || 0;
      const rlRate = parseFloat(getAttr(product, 'RL Rate')) || 0;
      const clLanding = getAttr(product, 'CL Landing Cost') !== '-'
        ? getAttr(product, 'CL Landing Cost')
        : clRate > 0 ? (clRate * 1.05).toFixed(0) : '-';
      const rlLanding = getAttr(product, 'RL Landing Cost') !== '-'
        ? getAttr(product, 'RL Landing Cost')
        : rlRate > 0 ? (rlRate * 1.05).toFixed(0) : '-';

      // GST Amount & MRP are formula-based, compute if missing
      const rrp = parseFloat(product.price) || 0;
      const gstPct = rawGst !== '-' ? (parseFloat(rawGst) <= 1 ? parseFloat(rawGst) : parseFloat(rawGst) / 100) : 0;
      const gstAmount = getAttr(product, 'GST Amount') !== '-'
        ? getAttr(product, 'GST Amount')
        : rrp > 0 ? (rrp * gstPct).toFixed(0) : '-';
      const mrp = getAttr(product, 'MRP') !== '-'
        ? getAttr(product, 'MRP')
        : rrp > 0 ? (rrp + rrp * gstPct).toFixed(0) : '-';

      return (
        <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors text-xs">
          <td className="px-4 py-3 text-muted-foreground">{getAttr(product, 'Sr. No')}</td>
          {/* <td className="px-4 py-3 font-medium">{product.attributes?.['Collection'] || '-'}</td> */}
          <td className="px-4 py-3 font-medium">{product.name}</td>
          <td className="px-4 py-3 text-muted-foreground">{getAttr(product, 'SRL No')}</td>
          <td className="px-4 py-3">{getAttr(product, 'Width (CM)')}</td>
          <td className="px-4 py-3">{getAttr(product, 'Gsm')}</td>
          <td className="px-4 py-3">{getAttr(product, 'HSN')}</td>

          {/* Delear Price group */}
          <td className="px-4 py-3 font-medium text-orange-700 border-l border-orange-100 bg-orange-50/20">₹{getAttr(product, 'CL Rate')}</td>
          <td className="px-4 py-3 text-orange-700 bg-orange-50/20">₹{getAttr(product, 'RL Rate')}</td>
          <td className="px-4 py-3 text-orange-700 bg-orange-50/20">₹{clLanding}</td>
          <td className="px-4 py-3 text-orange-700 bg-orange-50/20">₹{rlLanding}</td>

          {/* Customer Rate group */}
          <td className="px-4 py-3 font-bold text-blue-700 border-l border-blue-100 bg-blue-50/20">₹{product.price}</td>
          <td className="px-4 py-3 text-blue-700 bg-blue-50/20">{gstDisplay}</td>
          <td className="px-4 py-3 text-blue-700 bg-blue-50/20">₹{gstAmount}</td>
          <td className="px-4 py-3 text-blue-700 bg-blue-50/20">₹{mrp}</td>

          {/* Design Repeat group */}
          <td className="px-4 py-3 text-purple-700 border-l border-purple-100 bg-purple-50/20">{getAttr(product, 'Vertical')}</td>
          <td className="px-4 py-3 text-purple-700 bg-purple-50/20">{getAttr(product, 'Horizontal')}</td>

          <td className="px-4 py-3 border-l border-border">{getAttr(product, 'Martindale')}</td>
          <td className="px-4 py-3 font-bold text-muted-foreground">{getAttr(product, 'PRICE CODE')}</td>
          <td className="px-4 py-3 text-right">
            {editingProduct?.id === product.id ? (
              <div className="flex items-center gap-2 justify-end">
                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="h-7 w-28 text-xs" placeholder="Design name" />
                <Input value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} className="h-7 w-20 text-xs" placeholder="RRP" />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={handleUpdateProduct}><Save className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingProduct(null)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => handleEditProduct(product)}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </td>
        </tr>
      );
    })}
  </tbody>
</table>
  )}
</div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-border m-4 rounded-lg">
                    <div className="text-center py-12 px-4">
                      <Search className="h-16 w-16 mx-auto mb-4 opacity-20" />
                      <p className="text-lg font-medium mb-2">No Catalog Selected</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* === TRACKING TAB === */}
          <TabsContent value="tracking" className="space-y-4">
            {/* Top Bar for Tracking Filters */}
            <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-foreground ml-2">Active Issued Catalogs</h3>

              <Popover open={isTrackingFilterOpen} onOpenChange={setIsTrackingFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 flex gap-2 bg-background border-border hover:bg-muted">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    Filters
                    {activeTrackingFilterCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
                        {activeTrackingFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="w-[320px] p-0 shadow-xl rounded-xl border-border" align="end">
                  <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
                    <h4 className="font-semibold text-sm">Filter Active</h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setIsTrackingFilterOpen(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="p-4 space-y-4 bg-background">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Catalog Company</Label>
                      <Select value={trackingCompanyId} onValueChange={(v) => { setTrackingCompanyId(v); setTrackingCatalogId('ALL'); }}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Companies" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Companies</SelectItem>
                          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Catalog Name</Label>
                      <Select value={trackingCatalogId} onValueChange={setTrackingCatalogId} disabled={trackingCompanyId === 'ALL' || !trackingCompanyId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Catalogs" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Catalogs</SelectItem>
                          {getCatalogsForCompany(trackingCompanyId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Issued By</Label>
                      <Select value={trackingIssuedBy} onValueChange={setTrackingIssuedBy}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Users" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Users</SelectItem>
                          {uniqueIssuedByUsers.map((e: any) => <SelectItem key={e.name} value={e.name}>{e.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 border-t border-border bg-muted/10 flex flex-row-reverse justify-between items-center rounded-b-xl">
                    <Button size="sm" onClick={() => setIsTrackingFilterOpen(false)} className="px-6">
                      Apply filter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-sm text-muted-foreground hover:text-foreground" onClick={handleResetTrackingFilters}>
                      Clear all
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTrackingList.map(m => (
                <div key={m.id} className="card-premium p-4 relative hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase">{m.copy?.catalog.company?.name}</div>
                      <h3 className="font-bold text-base">{m.copy?.catalog.name}</h3>
                      <div className="text-xs text-muted-foreground mt-1 bg-muted inline-block px-2 py-0.5 rounded">Copy #{m.copy?.copyNumber}</div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openReturnDialog(m.id)}>
                      Return
                    </Button>
                  </div>

                  <div className="space-y-2 pt-3 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{m.clientName}</span>
                      <span className="text-muted-foreground text-xs">({m.inquiry?.client_name || 'Direct'})</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{format(new Date(m.issueDate), 'dd MMM, hh:mm a')}</span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      Issued by {m.issuedByUser?.name}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTrackingList.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg card-premium">
                  No active catalogues found matching your filters.
                </div>
              )}
            </div>
          </TabsContent>

          {/* === INVENTORY TAB === */}
          <TabsContent value="inventory" className="space-y-4">

            {/* Top Bar for Inventory */}
            <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-foreground ml-2">Inventory Records</h3>

              <div className="flex items-center gap-2">
                <Popover open={isInventoryFilterOpen} onOpenChange={setIsInventoryFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 flex gap-2 bg-background border-border hover:bg-muted">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      Filters
                      {activeInventoryFilterCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
                          {activeInventoryFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-[320px] p-0 shadow-xl rounded-xl border-border" align="end">
                    <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
                      <h4 className="font-semibold text-sm">Filter Inventory</h4>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setIsInventoryFilterOpen(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="p-4 space-y-4 bg-background">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-foreground">Catalog Company</Label>
                        <Select onValueChange={(v) => { setInventoryCompanyId(v); setInventoryCatalogId(''); }} value={inventoryCompanyId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Show All Companies" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            <SelectItem value="ALL">Show All Companies</SelectItem>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-semibold text-foreground">Catalog Name</Label>
                        <Select disabled={!inventoryCompanyId || inventoryCompanyId === 'ALL'} onValueChange={setInventoryCatalogId} value={inventoryCatalogId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Show All Catalogs" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            <SelectItem value="ALL">Show All Catalogs</SelectItem>
                            {getCatalogsForCompany(inventoryCompanyId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="p-4 border-t border-border bg-muted/10 flex flex-row-reverse justify-between items-center rounded-b-xl">
                      <Button size="sm" onClick={() => setIsInventoryFilterOpen(false)} className="px-6">
                        Apply filter
                      </Button>
                      <Button variant="ghost" size="sm" className="text-sm text-muted-foreground hover:text-foreground" onClick={handleResetInventoryFilters}>
                        Clear all
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button size="sm" className="h-9" onClick={() => setIsAddCopyOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Copies
                </Button>
              </div>
            </div>

            {filteredInventoryList.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {filteredInventoryList.map(copy => (
                  <div key={copy.id} className={`card-premium p-4 flex flex-col items-center text-center ${copy.status === 'ISSUED' ? 'opacity-60' : ''}`}>
                    <div className="bg-white p-1 mb-2 border rounded">
                      <QRCode value={`CAT:${copy.catalogId}-CPY:${copy.copyNumber}`} size={64} />
                    </div>
                    <p className="font-bold text-xs truncate w-full" title={copy.catalog.name}>{copy.catalog.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate w-full">{copy.catalog.company?.name}</p>
                    <p className="text-xs text-muted-foreground mb-2 mt-1">Copy #{copy.copyNumber}</p>
                    <Badge variant={copy.status === 'AVAILABLE' ? 'default' : 'destructive'} className={copy.status === 'AVAILABLE' ? 'bg-green-600 hover:bg-green-700' : ''}>
                      {copy.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg card-premium">
                No inventory found matching your filters.
              </div>
            )}
          </TabsContent>

          {/* === HISTORY TAB === */}
          <TabsContent value="history" className="space-y-4">

            {/* Top Bar for History */}
            <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-foreground ml-2">History Records</h3>

              <Popover open={isHistoryFilterOpen} onOpenChange={setIsHistoryFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 flex gap-2 bg-background border-border hover:bg-muted">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    Filters
                    {activeHistoryFilterCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
                        {activeHistoryFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="w-[450px] p-0 shadow-xl rounded-xl border-border" align="end">
                  <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
                    <h4 className="font-semibold text-sm">Filter History</h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setIsHistoryFilterOpen(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-4 max-h-[60vh] overflow-y-auto bg-background">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Catalog Company</Label>
                      <Select value={historyCompanyId} onValueChange={(v) => { setHistoryCompanyId(v); setHistoryCatalogId('ALL'); }}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Companies" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Companies</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Catalog Name</Label>
                      <Select value={historyCatalogId} onValueChange={setHistoryCatalogId} disabled={historyCompanyId === 'ALL' || !historyCompanyId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Catalogs" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Catalogs</SelectItem>{getCatalogsForCompany(historyCompanyId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Architect</Label>
                      <Select value={historyArchitect} onValueChange={setHistoryArchitect}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Architects" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Architects</SelectItem>{uniqueHistoryArchitects.map(a => <SelectItem key={a as string} value={a as string}>{a as string}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Inquiry</Label>
                      <Select value={historyInquiry} onValueChange={setHistoryInquiry}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Inquiries" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Inquiries</SelectItem>{uniqueHistoryInquiries.map(i => <SelectItem key={i as string} value={i as string}>{i as string}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Issued By</Label>
                      <Select value={historyIssuedBy} onValueChange={setHistoryIssuedBy}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Users" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Users</SelectItem>
                          {uniqueIssuedByUsers.map((e: any) => <SelectItem key={e.name} value={e.name}>{e.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-foreground">Issue Date</Label>
                      <Input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="h-9 text-sm" />
                    </div>
                  </div>

                  <div className="p-4 border-t border-border bg-muted/10 flex flex-row-reverse justify-between items-center rounded-b-xl">
                    <Button size="sm" onClick={() => setIsHistoryFilterOpen(false)} className="px-6">
                      Apply filter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-sm text-muted-foreground hover:text-foreground" onClick={handleResetHistoryFilters}>
                      Clear all filters
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Table Area */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Issued Date</th>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Returned Date</th>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Catalog</th>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Issued To</th>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">By</th>
                    <th className="p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredHistoryList.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-muted-foreground border-dashed">No history matches the current filters.</td></tr>
                  ) : filteredHistoryList.map(m => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-foreground">{format(new Date(m.issueDate), 'dd MMM yy')}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(m.issueDate), 'hh:mm a')}</div>
                      </td>
                      <td className="p-4">
                        {m.returnDate ? (
                          <>
                            <div className="font-medium text-foreground">{format(new Date(m.returnDate), 'dd MMM yy')}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(m.returnDate), 'hh:mm a')}</div>
                          </>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">{m.copy?.catalog.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Copy #{m.copy?.copyNumber}</div>
                      </td>
                      <td className="p-4 font-medium">{m.clientName}</td>
                      <td className="p-4 text-muted-foreground">{m.issuedByUser?.name}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={m.status === 'ISSUED' ? 'text-orange-600 border-orange-200 bg-orange-50' : 'text-green-600 border-green-200 bg-green-50'}>
                          {m.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        {/* --- DIALOGS --- */}

        {/* ISSUE DIALOG */}
        <Dialog open={isIssueOpen} onOpenChange={setIsIssueOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Issue Catalogue</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-6 py-4">
              {/* LEFT: Selection */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">1. Select Company</Label>
                  <Popover open={openCompanyCombo} onOpenChange={setOpenCompanyCombo}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {issueCompanyId ? companies.find(c => c.id === issueCompanyId)?.name : "Search Company..."}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search company..." />
                        <CommandList className="max-h-[200px] overflow-y-auto">
                          <CommandEmpty>No company found.</CommandEmpty>
                          <CommandGroup>
                            {companies.map(c => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  setIssueCompanyId(c.id);
                                  setIssueCatalogId('');
                                  setOpenCompanyCombo(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", issueCompanyId === c.id ? "opacity-100" : "opacity-0")} />
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">2. Select Catalog</Label>
                  <Popover open={openCatalogCombo} onOpenChange={setOpenCatalogCombo}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" disabled={!issueCompanyId} className="w-full justify-between font-normal">
                        {issueCatalogId ? getCatalogsForCompany(issueCompanyId).find(c => c.id === issueCatalogId)?.name : "Search Catalog..."}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search catalog..." />
                        <CommandList className="max-h-[200px] overflow-y-auto">
                          <CommandEmpty>No catalog found.</CommandEmpty>
                          <CommandGroup>
                            {getCatalogsForCompany(issueCompanyId).map(c => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  setIssueCatalogId(c.id);
                                  setIssueForm(prev => ({ ...prev, copyId: '' }));
                                  setOpenCatalogCombo(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", issueCatalogId === c.id ? "opacity-100" : "opacity-0")} />
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">3. Select Copy</Label>
                  <Select
                    disabled={!issueCatalogId}
                    value={issueForm.copyId}
                    onValueChange={v => setIssueForm(prev => ({ ...prev, copyId: v }))}
                  >
                    <SelectTrigger className="font-normal"><SelectValue placeholder="Choose Copy" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {getAvailableCopies(issueCatalogId).map(c => (
                        <SelectItem key={c.id} value={c.id}>Copy #{c.copyNumber} (Available)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* RIGHT: Details */}
              <div className="space-y-4 border-l pl-6 border-border">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Project / Inquiry</Label>
                  <Select onValueChange={v => {
                    const inq = inquiries.find(i => i.id === v);
                    setIssueForm(prev => ({ ...prev, inquiryId: v, clientName: inq?.client_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Optional Link" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {inquiries.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.client_name} ({i.inquiry_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Architect</Label>
                  <Select onValueChange={v => setIssueForm(prev => ({ ...prev, architectId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Architect" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {architects.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Client Name</Label>
                  <Input value={issueForm.clientName} onChange={e => setIssueForm(prev => ({ ...prev, clientName: e.target.value }))} placeholder="Enter Name" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Handover By</Label>
                  {role === 'super_admin' ? (
                    <Select onValueChange={v => setIssueForm(prev => ({ ...prev, issuedByUserId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={profile?.name || "Select Employee"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input disabled value={profile?.name || 'Me'} className="bg-muted/50 text-muted-foreground" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg border">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input type="date" value={issueForm.issueDate} onChange={e => setIssueForm(prev => ({ ...prev, issueDate: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Input type="time" value={issueForm.issueTime} onChange={e => setIssueForm(prev => ({ ...prev, issueTime: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsIssueOpen(false)}>Cancel</Button>
              <Button onClick={handleIssueCatalog} disabled={!issueForm.copyId || !issueForm.clientName}>Confirm Issue</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* RETURN DIALOG */}
        <Dialog open={isReturnOpen} onOpenChange={setIsReturnOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Return Catalogue</DialogTitle></DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex flex-col gap-3">
                <Label className="text-muted-foreground">When was it returned?</Label>

                <div
                  onClick={() => setReturnForm(prev => ({ ...prev, type: 'now' }))}
                  className={`flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-all ${returnForm.type === 'now' ? 'border-primary bg-muted/30' : 'hover:bg-muted/30'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${returnForm.type === 'now' ? 'border-primary' : 'border-border'
                    }`}>
                    {returnForm.type === 'now' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <span className="font-medium text-sm block">Right Now</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(), 'dd MMM, hh:mm a')}</span>
                  </div>
                </div>

                <div
                  onClick={() => setReturnForm(prev => ({ ...prev, type: 'manual' }))}
                  className={`flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-all ${returnForm.type === 'manual' ? 'border-primary bg-muted/30' : 'hover:bg-muted/30'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${returnForm.type === 'manual' ? 'border-primary' : 'border-border'
                    }`}>
                    {returnForm.type === 'manual' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <span className="font-medium text-sm">Custom Date & Time</span>
                </div>
              </div>

              {returnForm.type === 'manual' && (
                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={returnForm.returnDate} onChange={e => setReturnForm(prev => ({ ...prev, returnDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input type="time" value={returnForm.returnTime} onChange={e => setReturnForm(prev => ({ ...prev, returnTime: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsReturnOpen(false)}>Cancel</Button>
              <Button onClick={handleReturnCatalog}>Confirm Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ADD COPY DIALOG */}
        <Dialog open={isAddCopyOpen} onOpenChange={setIsAddCopyOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Generate Copies</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>1. Company</Label>
                <Select onValueChange={setInventoryCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Select Company" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>2. Catalog</Label>
                <Select disabled={!inventoryCompanyId} onValueChange={v => setAddCopyForm({ ...addCopyForm, catalogId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Catalog" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {getCatalogsForCompany(inventoryCompanyId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>3. Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={addCopyForm.quantity}
                  onChange={e => setAddCopyForm({ ...addCopyForm, quantity: parseInt(e.target.value) })}
                />
              </div>
              <Button onClick={handleAddCopies} className="w-full" disabled={!addCopyForm.catalogId}>Generate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Catalogs;