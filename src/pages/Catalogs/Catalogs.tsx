import React, { useEffect, useState } from 'react';
import { Plus, Upload, Search, Edit2, Save, X, BookOpen, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
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
  attributes: any; 
  imageUrl?: string; 
}

const Catalogs: React.FC = () => {
  const { toast } = useToast();
  
  // State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog States
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [uploadType, setUploadType] = useState('Curtains');
  const [isUploading, setIsUploading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', price: '' });

  useEffect(() => { 
    fetchCompanies(); 
  }, []);

  useEffect(() => { 
    if (selectedCatalog) {
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
      toast({ 
        title: 'Error', 
        description: error.response?.data?.error || 'Failed to create company', 
        variant: 'destructive' 
      }); 
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
      toast({ 
        title: 'Error', 
        description: error.response?.data?.error || 'Failed to delete company', 
        variant: 'destructive' 
      }); 
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedCompany) {
      toast({ title: 'Error', description: 'Please select file and company', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    const formData = new FormData(); 
    formData.append('file', file); 
    formData.append('companyId', selectedCompany); 
    formData.append('defaultType', uploadType);
    
    try { 
      const { data } = await api.post('/upload-catalog', formData, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      }); 
      toast({ 
        title: 'Success', 
        description: data.message || 'Catalog uploaded successfully' 
      }); 
      setIsUploadOpen(false); 
      setFile(null); 
      setSelectedCompany('');
      fetchCompanies(); 
      if (selectedCatalog) {
        fetchProducts(selectedCatalog);
      }
    } catch (error: any) { 
      toast({ 
        title: 'Error', 
        description: error.response?.data?.error || 'Failed to upload', 
        variant: 'destructive' 
      }); 
    } finally {
      setIsUploading(false);
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
      toast({ 
        title: 'Error', 
        description: error.response?.data?.error || 'Failed to update', 
        variant: 'destructive' 
      }); 
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

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header - Stacks on Mobile */}
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
                  <DialogHeader>
                    <DialogTitle>Add New Company</DialogTitle>
                  </DialogHeader>
                  <div className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input 
                        value={newCompanyName} 
                        onChange={e=>setNewCompanyName(e.target.value)} 
                        placeholder="Enter company name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddCompany();
                        }}
                      />
                    </div>
                    <Button onClick={handleAddCompany} className="w-full">
                      Create Company
                    </Button>
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
                    <DialogHeader>
                      <DialogTitle>Upload Catalog Excel</DialogTitle>
                    </DialogHeader>
                    <div className="pt-4 space-y-4">
                        <div className="space-y-2">
                          <Label>Select Company</Label>
                          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose company"/>
                            </SelectTrigger>
                            <SelectContent>
                              {companies.map(c=>
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Product Category</Label>
                          <Select value={uploadType} onValueChange={setUploadType}>
                            <SelectTrigger>
                              <SelectValue/>
                            </SelectTrigger>
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
                            accept=".xlsx,.xls"
                            onChange={e=>setFile(e.target.files?.[0] || null)} 
                          />
                          {file && (
                            <p className="text-sm text-muted-foreground break-all">
                              Selected: {file.name}
                            </p>
                          )}
                        </div>

                        <Button 
                          onClick={handleUpload} 
                          disabled={!file || !selectedCompany || isUploading} 
                          className="w-full"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            'Upload Catalog'
                          )}
                        </Button>
                    </div>
                </DialogContent>
             </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[calc(100vh-250px)]">
          {/* ACCORDION SIDEBAR - On mobile: max-height limit + scroll */}
          <div className="card-premium p-4 overflow-y-auto max-h-60 md:max-h-[calc(100vh-200px)]">
            <h3 className="font-semibold mb-4 text-xs uppercase text-muted-foreground tracking-wider">
              Companies & Catalogs
            </h3>
            <div className="space-y-2">
              {companies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No companies yet.</p>
                  <p className="text-xs">Add a company to get started.</p>
                </div>
              ) : (
                companies.map(company => (
                  <div key={company.id} className="border border-border rounded-lg overflow-hidden">
                    <div 
                      className="flex justify-between items-center p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCompany(company.id)}
                    >
                      <div className="font-medium flex items-center gap-2">
                          {expandedCompany === company.id ? (
                            <ChevronDown className="h-4 w-4 text-primary"/>
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                          )}
                          <span className="truncate">{company.name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-destructive hover:bg-destructive/10" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          handleDeleteCompany(company.id, company.name); 
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {expandedCompany === company.id && (
                      <div className="bg-background p-2 space-y-1 border-t border-border animate-in slide-in-from-top-2">
                          {company.catalogs.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-2 text-center">
                              No catalogs uploaded yet.
                            </p>
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
                                    <span className="ml-auto text-xs opacity-60">
                                      {catalog.type}
                                    </span>
                                </button>
                            ))
                          )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Product Table */}
          <div className="md:col-span-3 card-premium overflow-hidden flex flex-col">
             {selectedCatalog ? (
               <>
                 <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                   <h3 className="font-semibold text-foreground">
                     Products ({products.length})
                   </h3>
                   <div className="text-sm text-muted-foreground">
                     {loading ? 'Loading...' : products.length === 0 ? 'No products' : <span className="hidden md:inline">Scroll to view all</span>}
                   </div>
                 </div>
                 {/* Table Container - Horizontal Scroll on Mobile */}
                 <div className="overflow-x-auto flex-1">
                   {loading ? (
                     <div className="flex items-center justify-center h-full">
                       <div className="text-center py-12">
                         <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
                         <p className="text-muted-foreground">Loading products...</p>
                       </div>
                     </div>
                   ) : products.length === 0 ? (
                     <div className="flex items-center justify-center h-full text-muted-foreground">
                       <div className="text-center py-12">
                         <Search className="h-16 w-16 mx-auto mb-4 opacity-20" />
                         <p className="text-lg font-medium">No products found</p>
                         <p className="text-sm mt-1">Upload an Excel file to add products to this catalog.</p>
                       </div>
                     </div>
                   ) : (
                     <table className="w-full text-sm min-w-[600px]">
                       <thead className="sticky top-0 bg-muted/50 z-10">
                         <tr className="border-b">
                           <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Design Code</th>
                           <th className="text-left px-4 py-3 font-semibold text-muted-foreground">RR Price (GST)</th>
                           <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Other Details</th>
                           <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                         </tr>
                       </thead>
                       <tbody>
                         {products.map((product) => (
                           <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors">
                             <td className="px-4 py-3">
                               <p className="font-medium text-foreground">{product.name}</p>
                             </td>
                             <td className="px-4 py-3">
                               <span className="font-semibold text-accent text-base">
                                 ₹{product.price}
                               </span>
                             </td>
                             <td className="px-4 py-3">
                               <div className="flex gap-1 flex-wrap max-w-xs md:max-w-md">
                                 {product.attributes && Object.keys(product.attributes).length > 0 ? (
                                   <>
                                     {Object.entries(product.attributes).slice(0, 4).map(([k,v]) => (
                                       <span 
                                         key={k} 
                                         className="bg-muted px-2 py-0.5 rounded text-xs border border-border"
                                       >
                                         <span className="font-medium text-foreground">{k}:</span>
                                         <span className="text-muted-foreground ml-1">{String(v)}</span>
                                       </span>
                                     ))}
                                     {Object.keys(product.attributes).length > 4 && (
                                       <span className="text-xs text-muted-foreground px-2 py-0.5">
                                         +{Object.keys(product.attributes).length - 4} more
                                       </span>
                                     )}
                                   </>
                                 ) : (
                                   <span className="text-xs text-muted-foreground italic">No additional details</span>
                                 )}
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               {editingProduct?.id === product.id ? (
                                 <div className="flex items-center gap-2 justify-end">
                                   <Input
                                     type="text"
                                     value={editForm.name}
                                     onChange={e => setEditForm({...editForm, name: e.target.value})}
                                     className="h-8 w-24 md:w-32 text-xs"
                                     placeholder="Name"
                                   />
                                   <Input
                                     type="text"
                                     value={editForm.price}
                                     onChange={e => setEditForm({...editForm, price: e.target.value})}
                                     className="h-8 w-20 md:w-24 text-xs"
                                     placeholder="Price"
                                   />
                                   <Button 
                                     size="icon" 
                                     variant="ghost" 
                                     className="h-8 w-8 text-success hover:bg-success/10"
                                     onClick={handleUpdateProduct}
                                   >
                                     <Save className="h-4 w-4"/>
                                   </Button>
                                   <Button 
                                     size="icon" 
                                     variant="ghost" 
                                     className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                     onClick={() => setEditingProduct(null)}
                                   >
                                     <X className="h-4 w-4"/>
                                   </Button>
                                 </div>
                               ) : (
                                 <Button 
                                   size="icon" 
                                   variant="ghost" 
                                   className="h-8 w-8 text-primary hover:bg-primary/10"
                                   onClick={() => handleEditProduct(product)}
                                 >
                                   <Edit2 className="h-4 w-4"/>
                                 </Button>
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
                      <p className="text-sm">
                        Select a company and catalog from the list to view products.
                      </p>
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