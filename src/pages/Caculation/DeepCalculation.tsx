import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, FileText, Check, Settings, RefreshCcw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface CalcItem {
  internalId: string;
  category: string;
  selectionItemId: string;
  areaName: string;
  productName: string;
  
  width: number;
  height: number;
  unit: string;
  
  panna: number;
  part: number; 

  channelQty: number | string; 
  fabricQty: number | string; 
  blackoutQty: number | string; 
  sheerQty: number | string;
  labourQty: number | string; 
  fittingQty: number | string;
  weightChain: number | string;
  
  fabricRate: number | string; 
  blackoutRate: number | string; 
  sheerRate: number | string;
  channelRate: number | string; 
  labourRate: number | string; 
  fittingRate: number | string;
  
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

  const [bulkRates, setBulkRates] = useState({
    fabric: 0, blackout: 0, sheer: 0, 
    channel: 285, labour: 450, fitting: 355
  });

  // --- 1. HELPER FUNCTIONS ---

  const toInches = (val: number, unit: string) => {
    if (!val) return 0;
    const u = unit?.toLowerCase().trim() || 'mm';
    if (u === 'mm') return val / 25.4;
    if (u === 'cm') return val / 2.54;
    if (u === 'ft' || u === 'feet') return val * 12;
    if (u === 'm' || u === 'meter') return val * 39.37;
    return val; 
  };

  const applyCustomRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    const cleanDec = parseFloat(decPart.toFixed(2));
    if (cleanDec === 0) return intPart;
    if (cleanDec <= 0.30) return intPart + 0.25;
    if (cleanDec <= 0.55) return intPart + 0.50;
    if (cleanDec <= 0.75) return intPart + 0.75;
    return intPart + 1.00; 
  };

  const applyChannelRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    return decPart > 0.09 ? intPart + 1 : intPart;
  };

  const applyStrictRounding = (val: number) => {
    if (!val || val <= 0) return 0;
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    return decPart > 0.09 ? intPart + 1 : intPart;
  };

  const calculateLabourQty = (widthInches: number, heightInches: number) => {
    if (!widthInches) return 0;
    const rawPleats = widthInches / 21;
    const basePleats = applyStrictRounding(rawPleats); 
    if (heightInches >= 115 && heightInches <= 144) return basePleats * 1.5;
    if (heightInches >= 145 && heightInches <= 200) return basePleats * 2;
    if (heightInches > 200) return basePleats * 3;
    return basePleats;
  };

  // This function generates the initial values based on formulas.
  const calculateItemRow = (item: any) => {
    const unit = item.unit || 'mm';
    const rawWidth = parseFloat(item.width || 0);
    const rawHeight = parseFloat(item.height || 0);
    const wInch = toInches(rawWidth, unit);
    const hInch = toInches(rawHeight, unit);

    const isRoman = item.category === 'Roman';

    let panna = parseFloat(item.panna || 0);
    let part = parseFloat(item.part || 1); 

    if (isRoman) {
      part = wInch > 50 ? (wInch / 50) : 1;
      const rawPanna = (wInch * hInch) / 144;
      const roundedPanna = applyStrictRounding(rawPanna);
      panna = (roundedPanna > 0 && roundedPanna < 16) ? 16 : roundedPanna;
    } else {
      if (panna === 0 && wInch > 0) {
        const rawCalc = wInch / 21;
        panna = applyStrictRounding(rawCalc);
      }
    }

    let rawFabric = 0;
    if (isRoman) {
      const hBuffered = Math.ceil(hInch + 15);
      rawFabric = (hBuffered * part) / 39;
    } else {
      if (hInch > 0 && panna > 0) {
        rawFabric = ((hInch + 15) / 39) * panna;
      }
    }
    
    const finalFabric = applyCustomRounding(rawFabric);

    let channelQty = 0;
    let labourQty = 0; 
    
    if (isRoman) {
      labourQty = panna; 
      channelQty = 0; 
    } else {
      if (wInch > 0) {
        channelQty = applyChannelRounding(wInch / 12);
      }
      labourQty = calculateLabourQty(wInch, hInch);
    }

    const weightChain = item.hasSheer ? parseFloat(((panna * 54) / 39).toFixed(2)) : 0;
    
    const fabricQty = item.hasFabric ? finalFabric : 0;
    const blackoutQty = item.hasBlackout ? finalFabric : 0;
    const sheerQty = item.hasSheer ? finalFabric : 0;
    const finalChannelQty = item.hasChannel ? channelQty : 0;

    return {
        ...item,
        width: rawWidth,
        height: rawHeight,
        unit: unit,
        panna: panna,
        part: parseFloat(part.toFixed(2)),
        
        fabricQty: fabricQty,
        blackoutQty: blackoutQty, 
        sheerQty: sheerQty,       
        channelQty: finalChannelQty,
        labourQty: labourQty,
        fittingQty: item.fittingQty || 1, 
        weightChain: weightChain,

        fabricRate: item.fabricRate || 0,
        blackoutRate: item.blackoutRate || 0,
        sheerRate: item.sheerRate || 0,
        channelRate: item.channelRate || (isRoman ? 0 : 285), 
        labourRate: item.labourRate || 450,   
        fittingRate: item.fittingRate || 355  
    };
  };

  // --- 2. DATA LOADING ---
  useEffect(() => {
    if (selectionId) fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Saved Data
      let savedItems: any[] = [];
      try {
        const deepRes = await api.get(`/calculations/deep/${selectionId}`);
        if (deepRes.data?.items) savedItems = deepRes.data.items;
      } catch (e) { /* ignore */ }

      // 2. Fetch Selection (Source of Truth)
      const selRes = await api.get(`/selections/${selectionId}`);
      const selectionItems = selRes.data?.items || [];

      let finalItems: CalcItem[] = [];

      // 3. Merge Logic
      for (const item of selectionItems) {
        const rawAreaName = item.details?.areaName || item.areaName || 'Unknown';
        const typeStr = item.calculationType || '';
        
        // --- Detect M+S Split ---
        const isSplitItem = /\(M\+S\)/i.test(rawAreaName);
        const variants = isSplitItem ? ['Main', 'Sheer'] : ['Normal'];

        // Get all saved rows for this specific item ID
        const savedRowsForItem = savedItems.filter((s: any) => s.selectionItemId === item.id);

        variants.forEach((variant) => {
          // Identify Category
          let category = 'Local';
          if (typeStr.includes('Roman')) category = 'Roman';
          else if (typeStr.includes('Forest (Manual)')) category = 'Forest';
          else if (typeStr.includes('Somfy (Manual)')) category = 'Somfy';
          else if (!typeStr.includes('Local')) return; 

          // Rename Area based on Variant
          let finalAreaName = rawAreaName;
          if (variant === 'Main') finalAreaName = rawAreaName.replace(/\(M\+S\)/i, '(Main)');
          if (variant === 'Sheer') finalAreaName = rawAreaName.replace(/\(M\+S\)/i, '(Sheer)');

          // 🔥 FIXED: Always generate a consistent Internal ID. 
          // Never use the database ID as the internal ID key.
          const internalId = `${item.id}_${variant}`;

          // Match saved row by variant field
          const savedMatch = savedRowsForItem.find((s: any) => s.variant === variant);

          if (savedMatch) {
            // --- LOAD SAVED STATE ---
            finalItems.push({
               internalId: internalId, // ✅ ALWAYS USE GENERATED ID
               selectionItemId: item.id,
               category: category,
               areaName: finalAreaName, 
               productName: item.productName || 'Product',
               
               width: parseFloat(item.width || 0),
               height: parseFloat(item.height || 0),
               unit: item.unit || 'mm',
               
               panna: parseFloat(savedMatch.panna || 0),
               part: parseFloat(savedMatch.part || 1),

               fabricQty: parseFloat(savedMatch.fabric || 0),
               blackoutQty: parseFloat(savedMatch.blackout || 0), 
               sheerQty: parseFloat(savedMatch.sheer || 0),       
               channelQty: parseFloat(savedMatch.channel || 0),
               labourQty: parseFloat(savedMatch.labour || 0),
               fittingQty: parseFloat(savedMatch.fitting || 0),
               weightChain: parseFloat(savedMatch.weightChain || 0),

               fabricRate: parseFloat(savedMatch.fabricRate || 0),
               blackoutRate: parseFloat(savedMatch.blackoutRate || 0),
               sheerRate: parseFloat(savedMatch.sheerRate || 0),
               channelRate: parseFloat(savedMatch.channelRate || 0), 
               labourRate: parseFloat(savedMatch.labourRate || 0),   
               fittingRate: parseFloat(savedMatch.fittingRate || 0),  
               
               hasFabric: Boolean(savedMatch.hasFabric),
               hasBlackout: Boolean(savedMatch.hasBlackout),
               hasSheer: Boolean(savedMatch.hasSheer),
               hasChannel: Boolean(savedMatch.hasChannel),
               hasLabour: Boolean(savedMatch.hasLabour),
               hasFitting: Boolean(savedMatch.hasFitting),
            });
          } else {
            // --- GENERATE NEW STATE ---
            const isSheerVariant = (variant === 'Sheer');
            
            const defaultHasFabric = !isSheerVariant;
            const defaultHasBlackout = !isSheerVariant; 
            const defaultHasSheer = isSheerVariant;
            const defaultHasChannel = !isSheerVariant && category !== 'Roman'; 
            const defaultHasLabour = true; 
            const defaultHasFitting = !isSheerVariant;

            const newItem = {
              internalId,
              selectionItemId: item.id,
              category,
              areaName: finalAreaName,
              productName: item.productName || 'Product',
              width: parseFloat(item.width || 0),
              height: parseFloat(item.height || 0),
              unit: item.unit || 'mm',
              
              panna: 0, part: 1, 
              
              hasFabric: defaultHasFabric,
              hasBlackout: defaultHasBlackout,
              hasSheer: defaultHasSheer,
              hasChannel: defaultHasChannel,
              hasLabour: defaultHasLabour,
              hasFitting: defaultHasFitting,
              
              fabricRate: 0, blackoutRate: 0, sheerRate: 0,
              channelRate: category === 'Roman' ? 0 : 285,
              labourRate: 450, fittingRate: 355
            };
            
            finalItems.push(calculateItemRow(newItem));
          }
        });
      }

      finalItems.sort((a, b) => a.areaName.localeCompare(b.areaName));
      setItems(finalItems);
      
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to load data", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- 3. HANDLE UPDATES (SYNC & PERSISTENCE) ---
  const handleUpdate = (id: string, field: keyof CalcItem, value: any) => {
    setItems(prev => prev.map(item => {
      // ✅ STRICT ISOLATION: Only update the exact row matching the ID
      if (item.internalId !== id) return item; 
      
      const updatedItem = { ...item };
      
      let processedValue = value;
      if (typeof value === 'string' && field !== 'unit') {
        processedValue = value === '' ? 0 : parseFloat(value);
        if (isNaN(processedValue)) processedValue = 0;
      }
      
      (updatedItem as any)[field] = processedValue;

      // Toggle Logic
      if (field === 'hasFabric' && !value) updatedItem.fabricQty = 0;
      if (field === 'hasBlackout') updatedItem.blackoutQty = value ? updatedItem.fabricQty : 0;
      if (field === 'hasSheer') updatedItem.sheerQty = value ? updatedItem.fabricQty : 0;
      if (field === 'hasChannel' && !value) updatedItem.channelQty = 0;
      if (field === 'hasFitting' && !value) updatedItem.fittingQty = 0;
      
      if (field === 'fabricQty') {
         if (updatedItem.hasBlackout) updatedItem.blackoutQty = processedValue;
         if (updatedItem.hasSheer) updatedItem.sheerQty = processedValue;
      }

      return updatedItem;
    }));
  };

  // --- 4. HANDLE SAVE ---
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        items: items.map(item => ({
          selectionItemId: item.selectionItemId,
          category: item.category,
          
          // 🔥 FIXED: Extract Variant reliably from the Internal ID
          // Because we force internalId to be "UUID_Variant" in fetchData, this always works now.
          variant: item.internalId.split('_').pop() || 'Normal',
          
          width: item.width,
          height: item.height,
          unit: item.unit,

          panna: item.panna,
          part: item.part || 1,
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
          
          hasFabric: item.hasFabric,
          hasBlackout: item.hasBlackout,
          hasSheer: item.hasSheer,
          hasChannel: item.hasChannel,
          hasLabour: item.hasLabour,
          hasFitting: item.hasFitting
        }))
      };

      await api.post(`/calculations/deep/${selectionId}`, payload);
      toast({ 
        title: "Success", 
        description: "Calculation saved successfully!",
        className: "bg-green-600 text-white" 
      });
      
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save data", variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // 🔥 FIXED: Apply Bulk Rate ONLY to active Category
  const applyBulkRate = (field: string, rate: number) => {
    if (isNaN(rate)) return;
    setItems(prev => prev.map(item => {
      // Isolation Check: Only apply if category matches current tab
      if (item.category !== activeTab) return item;
      return { ...item, [field]: rate };
    }));
    toast({ title: "Applied", description: `Updated ${field} for ${activeTab} items only.` });
  };

  const handleRecalculateAll = () => {
    setItems(prev => prev.map(item => calculateItemRow(item)));
    toast({ title: "Recalculated", description: "Values refreshed based on dimensions." });
  };

  const getRowTotal = (item: CalcItem) => {
    let total = 0;
    const val = (v: string | number) => parseFloat(String(v)) || 0;

    if(item.hasFabric) total += val(item.fabricQty) * val(item.fabricRate);
    if(item.hasBlackout) total += val(item.blackoutQty) * val(item.blackoutRate);
    if(item.hasSheer) total += val(item.sheerQty) * val(item.sheerRate);
    if(item.hasChannel) total += val(item.channelQty) * val(item.channelRate);
    if(item.hasLabour) total += val(item.labourQty) * val(item.labourRate);
    if(item.hasFitting) total += val(item.fittingQty) * val(item.fittingRate);
    return total;
  };

  const displayedItems = items.filter(i => {
     if (activeTab === 'Local') return i.category === 'Local';
     if (activeTab === 'Roman') return i.category === 'Roman';
     if (activeTab === 'Forest') return i.category === 'Forest';
     return i.category === 'Somfy';
  });

  const grandTotal = items.reduce((sum, i) => sum + getRowTotal(i), 0);
  
  const counts = {
    Local: items.filter(i => i.category === 'Local').length,
    Roman: items.filter(i => i.category === 'Roman').length,
    Forest: items.filter(i => i.category === 'Forest').length,
    Somfy: items.filter(i => i.category === 'Somfy').length,
  };

  // --- UI COMPONENTS ---
  const RateBlock = ({ label, qty, rate, active, onCheck, onQty, onRate, color = 'gray' }: any) => {
    const borderColor = active ? `border-${color}-200` : 'border-gray-100';
    const bgColor = active ? 'bg-white' : 'bg-gray-50 opacity-50';
    const numQty = parseFloat(qty) || 0;
    const numRate = parseFloat(rate) || 0;
    const total = numQty * numRate;

    return (
      <div className={`flex flex-col gap-1 p-2 rounded border ${borderColor} ${bgColor} transition-all`}>
         <div className="flex justify-between items-center mb-1">
           <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{label}</span>
           <Checkbox checked={active} onCheckedChange={onCheck} className="h-3 w-3" />
         </div>
         <div className="flex gap-1">
            <div className="flex-1 flex gap-1">
             <Input className="h-7 text-[11px] text-center px-1" placeholder="Qty"
                value={qty} onChange={(e) => onQty(e.target.value)} disabled={!active} />
              <Input className="h-7 text-[11px] text-right px-1" placeholder="Rate"
                value={rate} onChange={(e) => onRate(e.target.value)} disabled={!active} />
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

      {/* TABS */}
        <div className="bg-white border-b px-6 py-3 flex gap-4 overflow-x-auto shadow-sm z-10 items-center min-h-[60px]">
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shrink-0">
            {['Local', 'Roman', 'Forest', 'Somfy'].map((tab) => {
              const count = counts[tab as keyof typeof counts] || 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${
                    activeTab === tab ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === tab ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="h-6 w-px bg-gray-300 mx-2" /> 

          {/* BULK RATES */}
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500 whitespace-nowrap">
            <Settings className="h-4 w-4" /> {activeTab} Rates:
          </div>
          {Object.entries(bulkRates).map(([key, val]) => (
            <div key={key} className="flex-none flex items-center border border-gray-200 rounded bg-white overflow-hidden shadow-sm h-9">
               <span className="flex-shrink-0 text-[10px] uppercase px-3 bg-gray-50 text-gray-600 font-medium border-r h-full flex items-center justify-center min-w-[60px]">{key}</span>
               <Input className="h-full w-20 text-xs text-center border-0 focus-visible:ring-0 rounded-none px-1" 
                 value={val} onChange={(e) => setBulkRates({...bulkRates, [key]: parseFloat(e.target.value)})} />
               <button onClick={() => applyBulkRate(`${key}Rate`, Number(val))} className="flex-shrink-0 h-full px-3 bg-purple-50 text-purple-700 border-l"><Check className="h-4 w-4" /></button>
            </div>
          ))}
          
          <div className="ml-auto border-l pl-4 flex gap-2">
             <Button variant="outline" size="sm" onClick={handleRecalculateAll} className="h-9 text-xs gap-2"><RefreshCcw className="h-3 w-3" /> Recalculate</Button>
          </div>
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50/50">
           <div className="max-w-[1600px] mx-auto space-y-3">
             {displayedItems.map((item) => (
               <div key={item.internalId} className="bg-white border border-gray-200 rounded-lg shadow-sm p-3">
                 <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs mt-1">
                        {item.areaName.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{item.areaName}</div>
                        <div className="text-xs text-gray-500 flex gap-2">
                            <span className="font-medium text-purple-600">{item.productName}</span>
                            <span>•</span>
                            <span className="font-mono">{item.width} x {item.height} {item.unit}</span>
                             {/* DEBUGGER: Shows Variant to confirm split */}
                            <span className="bg-gray-100 text-gray-500 px-1 rounded text-[10px]">{item.internalId.split('_').pop()}</span>
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
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasFabric', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'fabricQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'fabricRate', v)}
                     color="green"
                   />
                   <RateBlock label="Blackout" qty={item.blackoutQty} rate={item.blackoutRate} active={item.hasBlackout} 
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasBlackout', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'blackoutQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'blackoutRate', v)}
                     color="green"
                   />
                   <RateBlock label="Sheer" qty={item.sheerQty} rate={item.sheerRate} active={item.hasSheer} 
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasSheer', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'sheerQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'sheerRate', v)}
                     color="green"
                   />
                   <RateBlock label="Channel" qty={item.channelQty} rate={item.channelRate} active={item.hasChannel} 
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasChannel', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'channelQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'channelRate', v)}
                     color="orange"
                   />
                   <RateBlock label="Labour" qty={item.labourQty} rate={item.labourRate} active={item.hasLabour} 
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasLabour', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'labourQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'labourRate', v)}
                     color="blue"
                   />
                   <RateBlock label="Fitting" qty={item.fittingQty} rate={item.fittingRate} active={item.hasFitting} 
                     onCheck={(c:any) => handleUpdate(item.internalId, 'hasFitting', c)}
                     onQty={(v:any) => handleUpdate(item.internalId, 'fittingQty', v)}
                     onRate={(v:any) => handleUpdate(item.internalId, 'fittingRate', v)}
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