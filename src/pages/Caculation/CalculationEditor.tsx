import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Settings, Ruler,
  ChevronRight, LayoutDashboard, Calculator, Layers,  // ← Calculator added here
  Edit2, Save, Plus, Trash2, X, Grid, Blinds, ChevronDown, Loader2
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import QuotationTypeModal from '@/pages/Quotation/QuotationTypeModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,           // <--- ADD THIS
  DropdownMenuSubContent,    // <--- ADD THIS
  DropdownMenuSubTrigger,    // <--- ADD THIS
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
// Colors for tags
const TYPE_COLORS: any = {
  Local: 'bg-blue-100 text-blue-800 border-blue-300 ring-blue-300',
  'Forest (Manual)': 'bg-teal-100 text-teal-800 border-teal-300 ring-teal-300',
  'Forest (Auto)': 'bg-green-100 text-green-800 border-green-300 ring-green-300',
  Somfy: 'bg-yellow-100 text-yellow-800 border-yellow-300 ring-yellow-300',
  Roman: 'bg-orange-100 text-orange-800 border-orange-300 ring-orange-300',
  Blinds: 'bg-purple-100 text-purple-800 border-purple-300 ring-purple-300',
};

const COMMON_AREAS = [
  "Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom",
  "Guest Bedroom", "Parents Bedroom", "Dining Room", "Kitchen",
  "Study Room", "Home Office", "Balcony", "Verandah",
  "Puja Room", "Staircase", "Lobby", "Entrance",
  "Bathroom", "Store Room", "Servant Room", "Utility Area"
];
// Button base styles for active/inactive states
const BUTTON_STYLES = {
  Local: {
    active: 'bg-blue-100 text-blue-700 border-blue-300 ring-1 ring-blue-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
  'Forest (Manual)': {
    active: 'bg-teal-100 text-teal-700 border-teal-300 ring-1 ring-teal-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
  'Forest (Auto)': {
    active: 'bg-green-100 text-green-700 border-green-300 ring-1 ring-green-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
  Somfy: {
    active: 'bg-yellow-100 text-yellow-700 border-yellow-300 ring-1 ring-yellow-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },

  'Somfy (Manual)': { // <--- ADD THIS BLOCK
    active: 'bg-amber-100 text-amber-700 border-amber-300 ring-1 ring-amber-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },

  Roman: {
    active: 'bg-orange-100 text-orange-700 border-orange-300 ring-1 ring-orange-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
  Blinds: {
    active: 'bg-purple-100 text-purple-700 border-purple-300 ring-1 ring-purple-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
};
interface EditItem {
  id: string;
  productId?: string;
  productName: string;
  areaName: string;
  width: number;
  height: number;
  unit: string;
  quantity: number;
  price: number;
  calculationType: string;
  details?: any;
  orderIndex: number; // ✅ ADD THIS LINE

}

const CalculationEditor: React.FC = () => {
  const { selectionId } = useParams<{ selectionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<any>(null);

  // -- Editing States --
  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [generatingQuote, setGeneratingQuote] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    try {
      const selRes = await api.get(`/selections/${selectionId}`);
      setSelection(selRes.data);

      console.log('✅ Fetched Selection:', selRes.data);

      // ✅ PRESERVE orderIndex and sort by it
      const items = (selRes.data.items || [])
        .sort((a: any, b: any) => a.orderIndex - b.orderIndex) // Sort by existing order
        .map((i: any) => ({
          id: i.id,
          productId: i.productId,
          productName: i.productName || 'Manual Entry',
          areaName: i.details?.areaName || i.areaName || 'Area',
          width: parseFloat(i.width) || 0,
          height: parseFloat(i.height) || 0,
          unit: i.unit || 'mm',
          quantity: i.quantity || 1,
          price: i.price || 0,
          calculationType: i.calculationType || 'Local',
          details: i.details || {},
          orderIndex: i.orderIndex || 0 // ✅ PRESERVE THIS
        }));

      console.log('✅ Mapped Items with orderIndex:', items);
      setEditItems(items);
    } catch (error) {
      console.error('❌ Fetch Error:', error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER: Toggle Logic ---
  const toggleType = (currentTypes: string, type: string) => {
    const parts = currentTypes ? currentTypes.split(',').filter(Boolean) : [];
    if (parts.includes(type)) {
      // Remove it
      return parts.filter(p => p !== type).join(',');
    } else {
      // Add it
      return [...parts, type].join(',');
    }
  };

  // --- ITEM MANAGEMENT ---

  const handleAddNewItem = () => {
    const newItem: EditItem = {
      id: `temp-${Date.now()}`,
      productName: 'Manual Entry',
      areaName: 'New Area',
      width: 0,
      height: 0,
      unit: 'mm',
      quantity: 1,
      price: 0,
      calculationType: 'Local',
      details: { areaName: 'New Area' },
      orderIndex: editItems.length // ✅ Set to the end of the list
    };
    setEditItems([...editItems, newItem]);
  };


  const handleRemoveItem = (index: number) => {
    const updated = [...editItems];
    updated.splice(index, 1);
    setEditItems(updated);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...editItems];
    const item = { ...updated[index] };

    if (field === 'areaName') {
      item.areaName = value;
      item.details = { ...item.details, areaName: value };
    } else if (field === 'calculationType') {
      item.calculationType = value;
    } else if (field === 'width' || field === 'height' || field === 'quantity' || field === 'price') {
      item[field] = parseFloat(value) || 0;
    } else {
      (item as any)[field] = value;
    }

    updated[index] = item;
    setEditItems(updated);
  };

  const handleSaveItems = async () => {
    setSaving(true);
    try {
      console.log('💾 Saving Items:', editItems);

      const payload = {
        items: editItems.map((item, index) => ({ // ✅ Use map index to ensure sequential order
          productId: (item.productId && !String(item.productId).startsWith('temp-')) ? item.productId : null,
          productName: item.productName || 'Manual Entry',
          quantity: item.quantity || 1,
          price: item.price || 0,
          unit: item.unit || 'mm',
          width: item.width || 0,
          height: item.height || 0,

          calculationType: item.calculationType || 'Local',

          areaName: item.areaName || 'Unknown Area',
          details: {
            areaName: item.areaName || 'Unknown Area',
            ...(item.details || {})
          },

          orderIndex: index // ✅ CRITICAL: Preserve the current order
        })),
        status: selection?.status || 'pending',
        delivery_date: selection?.delivery_date,
        notes: selection?.notes
      };

      console.log('📤 Sending Payload:', payload);

      const response = await api.put(`/selections/${selectionId}`, payload);

      console.log('✅ Server Response:', response.data);

      toast({
        title: 'Success',
        description: 'Items and calculation types updated successfully!',
        duration: 3000
      });

      setIsEditing(false);
      await fetchData(); // Reload fresh data with preserved order

    } catch (error: any) {
      console.error('❌ Save Error:', error);
      console.error('❌ Error Response:', error.response?.data);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save changes',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Count items by type (using 'includes' for multi-select support)
const countType = (type: string) => editItems.filter(i => 
    i.calculationType && i.calculationType.split(',').includes(type)
  ).length;

  const typeCounts = {
    Local: countType('Local'),
    ForestManual: countType('Forest (Manual)'),
    ForestAuto: countType('Forest (Auto)'),
    Somfy: countType('Somfy'),
    SomfyManual: countType('Somfy (Manual)'), // <--- ADD THIS
    Roman: countType('Roman'),
    Blinds: countType('Blinds'),
  };
  // --- UI ---

  if (loading) return (
    <DashboardLayout>
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 pb-20">

        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/selections')}>
                  <ArrowLeft className="h-5 w-5 text-gray-500" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{selection?.inquiry?.client_name}</h1>
                  <p className="text-sm text-gray-500">{selection?.selection_number} • Calculation Hub</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Items: <span className="font-bold text-gray-900">{editItems.length}</span>
                </div>

                {/* ✅ ADD DEEP COSTING BUTTON */}
                <div className="h-6 w-px bg-gray-200"></div>
                <Button
                  onClick={() => navigate(`/calculations/deep/${selectionId}`)}
                  variant="outline"
                  className="text-purple-700 hover:bg-purple-50 border-purple-200 gap-2"
                >
                  <Calculator className="h-4 w-4" />
                  Deep Costing
                </Button>

                {/* ✅ QUOTATION BUTTON - FIXED */}
                <>
                  <div className="h-6 w-px bg-gray-200"></div>
                  <Button
                    onClick={() => setShowQuoteModal(true)}
                    className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Generate Quote
                  </Button>

                  {/* ✅ ADD THE MODAL */}
                  <QuotationTypeModal
                    isOpen={showQuoteModal}
                    onClose={() => setShowQuoteModal(false)}
                    loading={generatingQuote}
                    onSelect={async (type: 'simple' | 'detailed') => {
                      setGeneratingQuote(true);
                      try {
                        const response = await api.post('/quotations/generate', {
                          selectionId,
                          quotationType: type
                        });
                        const newQuote = response.data;

                        navigate(`/quotations/preview/${newQuote.id}`);

                        toast({
                          title: 'Success',
                          description: `${type === 'simple' ? 'Simple' : 'Detailed'} quotation generated successfully!`
                        });
                      } catch (error: any) {
                        toast({
                          title: 'Error',
                          description: error.response?.data?.error || 'Failed to generate quotation',
                          variant: 'destructive'
                        });
                      } finally {
                        setGeneratingQuote(false);
                        setShowQuoteModal(false);
                      }
                    }}
                  />
                </>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

          {/* 1. MODULE SELECTION CARDS (GROUPED) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* CARD 1: CURTAINS GROUP */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between hover:border-blue-300 transition-colors">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Curtains & Automation</h3>
                    {(typeCounts.Local + typeCounts.ForestManual + typeCounts.ForestAuto + typeCounts.Somfy + typeCounts.Roman) > 0 && (
                      <p className="text-xs text-gray-500">
                        {typeCounts.Local} Local • {typeCounts.ForestManual + typeCounts.ForestAuto} Forest • {typeCounts.Somfy} Somfy • {typeCounts.Roman} Roman
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  Calculations for Standard Panna/Fabric, Forest Tracks, Somfy Motors, and Roman Blinds.
                </p>
              </div>

             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full justify-between bg-blue-600 hover:bg-blue-700">
                    Select Calculator
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                
                <DropdownMenuContent className="w-[280px]" align="start">
                  <DropdownMenuLabel>Choose Method</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* 1. LOCAL / STANDARD (Top Level) */}
                  <DropdownMenuItem onClick={() => navigate(`/calculations/local/${selectionId}`)} className="cursor-pointer py-2.5">
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-7 w-7 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                        <Ruler className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm">Local / Standard</div>
                      </div>
                      {typeCounts.Local > 0 && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5">
                          {typeCounts.Local}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>

                  {/* 2. FOREST GROUP (Sub Menu) */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="py-2.5 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded bg-teal-50 flex items-center justify-center text-teal-600">
                          <Settings className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-sm">Forest Series</span>
                      </div>
                    </DropdownMenuSubTrigger>
                    
                    <DropdownMenuSubContent className="w-56">
                      {/* Forest (Auto) */}
                      <DropdownMenuItem onClick={() => navigate(`/calculations/forest/${selectionId}`)} className="cursor-pointer py-2">
                         <div className="flex flex-col">
                           <span className="font-bold">Forest (Auto)</span>
                           <span className="text-xs text-gray-500">Track Calculator</span>
                         </div>
                         {typeCounts.ForestAuto > 0 && (
                            <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200 text-[10px]">
                              {typeCounts.ForestAuto}
                            </Badge>
                         )}
                      </DropdownMenuItem>
                      
                      {/* Forest (Manual) */}
                      <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2">
                         <div className="flex flex-col">
                           <span className="font-bold">Forest (Manual)</span>
                           <span className="text-xs text-gray-500">Deep Costing</span>
                         </div>
                         {typeCounts.ForestManual > 0 && (
                            <Badge variant="outline" className="ml-auto bg-teal-50 text-teal-700 border-teal-200 text-[10px]">
                              {typeCounts.ForestManual}
                            </Badge>
                         )}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* 3. SOMFY GROUP (Sub Menu) */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="py-2.5 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded bg-yellow-50 flex items-center justify-center text-yellow-600">
                          <Layers className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-sm">Somfy Automation</span>
                      </div>
                    </DropdownMenuSubTrigger>
                    
                    <DropdownMenuSubContent className="w-56">
                      {/* Somfy Automation */}
                      <DropdownMenuItem onClick={() => navigate(`/calculations/somfy/${selectionId}`)} className="cursor-pointer py-2">
                         <div className="flex flex-col">
                           <span className="font-bold">Somfy (Auto)</span>
                           <span className="text-xs text-gray-500">Motors & Remotes</span>
                         </div>
                         {typeCounts.Somfy > 0 && (
                            <Badge variant="outline" className="ml-auto bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">
                              {typeCounts.Somfy}
                            </Badge>
                         )}
                      </DropdownMenuItem>
                      
                      {/* Somfy Manual */}
                      <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2">
                         <div className="flex flex-col">
                           <span className="font-bold">Somfy (Manual)</span>
                           <span className="text-xs text-gray-500">Deep Costing</span>
                         </div>
                         {typeCounts.SomfyManual > 0 && (
                            <Badge variant="outline" className="ml-auto bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              {typeCounts.SomfyManual}
                            </Badge>
                         )}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* 4. ROMAN (Top Level) */}
                  <DropdownMenuItem onClick={() => navigate(`/calculations/roman/${selectionId}`)} className="cursor-pointer py-2.5">
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-7 w-7 rounded bg-orange-50 flex items-center justify-center text-orange-600">
                        <Grid className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm">Roman Curtains</div>
                      </div>
                      {typeCounts.Roman > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] px-1.5">
                          {typeCounts.Roman}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>

                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* CARD 2: BLINDS SEPARATE */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between hover:border-purple-300 transition-colors">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Blinds className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Blinds & Rugs</h3>
                    {typeCounts.Blinds > 0 && (
                      <p className="text-xs text-gray-500">{typeCounts.Blinds} items assigned</p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  Square feet based calculations for Blinds, Wallpapers, and Rugs.
                </p>
              </div>
              <Button onClick={() => navigate(`/calculations/blinds/${selectionId}`)} className="w-full bg-purple-600 hover:bg-purple-700">
                Open Blinds Calculator <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

          </div>

          {/* 2. ITEMS TABLE WITH ASSIGNMENT */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Assign Items to Calculators</h2>
                <p className="text-sm text-gray-500">Decide which calculation logic applies to each item. You can select multiple.</p>
              </div>
              <div className="flex gap-2">
                {!isEditing ? (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit Assignments
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); fetchData(); }} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveItems} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                      {saving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 border-b text-gray-600 font-semibold">
                  <tr>
                    <th className="px-6 py-4 w-12">#</th>
                    <th className="px-6 py-4 w-1/4">Area Name</th>
                    <th className="px-6 py-4">Dimensions</th>
                    <th className="px-6 py-4 w-1/3">Assigned To</th>
                    {isEditing && <th className="px-6 py-4 w-16"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {editItems.length === 0 ? (
                    <tr>
                      <td colSpan={isEditing ? 5 : 4} className="px-6 py-12 text-center text-gray-400">
                        <Calculator className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>No items found. Add items to get started.</p>
                      </td>
                    </tr>
                  ) : (
                    editItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 text-gray-400 font-mono">{idx + 1}</td>

                        {/* Area Name */}
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <>
                              <Input
                                list={`calc-area-${item.id}`} // Use item ID for uniqueness
                                value={item.areaName || ''}
                                onChange={(e) => handleItemChange(idx, 'areaName', e.target.value)}
                                placeholder="Enter Area Name"
                                className="h-9 text-sm font-bold"
                              />
                              <datalist id={`calc-area-${item.id}`}>
                                {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance", "Lobby", "Staircase", "Utility"].map(area => (
                                  <option key={area} value={area} />
                                ))}
                              </datalist>
                            </>
                          ) : (
                            <div>
                              <div className="font-bold text-gray-900">{item.areaName || 'Unknown'}</div>
                              <div className="text-xs text-gray-500">{item.productName}</div>
                            </div>
                          )}
                        </td>

                        {/* Dimensions */}
                        <td className="px-6 py-4 font-mono text-gray-600">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={item.width}
                                onChange={(e) => handleItemChange(idx, 'width', e.target.value)}
                                placeholder="Width"
                                className="h-9 w-24"
                              />
                              <span>×</span>
                              <Input
                                type="number"
                                value={item.height}
                                onChange={(e) => handleItemChange(idx, 'height', e.target.value)}
                                placeholder="Height"
                                className="h-9 w-24"
                              />
                              <Select value={item.unit} onValueChange={(v) => handleItemChange(idx, 'unit', v)}>
                                <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mm">mm</SelectItem>
                                  <SelectItem value="inch">in</SelectItem>
                                  <SelectItem value="ft">ft</SelectItem>
                                  <SelectItem value="cm">cm</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span>{item.width} × {item.height} {item.unit}</span>
                          )}
                        </td>

                        {/* CALCULATION TYPE ASSIGNMENT - MULTI SELECT */}
                       {/* CALCULATION TYPE ASSIGNMENT - MULTI SELECT */}
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <div className="flex gap-2 flex-wrap">
                              {[
                                'Local', 
                                'Forest (Manual)', 
                                'Forest (Auto)', 
                                'Somfy', 
                                'Somfy (Manual)', 
                                'Roman', 
                                'Blinds'
                              ].map((type) => {
                                // 🔥 FIX: Use .split(',') to ensure "Somfy" doesn't match "Somfy (Manual)"
                                const isActive = item.calculationType && item.calculationType.split(',').includes(type);
                                const style = BUTTON_STYLES[type as keyof typeof BUTTON_STYLES];

                                return (
                                  <button
                                    key={type}
                                    onClick={() => handleItemChange(idx, 'calculationType', toggleType(item.calculationType, type))}
                                    className={`
                                      px-3 py-1.5 text-xs rounded-md border transition-all duration-200
                                      ${isActive ? style.active : style.inactive}
                                    `}
                                  >
                                    {type}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex gap-1 flex-wrap">
                              {item.calculationType.split(',').filter(Boolean).map(t => (
                                <span key={t} className={`px-2 py-1 rounded-md text-[10px] font-bold border ${TYPE_COLORS[t] || 'bg-gray-100 border-gray-200'}`}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {isEditing && (
                          <td className="px-6 py-4">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {isEditing && (
                <div className="p-4 bg-gray-50 border-t">
                  <Button variant="outline" className="w-full border-dashed" onClick={handleAddNewItem}>
                    <Plus className="h-4 w-4 mr-2" /> Add Manual Entry
                  </Button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default CalculationEditor;