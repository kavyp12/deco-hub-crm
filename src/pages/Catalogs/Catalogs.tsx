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
  copy?: CatalogCopy;
}
interface Employee { id: string; name: string; }

// --- SMART MAPPING CONFIGURATION ---
const SMART_MAPPINGS: Record<string, string[]> = {
  'RR Price after GST (Cut Rate)': ['RRP With Gst', 'RRP + with gst', 'RRP with GST', 'RRP + GST', 'RRP With GST', 'RRP_With_GST'], 
  'Serial No': ['Serial No', 'Series no', 'SKU', 'Design No'],
  'CL + GST': ['CL + gst rate', 'CL + GST', 'CL Rate'],
  'Price Code': ['PRICE CODE', 'Price code', 'Code', 'Collection Code'],
  'Material Description': ['Material Description', 'Description', 'Item Name'],
  'Collection': ['Collection', 'Book Name', 'Catalog Name'],
  'Width': ['Width', 'Size'],
  'HSN': ['HSN', 'HSN Code'],
  'Gsm': ['Gsm', 'GSM', 'Weight']
};

const Catalogs: React.FC = () => {
  const { toast } = useToast();
  const { profile, role } = useAuth();
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('library');
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
  }, []);

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
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load companies', variant: 'destructive' });
    }
  };
  
  const fetchEmployees = async () => { try { const { data } = await api.get('/users/sales-people'); setEmployees(data); } catch (e) {} };
  const fetchCopies = async () => { try { const { data } = await api.get('/catalogs/copies'); setCopies(data); } catch (e) {} };
  const fetchMovements = async () => { try { const { data } = await api.get('/catalogs/tracking'); setMovements(data); } catch (e) {} };
  const fetchInquiries = async () => { try { const { data } = await api.get('/inquiries'); setInquiries(data); } catch (e) {} };
  const fetchArchitects = async () => { try { const { data } = await api.get('/architects'); setArchitects(data); } catch (e) {} };
  
  const fetchProducts = async (catalogId: string) => { 
    setLoading(true);
    try { 
      const { data } = await api.get(`/catalogs/${catalogId}/products`);
      const uniqueProducts = data.filter((product: Product, index: number, self: Product[]) =>
        index === self.findIndex((p) => p.id === product.id)
      );
      setProducts(uniqueProducts); 
    } catch (e) { 
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load products', variant: 'destructive' });
    } finally { 
      setLoading(false); 
    }
  };

  // --- HELPERS ---
  const getCatalogsForCompany = (compId: string) => companies.find(c => c.id === compId)?.catalogs || [];
  const getAvailableCopies = (catId: string) => copies.filter(c => c.catalogId === catId && c.status === 'AVAILABLE');

  const getAttr = (product: Product, key: string) => {
    if (product.attributes?.[key]) return product.attributes[key];
    if (key === 'Price Code' && product.attributes?.['PRICE CODE']) return product.attributes['PRICE CODE'];
    return '-';
  };

  // --- FILTERED INVENTORY LOGIC ---
  const getFilteredInventory = () => {
    return copies.filter(copy => {
      if (inventoryCompanyId && inventoryCompanyId !== 'ALL' && copy.catalog.companyId !== inventoryCompanyId) return false;
      if (inventoryCatalogId && inventoryCatalogId !== 'ALL' && copy.catalogId !== inventoryCatalogId) return false;
      return true;
    });
  };

  const filteredInventoryList = getFilteredInventory();

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

  // --- FILE PROCESSING ---
  const processFile = (originalFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (jsonData.length > 0) {
            const currentHeaders = jsonData[0] as string[];
            const newHeaders = [...currentHeaders]; 
            let changesMade = false;

            Object.entries(SMART_MAPPINGS).forEach(([targetHeader, variations]) => {
              if (currentHeaders.includes(targetHeader)) return;

              const foundIndex = currentHeaders.findIndex(h => 
                h && variations.some(v => h.trim().toLowerCase() === v.toLowerCase())
              );

              if (foundIndex !== -1) {
                console.log(`Auto-Mapping: Renaming "${currentHeaders[foundIndex]}" to "${targetHeader}"`);
                newHeaders[foundIndex] = targetHeader;
                changesMade = true;
              }
            });
            
            if (changesMade) {
              jsonData[0] = newHeaders;
              const newWorksheet = XLSX.utils.aoa_to_sheet(jsonData);
              const newWorkbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Sheet1");
              
              const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
              const newFile = new File([excelBuffer], originalFile.name, { type: originalFile.type });
              resolve(newFile);
              return;
            }
          }
          resolve(originalFile);
        } catch (error) {
          console.error("Error processing file:", error);
          resolve(originalFile);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(originalFile);
    });
  };

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
    if(!confirm(`Delete "${name}" and all its catalogs/products? This cannot be undone.`)) return;
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
    setUploadStatus('Checking File...');

    try {
      const processedFile = await processFile(file);
      
      setUploadStatus('Uploading...');
      const formData = new FormData(); 
      formData.append('file', processedFile); 
      formData.append('companyId', selectedCompanyUpload); 
      formData.append('defaultType', uploadType); 
      
      const mapping = {
         name: 'Material Description',
         price: 'RR Price after GST (Cut Rate)',
         sku: 'Serial No',
         description: 'Collection'
      };
      formData.append('mapping', JSON.stringify(mapping));

      const response = await api.post('/upload-catalog', formData, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      }); 
      
      const { data } = response;
      
      if (data.errors && data.errors.length > 0) {
        const firstError = typeof data.errors[0] === 'string' ? data.errors[0] : JSON.stringify(data.errors[0]);
        toast({
          title: 'Partial Success',
          description: `Processed ${data.processed} items. ${data.errors.length} errors. First: ${firstError}`,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Success', description: data.message || `Catalog uploaded successfully.` }); 
      }

      setIsUploadOpen(false); 
      setFile(null); 
      setSelectedCompanyUpload('');
      fetchCompanies(); 
      if (selectedCatalog) fetchProducts(selectedCatalog);

    } catch (error: any) { 
      console.error("Upload failed:", error);
      toast({ 
        title: 'Upload Failed', 
        description: error.response?.data?.message || 'Failed to upload.', 
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
    if(!editingProduct) return;
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
            <ArrowRightLeft className="h-4 w-4"/> Issue Catalogue
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="library" className="gap-2"><BookOpen className="h-4 w-4"/> Library</TabsTrigger>
            <TabsTrigger value="tracking" className="gap-2"><ArrowRightLeft className="h-4 w-4"/> Active</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2"><QrCode className="h-4 w-4"/> Inventory</TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4"/> History</TabsTrigger>
          </TabsList>

          {/* === LIBRARY TAB === */}
          <TabsContent value="library" className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex gap-2 flex-wrap flex-1">
                <Dialog open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1 md:flex-none">
                      <Plus className="mr-2 h-4 w-4"/> Add Company
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[90vw] md:max-w-lg">
                    <DialogHeader><DialogTitle>Add New Company</DialogTitle></DialogHeader>
                    <div className="pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Company Name</Label>
                        <Input value={newCompanyName} onChange={e=>setNewCompanyName(e.target.value)} placeholder="Enter company name" />
                      </div>
                      <Button onClick={handleAddCompany} className="w-full">Create Company</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                  <DialogTrigger asChild>
                    <Button variant="accent" className="flex-1 md:flex-none">
                      <Upload className="mr-2 h-4 w-4"/> Upload Excel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[90vw] md:max-w-lg">
                    <DialogHeader><DialogTitle>Upload Catalog Excel</DialogTitle></DialogHeader>
                    <div className="pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Select Company</Label>
                        <Select value={selectedCompanyUpload} onValueChange={setSelectedCompanyUpload}>
                          <SelectTrigger><SelectValue placeholder="Choose company"/></SelectTrigger>
                          <SelectContent>
                            {companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Product Category</Label>
                        <Select value={uploadType} onValueChange={setUploadType}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
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
                          onChange={e=>setFile(e.target.files?.[0] || null)} 
                        />
                        {file && <p className="text-xs text-muted-foreground mt-1">Selected: {file.name}</p>}
                      </div>

                      <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3 flex gap-3 items-start">
                        <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-green-700 mb-1">Smart Auto-Fix Enabled</p>
                          <p className="text-muted-foreground">
                            Uploaded files will be automatically corrected. We will strictly use "RRP With Gst" for the price.
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[calc(100vh-250px)]">
              {/* Sidebar: Companies */}
              <div className="card-premium p-4 overflow-y-auto max-h-60 md:max-h-[calc(100vh-200px)]">
                <h3 className="font-semibold mb-4 text-xs uppercase text-muted-foreground tracking-wider">Companies & Catalogs</h3>
                <div className="relative mb-4">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." className="pl-9 h-9 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div className="space-y-2">
                  {filteredCompanies.map(company => (
                    <div key={company.id} className="border border-border rounded-lg overflow-hidden">
                      <div className="flex justify-between items-center p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleCompany(company.id)}>
                        <div className="font-medium flex items-center gap-2">
                          {expandedCompany === company.id ? <ChevronDown className="h-4 w-4 text-primary"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                          <span className="truncate">{company.name}</span>
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
                                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded capitalize ${
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

              {/* Main Area: Products */}
              <div className="md:col-span-3 card-premium overflow-hidden flex flex-col">
                {selectedCatalog ? (
                  <>
                    <div className="p-4 border-b border-border bg-muted/20 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground whitespace-nowrap">Products ({filteredProducts.length})</h3>
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>}
                      </div>
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search products..." className="pl-9 h-9 text-sm" value={productSearchQuery} onChange={(e) => setProductSearchQuery(e.target.value)} />
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto flex-1">
                      {loading ? (
                        <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">No products found</div>
                      ) : (
                        <table className="w-full text-sm min-w-[1000px]">
                          <thead className="sticky top-0 bg-muted/50 z-10">
                            <tr className="border-b">
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Series No</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Width</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">HSN</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">CL + GST</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">RRP + GST</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Price Code</th>
                              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">GSM</th>
                              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredProducts.map((product) => (
                              <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">{getAttr(product, 'Serial No')}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{getAttr(product, 'Width')}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{getAttr(product, 'HSN')}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-medium text-accent">₹{getAttr(product, 'CL + GST')}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-medium">₹{product.price}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-bold text-muted-foreground">{getAttr(product, 'Price Code')}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{getAttr(product, 'Gsm')}</td>
                                <td className="px-4 py-3 text-right">
                                  {editingProduct?.id === product.id ? (
                                    <div className="flex items-center gap-2 justify-end">
                                      <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="h-8 w-32 text-xs" />
                                      <Input value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} className="h-8 w-24 text-xs" />
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={handleUpdateProduct}><Save className="h-4 w-4"/></Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingProduct(null)}><X className="h-4 w-4"/></Button>
                                    </div>
                                  ) : (
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleEditProduct(product)}><Edit2 className="h-4 w-4"/></Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-border m-4 rounded-lg">
                    <div className="text-center py-12 px-4">
                      <Search className="h-16 w-16 mx-auto mb-4 opacity-20"/>
                      <p className="text-lg font-medium mb-2">No Catalog Selected</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* === TRACKING TAB === */}
          <TabsContent value="tracking" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {movements.filter(m => m.status === 'ISSUED').map(m => (
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
              {movements.filter(m => m.status === 'ISSUED').length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg card-premium">
                  No catalogues are currently out.
                </div>
              )}
            </div>
          </TabsContent>

          {/* === INVENTORY TAB === */}
          <TabsContent value="inventory" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center card-premium p-4">
              <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-2">
                    <Filter className="h-3 w-3"/> Filter by Company
                  </Label>
                  <Select 
                    onValueChange={(v) => { 
                      setInventoryCompanyId(v); 
                      setInventoryCatalogId(''); 
                    }} 
                    value={inventoryCompanyId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Show All Companies"/>
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="ALL">Show All Companies</SelectItem>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-2">
                    <Filter className="h-3 w-3"/> Filter by Catalog
                  </Label>
                  <Select 
                    disabled={!inventoryCompanyId || inventoryCompanyId === 'ALL'} 
                    onValueChange={setInventoryCatalogId} 
                    value={inventoryCatalogId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Show All Catalogs"/>
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="ALL">Show All Catalogs</SelectItem>
                      {getCatalogsForCompany(inventoryCompanyId).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                <Button onClick={() => setIsAddCopyOpen(true)}><Plus className="mr-2 h-4 w-4"/> Add Copies</Button>
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
          <TabsContent value="history">
            <div className="card-premium overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 font-semibold text-muted-foreground">Issued Date</th>
                    <th className="p-3 font-semibold text-muted-foreground">Returned Date</th>
                    <th className="p-3 font-semibold text-muted-foreground">Catalog</th>
                    <th className="p-3 font-semibold text-muted-foreground">Issued To</th>
                    <th className="p-3 font-semibold text-muted-foreground">By</th>
                    <th className="p-3 font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map(m => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="font-medium">{format(new Date(m.issueDate), 'dd MMM yy')}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(m.issueDate), 'hh:mm a')}</div>
                      </td>
                      <td className="p-3">
                        {m.returnDate ? (
                          <>
                            <div className="font-medium">{format(new Date(m.returnDate), 'dd MMM yy')}</div>
                            <div className="text-xs text-muted-foreground">{format(new Date(m.returnDate), 'hh:mm a')}</div>
                          </>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{m.copy?.catalog.name}</div>
                        <div className="text-xs text-muted-foreground">Copy #{m.copy?.copyNumber}</div>
                      </td>
                      <td className="p-3">{m.clientName}</td>
                      <td className="p-3">{m.issuedByUser?.name}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={m.status === 'ISSUED' ? 'text-orange-600 border-orange-200 bg-orange-50' : ''}>
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
                                <Check className={cn("mr-2 h-4 w-4", issueCompanyId === c.id ? "opacity-100" : "opacity-0")}/>
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
                                  setIssueForm(prev => ({...prev, copyId: ''})); 
                                  setOpenCatalogCombo(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", issueCatalogId === c.id ? "opacity-100" : "opacity-0")}/>
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
                    onValueChange={v => setIssueForm(prev => ({...prev, copyId: v}))}
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
                    setIssueForm(prev => ({...prev, inquiryId: v, clientName: inq?.client_name || ''}));
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
                  <Select onValueChange={v => setIssueForm(prev => ({...prev, architectId: v}))}>
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
                  <Input value={issueForm.clientName} onChange={e => setIssueForm(prev => ({...prev, clientName: e.target.value}))} placeholder="Enter Name"/>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Handover By</Label>
                  {role === 'super_admin' ? (
                    <Select onValueChange={v => setIssueForm(prev => ({...prev, issuedByUserId: v}))}>
                      <SelectTrigger>
                        <SelectValue placeholder={profile?.name || "Select Employee"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input disabled value={profile?.name || 'Me'} className="bg-muted/50 text-muted-foreground"/>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg border">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input type="date" value={issueForm.issueDate} onChange={e => setIssueForm(prev => ({...prev, issueDate: e.target.value}))} className="h-8 text-xs"/>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Input type="time" value={issueForm.issueTime} onChange={e => setIssueForm(prev => ({...prev, issueTime: e.target.value}))} className="h-8 text-xs"/>
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
                  onClick={() => setReturnForm(prev => ({...prev, type: 'now'}))}
                  className={`flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-all ${
                    returnForm.type === 'now' ? 'border-primary bg-muted/30' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    returnForm.type === 'now' ? 'border-primary' : 'border-border'
                  }`}>
                    {returnForm.type === 'now' && <div className="w-2 h-2 rounded-full bg-primary"/>}
                  </div>
                  <div>
                    <span className="font-medium text-sm block">Right Now</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(), 'dd MMM, hh:mm a')}</span>
                  </div>
                </div>

                <div 
                  onClick={() => setReturnForm(prev => ({...prev, type: 'manual'}))}
                  className={`flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-all ${
                    returnForm.type === 'manual' ? 'border-primary bg-muted/30' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    returnForm.type === 'manual' ? 'border-primary' : 'border-border'
                  }`}>
                    {returnForm.type === 'manual' && <div className="w-2 h-2 rounded-full bg-primary"/>}
                  </div>
                  <span className="font-medium text-sm">Custom Date & Time</span>
                </div>
              </div>

              {returnForm.type === 'manual' && (
                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={returnForm.returnDate} onChange={e => setReturnForm(prev => ({...prev, returnDate: e.target.value}))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input type="time" value={returnForm.returnTime} onChange={e => setReturnForm(prev => ({...prev, returnTime: e.target.value}))} />
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
                  <SelectTrigger><SelectValue placeholder="Select Company"/></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>2. Catalog</Label>
                <Select disabled={!inventoryCompanyId} onValueChange={v => setAddCopyForm({...addCopyForm, catalogId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Catalog"/></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {getCatalogsForCompany(inventoryCompanyId).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>3. Quantity</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={addCopyForm.quantity} 
                  onChange={e => setAddCopyForm({...addCopyForm, quantity: parseInt(e.target.value)})}
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