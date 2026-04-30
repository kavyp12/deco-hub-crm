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
  catalogId: string;
  catalogName: string;
  catalogType: string;
  productId: string;
  productName: string;
  selectedProductName: string;  // ✅ NEW: tracks chosen design name before SRL pick
  srlNo: string;
  areaName: string;
  unit: string;
  width: string;
  height: string;
  calculationType: string;
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

const MeasurementEditor: React.FC = () => {
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
              return {
                uid: item.id || Math.random().toString(36).substr(2, 9),
                companyId: compId,
                catalogId: catId,
                catalogName: catName,
                catalogType: catType,
                productId: item.productId || '',
                productName: item.productName || '',
                selectedProductName: item.productName || '',                    // ✅ ADD
                srlNo: item.srlNo || item.details?.srlNo || '',                // ✅ ADD
                areaName: item.details?.areaName || item.areaName || '',
                unit: item.unit || 'mm',
                width: item.width?.toString() || '',
                height: item.height?.toString() || '',
                calculationType: item.calculationType || 'Local',
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
    catalogId: '',
    catalogName: '',
    catalogType: '',
    productId: '',
    productName: '',
    selectedProductName: '',  // ✅ NEW
    srlNo: '',
    areaName: '',
    unit: 'mm',
    width: '',
    height: '',
    calculationType: 'Local',
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
    const newRows = [...rows];

    if (field === 'productId') {
      // 'value' is the uniqueKey from the dropdown (e.g., "prodID-17")
      // Process products from your API state to match against
      const processedList = processProductsForDropdown(products);
      const selectedVariant = processedList.find(p => p.uniqueKey === value);

      if (selectedVariant) {
        newRows[index].productId = selectedVariant.originalId;
        newRows[index].productName = selectedVariant.name;
        newRows[index].srlNo = selectedVariant.srlNo;     // ✅ Set the exact SRL
        newRows[index].price = selectedVariant.price;     // ✅ Auto-update price
      } else {
        newRows[index].productId = value;
      }
    } else {
      // Handle all other standard field updates
      newRows[index][field] = value as never;
    }

    setRows(newRows);
  };

  const handleCompanySelect = (index: number, companyId: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        companyId,
        catalogId: '',
        catalogName: '',
        catalogType: '',
        productId: '',
        productName: '',
        selectedProductName: '',  // ✅ NEW
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };
  const handleCatalogSelect = (index: number, catalogId: string) => {
    const catalog = allCatalogs.find(c => c.id === catalogId);
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        catalogId: catalog ? catalog.id : '',
        catalogName: catalog ? catalog.name : '',
        catalogType: catalog ? (catalog.type || 'Curtains') : '',
        productId: '',
        productName: '',
        selectedProductName: '',  // ✅ NEW
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };

  // ✅ NEW: Step 1 — employee picks design name (e.g. "BLISS")
  // This clears SRL so they must then pick from the SRL dropdown
  const handleDesignSelect = (index: number, designName: string) => {
    if (!designName) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = {
          ...newRows[index],
          productId: '',
          productName: '',
          selectedProductName: '',
          srlNo: '',
          price: 0
        };
        return newRows;
      });
      return;
    }

    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        selectedProductName: designName,
        // Clear SRL until employee picks one
        productId: '',
        srlNo: '',
        price: 0
      };
      return newRows;
    });
  };


  // ✅ Fix: Accept uniqueKey instead of original prodId
  const handleProductSelect = (index: number, uniqueKey: string) => {
    if (!uniqueKey) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], productId: '', productName: '', srlNo: '', price: 0 };
        return newRows;
      });
      return;
    }

    const catalogId = rows[index].catalogId;
    const selectedDesign = rows[index].selectedProductName; // ✅ Filter by chosen design name
    const relevantProducts = products.filter(
      p => p.catalogId === catalogId && p.name === selectedDesign  // ✅ Only BLISS's rows
    );
    const processedProducts = processProductsForDropdown(relevantProducts);
    const prod = processedProducts.find(p => p.uniqueKey === uniqueKey);

    if (prod) {
      const price = typeof prod.price === 'number'
        ? prod.price                                                 // ✅ Already a number (after utils fix)
        : parseFloat(String(prod.price).replace(/,/g, '')) || 0;    // ✅ Fallback string parse — fixes TS error
      setRows(prev => {
        const newRows = [...prev];
        newRows[index] = {
          ...newRows[index],
          productId: prod.originalId,
          productName: prod.name,
          selectedProductName: prod.name,
          srlNo: prod.srlNo,
          price: price
        };
        return newRows;
      });
    }
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
          calculationType: r.calculationType || 'Local',
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
            areaName: r.areaName,
            srlNo: r.srlNo || null
          }
        }))
      };

      let savedSelection: any;
      if (selection) {
        // ✅ Selection exists → always PUT (update in place)
        const res = await api.put(`/selections/${selection.id}`, payload);
        savedSelection = res.data;
      } else {
        // ✅ No selection yet → POST (server will upsert if one already exists for inquiry)
        const res = await api.post('/selections', payload);
        savedSelection = res.data;
      }

      // ✅ CRITICAL: Update local state with the saved selection so the next
      // save (if user stays on the page) uses PUT, NOT POST — prevents duplicates.
      setSelection(savedSelection);

      toast({ title: 'Saved ✓', description: 'Measurements saved successfully. You can continue editing or go to Selections.' });
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

  // Helper to safely find ID by Name for the datalists
  const handleSearchableChange = (
    index: number,
    field: 'company' | 'catalog' | 'design' | 'srl',  // ✅ 'product' split into 'design' and 'srl'
    value: string
  ) => {
    if (field === 'company') {
      const match = companies.find(c => c.name.toLowerCase() === value.toLowerCase());
      if (match) handleCompanySelect(index, match.id);
    }
    else if (field === 'catalog') {
      const row = rows[index];
      const relevantCatalogs = allCatalogs.filter(c => c.companyId === row.companyId);
      const match = relevantCatalogs.find(c => c.name.toLowerCase() === value.toLowerCase());
      if (match) handleCatalogSelect(index, match.id);
    }
    else if (field === 'design') {
      // ✅ NEW: Step 1 — just pick the design name
      handleDesignSelect(index, value);
    }
    else if (field === 'srl') {
      // ✅ NEW: Step 2 — match uniqueKey by displayName typed/selected
      const row = rows[index];
      const relevantProducts = products.filter(p => p.catalogId === row.catalogId);
      const processedProducts = processProductsForDropdown(relevantProducts);
      const match = processedProducts.find(p => p.displayName.toLowerCase() === value.toLowerCase());
      if (match) handleProductSelect(index, match.uniqueKey);
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
          {/* Scrollable Area */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm border-collapse" style={{ minWidth: '2100px' }}>
              <thead className="bg-gradient-to-r from-primary/10 to-primary/5 sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-14 text-center font-bold text-primary border-r border-primary/20 sticky left-0 bg-white z-20 shadow-sm">SR</th>
                  <th className="p-3 w-48 text-left font-bold text-primary border-r border-primary/20">Area *</th>
                  <th className="p-3 w-48 text-left font-bold text-primary border-r border-primary/20">Company</th>
                  <th className="p-3 w-64 text-left font-bold text-primary border-r border-primary/20">Catalog (Type)</th>
                  <th className="p-3 w-64 text-left font-bold text-primary border-r border-primary/20">Product</th>
                  <th className="p-3 w-20 text-left font-bold text-primary border-r border-primary/20">Unit</th>
                  <th className="p-3 w-24 text-left font-bold text-primary border-r border-primary/20">Width</th>
                  <th className="p-3 w-24 text-left font-bold text-primary border-r border-primary/20">Height</th>
                  <th className="p-3 w-36 text-left font-bold text-primary border-r border-primary/20">Type</th>
                  <th className="p-3 w-40 text-left font-bold text-primary border-r border-primary/20">Motorization</th>
                  <th className="p-3 w-24 text-left font-bold text-primary border-r border-primary/20">OPS/W</th>
                  <th className="p-3 w-28 text-left font-bold text-primary border-r border-primary/20">Pelmet</th>
                  <th className="p-3 w-32 text-left font-bold text-primary border-r border-primary/20">Opening</th>
                  <th className="p-3 w-16 sticky right-0 bg-white z-20 shadow-sm"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, idx) => {
                  const isCurtainRow = row.catalogType === 'Curtains';
                  const disableCurtainFields = !isCurtainRow;

                  // Get the current names for display (since state stores IDs)
                  const currentCompanyName = companies.find(c => c.id === row.companyId)?.name || '';

                  // Filter lists for this specific row
                  const rowCatalogs = allCatalogs.filter(c => c.companyId === row.companyId);

                  return (
                    <tr key={row.uid} className="group hover:bg-primary/5 transition-colors">
                      <td className="p-2 text-center text-muted-foreground border-r bg-muted/10 font-bold sticky left-0 z-10">{idx + 1}</td>

                      <td className="p-1 border-r">
                        <input
                          list={`area-suggestions-${row.uid}`}
                          value={row.areaName}
                          onChange={(e) => updateRow(idx, 'areaName', e.target.value)}
                          className="w-full h-10 px-3 border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                          placeholder="Area Name"
                        />
                        <datalist id={`area-suggestions-${row.uid}`}>
                          {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance", "Lobby"].map(area => (
                            <option key={area} value={area} />
                          ))}
                        </datalist>
                      </td>

                      <td className="p-1 border-r relative">
                        <input
                          list={`company-list-${row.uid}`}
                          placeholder="Select Company"
                          defaultValue={currentCompanyName}
                          onBlur={(e) => handleSearchableChange(idx, 'company', e.target.value)}
                          key={`comp-${row.companyId}`}
                          className="w-full h-10 px-2 border-transparent bg-transparent focus:bg-white focus:border-primary rounded text-xs"
                        />
                        <datalist id={`company-list-${row.uid}`}>
                          {companies.map(c => <option key={c.id} value={c.name} />)}
                        </datalist>
                      </td>

                      <td className="p-1 border-r">
                        <div className="flex flex-col justify-center h-full gap-1">
                          <input
                            list={`catalog-list-${row.uid}`}
                            placeholder={row.companyId ? "Select Catalog" : "-"}
                            disabled={!row.companyId}
                            defaultValue={row.catalogName}
                            onBlur={(e) => handleSearchableChange(idx, 'catalog', e.target.value)}
                            key={`cat-${row.catalogId}`}
                            className="w-full h-8 px-2 border-transparent bg-transparent focus:bg-white focus:border-primary rounded text-xs disabled:opacity-50"
                          />
                          <datalist id={`catalog-list-${row.uid}`}>
                            {rowCatalogs.map(cat => <option key={cat.id} value={cat.name} />)}
                          </datalist>

                          {row.catalogType && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border self-start ml-2 ${getBadgeColor(row.catalogType)}`}>
                              {row.catalogType}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-1 border-r">
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            placeholder="🔍 Direct SRL Search..."
                            disabled={!row.catalogId}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSrlDirectSearch(idx, e.currentTarget.value);
                              }
                            }}
                            onBlur={(e) => handleSrlDirectSearch(idx, e.target.value)}
                            className="w-full h-8 px-2 border border-green-300 bg-green-50 focus:border-green-500 rounded text-xs placeholder-green-700/50 text-green-900 font-medium disabled:opacity-50 transition-colors"
                          />

                          <div className="text-[10px] text-center text-muted-foreground font-medium">- OR SEARCH DESIGN -</div>

                          <input
                            list={`design-list-${row.uid}`}
                            placeholder={row.catalogId ? "Design name..." : "-"}
                            disabled={!row.catalogId}
                            defaultValue={row.selectedProductName}
                            onBlur={(e) => handleSearchableChange(idx, 'design', e.target.value)}
                            key={`design-${row.catalogId}-${row.selectedProductName}`}
                            className="w-full h-8 px-2 border border-border bg-transparent focus:bg-white focus:border-primary rounded text-xs disabled:opacity-50"
                          />
                          <datalist id={`design-list-${row.uid}`}>
                            {Array.from(new Set(products.filter(p => p.catalogId === row.catalogId).map(p => p.name)))
                              .map(name => <option key={name} value={name} />)}
                          </datalist>

                          {row.selectedProductName && (
                            <select
                              value={row.srlNo ? `${row.productId}-${row.srlNo}` : ''}
                              onChange={(e) => handleProductSelect(idx, e.target.value)}
                              className="w-full h-8 px-2 border border-border bg-white focus:border-primary rounded text-xs text-blue-700 font-medium"
                            >
                              <option value="">-- SRL No --</option>
                              {processProductsForDropdown(
                                products.filter(p => p.catalogId === row.catalogId && p.name === row.selectedProductName)
                              ).map(p => (
                                <option key={p.uniqueKey} value={p.uniqueKey}>SRL: {p.srlNo}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="p-1 border-r">
                        <select value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} className="w-full h-10 px-2 border-transparent bg-transparent focus:bg-white rounded"><option value="mm">mm</option><option value="cm">cm</option><option value="inch">inch</option></select>
                      </td>
                      <td className="p-1 border-r"><input type="number" step="0.01" value={row.width} onChange={(e) => updateRow(idx, 'width', e.target.value)} className="w-full h-10 px-3 text-right border-transparent bg-transparent focus:bg-white rounded" /></td>
                      <td className="p-1 border-r"><input type="number" step="0.01" value={row.height} onChange={(e) => updateRow(idx, 'height', e.target.value)} className="w-full h-10 px-3 text-right border-transparent bg-transparent focus:bg-white rounded" /></td>

                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-100 opacity-50' : ''}`}>
                        <select value={row.type} onChange={(e) => updateRow(idx, 'type', e.target.value)} disabled={disableCurtainFields} className="w-full h-10 px-2 bg-transparent border-transparent focus:bg-white focus:border-primary rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Manual">Manual</option><option value="Automatic / Motorized">Motorized</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-100 opacity-50' : ''}`}>
                        <select value={row.motorizationMode} onChange={(e) => updateRow(idx, 'motorizationMode', e.target.value)} disabled={disableCurtainFields || row.type !== 'Automatic / Motorized'} className="w-full h-10 px-2 bg-transparent border-transparent focus:bg-white focus:border-primary rounded disabled:opacity-30 disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Remote">Remote</option><option value="Automation">Automation</option><option value="Both">Both</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-100 opacity-50' : ''}`}>
                        <select value={row.opsType} onChange={(e) => updateRow(idx, 'opsType', e.target.value)} disabled={disableCurtainFields} className="w-full h-10 px-2 bg-transparent border-transparent focus:bg-white focus:border-primary rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="L">L</option><option value="R">R</option>
                        </select>
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-100 opacity-50' : ''}`}>
                        <input type="number" step="0.01" value={row.pelmet} onChange={(e) => updateRow(idx, 'pelmet', e.target.value)} disabled={disableCurtainFields} className="w-full h-10 px-3 text-right bg-transparent border-transparent focus:bg-white focus:border-primary rounded disabled:cursor-not-allowed" />
                      </td>
                      <td className={`p-1 border-r ${disableCurtainFields ? 'bg-gray-100 opacity-50' : ''}`}>
                        <select value={row.openingType} onChange={(e) => updateRow(idx, 'openingType', e.target.value)} disabled={disableCurtainFields} className="w-full h-10 px-2 bg-transparent border-transparent focus:bg-white focus:border-primary rounded disabled:cursor-not-allowed">
                          <option value="">-</option><option value="Left">Left</option><option value="Right">Right</option><option value="Center">Center</option>
                        </select>
                      </td>
                      <td className="p-1 text-center sticky right-0 bg-white z-10 border-l">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(idx)} className="h-9 w-9 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
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

export default MeasurementEditor;