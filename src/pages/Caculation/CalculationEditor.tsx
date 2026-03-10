import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Settings, Ruler,
  ChevronRight, LayoutDashboard, Calculator, Layers,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

// Detect mobile screen
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

const TYPE_COLORS: any = {
  Local: 'bg-blue-100 text-blue-800 border-blue-300 ring-blue-300',
  'Forest (Manual)': 'bg-teal-100 text-teal-800 border-teal-300 ring-teal-300',
  'Forest (Auto)': 'bg-green-100 text-green-800 border-green-300 ring-green-300',
  Somfy: 'bg-yellow-100 text-yellow-800 border-yellow-300 ring-yellow-300',
  'Somfy (Manual)': 'bg-amber-100 text-amber-800 border-amber-300 ring-amber-300',
  GPW: 'bg-indigo-100 text-indigo-800 border-indigo-300 ring-indigo-300',
  Roman: 'bg-orange-100 text-orange-800 border-orange-300 ring-orange-300',
  Blinds: 'bg-purple-100 text-purple-800 border-purple-300 ring-purple-300',
};

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
  'Somfy (Manual)': {
    active: 'bg-amber-100 text-amber-700 border-amber-300 ring-1 ring-amber-300 font-bold',
    inactive: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
  },
  GPW: {
    active: 'bg-indigo-100 text-indigo-700 border-indigo-300 ring-1 ring-indigo-300 font-bold',
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
  orderIndex: number;
}

const CalculationEditor: React.FC = () => {
  const { selectionId } = useParams<{ selectionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<any>(null);
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
      const items = (selRes.data.items || [])
        .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
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
          orderIndex: i.orderIndex || 0
        }));
      setEditItems(items);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleType = (currentTypes: string, type: string) => {
    const parts = currentTypes ? currentTypes.split(',').filter(Boolean) : [];
    if (parts.includes(type)) {
      return parts.filter(p => p !== type).join(',');
    } else {
      return [...parts, type].join(',');
    }
  };

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
      orderIndex: editItems.length
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
      const payload = {
        items: editItems.map((item, index) => ({
          productId: (item.productId && !String(item.productId).startsWith('temp-')) ? item.productId : null,
          productName: item.productName || 'Manual Entry',
          quantity: item.quantity || 1,
          price: item.price || 0,
          unit: item.unit || 'mm',
          width: item.width || 0,
          height: item.height || 0,
          calculationType: item.calculationType || 'Local',
          areaName: item.areaName || 'Unknown Area',
          details: { areaName: item.areaName || 'Unknown Area', ...(item.details || {}) },
          orderIndex: index
        })),
        status: selection?.status || 'pending',
        delivery_date: selection?.delivery_date,
        notes: selection?.notes
      };
      await api.put(`/selections/${selectionId}`, payload);
      toast({ title: 'Success', description: 'Items and calculation types updated successfully!', duration: 3000 });
      setIsEditing(false);
      await fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to save changes', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const countType = (type: string) => editItems.filter(i =>
    i.calculationType && i.calculationType.split(',').includes(type)
  ).length;

  const typeCounts = {
    Local: countType('Local'),
    ForestManual: countType('Forest (Manual)'),
    ForestAuto: countType('Forest (Auto)'),
    Somfy: countType('Somfy'),
    SomfyManual: countType('Somfy (Manual)'),
    GPW: countType('GPW'),
    Roman: countType('Roman'),
    Blinds: countType('Blinds'),
  };

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

        {/* ── HEADER ── */}
        <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">

            {/* Row 1: back arrow + title */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/selections')}
                className="shrink-0 h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4 text-gray-500" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate leading-tight">
                  {selection?.inquiry?.client_name}
                </h1>
                <p className="text-xs text-gray-500 truncate">
                  {selection?.selection_number} • Calculation Hub
                </p>
              </div>
            </div>

            {/* Row 2: action buttons — full width row on mobile */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-gray-500 mr-1">
                Items: <span className="font-bold text-gray-800">{editItems.length}</span>
              </span>

              <div className="h-4 w-px bg-gray-200 hidden sm:block" />

              <Button
                onClick={() => navigate(`/calculations/deep/${selectionId}`)}
                variant="outline"
                size="sm"
                className="text-purple-700 hover:bg-purple-50 border-purple-200 gap-1.5 text-xs h-8 px-3"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Deep Costing</span>
              </Button>

              <Button
                onClick={() => setShowQuoteModal(true)}
                size="sm"
                className="bg-gray-900 hover:bg-gray-800 text-white gap-1.5 text-xs h-8 px-3"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Generate Quote</span>
              </Button>
            </div>
          </div>
        </div>

        <QuotationTypeModal
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          loading={generatingQuote}
          onSelect={async (type: 'simple' | 'detailed') => {
            setGeneratingQuote(true);
            try {
              const response = await api.post('/quotations/generate', { selectionId, quotationType: type });
              navigate(`/quotations/preview/${response.data.id}`);
              toast({ title: 'Success', description: `${type === 'simple' ? 'Simple' : 'Detailed'} quotation generated successfully!` });
            } catch (error: any) {
              toast({ title: 'Error', description: error.response?.data?.error || 'Failed to generate quotation', variant: 'destructive' });
            } finally {
              setGeneratingQuote(false);
              setShowQuoteModal(false);
            }
          }}
        />

        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6 sm:space-y-8">

          {/* ── MODULE CARDS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

            {/* CARD 1: CURTAINS */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col justify-between hover:border-blue-300 transition-colors">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Curtains & Automation</h3>
                    {(typeCounts.Local + typeCounts.ForestManual + typeCounts.ForestAuto + typeCounts.Somfy + typeCounts.Roman + typeCounts.GPW) > 0 && (
                      <p className="text-[11px] text-gray-500 truncate">
                        {typeCounts.Local} Local • {typeCounts.GPW} GPW • {typeCounts.ForestManual + typeCounts.ForestAuto} Forest • {typeCounts.Somfy} Somfy • {typeCounts.Roman} Roman
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mb-4">
                  Calculations for Standard Panna, Forest, Somfy, Gravel/Pulse/Weave, and Roman Blinds.
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-sm h-9 sm:h-10">
                    Select Calculator
                    <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>

                {/* 
                  avoidCollisions + collisionPadding keeps the menu 
                  inside the viewport on all screen sizes 
                */}
                <DropdownMenuContent
                  className="w-[260px] sm:w-[280px]"
                  align="start"
                  avoidCollisions
                  collisionPadding={12}
                >
                  <DropdownMenuLabel>Choose Method</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* LOCAL */}
                  <DropdownMenuItem onClick={() => navigate(`/calculations/local/${selectionId}`)} className="cursor-pointer py-2.5">
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-7 w-7 rounded bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <Ruler className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">Local / Standard</div>
                      </div>
                      {typeCounts.Local > 0 && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 shrink-0">
                          {typeCounts.Local}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>

                  {/* GPW */}
                  <DropdownMenuItem onClick={() => navigate(`/calculations/gpw/${selectionId}`)} className="cursor-pointer py-2.5">
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-7 w-7 rounded bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Calculator className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">Gravel / Pulse / Weave</div>
                        <div className="text-[10px] text-gray-400">Fixed Rates per RFT</div>
                      </div>
                      {typeCounts.GPW > 0 && (
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] px-1.5 shrink-0">
                          {typeCounts.GPW}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>

                  {/* FOREST — inline on mobile, submenu on desktop */}
                  {isMobile ? (
                    <>
                      <DropdownMenuItem onClick={() => navigate(`/calculations/forest/${selectionId}`)} className="cursor-pointer py-2.5 pl-5 border-l-2 border-teal-200 ml-3">
                        <div className="flex items-center gap-3 w-full">
                          <div className="h-7 w-7 rounded bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                            <Settings className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold text-sm">Forest (Auto)</span>
                            <span className="text-[10px] text-gray-400">Track Calculator</span>
                          </div>
                          {typeCounts.ForestAuto > 0 && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] shrink-0">
                              {typeCounts.ForestAuto}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2.5 pl-5 border-l-2 border-teal-200 ml-3">
                        <div className="flex items-center gap-3 w-full">
                          <div className="h-7 w-7 rounded bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                            <Settings className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold text-sm">Forest (Manual)</span>
                            <span className="text-[10px] text-gray-400">Deep Costing</span>
                          </div>
                          {typeCounts.ForestManual > 0 && (
                            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[10px] shrink-0">
                              {typeCounts.ForestManual}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="py-2.5 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                            <Settings className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-sm">Forest Series</span>
                        </div>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52" avoidCollisions collisionPadding={12}>
                        <DropdownMenuItem onClick={() => navigate(`/calculations/forest/${selectionId}`)} className="cursor-pointer py-2">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold">Forest (Auto)</span>
                            <span className="text-xs text-gray-500">Track Calculator</span>
                          </div>
                          {typeCounts.ForestAuto > 0 && (
                            <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200 text-[10px] shrink-0">
                              {typeCounts.ForestAuto}
                            </Badge>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold">Forest (Manual)</span>
                            <span className="text-xs text-gray-500">Deep Costing</span>
                          </div>
                          {typeCounts.ForestManual > 0 && (
                            <Badge variant="outline" className="ml-2 bg-teal-50 text-teal-700 border-teal-200 text-[10px] shrink-0">
                              {typeCounts.ForestManual}
                            </Badge>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  {/* SOMFY — inline on mobile, submenu on desktop */}
                  {isMobile ? (
                    <>
                      <DropdownMenuItem onClick={() => navigate(`/calculations/somfy/${selectionId}`)} className="cursor-pointer py-2.5 pl-5 border-l-2 border-yellow-200 ml-3">
                        <div className="flex items-center gap-3 w-full">
                          <div className="h-7 w-7 rounded bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold text-sm">Somfy (Auto)</span>
                            <span className="text-[10px] text-gray-400">Motors & Remotes</span>
                          </div>
                          {typeCounts.Somfy > 0 && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px] shrink-0">
                              {typeCounts.Somfy}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2.5 pl-5 border-l-2 border-yellow-200 ml-3">
                        <div className="flex items-center gap-3 w-full">
                          <div className="h-7 w-7 rounded bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold text-sm">Somfy (Manual)</span>
                            <span className="text-[10px] text-gray-400">Deep Costing</span>
                          </div>
                          {typeCounts.SomfyManual > 0 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] shrink-0">
                              {typeCounts.SomfyManual}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="py-2.5 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
                            <Layers className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-sm">Somfy Automation</span>
                        </div>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52" avoidCollisions collisionPadding={12}>
                        <DropdownMenuItem onClick={() => navigate(`/calculations/somfy/${selectionId}`)} className="cursor-pointer py-2">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold">Somfy (Auto)</span>
                            <span className="text-xs text-gray-500">Motors & Remotes</span>
                          </div>
                          {typeCounts.Somfy > 0 && (
                            <Badge variant="outline" className="ml-2 bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px] shrink-0">
                              {typeCounts.Somfy}
                            </Badge>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/calculations/deep/${selectionId}`)} className="cursor-pointer py-2">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-bold">Somfy (Manual)</span>
                            <span className="text-xs text-gray-500">Deep Costing</span>
                          </div>
                          {typeCounts.SomfyManual > 0 && (
                            <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-[10px] shrink-0">
                              {typeCounts.SomfyManual}
                            </Badge>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  {/* ROMAN */}
                  <DropdownMenuItem onClick={() => navigate(`/calculations/roman/${selectionId}`)} className="cursor-pointer py-2.5">
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-7 w-7 rounded bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                        <Grid className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">Roman Curtains</div>
                      </div>
                      {typeCounts.Roman > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] px-1.5 shrink-0">
                          {typeCounts.Roman}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>

                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* CARD 2: BLINDS */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col justify-between hover:border-purple-300 transition-colors">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Blinds className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900">Blinds & Rugs</h3>
                    {typeCounts.Blinds > 0 && (
                      <p className="text-[11px] text-gray-500">{typeCounts.Blinds} items assigned</p>
                    )}
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mb-4">
                  Square feet based calculations for Blinds, Wallpapers, and Rugs.
                </p>
              </div>
              <Button
                onClick={() => navigate(`/calculations/blinds/${selectionId}`)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-sm h-9 sm:h-10"
              >
                Open Blinds Calculator
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

          </div>

          {/* ── ITEMS TABLE ── */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-800">Assign Items to Calculators</h2>
                <p className="text-xs sm:text-sm text-gray-500">Decide which calculation logic applies to each item. You can select multiple.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                {!isEditing ? (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-8 text-xs sm:text-sm">
                    <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit Assignments
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); fetchData(); }} disabled={saving} className="h-8 text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveItems} disabled={saving} className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">
                      {saving ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</>
                      ) : (
                        <><Save className="h-3.5 w-3.5 mr-1.5" />Save Changes</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden w-full">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="bg-gray-100 border-b text-gray-600 font-semibold">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 w-10">#</th>
                      <th className="px-4 sm:px-6 py-3 w-1/4">Area Name</th>
                      <th className="px-4 sm:px-6 py-3">Dimensions</th>
                      <th className="px-4 sm:px-6 py-3 w-1/3">Assigned To</th>
                      {isEditing && <th className="px-4 sm:px-6 py-3 w-12"></th>}
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
                          <td className="px-4 sm:px-6 py-3 text-gray-400 font-mono text-xs">{idx + 1}</td>

                          {/* Area Name */}
                          <td className="px-4 sm:px-6 py-3">
                            {isEditing ? (
                              <>
                                <Input
                                  list={`calc-area-${item.id}`}
                                  value={item.areaName || ''}
                                  onChange={(e) => handleItemChange(idx, 'areaName', e.target.value)}
                                  placeholder="Enter Area Name"
                                  className="h-8 text-xs font-bold"
                                />
                                <datalist id={`calc-area-${item.id}`}>
                                  {["Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom", "Guest Bedroom", "Dining Room", "Kitchen", "Study Room", "Balcony", "Puja Room", "Entrance", "Lobby", "Staircase", "Utility"].map(area => (
                                    <option key={area} value={area} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              <div>
                                <div className="font-bold text-gray-900 text-xs sm:text-sm">{item.areaName || 'Unknown'}</div>
                                <div className="text-[10px] sm:text-xs text-gray-500">{item.productName}</div>
                              </div>
                            )}
                          </td>

                          {/* Dimensions */}
                          <td className="px-4 sm:px-6 py-3 font-mono text-gray-600">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  value={item.width}
                                  onChange={(e) => handleItemChange(idx, 'width', e.target.value)}
                                  placeholder="W"
                                  className="h-8 w-16 sm:w-20 text-xs"
                                />
                                <span className="text-gray-400">×</span>
                                <Input
                                  type="number"
                                  value={item.height}
                                  onChange={(e) => handleItemChange(idx, 'height', e.target.value)}
                                  placeholder="H"
                                  className="h-8 w-16 sm:w-20 text-xs"
                                />
                                <Select value={item.unit} onValueChange={(v) => handleItemChange(idx, 'unit', v)}>
                                  <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mm">mm</SelectItem>
                                    <SelectItem value="inch">in</SelectItem>
                                    <SelectItem value="ft">ft</SelectItem>
                                    <SelectItem value="cm">cm</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className="text-xs sm:text-sm">{item.width} × {item.height} {item.unit}</span>
                            )}
                          </td>

                          {/* Assigned To */}
                          <td className="px-4 sm:px-6 py-3">
                            {isEditing ? (
                              <div className="flex gap-1.5 flex-wrap">
                                {['Local', 'Forest (Manual)', 'Forest (Auto)', 'Somfy', 'Somfy (Manual)', 'GPW', 'Roman', 'Blinds'].map((type) => {
                                  const isActive = item.calculationType && item.calculationType.split(',').includes(type);
                                  const style = BUTTON_STYLES[type as keyof typeof BUTTON_STYLES];
                                  return (
                                    <button
                                      key={type}
                                      onClick={() => handleItemChange(idx, 'calculationType', toggleType(item.calculationType, type))}
                                      className={`px-2 py-1 text-[10px] rounded-md border transition-all duration-200 ${isActive ? style.active : style.inactive}`}
                                    >
                                      {type}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex gap-1 flex-wrap">
                                {item.calculationType.split(',').filter(Boolean).map(t => (
                                  <span key={t} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${TYPE_COLORS[t] || 'bg-gray-100 border-gray-200'}`}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {isEditing && (
                            <td className="px-4 sm:px-6 py-3">
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600 h-7 w-7">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {isEditing && (
                <div className="p-3 sm:p-4 bg-gray-50 border-t">
                  <Button variant="outline" className="w-full border-dashed text-sm h-9" onClick={handleAddNewItem}>
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