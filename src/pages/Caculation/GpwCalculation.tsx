import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Calculator } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

// --- CONSTANTS ---
const PRICING = {
  Gravel: { trackRate: 750, motorBase: 8500, remoteBase: 2400 },
  Pulse:  { trackRate: 900, motorBase: 11500, remoteBase: 2800 },
  Weave:  { trackRate: 1150, motorBase: 14500, remoteBase: 3200 }
};

type GPWType = 'Gravel' | 'Pulse' | 'Weave';

interface GpwItem {
  selectionItemId: string;
  areaName: string;
  productName: string;
  unit: string;
  width: number;
  height: number;
  
  type: GPWType;       // Main Type (Channel)
  motorType: GPWType;  // Independent Motor Type
  remoteType: GPWType; // Independent Remote Type
  
  rft: number;
  
  trackPrice: number; trackGst: number; trackFinal: number;
  motorPrice: number; motorGst: number; motorFinal: number;
  remotePrice: number; remoteGst: number; remoteFinal: number;
}

export default function GpwCalculation() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [items, setItems] = useState<GpwItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- LOGIC HELPERS ---

  const toInches = (value: number, unit: string) => {
    if (!value || isNaN(value)) return 0;
    const u = unit?.toLowerCase().trim() || 'mm';
    if (u === 'inch' || u === 'inches' || u === '"') return value;
    if (u === 'mm') return value / 25.4;
    if (u === 'cm') return value / 2.54;
    if (u === 'ft' || u === 'feet') return value * 12;
    return value;
  };

  const calculateRFT = (width: number, unit: string) => {
    const widthInInches = toInches(width, unit);
    const rawRft = widthInInches / 12;
    
    const floorVal = Math.floor(rawRft);
    const decimalPart = rawRft - floorVal;

    // Logic: If decimal > 0.09, round UP. Else, round DOWN (keep floor)
    return decimalPart > 0.09 ? Math.ceil(rawRft) : floorVal;
  };

  // Helper to reverse-lookup type from price (for loading saved data)
  const getTypeFromPrice = (price: number, category: 'motorBase' | 'remoteBase'): GPWType => {
    if (price === PRICING.Pulse[category]) return 'Pulse';
    if (price === PRICING.Weave[category]) return 'Weave';
    return 'Gravel'; // Default
  };

  const calculateRow = (item: GpwItem): GpwItem => {
    // 1. Calculate RFT
    const rft = calculateRFT(item.width, item.unit);

    // 2. Track (Channel) Calculation - Based on Main 'type'
    const trackRates = PRICING[item.type] || PRICING.Gravel;
    const trackPrice = rft * trackRates.trackRate;
    const trackGst = trackPrice * 0.18;
    const trackFinal = Math.round(trackPrice + trackGst);

    // 3. Motor Calculation - Based on 'motorType'
    const motorRates = PRICING[item.motorType] || PRICING.Gravel;
    const motorPrice = motorRates.motorBase;
    const motorGst = motorPrice * 0.18;
    const motorFinal = Math.round(motorPrice + motorGst);

    // 4. Remote Calculation - Based on 'remoteType'
    const remoteRates = PRICING[item.remoteType] || PRICING.Gravel;
    const remotePrice = remoteRates.remoteBase;
    const remoteGst = remotePrice * 0.18;
    const remoteFinal = Math.round(remotePrice + remoteGst);

    return {
      ...item,
      rft,
      trackPrice, trackGst, trackFinal,
      motorPrice, motorGst, motorFinal,
      remotePrice, remoteGst, remoteFinal
    };
  };

  useEffect(() => {
    fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    try {
      const res = await api.get(`/calculations/gpw/${selectionId}`);
      const mapped = (res.data.items || []).map((i: any) => {
        
        const mainType: GPWType = i.type || 'Gravel';
        
        // Detect subtypes from saved prices, or default to main type
        const savedMotorPrice = parseFloat(i.motorPrice || 0);
        const savedRemotePrice = parseFloat(i.remotePrice || 0);

        const detectedMotorType = savedMotorPrice > 0 
          ? getTypeFromPrice(savedMotorPrice, 'motorBase') 
          : mainType;

        const detectedRemoteType = savedRemotePrice > 0
          ? getTypeFromPrice(savedRemotePrice, 'remoteBase')
          : mainType;

        const rawItem: GpwItem = {
          selectionItemId: i.selectionItemId,
          areaName: i.selectionItem?.details?.areaName || i.selectionItem?.areaName || 'Area',
          productName: i.selectionItem?.productName || 'Item',
          unit: i.selectionItem?.unit || 'mm',
          width: parseFloat(i.selectionItem?.width || 0),
          height: parseFloat(i.selectionItem?.height || 0),
          
          type: mainType,
          motorType: detectedMotorType,
          remoteType: detectedRemoteType,
          
          rft: 0,
          trackPrice: 0, trackGst: 0, trackFinal: 0,
          motorPrice: 0, motorGst: 0, motorFinal: 0,
          remotePrice: 0, remoteGst: 0, remoteFinal: 0,
        };
        // Run calculation immediately on load
        return calculateRow(rawItem);
      });
      setItems(mapped);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load GPW data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (id: string, field: keyof GpwItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.selectionItemId !== id) return item;
      
      const updated = { ...item, [field]: value };
      
      // LOGIC: If Main Type changes, reset Motor & Remote to match it (Default behavior)
      if (field === 'type') {
        updated.motorType = value as GPWType;
        updated.remoteType = value as GPWType;
      }

      // If width/unit changed, recalc RFT is implicit in calculateRow
      if (field === 'width') updated.width = parseFloat(value) || 0;
      
      return calculateRow(updated);
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/calculations/gpw/${selectionId}`, {
        items: items.map(i => ({
          selectionItemId: i.selectionItemId,
          width: i.width,
          height: i.height,
          unit: i.unit,
          type: i.type, // Main type saved for reference
          rft: i.rft,
          
          trackPrice: i.trackPrice, trackGst: i.trackGst, trackFinal: i.trackFinal,
          
          // Prices derived from Motor/Remote types are saved
          motorPrice: i.motorPrice, motorGst: i.motorGst, motorFinal: i.motorFinal,
          remotePrice: i.remotePrice, remoteGst: i.remoteGst, remoteFinal: i.remoteFinal,
        }))
      });
      toast({ title: "Saved", description: "GPW calculations updated!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const grandTotal = items.reduce((sum, i) => sum + i.trackFinal + i.motorFinal + i.remoteFinal, 0);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-white">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
                <Calculator className="h-5 w-5" /> 
                Gravel / Pulse / Weave
              </h1>
              <p className="text-sm text-gray-500">Auto-selects Motor & Remote based on Channel, but can be customized.</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total Value</span>
              <div className="text-2xl font-bold text-indigo-700">₹{grandTotal.toLocaleString()}</div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Calculation
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          <div className="border rounded-lg shadow-sm bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-gray-100 z-10 w-[180px]">Area</th>
                    <th className="px-2 py-3 text-center bg-indigo-50/50 w-24">Width</th>
                    <th className="px-2 py-3 text-center bg-indigo-50/50 w-20">RFT</th>
                    
                    {/* TYPE SELECTOR */}
                    <th className="px-4 py-3 min-w-[150px] bg-indigo-100/50 text-indigo-900 border-l border-white">Channel Type</th>

                    {/* CHANNEL */}
                    <th className="px-2 py-3 text-right bg-blue-50 text-blue-900 border-l">Channel Base</th>
                    <th className="px-2 py-3 text-right bg-blue-50 text-blue-900">+ GST</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-blue-600">Final</th>

                    {/* MOTOR */}
                    <th className="px-4 py-3 min-w-[150px] bg-yellow-50 text-yellow-900 border-l">Motor Type</th>
                    <th className="px-2 py-3 text-right bg-yellow-50 text-yellow-900">Motor Base</th>
                    <th className="px-2 py-3 text-right bg-yellow-50 text-yellow-900">+ GST</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-yellow-600">Final</th>

                    {/* REMOTE */}
                    <th className="px-4 py-3 min-w-[150px] bg-purple-50 text-purple-900 border-l">Remote Type</th>
                    <th className="px-2 py-3 text-right bg-purple-50 text-purple-900">Remote Base</th>
                    <th className="px-2 py-3 text-right bg-purple-50 text-purple-900">+ GST</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-purple-600">Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.selectionItemId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="font-bold text-gray-900 truncate w-[160px]" title={item.areaName}>{item.areaName}</div>
                        <div className="text-xs text-gray-500 truncate w-[160px]" title={item.productName}>{item.productName}</div>
                      </td>

                      <td className="px-2 py-3 bg-indigo-50/10 text-center">
                        <div className="flex items-center gap-1 justify-center">
                            <Input 
                                type="number" 
                                className="h-8 text-xs text-center w-16"
                                value={item.width || ''} 
                                onChange={(e) => handleUpdate(item.selectionItemId, 'width', e.target.value)} 
                            />
                            <span className="text-[10px] text-gray-400">{item.unit}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 bg-indigo-50/10 text-center font-bold text-indigo-700 border-r border-indigo-100">
                        {item.rft}
                      </td>

                      {/* MAIN CHANNEL TYPE SELECTOR */}
                      <td className="px-4 py-3 bg-indigo-50/20">
                        <Select value={item.type} onValueChange={(v: any) => handleUpdate(item.selectionItemId, 'type', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-indigo-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Gravel">Gravel</SelectItem>
                            <SelectItem value="Pulse">Pulse</SelectItem>
                            <SelectItem value="Weave">Weave</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* CHANNEL OUTPUT */}
                      <td className="px-2 py-3 text-right bg-blue-50/50 border-l">₹{item.trackPrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-blue-50/50 text-xs text-gray-500">₹{item.trackGst.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-bold bg-blue-100 text-blue-800">₹{item.trackFinal.toLocaleString()}</td>

                      {/* MOTOR SELECTION & OUTPUT */}
                      <td className="px-4 py-3 bg-yellow-50/20 border-l">
                         <Select value={item.motorType} onValueChange={(v: any) => handleUpdate(item.selectionItemId, 'motorType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-yellow-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Gravel">Gravel</SelectItem>
                            <SelectItem value="Pulse">Pulse</SelectItem>
                            <SelectItem value="Weave">Weave</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-3 text-right bg-yellow-50/50">₹{item.motorPrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-yellow-50/50 text-xs text-gray-500">₹{item.motorGst.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-bold bg-yellow-100 text-yellow-800">₹{item.motorFinal.toLocaleString()}</td>

                      {/* REMOTE SELECTION & OUTPUT */}
                      <td className="px-4 py-3 bg-purple-50/20 border-l">
                         <Select value={item.remoteType} onValueChange={(v: any) => handleUpdate(item.selectionItemId, 'remoteType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-purple-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Gravel">Gravel</SelectItem>
                            <SelectItem value="Pulse">Pulse</SelectItem>
                            <SelectItem value="Weave">Weave</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-3 text-right bg-purple-50/50">₹{item.remotePrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-purple-50/50 text-xs text-gray-500">₹{item.remoteGst.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-bold bg-purple-100 text-purple-800">₹{item.remoteFinal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}