import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Ruler } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { processProductsForDropdown } from '@/lib/utils';
interface MeasurementRow {
  uid: string;
  companyId: string;
  companyInput: string;
  catalogId: string;
  catalogInput: string;
  catalogName: string;
  catalogType: string;
  productId: string;
  productName: string;
  selectedProductName: string;
  srlNo?: string;
  areaName: string;
  unit: 'mm' | 'cm' | 'inch';
  width: string;
  height: string;
  type: 'Manual' | 'Automatic / Motorized' | '';
  motorizationMode: 'Remote' | 'Automation' | 'Both' | '';
  opsType: 'L' | 'R' | '';
  pelmet: string;
  openingType: 'Left' | 'Right' | 'Center' | '';
  quantity: number;
  price: number;
}
const COMMON_AREAS = [
  "Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom",
  "Guest Bedroom", "Parents Bedroom", "Dining Room", "Kitchen",
  "Study Room", "Home Office", "Balcony", "Verandah",
  "Puja Room", "Staircase", "Lobby", "Entrance",
  "Bathroom", "Store Room", "Servant Room", "Utility Area"
];

const IndependentMeasurementForm: React.FC = () => {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [inquiry, setInquiry] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);

  const [companies, setCompanies] = useState<any[]>([]);
  const [allCatalogs, setAllCatalogs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [rows, setRows] = useState<MeasurementRow[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const inqRes = await api.get('/inquiries');
        const currentInquiry = inqRes.data.find((i: any) => i.id === inquiryId);

        if (!currentInquiry) {
          toast({ title: 'Error', description: 'Inquiry not found', variant: 'destructive' });
          navigate('/measurements');
          return;
        }
        setInquiry(currentInquiry);

        // Fetch Companies & Catalogs
        const companiesRes = await api.get('/companies');
        setCompanies(companiesRes.data);

        const flatCatalogs = companiesRes.data.flatMap((c: any) =>
          c.catalogs.map((cat: any) => ({
            ...cat,
            companyName: c.name,
            companyId: c.id,
            type: cat.type || 'Generic'
          }))
        );
        setAllCatalogs(flatCatalogs);

        // Fetch Products
        const prodRes = await api.get('/products/all');
        setProducts(prodRes.data);

        // Load Selection Items
        try {
          const selRes = await api.get(`/selections/by-inquiry/${inquiryId}`);

          if (selRes.data && selRes.data.items && selRes.data.items.length > 0) {
            setSelection(selRes.data);

            const mappedRows = selRes.data.items.map((item: any) => {
              const associatedProduct = prodRes.data.find((p: any) => p.id === item.productId);

              let compId = '';
              let catId = '';
              let catName = item.details?.catalogName || item.catalogName || '';
              let catType = item.details?.catalogType || item.catalogType || 'Curtains';

              if (associatedProduct && associatedProduct.catalog) {
                compId = associatedProduct.catalog.companyId;
                catId = associatedProduct.catalog.id;
                catName = associatedProduct.catalog.name;
                catType = associatedProduct.catalog.type || 'Curtains';
              } else if (catName) {
                const matchingCat = flatCatalogs.find((c: any) => c.name === catName);
                if (matchingCat) {
                  compId = matchingCat.companyId;
                  catId = matchingCat.id;
                  catType = matchingCat.type;
                }
              }

              // ✅ NEW: Final fallback — use companyId saved in details if still not found
              if (!compId && item.details?.companyId) {
                compId = item.details.companyId;
              }

              const companyName = compId ? (companiesRes.data.find((c: any) => c.id === compId)?.name || compId) : '';
              return {
                uid: item.id || Math.random().toString(36).substr(2, 9),
                companyId: compId,
                companyInput: companyName,
                catalogId: catId,
                catalogInput: catName,
                catalogName: catName,
                catalogType: catType,
                productId: item.productId || '',
                productName: item.productName || '',
                selectedProductName: item.productName || '',
                srlNo: item.srlNo || item.details?.srlNo || '',
                areaName: item.details?.areaName || item.areaName || '',
                unit: item.unit || 'mm',
                width: item.width?.toString() || '',
                height: item.height?.toString() || '',
                type: item.type || '',
                motorizationMode: item.motorizationMode || '',
                opsType: item.opsType || '',
                pelmet: item.pelmet?.toString() || '',
                openingType: item.openingType || '',
                quantity: item.quantity || 1,
                price: item.price || 0
              };
            });
            setRows(mappedRows);
          } else {
            setRows([createEmptyRow()]);
          }
        } catch (error: any) {
          // If 404, assume new selection
          setRows([createEmptyRow()]);
        }
      } catch (error) {
        console.error('Init error:', error);
        toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    if (inquiryId) init();
  }, [inquiryId, navigate, toast]);

  const createEmptyRow = (): MeasurementRow => ({
    uid: Math.random().toString(36).substr(2, 9),
    companyId: '',
    companyInput: '',
    catalogId: '',
    catalogInput: '',
    catalogName: '',
    catalogType: '',
    productId: '',
    productName: '',
    selectedProductName: '',
    srlNo: '',
    areaName: '',
    unit: 'mm',
    width: '',
    height: '',
    type: '',
    motorizationMode: '',
    opsType: '',
    pelmet: '',
    openingType: '',
    quantity: 1,
    price: 0
  });
  const handleAddRow = () => setRows(prev => [...prev, createEmptyRow()]);

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) {
      toast({ title: 'Warning', description: 'At least one row is required', variant: 'destructive' });
      return;
    }
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof MeasurementRow, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      if (field === 'type' && value === 'Manual') {
        newRows[index].motorizationMode = '';
      }
      return newRows;
    });
  };

  const handleCompanySelect = (index: number, companyId: string, inputVal?: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        companyId,
        companyInput: inputVal ?? companyId,
        catalogId: '',
        catalogInput: '',
        catalogName: '',
        catalogType: '',
        productId: '',
        productName: '',
        selectedProductName: '',
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };

  const handleCatalogSelect = (index: number, catalogId: string, inputVal?: string) => {
    const catalog = allCatalogs.find(c => c.id === catalogId);
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        catalogId: catalog ? catalog.id : catalogId,
        catalogInput: inputVal ?? (catalog ? catalog.name : catalogId),
        catalogName: catalog ? catalog.name : (inputVal || catalogId),
        catalogType: catalog ? (catalog.type || 'Curtains') : 'Generic',
        productId: '',
        productName: '',
        selectedProductName: '',
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };

  // ✅ NEW: Step 1 — pick design name only, clears SRL
  const handleDesignSelect = (index: number, designName: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        selectedProductName: designName,
        productId: '',
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };

  // ✅ UPDATED: Step 2 — pick specific SRL
  const handleProductSelect = (index: number, srlValue: string) => {
    if (!srlValue) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], productId: '', srlNo: '', price: 0 };
        return newRows;
      });
      return;
    }

    setRows(prev => {
      const catalogId = prev[index].catalogId;
      const selectedDesign = prev[index].selectedProductName;
      const availableProdList = processProductsForDropdown(
        products.filter(p => p.catalogId === catalogId && p.name === selectedDesign)
      );
      const processedProd = availableProdList.find(p => p.srlNo === srlValue);

      if (processedProd) {
        const newRows = [...prev];
        const price = typeof processedProd.price === 'number'
          ? processedProd.price
          : parseFloat(String(processedProd.price).replace(/,/g, '')) || 0;
        newRows[index] = {
          ...newRows[index],
          productId: processedProd.originalId,
          productName: processedProd.name,
          selectedProductName: processedProd.name,
          srlNo: processedProd.srlNo !== 'N/A' ? processedProd.srlNo : '',
          price: price
        };
        return newRows;
      } else {
        const newRows = [...prev];
        newRows[index] = {
          ...newRows[index],
          productId: 'manual',
          productName: newRows[index].selectedProductName || 'Custom Design',
          srlNo: srlValue,
          price: 0
        };
        return newRows;
      }
    });
  };

  const handleSave = async () => {
    const invalidRows = rows.filter(r => !r.areaName.trim());
    if (invalidRows.length > 0) {
      toast({ title: 'Validation Error', description: 'All rows must have an Area Name', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        inquiryId,
        status: selection?.status || 'pending',
        delivery_date: selection?.delivery_date || null,
        notes: selection?.notes || null,
        items: rows.map(r => ({
          productId: r.productId || null,
          productName: r.productName || 'Custom Item',
          quantity: r.quantity,
          price: r.price,
          unit: r.unit,
          width: r.width ? parseFloat(r.width) : null,
          height: r.height ? parseFloat(r.height) : null,
          type: r.catalogType === 'Curtains' ? (r.type || null) : null,
          motorizationMode: r.catalogType === 'Curtains' ? (r.motorizationMode || null) : null,
          opsType: r.catalogType === 'Curtains' ? (r.opsType || null) : null,
          pelmet: r.catalogType === 'Curtains' ? (r.pelmet ? parseFloat(r.pelmet) : null) : null,
          openingType: r.catalogType === 'Curtains' ? (r.openingType || null) : null,
          areaName: r.areaName,
          catalogName: r.catalogName,
          srlNo: r.srlNo || null,
          details: {
            catalogName: r.catalogName,
            catalogType: r.catalogType,
            companyId: r.companyId,
            areaName: r.areaName,        // ✅ ADD THIS
            srlNo: r.srlNo || null
          }
        }))
      };

      if (selection) {
        await api.put(`/selections/${selection.id}`, payload);
      } else {
        await api.post('/selections', payload);
      }
      toast({ title: 'Success', description: 'Measurements saved successfully' });
      setTimeout(() => navigate('/selections'), 1000);
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to save measurements', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'curtains': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'rugs': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'blinds': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  // Controlled input handlers for Company
  const handleCompanyInputChange = (index: number, value: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], companyInput: value };
      return newRows;
    });
    const match = companies.find(c => c.name.toLowerCase() === value.toLowerCase());
    if (match) handleCompanySelect(index, match.id, value);
    else if (value === '') handleCompanySelect(index, '', '');
  };

  const handleCompanyInputBlur = (index: number, value: string) => {
    const match = companies.find(c => c.name.toLowerCase() === value.toLowerCase());
    if (match) {
      handleCompanySelect(index, match.id, match.name);
    } else if (value.trim()) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], companyId: value, companyInput: value, catalogId: '', catalogInput: '', catalogName: '', catalogType: '', productId: '', productName: '', selectedProductName: '', srlNo: '', price: 0 };
        return newRows;
      });
    }
  };

  // Controlled input handlers for Catalog
  const handleCatalogInputChange = (index: number, value: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], catalogInput: value };
      return newRows;
    });
    const row = rows[index];
    const relevantCatalogs = allCatalogs.filter(c => c.companyId === row.companyId);
    const match = relevantCatalogs.find(c => c.name.toLowerCase() === value.toLowerCase());
    if (match) handleCatalogSelect(index, match.id, value);
    else if (value === '') handleCatalogSelect(index, '', '');
  };

  const handleCatalogInputBlur = (index: number, value: string) => {
    const row = rows[index];
    const relevantCatalogs = allCatalogs.filter(c => c.companyId === row.companyId);
    const match = relevantCatalogs.find(c => c.name.toLowerCase() === value.toLowerCase());
    if (match) {
      handleCatalogSelect(index, match.id, match.name);
    } else if (value.trim()) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], catalogId: value, catalogInput: value, catalogName: value, catalogType: 'Generic', productId: '', productName: '', selectedProductName: '', srlNo: '', price: 0 };
        return newRows;
      });
    }
  };

  const handleSrlDirectSearch = (index: number, srlTerm: string) => {
    const row = rows[index];
    if (!row.catalogId || !srlTerm.trim()) return;

    // Find all products for the current catalog
    const relevantProducts = products.filter(p => p.catalogId === row.catalogId);
    const processedProducts = processProductsForDropdown(relevantProducts);

    // Search for an exact or case-insensitive match on the SRL No
    const matchedProd = processedProducts.find(
      p => p.srlNo?.toString().toLowerCase() === srlTerm.trim().toLowerCase()
    );

    if (matchedProd) {
      const price = typeof matchedProd.price === 'number'
        ? matchedProd.price
        : parseFloat(String(matchedProd.price).replace(/,/g, '')) || 0;

      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = {
          ...newRows[index],
          selectedProductName: matchedProd.name, // Auto-selects the Design Name
          productId: matchedProd.originalId,     // Selects the exact product mapping
          productName: matchedProd.name,
          srlNo: matchedProd.srlNo,
          price: price
        };
        return newRows;
      });

      toast({ title: 'Product Found', description: `Auto-selected ${matchedProd.name} (SRL: ${matchedProd.srlNo})` });
    } else {
      toast({ title: 'Not Found', description: `No product found with SRL: ${srlTerm} in this catalog.`, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const totalAmount = rows.reduce((sum, r) => sum + (r.quantity * r.price), 0);

  return (
    <DashboardLayout>
      <div className="max-w-[98vw] mx-auto animate-fade-in pb-20">

        {/* Header - Stack on Mobile */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-start md:items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/measurements')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Ruler className="h-5 w-5 md:h-6 md:w-6 text-primary" /> Measurement Form
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{inquiry?.client_name}</span>
                <span className="hidden md:inline h-1 w-1 bg-muted-foreground rounded-full" />
                <span className="text-xs bg-muted px-2 py-0.5 rounded">{inquiry?.inquiry_number}</span>
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} variant="accent" className="w-full md:w-auto gap-2 shadow-md">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {/* Main Table Container */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm border-collapse" style={{ minWidth: '1600px' }}>
              <thead className="bg-gradient-to-r from-primary/10 to-primary/5 sticky top-0 z-10">
                <tr>
                  <th className="p-2 w-10 text-center font-bold text-primary border-r border-primary/20 sticky left-0 bg-white z-20 shadow-sm">#</th>
                  <th className="p-2 w-36 text-left font-bold text-primary border-r border-primary/20">Area *</th>
                  <th className="p-2 w-36 text-left font-bold text-primary border-r border-primary/20">Company</th>
                  <th className="p-2 w-44 text-left font-bold text-primary border-r border-primary/20">Catalog</th>
                  <th className="p-2 w-56 text-left font-bold text-primary border-r border-primary/20">Product / SRL</th>
                  <th className="p-2 w-16 text-left font-bold text-primary border-r border-primary/20">Unit</th>
                  <th className="p-2 w-20 text-left font-bold text-primary border-r border-primary/20">Width</th>
                  <th className="p-2 w-20 text-left font-bold text-primary border-r border-primary/20">Height</th>
                  <th className="p-2 w-28 text-left font-bold text-primary border-r border-primary/20">Type</th>
                  <th className="p-2 w-32 text-left font-bold text-primary border-r border-primary/20">Motorization</th>
                  <th className="p-2 w-16 text-left font-bold text-primary border-r border-primary/20">OPS</th>
                  <th className="p-2 w-20 text-left font-bold text-primary border-r border-primary/20">Pelmet</th>
                  <th className="p-2 w-24 text-left font-bold text-primary border-r border-primary/20">Opening</th>
                  <th className="p-2 w-10 sticky right-0 bg-white z-20 shadow-sm"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, idx) => {
                  const isCurtainRow = row.catalogType === 'Curtains';
                  const disableCurtainFields = !isCurtainRow;
                  const rowCatalogs = allCatalogs.filter(c => c.companyId === row.companyId);

                  return (
                    <tr key={row.uid} className="group hover:bg-primary/5 transition-colors">
                      <td className="p-1 text-center text-xs text-muted-foreground border-r bg-muted/10 font-bold sticky left-0 z-10">{idx + 1}</td>

                      {/* Area */}
                      <td className="p-1 border-r">
                        <input
                          list={`area-suggestions-${row.uid}`}
                          value={row.areaName}
                          onChange={(e) => updateRow(idx, 'areaName', e.target.value)}
                          className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                          placeholder="Area Name"
                        />
                        <datalist id={`area-suggestions-${row.uid}`}>
                          {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance", "Lobby"].map(area => (
                            <option key={area} value={area} />
                          ))}
                        </datalist>
                      </td>

                      {/* Company — fully controlled */}
                      <td className="p-1 border-r">
                        <input
                          list={`company-list-${row.uid}`}
                          placeholder="Company..."
                          value={row.companyInput}
                          onChange={(e) => handleCompanyInputChange(idx, e.target.value)}
                          onBlur={(e) => handleCompanyInputBlur(idx, e.target.value)}
                          className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                        />
                        <datalist id={`company-list-${row.uid}`}>
                          {companies.map(c => <option key={c.id} value={c.name} />)}
                        </datalist>
                      </td>

                      {/* Catalog — fully controlled */}
                      <td className="p-1 border-r">
                        <input
                          list={`catalog-list-${row.uid}`}
                          placeholder="Catalog..."
                          value={row.catalogInput}
                          onChange={(e) => handleCatalogInputChange(idx, e.target.value)}
                          onBlur={(e) => handleCatalogInputBlur(idx, e.target.value)}
                          className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                        />
                        <datalist id={`catalog-list-${row.uid}`}>
                          {rowCatalogs.map(cat => <option key={cat.id} value={cat.name} />)}
                        </datalist>
                        {row.catalogType && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border mt-0.5 inline-block ${getBadgeColor(row.catalogType)}`}>
                            {row.catalogType}
                          </span>
                        )}
                      </td>

                      {/* Product / SRL — compact 2-row */}
                      <td className="p-1 border-r">
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="🔍 SRL"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSrlDirectSearch(idx, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                              onBlur={(e) => { if (e.target.value) { handleSrlDirectSearch(idx, e.target.value); e.target.value = ''; } }}
                              className="w-24 h-8 px-2 border border-green-300 bg-green-50 focus:border-green-500 rounded text-xs text-green-900 placeholder-green-700/60"
                            />
                            <input
                              list={`design-list-${row.uid}`}
                              placeholder="Design / Product"
                              value={row.selectedProductName}
                              onChange={(e) => handleDesignSelect(idx, e.target.value)}
                              className="flex-1 h-8 px-2 border border-border bg-transparent focus:bg-white focus:border-primary rounded text-xs"
                            />
                            <datalist id={`design-list-${row.uid}`}>
                              {Array.from(new Set(products.filter(p => p.catalogId === row.catalogId).map(p => p.name)))
                                .map(name => <option key={name} value={name} />)}
                            </datalist>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              list={`srl-list-${row.uid}`}
                              placeholder="SRL No. (optional)"
                              value={row.srlNo || ''}
                              onChange={(e) => handleProductSelect(idx, e.target.value)}
                              className="flex-1 h-8 px-2 border border-border bg-white focus:border-primary rounded text-xs text-blue-700 font-medium"
                            />
                            <datalist id={`srl-list-${row.uid}`}>
                              {processProductsForDropdown(
                                products.filter(p => p.catalogId === row.catalogId && (row.selectedProductName ? p.name === row.selectedProductName : true))
                              ).map(p => (
                                <option key={p.uniqueKey} value={p.srlNo} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                      </td>

                      <td className="p-1 border-r">
                        <select value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded"><option value="mm">mm</option><option value="cm">cm</option><option value="inch">inch</option></select>
                      </td>
                      <td className="p-1 border-r"><input type="number" step="0.01" value={row.width} onChange={(e) => updateRow(idx, 'width', e.target.value)} className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded" /></td>
                      <td className="p-1 border-r"><input type="number" step="0.01" value={row.height} onChange={(e) => updateRow(idx, 'height', e.target.value)} className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded" /></td>

                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-50 opacity-50' : ''}`}>
                        <select value={row.type} onChange={(e) => updateRow(idx, 'type', e.target.value)} disabled={disableCurtainFields} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Manual">Manual</option><option value="Automatic / Motorized">Motorized</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-50 opacity-50' : ''}`}>
                        <select value={row.motorizationMode} onChange={(e) => updateRow(idx, 'motorizationMode', e.target.value)} disabled={disableCurtainFields || row.type !== 'Automatic / Motorized'} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Remote">Remote</option><option value="Automation">Auto</option><option value="Both">Both</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-50 opacity-50' : ''}`}>
                        <select value={row.opsType} onChange={(e) => updateRow(idx, 'opsType', e.target.value)} disabled={disableCurtainFields} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="L">L</option><option value="R">R</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-50 opacity-50' : ''}`}>
                        <input type="number" step="0.01" value={row.pelmet} onChange={(e) => updateRow(idx, 'pelmet', e.target.value)} disabled={disableCurtainFields} className="w-full h-9 px-2 text-xs text-right bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed" />
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-50 opacity-50' : ''}`}>
                        <select value={row.openingType} onChange={(e) => updateRow(idx, 'openingType', e.target.value)} disabled={disableCurtainFields} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Left">Left</option><option value="Right">Right</option><option value="Center">Center</option>
                        </select>
                      </td>
                      <td className="p-1 text-center sticky right-0 bg-white z-10 border-l">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(idx)} className="h-8 w-8 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer - Stack on mobile */}
          <div className="p-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
            <Button variant="outline" onClick={handleAddRow} className="w-full sm:w-auto gap-2 border-dashed border-2"><Plus className="h-4 w-4" /> Add Row</Button>
            <div className="flex items-center justify-between w-full sm:w-auto gap-6 text-sm text-muted-foreground">
              <div>Total Rows: <span className="text-foreground font-bold">{rows.length}</span></div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default IndependentMeasurementForm;