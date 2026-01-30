// [FILE: src/pages/Calculation/RomanCalculation.tsx]
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface RomanItem {
  selectionItemId: string;
  areaName: string;
  productName: string;
  width: number;
  height: number;
  unit: string;
  part: number;
  panna: number;
  fabric: number;
  fabricRate: number;
  labourRate: number;
  fittingRate: number;
}

export default function RomanCalculation() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [items, setItems] = useState<RomanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkRates, setBulkRates] = useState({
    fabric: 0,
    labour: 450,
    fitting: 355
  });

  // Helper to safely parse numbers
  const safeFloat = (val: any) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  const toInches = (value: number, unit: string = 'mm') => {
    // Treat 0 as a valid number, only fail on actual NaN or null/undefined
    if (value === null || value === undefined || isNaN(value)) return 0;
    
    const u = unit?.toLowerCase().trim() || 'mm';
    if (u === 'inch' || u === 'inches' || u === '"') return value;
    if (u === 'mm') return value / 25.4;
    if (u === 'cm') return value / 2.54;
    if (u === 'ft' || u === 'feet') return value * 12;
    if (u === 'm' || u === 'meter') return value * 39.3701;
    return value;
  };

  const formatNumber = (num: number) => parseFloat(num.toFixed(2));

  const calculateRomanValues = (width: number, height: number, unit: string) => {
    const wInch = toInches(width, unit);
    const hInch = toInches(height, unit);
    
    // UPDATED: Check if > 50 instead of > 100
    const part = wInch > 50 ? (wInch / 50) : 1;
    
    // PANNA: (w * h) / 144. If result < 16 -> 16. Else -> Round Up
    const rawPanna = (wInch * hInch) / 144;
    const panna = rawPanna > 0 && rawPanna < 16 ? 16 : Math.ceil(rawPanna);
    
    // FABRIC: RoundUp(H + 15) * Part / 39
    const hBuffered = Math.ceil(hInch + 15);
    const fabric = (hBuffered * part) / 39;
    
    return { part: formatNumber(part), panna, fabric: formatNumber(fabric) };
  };
  
  useEffect(() => {
    fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    try {
      const selRes = await api.get(`/selections/${selectionId}`);
      const selection = selRes.data;

      if (!selection.items || selection.items.length === 0) {
        toast({ 
          title: "No Items", 
          description: "Please add items to the selection first.", 
          variant: "destructive" 
        });
        setLoading(false);
        return;
      }

      let existingCalc = null;
      try {
        const calcRes = await api.get(`/calculations/by-selection/${selectionId}`);
        existingCalc = calcRes.data;
      } catch (err) {}

      // 🔥 FIX: Change '===' to '.includes'
      const mapped = selection.items
        .filter((item: any) => item.calculationType && item.calculationType.includes('Roman'))
        .map((item: any) => {
          const width = safeFloat(item.width);
          const height = safeFloat(item.height);
          const unit = item.unit || 'mm';
          
          const { part, panna, fabric } = calculateRomanValues(width, height, unit);
          
          const savedItem = existingCalc?.items?.find((ci: any) => 
            ci.selectionItemId === item.id && ci.category === 'Roman'
          );
          
          return {
            selectionItemId: item.id,
            areaName: item.details?.areaName || item.areaName || 'Area',
            productName: item.productName || 'Roman Curtain',
            width: width,
            height: height,
            unit,
            part,
            panna,
            fabric,
            fabricRate: savedItem ? safeFloat(savedItem.fabricRate) : 0,
            labourRate: savedItem ? safeFloat(savedItem.labourRate) : 450,
            fittingRate: savedItem ? safeFloat(savedItem.fittingRate) : 355
          };
        });
      
      setItems(mapped);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDimensionChange = (id: string, field: 'width' | 'height' | 'unit', value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item.selectionItemId !== id) return item;
      
      // 1. Update the raw field
      const updated = { ...item, [field]: value };
      
      // 2. Prepare safe numbers for calculation
      // If we are changing width, use the NEW parsed value. Otherwise use existing item.width
      const newWidth = field === 'width' ? safeFloat(value) : safeFloat(item.width);
      const newHeight = field === 'height' ? safeFloat(value) : safeFloat(item.height);
      const newUnit = field === 'unit' ? String(value) : item.unit;
      
      // 3. Recalculate Logic
      const { part, panna, fabric } = calculateRomanValues(newWidth, newHeight, newUnit);
      
      updated.part = part;
      updated.panna = panna;
      updated.fabric = fabric;
      
      return updated;
    }));
  };

  const handleRateChange = (id: string, field: 'fabricRate' | 'labourRate' | 'fittingRate', value: string) => {
    setItems(prev => prev.map(item => 
      item.selectionItemId === id ? { ...item, [field]: value } : item
    ));
  };

  const handleRateBlur = (id: string, field: 'fabricRate' | 'labourRate' | 'fittingRate', value: string) => {
    setItems(prev => prev.map(item => 
      item.selectionItemId === id ? { ...item, [field]: safeFloat(value) } : item
    ));
  };

  const applyBulkRate = (field: 'fabricRate' | 'labourRate' | 'fittingRate', rateKey: keyof typeof bulkRates) => {
    const value = formatNumber(bulkRates[rateKey]);
    setItems(prev => prev.map(item => ({ ...item, [field]: value })));
    toast({ title: "Applied", description: `${field} updated for all items.` });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/calculations', {
        selectionId,
        items: items.map(item => ({
          selectionItemId: item.selectionItemId,
          category: 'Roman',
          type: 'Local',
          part: item.part,
          panna: item.panna,
          fabric: item.fabric,
          fabricRate: item.fabricRate,
          labourRate: item.labourRate,
          fittingRate: item.fittingRate,
          // Explicitly save dimensions back to ensure persistence
          width: item.width,
          height: item.height,
          unit: item.unit,
          
          hasBlackout: false,
          blackout: 0,
          hasSheer: false,
          sheer: 0,
          weightChain: 0,
          channel: 0,
          sqft: 0
        }))
      });
      toast({ title: "Saved", description: "Roman calculations saved successfully!" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const calculateRowTotal = (item: RomanItem) => {
    const fabricTotal = item.fabric * item.fabricRate;
    const labourTotal = item.panna * item.labourRate;
    const fittingTotal = item.fittingRate;
    return formatNumber(fabricTotal + labourTotal + fittingTotal);
  };

  const grandTotal = formatNumber(items.reduce((sum, item) => sum + calculateRowTotal(item), 0));

  if (loading) return (
    <DashboardLayout>
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-[#ee4046]" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Roman Curtain Calculation</h1>
              <p className="text-sm text-gray-500">{items.length} items</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total</span>
              <div className="text-2xl font-bold text-[#ee4046]">₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-[#ee4046] hover:bg-[#d63940]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50/80 text-gray-700 font-semibold border-b">
                <tr>
                  <th className="p-4 w-12 text-center text-gray-400">#</th>
                  <th className="p-4 min-w-[200px]">Item Details</th>
                  <th className="p-4 w-24 text-center">Unit</th>
                  <th className="p-4 w-32 text-center">Dimensions (WxH)</th>
                  <th className="p-4 w-24 text-center bg-orange-50/50 text-orange-800 border-l border-orange-100">Part</th>
                  <th className="p-4 w-24 text-center bg-orange-50/50 text-orange-800">Panna</th>
                  <th className="p-4 w-24 text-center bg-green-50/50 text-green-800 border-l border-green-100">Fabric</th>
                  <th className="p-4 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={item.selectionItemId} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-center text-gray-400 font-mono">{idx + 1}</td>
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{item.areaName}</div>
                      <div className="text-xs text-gray-500">{item.productName}</div>
                    </td>
                    
                    <td className="p-2 text-center">
                      <select 
                        className="w-full h-9 border-gray-200 rounded px-2 text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100" 
                        value={item.unit} 
                        onChange={(e) => handleDimensionChange(item.selectionItemId, 'unit', e.target.value)}
                      >
                        <option value="mm">mm</option>
                        <option value="inch">inch</option>
                        <option value="ft">ft</option>
                        <option value="m">m</option>
                        <option value="cm">cm</option>
                      </select>
                    </td>
                    
                    <td className="p-2">
                      <div className="flex items-center gap-1 justify-center">
                        <Input 
                          type="number" 
                          className="h-9 w-20 text-right bg-gray-50 focus:bg-white border-gray-200" 
                          value={item.width} 
                          onChange={(e) => handleDimensionChange(item.selectionItemId, 'width', e.target.value)} 
                        />
                        <span className="text-gray-300">x</span>
                        <Input 
                          type="number" 
                          className="h-9 w-20 text-right bg-gray-50 focus:bg-white border-gray-200" 
                          value={item.height} 
                          onChange={(e) => handleDimensionChange(item.selectionItemId, 'height', e.target.value)} 
                        />
                      </div>
                    </td>
                    
                    <td className="p-4 text-center font-bold text-orange-700 bg-orange-50/20 border-l border-orange-50">
                      {item.part.toFixed(2)}
                    </td>
                    <td className="p-4 text-center font-bold text-orange-700 bg-orange-50/20">
                      {item.panna}
                    </td>
                    <td className="p-4 text-center font-bold text-green-700 bg-green-50/20 border-l border-green-50">
                      {item.fabric.toFixed(2)}
                    </td>
                    
                    <td className="p-4 text-center">
                      <button className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2">
                <tr>
                  <td colSpan={6} className="p-4 text-right uppercase text-sm text-gray-600">Totals</td>
                  <td className="p-4 text-center text-green-700 text-lg">
                    {items.reduce((sum, item) => sum + item.fabric, 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}