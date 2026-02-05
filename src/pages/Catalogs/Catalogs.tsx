import React, { useEffect, useState } from 'react';
import { Plus, Upload, Search, Edit2, Save, X, BookOpen, Trash2, ChevronDown, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import * as XLSX from 'xlsx';

interface Company { 
  id: string; 
  name: string; 
  catalogs: Catalog[]; 
}

interface Catalog { 
  id: string; 
  name: string; 
  type: string; 
}

interface Product { 
  id: string; 
  name: string; 
  price: string;
  description?: string; 
  attributes: Record<string, any>; 
  imageUrl?: string; 
}

// --- SMART MAPPING CONFIGURATION ---
const SMART_MAPPINGS: Record<string, string[]> = {
  // Backend Required Name         // Excel Headers to Look For
  // REMOVED 'RRP' from this list so it strictly picks 'RRP With Gst'
  'RR Price after GST (Cut Rate)': ['RRP With Gst', 'RRP + with gst', 'RRP with GST', 'RRP + GST', 'RRP With GST', 'RRP_With_GST'], 
  'Serial No':                     ['Serial No', 'Series no', 'SKU', 'Design No'],
  'CL + GST':                      ['CL + gst rate', 'CL + GST', 'CL Rate'],
  'Price Code':                    ['PRICE CODE', 'Price code', 'Code', 'Collection Code'],
  'Material Description':          ['Material Description', 'Description', 'Item Name'],
  // Collection is mapped here for data storage, even if hidden in table
  'Collection':                    ['Collection', 'Book Name', 'Catalog Name'],
  'Width':                         ['Width', 'Size'],
  'HSN':                           ['HSN', 'HSN Code'],
  'Gsm':                           ['Gsm', 'GSM', 'Weight']
};

const Catalogs: React.FC = () => {
  const { toast } = useToast();
  
  // State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  
  // Dialog States
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [uploadType, setUploadType] = useState('Curtains'); 
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Editing State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', price: '' });

  useEffect(() => { 
    fetchCompanies(); 
  }, []);

  useEffect(() => { 
    if (selectedCatalog) {
      setProductSearchQuery('');
      fetchProducts(selectedCatalog);
    } else {
      setProducts([]);
    }
  }, [selectedCatalog]);

  const fetchCompanies = async () => {
    try { 
      const { data } = await api.get('/companies'); 
      setCompanies(data); 
    } catch (e) { 
      console.error(e); 
      toast({ title: 'Error', description: 'Failed to load companies', variant: 'destructive' });
    }
  };

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

              // Find exact matching column in file from variations
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

  const handleUpload = async () => {
    if (!file || !selectedCompany) {
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
      formData.append('companyId', selectedCompany); 
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
      setSelectedCompany('');
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

  const getAttr = (product: Product, key: string) => {
    if (product.attributes?.[key]) return product.attributes[key];
    if (key === 'Price Code' && product.attributes?.['PRICE CODE']) return product.attributes['PRICE CODE'];
    return '-';
  };

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

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Catalog Manager</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Manage companies, catalogs and products</p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
                          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
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
                          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <div className="text-xs">
                             <p className="font-semibold text-green-700 mb-1">Smart Auto-Fix Enabled</p>
                             <p className="text-muted-foreground">
                               Uploaded files will be automatically corrected. We will strictly use "RRP With Gst" for the price.
                             </p>
                          </div>
                        </div>

                        <Button 
                          onClick={handleUpload} 
                          disabled={!file || !selectedCompany || isUploading} 
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
                      {company.catalogs.length === 0 ? <p className="text-xs text-muted-foreground p-2 text-center">No catalogs.</p> : company.catalogs.map(catalog => (
                        <button key={catalog.id} onClick={() => setSelectedCatalog(catalog.id)} className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${selectedCatalog === catalog.id ? 'bg-accent/10 text-accent font-medium border border-accent/20' : 'text-muted-foreground hover:bg-muted'}`}>
                          <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{catalog.name}</span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded capitalize ${catalog.type === 'Curtains' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {catalog.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

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
      </div>
    </DashboardLayout>
  );
};

export default Catalogs; 