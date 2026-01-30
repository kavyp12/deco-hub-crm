import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, FileText, Check, Settings, RefreshCcw, Calculator, RotateCcw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

// [In DeepCalculation.tsx]

interface CalcItem {
  category: string;
  selectionItemId: string;
  areaName: string;
  productName: string;
  
  // Dimensions
  width: number;
  height: number;
  unit: string;
  
  // Quantities - Allow string | number to fix input typing issues
  panna: number;
  part: number; 

  channelQty: number | string; 
  fabricQty: number | string; 
  blackoutQty: number | string; 
  sheerQty: number | string;
  labourQty: number | string; 
  fittingQty: number | string;
  weightChain: number | string;
  
  // Rates - Allow string | number
  fabricRate: number | string; 
  blackoutRate: number | string; 
  sheerRate: number | string;
  channelRate: number | string; 
  labourRate: number | string; 
  fittingRate: number | string;
  
  // Toggles
  hasFabric: boolean; 
  hasBlackout: boolean; 
  hasSheer: boolean;
  hasChannel: boolean; 
  hasLabour: boolean; 
  hasFitting: boolean;
}
export default function DeepCalculation() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [items, setItems] = useState<CalcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

const [activeTab, setActiveTab] = useState<'Local' | 'Roman' | 'Forest' | 'Somfy'>('Local');

  const localItems = items.filter(i => i.category === 'Local');
  const romanItems = items.filter(i => i.category === 'Roman');
  const forestItems = items.filter(i => i.category === 'Forest');
  const somfyItems = items.filter(i => i.category === 'Somfy');

const displayedItems = activeTab === 'Local' 
    ? localItems 
    : activeTab === 'Roman' 
      ? romanItems 
      : activeTab === 'Forest'
        ? forestItems
        : somfyItems; // 'Somfy' is the fallback (else)
  
  
  // --- DEFAULT RATES ---
  const [bulkRates, setBulkRates] = useState({
    fabric: 0, blackout: 0, sheer: 0, 
    channel: 285, labour: 450, fitting: 355
  });

  // --- 1. PRECISE UNIT CONVERSION ---
  const toInches = (val: number, unit: string) => {
    if (!val) return 0;
    const u = unit?.toLowerCase().trim() || 'mm';
    if (u === 'mm') return val / 25.4;
    if (u === 'cm') return val / 2.54;
    if (u === 'ft' || u === 'feet') return val * 12;
    if (u === 'm' || u === 'meter') return val * 39.37;
    return val; 
  };
// [In DeepCalculation.tsx]

 
  // --- CUSTOM FABRIC ROUNDING LOGIC ---
  const applyCustomRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    
    // Fix floating point precision (e.g. 0.3000004 -> 0.30)
    const cleanDec = parseFloat(decPart.toFixed(2));

    if (cleanDec === 0) return intPart;

    // "Up to 12.10, take 12.25" implies 0.01 to 0.30 range in your logic context
    if (cleanDec <= 0.30) return intPart + 0.25;
    
    // "From 12.31 to 12.55, take 12.50"
    if (cleanDec <= 0.55) return intPart + 0.50;
    
    // "From 12.56 to 12.75, take 12.75"
    if (cleanDec <= 0.75) return intPart + 0.75;
    
    // "Above 12.75, take 1 full meter extra"
    return intPart + 1.00; 
  };
  // --- 3. CHANNEL ROUNDING LOGIC ---
  const applyChannelRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    if (decPart > 0.09) {
      return intPart + 1;
    }
    return intPart;
  };


  // --- NEW STRICT ROUNDING LOGIC (For Labour) ---
  const applyStrictRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    
    const intPart = Math.floor(val);
    const decPart = val - intPart;
  
    // Logic: If decimal is > 0.09, go to next number. Otherwise keep integer.
    // Example: 14.09 -> 14, but 14.091 -> 15
    if (decPart > 0.09) {
      return intPart + 1;
    }
    return intPart;
  };

  // --- 4. LABOUR CALCULATION LOGIC (UPDATED) ---
  const calculateLabourQty = (widthInches: number, heightInches: number) => {
    if (!widthInches) return 0;
    
    // Calculate base pleats (Width / 21)
    const rawPleats = widthInches / 21;
    
    // Apply the STRICT rounding (e.g., 5.19 becomes 6)
    const basePleats = applyStrictRounding(rawPleats); 

    // Apply Height Multipliers
    if (heightInches >= 115 && heightInches <= 144) return basePleats * 1.5;
    if (heightInches >= 145 && heightInches <= 200) return basePleats * 2;
    if (heightInches > 200) return basePleats * 3;
    
    return basePleats;
  };
// [In DeepCalculation.tsx]

const calculateItemRow = (item: any) => {
  const unit = item.unit || item.selectionItem?.unit || 'mm';
  const rawWidth = parseFloat(item.width || item.selectionItem?.width || 0);
  const rawHeight = parseFloat(item.height || item.selectionItem?.height || 0);
  
  const wInch = toInches(rawWidth, unit);
  const hInch = toInches(rawHeight, unit);

  // Detect Roman
  const isRoman = item.category === 'Roman' || 
                  item.selectionItem?.calculationType?.includes('Roman');

  let panna = parseFloat(item.panna || 0);
  let part = parseFloat(item.part || 1); 
  
  // --- 1. PANNA & PART CALCULATION ---
  // [Inside calculateItemRow function]

  // --- 1. PANNA & PART CALCULATION ---
  if (isRoman) {
    // Part: If Width > 100 inch -> w/50, else 1
    part = wInch > 100 ? (wInch / 50) : 1;
    
    // Panna: (w * h) / 144
    const rawPanna = (wInch * hInch) / 144;
    
    // 🔥 UPDATED LOGIC HERE: Use applyStrictRounding instead of Math.ceil
    // Logic: 14.09 -> 14, but 14.091 -> 15
    const roundedPanna = applyStrictRounding(rawPanna);

    // Apply minimum 16 rule (keep this if your business logic requires min 16 sqft)
    panna = (roundedPanna > 0 && roundedPanna < 16) ? 16 : roundedPanna;

  } else {
    // Local Panna Logic (Unchanged)
    if (panna === 0 && wInch > 0) {
      panna = Math.round(wInch / 21);
    }
  }

  // --- 2. FABRIC CALCULATION ---
  let rawFabric = 0;
  if (isRoman) {
    // ROMAN FORMULA: ((h+15) * part) / 39
    const hBuffered = Math.ceil(hInch + 15);
    rawFabric = (hBuffered * part) / 39;
  } else {
    // LOCAL FORMULA: ((h+15) / 39) * panna
    if (hInch > 0 && panna > 0) {
      rawFabric = ((hInch + 15) / 39) * panna;
    }
  }
  
  const finalFabric = applyCustomRounding(rawFabric);

  // --- 3. EXTRAS ---
  let channelQty = 0;
  let labourQty = 0; // Initialize at 0
  
  if (isRoman) {
    // Roman usually uses Panna for labour qty, or Part? 
    // Usually Roman Labour is calculated on Panna or Area. 
    // Assuming Panna based on your RomanCalculation.tsx file:
    labourQty = panna; 
    channelQty = 0; // Roman usually doesn't use standard channel
  } else {
    // Local Logic
    if (wInch > 0) {
      channelQty = applyChannelRounding(wInch / 12);
    }
    labourQty = calculateLabourQty(wInch, hInch);
  }

  const weightChain = item.hasSheer ? parseFloat(((panna * 54) / 39).toFixed(2)) : 0;

  return {
      ...item,
      width: rawWidth,
      height: rawHeight,
      unit: unit,
      panna: panna,
      part: parseFloat(part.toFixed(2)),
      
      fabricQty: finalFabric,
      blackoutQty: item.hasBlackout ? finalFabric : 0, 
      sheerQty: item.hasSheer ? finalFabric : 0,       
      channelQty: channelQty,
      labourQty: labourQty,
      fittingQty: item.fittingQty || 1, 
      weightChain: weightChain,

      // Ensure rates are kept
      fabricRate: item.fabricRate || 0,
      blackoutRate: item.blackoutRate || 0,
      sheerRate: item.sheerRate || 0,
      channelRate: item.channelRate || 285, 
      labourRate: item.labourRate || 450,   
      fittingRate: item.fittingRate || 355  
  };
};
  useEffect(() => {
    if (selectionId) fetchData();
  }, [selectionId]);

  // In DeepCalculation.tsx - Replace the fetchData function
// In DeepCalculation.tsx

const fetchData = async () => {
  setLoading(true);
  try {
    // =========================================================
    // ✅ STEP 1: Try to load EXISTING saved Deep Calculation
    // =========================================================
    const deepRes = await api.get(`/calculations/deep/${selectionId}`);
    
    if (deepRes.data && deepRes.data.items && deepRes.data.items.length > 0) {
      
      const processed = deepRes.data.items.map((i: any) => ({
        selectionItemId: i.selectionItemId,
        areaName: i.selectionItem?.details?.areaName || i.selectionItem?.areaName || 'Unknown',
        productName: i.selectionItem?.productName || 'Product',
        
        width: parseFloat(i.width || i.selectionItem?.width || 0),
        height: parseFloat(i.height || i.selectionItem?.height || 0),
        unit: i.unit || i.selectionItem?.unit || 'mm',
        
        // ✅ FIX: Use saved category if available, otherwise fallback (fixes multi-type issue on load)
      category: i.category || 
                 (i.selectionItem?.calculationType?.includes('Roman') ? 'Roman' : 
                  i.selectionItem?.calculationType?.includes('Forest (Manual)') ? 'Forest' : 
                  i.selectionItem?.calculationType?.includes('Somfy (Manual)') ? 'Somfy' : // <--- ADD THIS CHECK
                  'Local'),

        panna: parseFloat(i.panna || 0),
        part: parseFloat(i.part || 1),
        channelQty: parseFloat(i.channel || 0),
        fabricQty: parseFloat(i.fabric || 0),
        blackoutQty: parseFloat(i.blackout || 0),
        sheerQty: parseFloat(i.sheer || 0),
        labourQty: parseFloat(i.labour || 0),
        fittingQty: parseFloat(i.fitting || 1),
        weightChain: parseFloat(i.weightChain || 0),
        
        fabricRate: parseFloat(i.fabricRate || 0),
        blackoutRate: parseFloat(i.blackoutRate || 0),
        sheerRate: parseFloat(i.sheerRate || 0),
        channelRate: parseFloat(i.channelRate || 285),
        labourRate: parseFloat(i.labourRate || 450),
        fittingRate: parseFloat(i.fittingRate || 355),
        
        hasFabric: true,
        hasBlackout: Boolean(i.hasBlackout),
        hasSheer: Boolean(i.hasSheer),
        hasChannel: true,
        hasLabour: true,
        hasFitting: true,
      }));
      
      // Sort by original order (using SelectionItem orderIndex if possible)
      processed.sort((a: any, b: any) => 0); 
      
      setItems(processed);
      setLoading(false);
      return;
    }
  } catch (error) {
    console.log('No deep calculation found, generating from selection...');
  }

  // =========================================================
  // ✅ STEP 2: FALLBACK - Generate Fresh Data from Selection
  // =========================================================
  try {
    // 1. Fetch the Master List (Selection Items)
    const selRes = await api.get(`/selections/${selectionId}`);
    const selectionItems = selRes.data?.items || [];

    // 2. Fetch Existing Contexts (Local / Roman tables) to preserve rates if they exist
    let localItemsMap: Record<string, any> = {};
    let romanItemsMap: Record<string, any> = {};

    try {
      const localRes = await api.get(`/calculations/local/${selectionId}`);
      if (localRes.data?.items) {
        localRes.data.items.forEach((i: any) => localItemsMap[i.selectionItemId] = i);
      }
    } catch (e) { console.log('No local data to merge'); }

    try {
      const romanRes = await api.get(`/calculations/by-selection/${selectionId}`);
      if (romanRes.data?.items) {
         romanRes.data.items.forEach((i: any) => {
             if (i.category === 'Roman') romanItemsMap[i.selectionItemId] = i;
         });
      }
    } catch (e) { console.log('No roman data to merge'); }

    let allProcessedItems: any[] = [];

    // 3. Iterate Master List and Create Rows for ALL assigned types
    for (const item of selectionItems) {
      const typeStr = item.calculationType || '';

      // Base Props (Measurements)
      const baseItem = {
        selectionItemId: item.id,
        orderIndex: item.orderIndex || 0,
        areaName: item.details?.areaName || item.areaName || 'Unknown',
        productName: item.productName || 'Product',
        width: parseFloat(item.width || 0),
        height: parseFloat(item.height || 0),
        unit: item.unit || 'mm',
        
        // Defaults
        fabricRate: 0, blackoutRate: 0, sheerRate: 0,
        channelRate: 285, labourRate: 450, fittingRate: 355,
        
        hasFabric: true, hasBlackout: false, hasSheer: false,
        hasChannel: true, hasLabour: true, hasFitting: true,
        fittingQty: 1, panna: 0, part: 1
      };

      // --- A. IF LOCAL ---
      if (typeStr.includes('Local')) {
        const saved = localItemsMap[item.id];
        
        allProcessedItems.push(calculateItemRow({
          ...baseItem,
          category: 'Local',
          // Inherit saved rates if available
          fabricRate: saved ? parseFloat(saved.fabricRate) : 0,
          blackoutRate: saved ? parseFloat(saved.blackoutRate) : 0,
          sheerRate: saved ? parseFloat(saved.sheerRate) : 0,
          channelRate: saved ? parseFloat(saved.channelRate) : 285,
          labourRate: saved ? parseFloat(saved.labourRate) : 450,
          fittingRate: saved ? parseFloat(saved.fittingRate) : 355,

          hasBlackout: saved ? Boolean(saved.hasBlackout) : false,
          hasSheer: saved ? Boolean(saved.hasSheer) : false,
          
          panna: saved ? parseFloat(saved.panna) : 0 // Will recalculate inside calculateItemRow anyway if needed
        }));
      }

      // --- B. IF ROMAN ---
      if (typeStr.includes('Roman')) {
        const saved = romanItemsMap[item.id];

        allProcessedItems.push(calculateItemRow({
          ...baseItem,
          category: 'Roman',
          
          // Roman Specifics
          channelRate: 0, 
          hasChannel: false,
          
          // Inherit saved rates
          fabricRate: saved ? parseFloat(saved.fabricRate) : 0,
          labourRate: saved ? parseFloat(saved.labourRate) : 450,
          fittingRate: saved ? parseFloat(saved.fittingRate) : 355,
          part: saved ? parseFloat(saved.part) : 0
        }));
      }

      // --- C. IF FOREST (MANUAL) ---
      if (typeStr.includes('Forest (Manual)')) {
        // Forest Manual usually doesn't have a pre-calculation table like Local/Roman
        // So we generate a fresh default row
        allProcessedItems.push(calculateItemRow({
          ...baseItem,
          category: 'Forest', // Maps to Forest tab
          
          // Defaults for Forest Manual
          channelRate: 285,
          labourRate: 450,
          fittingRate: 355,
          fabricRate: 0
        }));
      }

      if (typeStr.includes('Somfy (Manual)')) {
        allProcessedItems.push(calculateItemRow({
          ...baseItem,
          category: 'Somfy', // Maps to Somfy tab
          
          // Defaults for Somfy Manual (Adjust default rates if needed)
          channelRate: 0,    // Somfy usually uses tracks, not standard channels
          labourRate: 450,
          fittingRate: 355,
          fabricRate: 0,
          
          hasChannel: false // Default off for Somfy if not using channel
        }));
      }
    }


    // 4. Sort and Set
    if (allProcessedItems.length === 0) {
      toast({ 
        title: "No Items", 
        description: "No Local, Roman, or Forest items found in selection.", 
        variant: 'destructive' 
      });
    } else {
      // Sort by orderIndex to keep them in sync with selection
      allProcessedItems.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      console.log('✅ Generated Fresh Deep Data:', allProcessedItems);
      setItems(allProcessedItems);
    }

  } catch (error) {
    console.error(error);
    toast({ title: "Error", description: "Failed to load data", variant: 'destructive' });
  } finally {
    setLoading(false);
  }
};
  const handleUpdate = (id: string, field: keyof CalcItem, value: any) => {
  setItems(prev => prev.map(item => {
    if (item.selectionItemId !== id) return item;
    
    // ✅ FIX: Handle empty strings and convert to 0
    let processedValue = value;
    if (value === '' || value === null || value === undefined) {
      processedValue = 0;
    } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      processedValue = parseFloat(value);
    }
    
    const updatedItem = { ...item, [field]: processedValue };
    
    if (field === 'hasBlackout') {
       updatedItem.blackoutQty = value ? item.fabricQty : 0;
    }
    if (field === 'hasSheer') {
       updatedItem.sheerQty = value ? item.fabricQty : 0;
    }
    return updatedItem;
  }));
};
  const applyBulkRate = (field: string, rate: number) => {
    if (isNaN(rate)) return;
    setItems(prev => prev.map(item => ({ ...item, [field]: rate })));
    toast({ title: "Applied", description: `Updated all ${field} to ${rate}` });
  };

  const handleRecalculateAll = () => {
    setItems(prev => prev.map(item => calculateItemRow(item)));
    toast({ title: "Recalculated", description: "All quantities refreshed based on dimensions." });
  };

  // ✅ NEW: Reset to Default Values
  const handleResetToDefaults = async () => {
    try {
      const res = await api.get(`/calculations/local/${selectionId}`);
      if (!res.data || !res.data.items) {
        toast({ title: "Error", description: "Cannot load default values", variant: 'destructive' });
        return;
      }
      
      const rawItems = res.data.items;
      const processed = rawItems.map((i: any) => {
        const baseItem = {
           selectionItemId: i.selectionItemId,
           areaName: i.selectionItem?.details?.areaName || i.selectionItem?.areaName || 'Unknown',
           productName: i.selectionItem?.productName || 'Product',
           width: parseFloat(i.selectionItem?.width || 0),
           height: parseFloat(i.selectionItem?.height || 0),
           unit: i.selectionItem?.unit || 'mm',
           
           panna: parseFloat(i.panna || 0),
           fabricRate: parseFloat(i.fabricRate || 0),
           blackoutRate: parseFloat(i.blackoutRate || 0),
           sheerRate: parseFloat(i.sheerRate || 0),
           channelRate: parseFloat(i.channelRate || 285),
           labourRate: parseFloat(i.labourRate || 450),
           fittingRate: parseFloat(i.fittingRate || 355),
           
           hasFabric: true,
           hasBlackout: Boolean(i.hasBlackout),
           hasSheer: Boolean(i.hasSheer),
           hasChannel: true,
           hasLabour: true,
           hasFitting: true,
           
           fittingQty: parseFloat(i.fitting || 1)
        };
        return calculateItemRow(baseItem);
      });
      
      setItems(processed);
      toast({ title: "Reset Complete", description: "All values restored to calculated defaults" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset values", variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        items: items.map(item => ({
          selectionItemId: item.selectionItemId,
          category: item.category, // ✅ CRITICAL: Send category to backend
          
          width: item.width,
          height: item.height,
          unit: item.unit,

          panna: item.panna,
          part: item.part || 1, // ✅ ADD THIS
          channel: item.channelQty,
          fabric: item.fabricQty,
          blackout: item.blackoutQty,
          sheer: item.sheerQty,
          labour: item.labourQty,
          fitting: item.fittingQty,
          weightChain: item.weightChain,
          
          fabricRate: item.fabricRate,
          blackoutRate: item.blackoutRate,
          sheerRate: item.sheerRate,
          channelRate: item.channelRate,
          labourRate: item.labourRate,
          fittingRate: item.fittingRate,
          
          hasBlackout: item.hasBlackout,
          hasSheer: item.hasSheer
        }))
      };

      await api.post(`/calculations/deep/${selectionId}`, payload);
      toast({ title: "Success", description: "Calculation saved successfully!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save data" });
    } finally {
      setSaving(false);
    }
  };

// [In DeepCalculation.tsx]

const getRowTotal = (item: CalcItem) => {
  let total = 0;
  // Helper to safely get number
  const val = (v: string | number) => parseFloat(String(v)) || 0;

  if(item.hasFabric) total += val(item.fabricQty) * val(item.fabricRate);
  if(item.hasBlackout) total += val(item.blackoutQty) * val(item.blackoutRate);
  if(item.hasSheer) total += val(item.sheerQty) * val(item.sheerRate);
  if(item.hasChannel) total += val(item.channelQty) * val(item.channelRate);
  if(item.hasLabour) total += val(item.labourQty) * val(item.labourRate);
  if(item.hasFitting) total += val(item.fittingQty) * val(item.fittingRate);
  return total;
};
  const grandTotal = items.reduce((sum, i) => sum + getRowTotal(i), 0);

// [In DeepCalculation.tsx]

const RateBlock = ({ label, qty, rate, active, onCheck, onQty, onRate, color = 'gray' }: any) => {
  const borderColor = active ? `border-${color}-200` : 'border-gray-100';
  const bgColor = active ? 'bg-white' : 'bg-gray-50 opacity-50';
  
  // Safe math for display
  const numQty = parseFloat(qty) || 0;
  const numRate = parseFloat(rate) || 0;
  const total = numQty * numRate;

  return (
    <div className={`flex flex-col gap-1 p-2 rounded border ${borderColor} ${bgColor} transition-all`}>
       <div className="flex justify-between items-center mb-1">
         <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{label}</span>
         <Checkbox 
           checked={active} 
           onCheckedChange={onCheck} 
           className="h-3 w-3 border-gray-300 data-[state=checked]:bg-purple-600" 
         />
       </div>
       <div className="flex gap-1">
          <div className="flex-1 flex gap-1">
           {/* QTY INPUT */}
           <Input 
              className="h-7 text-[11px] text-center px-1 bg-white border-gray-200 focus:border-purple-400" 
              placeholder="Qty"
              value={qty} // ✅ Pass raw value (string or number)
              onChange={(e) => onQty(e.target.value)} // ✅ Pass raw event value
              disabled={!active} 
            />

            {/* RATE INPUT */}
            <Input 
              className="h-7 text-[11px] text-right px-1 bg-white border-gray-200 focus:border-purple-400" 
              placeholder="Rate"
              value={rate} // ✅ Pass raw value
              onChange={(e) => onRate(e.target.value)} // ✅ Pass raw event value
              disabled={!active} 
            />
          </div>
       </div>
       {active && (
         <div className="text-[10px] font-bold text-right text-gray-700 mt-1">
           ₹{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
         </div>
       )}
    </div>
  );
};
// ... (rest of your component logic above)

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-purple-600" /></div>;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
        
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-20">
           <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => navigate('/calculations/edit/' + selectionId)}>
               <ArrowLeft className="h-5 w-5 text-gray-500" />
             </Button>
             <div>
               <h1 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                 <FileText className="h-5 w-5 text-purple-600" /> Deep Costing
               </h1>
               <div className="flex items-center gap-2 text-xs text-gray-500">
                 <span>Items: {items.length}</span>
                 <span>•</span>
                 <span>Final Pricing & Rates</span>
               </div>
             </div>
           </div>
           <div className="text-right flex items-center gap-6">
             <div>
               <span className="text-xs text-gray-500 uppercase font-bold tracking-wider block text-right">Grand Total</span>
               <div className="text-2xl font-bold text-purple-700">₹{grandTotal.toLocaleString()}</div>
             </div>
             <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 h-10 px-6 shadow-sm">
               {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Calculation
             </Button>
           </div>
        </div>

       {/* SECONDARY TOOLBAR WITH TABS */}
        <div className="bg-white border-b px-6 py-3 flex gap-4 overflow-x-auto shadow-sm z-10 items-center min-h-[60px]">
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shrink-0">
            <button
              onClick={() => setActiveTab('Local')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'Local' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Local ({localItems.length})
            </button>
            <button
              onClick={() => setActiveTab('Roman')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'Roman' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Roman ({romanItems.length})
            </button>
            <button
              onClick={() => setActiveTab('Forest')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'Forest' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Forest ({forestItems.length})
            </button>
            <button
              onClick={() => setActiveTab('Somfy')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'Somfy' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Somfy ({somfyItems.length})
            </button>
          </div>

          <div className="h-6 w-px bg-gray-300 mx-2" /> 

          {/* BULK RATES */}
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500 whitespace-nowrap">
            <Settings className="h-4 w-4" /> Rates:
          </div>
          
          {Object.entries(bulkRates).map(([key, val]) => (
            <div key={key} className="flex-none flex items-center border border-gray-200 rounded bg-white overflow-hidden shadow-sm h-9">
               <span className="flex-shrink-0 text-[10px] uppercase px-3 bg-gray-50 text-gray-600 font-medium border-r h-full flex items-center justify-center min-w-[60px]">
                 {key}
               </span>
               <Input 
                 className="h-full w-20 text-xs text-center border-0 focus-visible:ring-0 rounded-none px-1" 
                 value={val} 
                 onChange={(e) => setBulkRates({...bulkRates, [key]: parseFloat(e.target.value)})} 
               />
               <button 
                 onClick={() => applyBulkRate(`${key}Rate`, Number(val))} 
                 className="flex-shrink-0 h-full px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border-l transition-colors flex items-center justify-center"
                 title={`Apply ${val} to all ${key}`}
               >
                 <Check className="h-4 w-4" />
               </button>
            </div>
          ))}
          
          {/* ACTIONS */}
          <div className="ml-auto border-l pl-4 flex gap-2">
             <Button variant="outline" size="sm" onClick={handleRecalculateAll} className="h-9 text-xs gap-2 text-gray-600 border-gray-300">
                <RefreshCcw className="h-3 w-3" /> Recalculate
             </Button>
             <Button variant="outline" size="sm" onClick={handleResetToDefaults} className="h-9 text-xs gap-2 text-orange-600 border-orange-300 hover:bg-orange-50">
                <RotateCcw className="h-3 w-3" /> Reset
             </Button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50/50">
           <div className="max-w-[1600px] mx-auto space-y-3">
             
             {/* EMPTY STATE */}
             {displayedItems.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  <p>No {activeTab} items found for this selection.</p>
                </div>
             )}

             {/* RENDER ITEMS */}
             {displayedItems.map((item) => (
               <div key={item.selectionItemId} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow p-3">
                 <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                    <div className="flex items-start gap-3">
                      {/* COLOR CODED ICON - Cleaned Logic */}
                      <div className={`h-8 w-8 rounded flex items-center justify-center font-bold text-xs mt-1 ${
                        item.category === 'Roman' ? 'bg-orange-50 text-orange-700' :
                        item.category === 'Forest' ? 'bg-teal-50 text-teal-700' :
                        item.category === 'Somfy' ? 'bg-amber-50 text-amber-700' :
                        'bg-purple-50 text-purple-700'
                      }`}>
                        {item.areaName.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{item.areaName}</div>
                        <div className="text-xs text-gray-500 flex gap-2">
                            <span className="font-medium text-purple-600">{item.productName}</span>
                            <span>•</span>
                            <span className="font-mono">{item.width} x {item.height} {item.unit}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Total</div>
                      <div className="font-bold text-base text-purple-700">₹{getRowTotal(item).toLocaleString()}</div>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <RateBlock label="Fabric" qty={item.fabricQty} rate={item.fabricRate} active={item.hasFabric} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasFabric', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'fabricQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'fabricRate', v)}
                      color="green"
                    />
                    <RateBlock label="Blackout" qty={item.blackoutQty} rate={item.blackoutRate} active={item.hasBlackout} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasBlackout', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'blackoutQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'blackoutRate', v)}
                      color="green"
                    />
                    <RateBlock label="Sheer" qty={item.sheerQty} rate={item.sheerRate} active={item.hasSheer} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasSheer', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'sheerQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'sheerRate', v)}
                      color="green"
                    />
                    <RateBlock label="Channel" qty={item.channelQty} rate={item.channelRate} active={item.hasChannel} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasChannel', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'channelQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'channelRate', v)}
                      color="orange"
                    />
                    <RateBlock label="Labour" qty={item.labourQty} rate={item.labourRate} active={item.hasLabour} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasLabour', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'labourQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'labourRate', v)}
                      color="blue"
                    />
                    <RateBlock label="Fitting" qty={item.fittingQty} rate={item.fittingRate} active={item.hasFitting} 
                      onCheck={(c:any) => handleUpdate(item.selectionItemId, 'hasFitting', c)}
                      onQty={(v:any) => handleUpdate(item.selectionItemId, 'fittingQty', v)}
                      onRate={(v:any) => handleUpdate(item.selectionItemId, 'fittingRate', v)}
                      color="blue"
                    />
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </DashboardLayout>
  );
}