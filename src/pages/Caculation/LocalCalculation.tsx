import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Ruler, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface CalcRow {
  selectionItemId: string;
  areaName: string;
  productName: string;
  unit: string;
  width: number;
  height: number;
  
  // Quantities
  panna: number;
  channel: number;
  fabric: number;
  blackout: number;
  sheer: number;
  weightChain: number;
  
  // Toggles
  hasBlackout: boolean;
  hasSheer: boolean;
  
  // Hidden Rates (Preserved)
  fabricRate: number;
  blackoutRate: number;
  sheerRate: number;
  channelRate: number;
  labourRate: number;
  fittingRate: number;
}

export default function LocalCalculation() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<CalcRow[]>([]);

  // --- LOGIC: Exact match from your snippet ---
  const toInches = (value: number, unit: string) => {
    if (!value || isNaN(value)) return 0;
    const u = unit?.toLowerCase().trim() || 'mm';
    if (u === 'inch' || u === 'inches' || u === '"') return value;
    if (u === 'mm') return value / 25.4;
    if (u === 'cm') return value / 2.54;
    if (u === 'ft' || u === 'feet') return value * 12;
    if (u === 'm' || u === 'meter') return value * 39.3701;
    return value;
  };

  const calculateQuantities = (row: CalcRow, field?: string, value?: any) => {
    const newRow = { ...row };
    if (field) {
      // @ts-ignore
      newRow[field] = value;
    }

    const wInch = toInches(newRow.width, newRow.unit);
    const hInch = toInches(newRow.height, newRow.unit);

    // --- UPDATED PANNA LOGIC ---
    // If decimal part is > 0.09 → go to the next full number
    // Examples: 14.09 -> 14 | 14.091 -> 15 | 5.08 -> 5 | 17.50 -> 18
    const rawPanna = wInch > 0 ? wInch / 21 : 0;
    const pannaFloor = Math.floor(rawPanna);
    const pannaDecimal = rawPanna - pannaFloor;

    newRow.panna = pannaDecimal > 0.09 ? pannaFloor + 1 : pannaFloor;
    // ---------------------------
    
    newRow.channel = wInch > 0 ? wInch / 12 : 0;
    
    // Fabric Formula: hInch > 0 ? ((hInch + 15) / 39) * panna : 0
    newRow.fabric = hInch > 0 ? ((hInch + 15) / 39) * newRow.panna : 0;

    // Weight Chain: hasSheer ? ((panna * 54) / 39) : 0
    newRow.weightChain = newRow.hasSheer ? ((newRow.panna * 54) / 39) : 0;

    // Blackout / Sheer = fabric value if checked
    newRow.blackout = newRow.hasBlackout ? newRow.fabric : 0;
    newRow.sheer = newRow.hasSheer ? newRow.fabric : 0;

    return newRow;
  };

  useEffect(() => {
    if (selectionId) fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/calculations/local/${selectionId}`);
      
      console.log('✅ Backend Response:', res.data); // DEBUG
      
      if (res.data && res.data.items && res.data.items.length > 0) {
        const mapped = res.data.items.map((i: any) => {
          const baseItem = {
            selectionItemId: i.selectionItemId,
            areaName: i.selectionItem?.details?.areaName || i.selectionItem?.areaName || 'Unknown Area',
            productName: i.selectionItem?.productName || 'Unknown Product',
            unit: i.selectionItem?.unit || 'mm',
            width: parseFloat(i.selectionItem?.width || 0),   // Fresh Width
            height: parseFloat(i.selectionItem?.height || 0), // Fresh Height
            
            panna: parseFloat(i.panna || 0),
            channel: parseFloat(i.channel || 0),
            fabric: parseFloat(i.fabric || 0),
            blackout: parseFloat(i.blackout || 0),
            sheer: parseFloat(i.sheer || 0),
            weightChain: parseFloat(i.weightChain || 0),
            
            hasBlackout: Boolean(i.hasBlackout), // Preserve Toggles
            hasSheer: Boolean(i.hasSheer),       // Preserve Toggles
            
            fabricRate: parseFloat(i.fabricRate || 0),
            blackoutRate: parseFloat(i.blackoutRate || 0),
            sheerRate: parseFloat(i.sheerRate || 0),
            channelRate: parseFloat(i.channelRate || 285),
            labourRate: parseFloat(i.labourRate || 450),
            fittingRate: parseFloat(i.fittingRate || 355),
          };
          return calculateQuantities(baseItem);
        });
        
        console.log('✅ Mapped Rows:', mapped); // DEBUG
        setRows(mapped);
      } else {
        console.error('❌ No items in response');
        toast({ title: "Warning", description: "No items found", variant: 'destructive' });
      }
    } catch (error) {
      console.error('❌ Fetch Error:', error);
      toast({ title: "Error", description: "Failed to load data", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (index: number, field: string, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = calculateQuantities(newRows[index], field, value);
      return newRows;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/calculations/local/${selectionId}`, { items: rows });
      toast({ title: "Success", description: "Quantities saved successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
        
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/calculations/edit/' + selectionId)}>
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                <Ruler className="h-5 w-5 text-blue-600" /> Local Calculation
              </h1>
              <p className="text-sm text-gray-500">Step 1: Quantities & Measurements</p>
            </div>
          </div>
          <div className="flex gap-3">
   <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
     {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
     Save
   </Button>
</div>
        </div>

        {/* CRM Style Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50/80 text-gray-700 font-semibold border-b">
                <tr>
                  <th className="p-4 w-12 text-center text-gray-400">#</th>
                  <th className="p-4 min-w-[200px]">Item Details</th>
                  <th className="p-4 w-24 text-center">Unit</th>
                  <th className="p-4 w-32 text-center">Dimensions (WxH)</th>
                  
                  {/* Calculation Groups */}
                  <th className="p-4 w-20 text-center bg-orange-50/50 text-orange-800 border-l border-orange-100">Panna</th>
                  <th className="p-4 w-24 text-center bg-orange-50/50 text-orange-800 border-r border-orange-100">Channel</th>
                  
                  <th className="p-4 w-24 text-center bg-green-50/50 text-green-800 border-l border-green-100">Fabric</th>
                  <th className="p-4 w-24 text-center bg-green-50/50 text-green-800">Blackout</th>
                  <th className="p-4 w-24 text-center bg-green-50/50 text-green-800 border-r border-green-100">Sheer</th>
                  
                  <th className="p-4 w-28 text-center text-purple-800">Weight Chain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-center text-gray-400 font-mono">{idx + 1}</td>
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{row.areaName}</div>
                      <div className="text-xs text-gray-500">{row.productName}</div>
                    </td>
                    
                    <td className="p-2 text-center">
                      <select 
                        className="w-full h-9 border-gray-200 rounded px-2 text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100" 
                        value={row.unit} 
                        onChange={(e) => handleUpdate(idx, 'unit', e.target.value)}
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
                            value={row.width} 
                            onChange={(e) => handleUpdate(idx, 'width', e.target.value)} 
                          />
                          <span className="text-gray-300">x</span>
                          <Input 
                            type="number" 
                            className="h-9 w-20 text-right bg-gray-50 focus:bg-white border-gray-200" 
                            value={row.height} 
                            onChange={(e) => handleUpdate(idx, 'height', e.target.value)} 
                          />
                       </div>
                    </td>

                    {/* Calculated Columns */}
                    <td className="p-4 text-center font-bold text-orange-700 bg-orange-50/20 border-l border-orange-50">{row.panna}</td>
                    <td className="p-4 text-center font-bold text-orange-700 bg-orange-50/20 border-r border-orange-100">{row.channel.toFixed(2)}</td>
                    
                    <td className="p-4 text-center font-bold text-green-700 bg-green-50/20 border-l border-green-50">{row.fabric.toFixed(2)}</td>
                    
                    <td className="p-4 text-center bg-green-50/20">
                      <div className="flex flex-col items-center gap-1">
                        <Checkbox checked={row.hasBlackout} onCheckedChange={(c) => handleUpdate(idx, 'hasBlackout', c)} />
                        {row.hasBlackout && <span className="text-xs font-bold text-green-700">{row.blackout.toFixed(2)}</span>}
                      </div>
                    </td>
                    
                    <td className="p-4 text-center bg-green-50/20 border-r border-green-100">
                      <div className="flex flex-col items-center gap-1">
                        <Checkbox checked={row.hasSheer} onCheckedChange={(c) => handleUpdate(idx, 'hasSheer', c)} />
                        {row.hasSheer && <span className="text-xs font-bold text-green-700">{row.sheer.toFixed(2)}</span>}
                      </div>
                    </td>

                    <td className="p-4 text-center text-purple-700 font-bold bg-gray-50/30">
                      {row.hasSheer ? `${row.weightChain.toFixed(2)} m` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}