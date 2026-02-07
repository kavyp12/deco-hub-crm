// [FILE: src/pages/Caculation/SomfyCalculation.tsx]
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Calculator } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// ==========================================
// PRICING DATA & CONSTANTS
// ==========================================

const TRACK_PRICING = {
  Ripple: [
    { label: "Upto 2m", max: 2, medium: 12304, heavy: 16653, silent: 20614 },
    { label: "2m - 3m", max: 3, medium: 15753, heavy: 20468, silent: 26504 },
    { label: "3m - 4m", max: 4, medium: 19864, heavy: 24945, silent: 33031 },
    { label: "4m - 5m", max: 5, medium: 23314, heavy: 28760, silent: 38921 },
    { label: "5m - 6m", max: 6, medium: 29366, heavy: 35179, silent: 47323 },
    { label: "6m - 7m", max: 7, medium: 33477, heavy: 40316, silent: 54489 },
    { label: "7m - 8m", max: 8, medium: 37587, heavy: 44131, silent: 60379 },
    { label: "8m - 9m", max: 9, medium: 41037, heavy: 47947, silent: 66269 },
    { label: "9m - 10m", max: 10, medium: 44487, heavy: 51762, silent: 72159 },
  ],
  Traditional: [
    { label: "Upto 2m", max: 2, medium: 8834, heavy: 12772, silent: 14340 },
    { label: "2m - 3m", max: 3, medium: 10615, heavy: 14918, silent: 17418 },
    { label: "3m - 4m", max: 4, medium: 13056, heavy: 17725, silent: 21134 },
    { label: "4m - 5m", max: 5, medium: 14837, heavy: 19872, silent: 24213 },
    { label: "5m - 6m", max: 6, medium: 19220, heavy: 24621, silent: 29803 },
    { label: "6m - 7m", max: 7, medium: 21662, heavy: 28089, silent: 34157 },
    { label: "7m - 8m", max: 8, medium: 24103, heavy: 30235, silent: 37235 },
    { label: "8m - 9m", max: 9, medium: 25883, heavy: 32382, silent: 40314 },
    { label: "9m - 10m", max: 10, medium: 27664, heavy: 34528, silent: 43392 },
  ]
};

const MOTORS = [
  { code: 'none', name: 'None', price: 0 },
  { code: '1240233', name: 'Izigo Ultra 30e RTS (7yr)', price: 43298 },
  { code: '1240231', name: 'Izigo Ultra 30e WT (7yr)', price: 36327 },
  { code: '1240236', name: 'Izigo Ultra 50e RTS (7yr)', price: 52889 },
  { code: '1240234', name: 'Izigo Ultra 50e WT (7yr)', price: 42897 },
  { code: '1240233-5', name: 'Izigo Ultra 30e RTS (5yr)', price: 36081 },
  { code: '1240231-5', name: 'Izigo Ultra 30e WT (5yr)', price: 30273 },
  { code: '1240236-5', name: 'Izigo Ultra 50e RTS (5yr)', price: 44074 },
  { code: '1240234-5', name: 'Izigo Ultra 50e WT (5yr)', price: 35748 },
  { code: '1240437', name: 'Irismo Plus 35 RTS (7yr)', price: 21744 },
  { code: '1240435', name: 'Irismo Plus 35 WT (7yr)', price: 19103 },
  { code: '1240440', name: 'Irismo Plus 50 RTS (7yr)', price: 29523 },
  { code: '1240438', name: 'Irismo Plus 50 WT (7yr)', price: 26212 },
  { code: '1240437-5', name: 'Irismo Plus 35 RTS (5yr)', price: 18120 },
  { code: '1240435-5', name: 'Irismo Plus 35 WT (5yr)', price: 15919 },
  { code: '1240440-5', name: 'Irismo Plus 50 RTS (5yr)', price: 24603 },
  { code: '1240438-5', name: 'Irismo Plus 50 WT (5yr)', price: 21844 },
  { code: '1246120', name: 'DESINGO 35 WT (3yr)', price: 11386 },
  { code: '1246124', name: 'DESINGO 35 RTS (3yr)', price: 12334 },
  { code: '1246608', name: 'DESINGO 50 WT (3yr)', price: 16890 },
  { code: '1246610', name: 'DESINGO 50 RTS (3yr)', price: 18898 },
  { code: '1240407', name: 'IRISMO PLUS WIREFREE 35 RTS', price: 23868 },
];

const REMOTES = [
  { code: 'none', name: 'None', price: 0 },
  { code: '1810636', name: 'Situo RTS', price: 6626 },
  { code: '1871413', name: 'Situo 1 RTS Pure II', price: 6626 },
  { code: '1871417', name: 'Situo 2 RTS Pure II', price: 7622 },
  { code: '1871415', name: 'Situo 5 RTS Pure II', price: 8754 },
  { code: '1805209', name: 'Telis 6 Chronis RTS', price: 20411 },
  { code: '1810880', name: 'Smoove Origin RTS', price: 4228 },
  { code: '1870444', name: 'TaHoma Beacon', price: 20730 },
  { code: '1800490', name: 'Inis Uno Fixed (Wired)', price: 1446 },
  { code: '1800491', name: 'Inis Uno Momentary (Wired)', price: 1516 },
  { code: '1800493', name: 'Inis Duo Fixed (Wired)', price: 2170 },
];

// ==========================================
// TYPES
// ==========================================

interface SomfyItem {
  selectionItemId: string;
  areaName: string;
  productName: string;
  width: number;
  height: number; // Added Height for KG calc
  unit: string;
  
  // KG Logic
  gsm: number;
  fabricQty: number;
  motorKg: number;

  // Track
  trackType: string;
  trackDuty: string;
  trackPrice: number;
  roundedMeters: number;
  bracketLabel: string;
  
  // Motor
  motorName: string;
  motorPrice: number;
  
  // Remote
  remoteName: string;
  remotePrice: number;
  
  // Calculated Totals
  trackBasic: number;
  trackGst: number;
  trackFinal: number;

  motorGst: number;
  motorFinal: number;

  remoteGst: number;
  remoteFinal: number;
}

// ==========================================
// UTILS
// ==========================================

// Helper to safely parse numbers
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

const toMeters = (val: number, unit: string) => {
  if (!val) return 0;
  const u = unit.toLowerCase().trim();
  if (u === 'mm') return val / 1000;
  if (u === 'cm') return val / 100;
  if (u === 'inch' || u === '"') return val / 39.3701;
  if (u === 'ft') return val / 3.28084;
  return val;
};

// Somfy Rounding Rule: "If decimal crosses 0.09, go to next number"
const getSomfyRounding = (meters: number) => {
  if (meters <= 0) return 0;
  const integerPart = Math.floor(meters);
  const decimalPart = meters - integerPart;
  if (decimalPart > 0.09) {
    return integerPart + 1; 
  }
  return Math.max(2, integerPart); // Minimum is usually 2m
};

// --- ROBUST GSM FINDER (From Forest) ---
const findGsmInAttributes = (attributes: any) => {
  if (!attributes || typeof attributes !== 'object') return 0;
  
  let valStr = attributes['Weight/Mt'] || attributes['Weight/mt'] || attributes['GSM'] || attributes['gsm'];
  
  if (!valStr) {
    const keys = Object.keys(attributes);
    for (const key of keys) {
      if (key.toLowerCase().includes('weight') || key.toLowerCase().includes('gsm')) {
        valStr = attributes[key];
        break;
      }
    }
  }

  if (!valStr) return 0;
  const val = parseFloat(String(valStr));
  return isNaN(val) ? 0 : val;
};

// --- KG SPECIFIC CALCULATION (From Forest) ---
const calculateFabricForKg = (widthVal: number, heightVal: number, unit: string) => {
  const wInch = toInches(widthVal, unit);
  const hInch = toInches(heightVal, unit);

  if (wInch <= 0 || hInch <= 0) return 0;

  const rawPanna = wInch / 21;
  const pannaFloor = Math.floor(rawPanna);
  const pannaDecimal = rawPanna - pannaFloor;
  const panna = pannaDecimal > 0.09 ? pannaFloor + 1 : pannaFloor;

  const fabric = ((hInch + 15) / 39) * panna;
  return parseFloat(fabric.toFixed(2));
};

const calculateMotorKg = (fabricQty: number, gsm: number, areaName: string) => {
  const isMainCurtain = areaName && areaName.toUpperCase().includes('(M)');
  const blackoutGsm = isMainCurtain ? 280 : 0;
  
  const totalGsm = (gsm || 0) + blackoutGsm;

  // Formula: (TotalGSM * 1.39 * FabricQty) / 1000
  const kg = (totalGsm * 1.39 * fabricQty) / 1000;
  
  return parseFloat(kg.toFixed(2));
};

// ==========================================
// COMPONENT
// ==========================================

const SomfyCalculation = () => {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<SomfyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get(`/calculations/somfy/${selectionId}`);
        const dataItems = res.data.items.map((item: any) => {
          
          // Data Extraction for KG Logic
          const attributes = item.selectionItem?.product?.attributes || {};
          const gsm = findGsmInAttributes(attributes);
          const areaName = item.selectionItem?.details?.areaName || item.selectionItem?.areaName || 'Area';
          const rawWidth = parseFloat(item.selectionItem?.width || 0);
          const rawHeight = parseFloat(item.selectionItem?.height || 0);
          const unit = item.selectionItem?.unit || 'mm';

          // Initial Calculation
          const fabricQty = calculateFabricForKg(rawWidth, rawHeight, unit);
          const motorKg = calculateMotorKg(fabricQty, gsm, areaName);

          return {
            selectionItemId: item.selectionItemId,
            areaName,
            productName: item.selectionItem?.productName || 'Item',
            width: rawWidth,
            height: rawHeight,
            unit,
            
            // KG Props
            gsm,
            fabricQty,
            motorKg,

            trackType: item.trackType || 'Ripple',
            trackDuty: item.trackDuty || 'Medium',
            trackPrice: item.trackPrice || 0,
            
            motorName: item.motorName || 'none',
            motorPrice: item.motorPrice || 0,
            
            remoteName: item.remoteName || 'none',
            remotePrice: item.remotePrice || 0,
            
            // Initial placeholders, will be calc'd immediately
            roundedMeters: 0,
            bracketLabel: '',
            trackBasic: 0, trackGst: 0, trackFinal: 0,
            motorGst: 0, motorFinal: 0,
            remoteGst: 0, remoteFinal: 0
          };
        });
        setItems(dataItems);
        // Run initial calculation to fill derived fields
        setItems(prev => prev.map(calcRow));
      } catch (err) {
        toast({ title: "Error loading data", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectionId]);

  const calcRow = (item: SomfyItem): SomfyItem => {
    // 1. Calculate Track
    const meters = toMeters(item.width, item.unit);
    const roundedMeters = getSomfyRounding(meters);
    
    // Find Bracket Index (Range starts at roundedMeters - 1)
    let bracketIndex = roundedMeters - 1;
    if (bracketIndex < 0) bracketIndex = 0; 
    if (bracketIndex >= 9) bracketIndex = 8; 

    const table = TRACK_PRICING[item.trackType as keyof typeof TRACK_PRICING] || TRACK_PRICING.Ripple;
    const row = table[bracketIndex];

    let trackPrice = 0;
    const duty = item.trackDuty.toLowerCase();

    if (row) {
      if (duty === 'heavy') trackPrice = row.heavy;
      else if (duty === 'silent') trackPrice = row.silent;
      else trackPrice = row.medium; // default medium
    }

    // 2. KG Calculation Update (in case dimensions changed)
    const fabricQty = calculateFabricForKg(item.width, item.height, item.unit);
    const motorKg = calculateMotorKg(fabricQty, item.gsm, item.areaName);

    // 3. Lookup Prices
    const motor = MOTORS.find(m => m.name === item.motorName) || { price: 0 };
    const remote = REMOTES.find(r => r.name === item.remoteName) || { price: 0 };

    // 4. GST Calculations
    const trackBasic = trackPrice; 
    const trackGst = trackBasic * 0.18;
    const trackFinal = Math.round(trackBasic + trackGst);

    const motorPrice = motor.price;
    const motorGst = motorPrice * 0.18;
    const motorFinal = Math.round(motorPrice + motorGst);

    const remotePrice = remote.price;
    const remoteGst = remotePrice * 0.18;
    const remoteFinal = Math.round(remotePrice + remoteGst);

    return {
      ...item,
      fabricQty,
      motorKg,
      trackPrice,
      roundedMeters,
      bracketLabel: row?.label || '',
      motorPrice,
      remotePrice,
      
      trackBasic, trackGst, trackFinal,
      motorGst, motorFinal,
      remoteGst, remoteFinal
    };
  };

  const handleUpdate = (id: string, field: keyof SomfyItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.selectionItemId !== id) return item;

      // Update the specific field
      const updated = { ...item, [field]: value };
      
      // If we changed width/height, ensure it's a number
      if (field === 'width' || field === 'height') {
         // @ts-ignore
         updated[field] = parseFloat(value) || 0;
      }

      // Recalculate costs & KG
      return calcRow(updated);
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/calculations/somfy/${selectionId}`, { 
        items: items.map(i => ({
          selectionItemId: i.selectionItemId,
          // Save updated dims
          width: i.width,
          height: i.height,
          
          trackType: i.trackType,
          trackDuty: i.trackDuty,
          trackPrice: i.trackPrice,
          motorName: i.motorName,
          motorPrice: i.motorPrice,
          remoteName: i.remoteName,
          remotePrice: i.remotePrice,
          
          // Saving calculated values for record/invoicing
          trackFinal: i.trackFinal,
          motorFinal: i.motorFinal,
          remoteFinal: i.remoteFinal,
          
          motorKg: i.motorKg // Optional: Save KG if backend supports it
        }))
      });
      toast({ title: "Somfy Calculation Saved" });
    } catch (err) {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const grandTotal = items.reduce((sum, i) => sum + i.trackFinal + i.motorFinal + i.remoteFinal, 0);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-yellow-600" /></div>;

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
              <h1 className="text-xl font-bold flex items-center gap-2 text-yellow-700">
                <Calculator className="h-5 w-5" /> 
                Somfy Automation
              </h1>
              <p className="text-sm text-gray-500">Separate GST Calculations for Track, Motor & Remote</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-gray-500 uppercase font-semibold">Total Value</span>
              <div className="text-2xl font-bold text-yellow-700">₹{grandTotal.toLocaleString()}</div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 text-white">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Calculation
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          <div className="border rounded-lg shadow-sm bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-gray-100 z-10 w-[180px]">Area</th>
                    <th className="px-2 py-3 text-center bg-blue-50/50 w-20">Width</th>
                    <th className="px-2 py-3 text-center bg-blue-50/50 w-20">Height</th> {/* Added Height Header */}
                    <th className="px-2 py-3 text-center bg-blue-50/50 border-r border-blue-100 w-24">Meters</th>
                    
                    {/* TRACK SECTION */}
                    <th className="px-2 py-3 min-w-[140px]">Type</th>
                    <th className="px-2 py-3 min-w-[140px]">Duty</th>
                    <th className="px-2 py-3 text-right bg-blue-100 text-blue-900 border-l border-white">Basic</th>
                    <th className="px-2 py-3 text-right bg-blue-100 text-blue-900">GST(18%)</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-blue-600">Track Final</th>
                    
                    {/* MOTOR SECTION */}
                    <th className="px-2 py-3 min-w-[200px] bg-yellow-50/50 text-yellow-900 border-l border-gray-300">Motor</th>
                    <th className="px-2 py-3 text-center bg-yellow-100/50 text-yellow-900 font-bold" title="Calculated Weight">KG</th> {/* Added KG Header */}
                    <th className="px-2 py-3 text-right bg-yellow-100/50 text-yellow-900">Price</th>
                    <th className="px-2 py-3 text-right bg-yellow-100/50 text-yellow-900">GST</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-yellow-600">Motor Final</th>

                    {/* REMOTE SECTION */}
                    <th className="px-2 py-3 min-w-[180px] bg-purple-50/50 text-purple-900 border-l border-gray-300">Remote</th>
                    <th className="px-2 py-3 text-right bg-purple-100/50 text-purple-900">Price</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-purple-600">Remote Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.selectionItemId} className="hover:bg-gray-50 transition-colors">
                      {/* Area */}
                      <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="font-bold text-gray-900 truncate w-[160px]" title={item.areaName}>{item.areaName}</div>
                        <div className="text-xs text-gray-500 truncate w-[160px]" title={item.productName}>{item.productName}</div>
                        <div className="text-[10px] text-gray-400 mt-1">GSM: {item.gsm}</div> {/* Added GSM Display */}
                      </td>

                      {/* Dimensions */}
                      <td className="px-1 py-3 bg-blue-50/10">
  <Input 
    type="number" 
    className="h-8 text-xs text-center w-20 mx-auto" // <--- Changed to w-20
    value={item.width || ''} 
    onChange={(e) => handleUpdate(item.selectionItemId, 'width', e.target.value)} 
  />
  <div className="text-[9px] text-center text-gray-400 mt-1">{item.unit}</div>
</td>
<td className="px-1 py-3 bg-blue-50/10"> 
  <Input 
    type="number" 
    className="h-8 text-xs text-center w-20 mx-auto" // <--- Changed to w-20
    value={item.height || ''} 
    onChange={(e) => handleUpdate(item.selectionItemId, 'height', e.target.value)} 
  />
</td>
                      <td className="px-1 py-3 bg-blue-50/10 border-r border-blue-100 text-center">
                         <div className="font-bold text-blue-700">{(toMeters(item.width, item.unit)).toFixed(2)}m</div>
                         <Badge variant="outline" className="text-[9px] mt-1 h-4 px-1 border-blue-200 bg-white text-blue-700">
                           ~{item.roundedMeters}m
                         </Badge>
                      </td>

                      {/* TRACK COMPONENTS */}
                      <td className="px-2 py-3">
                        <Select value={item.trackType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'trackType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ripple">Ripple</SelectItem>
                            <SelectItem value="Traditional">Traditional</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      <td className="px-2 py-3">
                        <Select value={item.trackDuty} onValueChange={(v) => handleUpdate(item.selectionItemId, 'trackDuty', v)}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="Medium">Medium (&lt;50kg)</SelectItem>
                             <SelectItem value="Heavy">Heavy (&gt;50kg)</SelectItem>
                             <SelectItem value="Silent">Silent</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* TRACK CALCULATIONS */}
                      <td className="px-2 py-3 text-right bg-blue-50 font-medium text-blue-900 border-l">₹{item.trackBasic.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-blue-50 text-gray-500 text-xs">₹{item.trackGst.toFixed(0)}</td>
                      <td className="px-2 py-3 text-right font-bold bg-blue-100 text-blue-700 border-r border-gray-300">₹{item.trackFinal.toLocaleString()}</td>

                      {/* MOTOR SECTION */}
                      <td className="px-2 py-3 bg-yellow-50/20">
                        <Select value={item.motorName} onValueChange={(v) => handleUpdate(item.selectionItemId, 'motorName', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-yellow-200 truncate"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            {MOTORS.map(m => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-3 text-center bg-yellow-50/30 text-yellow-800 font-bold border-l border-white">
                        {item.motorKg} {/* Added KG Display */}
                      </td>
                      <td className="px-2 py-3 text-right bg-yellow-50/20">₹{item.motorPrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-yellow-50/20 text-xs text-gray-500">₹{item.motorGst.toFixed(0)}</td>
                      <td className="px-2 py-3 text-right font-bold bg-yellow-100 text-yellow-700 border-r border-gray-300">₹{item.motorFinal.toLocaleString()}</td>

                      {/* REMOTE SECTION */}
                      <td className="px-2 py-3 bg-purple-50/20">
                         <Select value={item.remoteName} onValueChange={(v) => handleUpdate(item.selectionItemId, 'remoteName', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-purple-200 truncate"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            {REMOTES.map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-3 text-right bg-purple-50/20">₹{item.remotePrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-bold bg-purple-100 text-purple-700">₹{item.remoteFinal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                
                {/* Footer */}
                <tfoot className="bg-gray-800 text-white font-bold text-xs">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right uppercase">Category Totals</td> {/* Adjusted colspan for new Height col */}
                    <td className="px-2 py-3 text-right bg-blue-900">₹{items.reduce((s, i) => s + i.trackBasic, 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right bg-blue-900 text-blue-200">₹{items.reduce((s, i) => s + i.trackGst, 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right bg-blue-950 text-[#4ade80]">₹{items.reduce((s, i) => s + i.trackFinal, 0).toLocaleString()}</td>
                    
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3 text-right bg-yellow-900">₹{items.reduce((s, i) => s + i.motorPrice, 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right bg-yellow-900 text-yellow-200">₹{items.reduce((s, i) => s + i.motorGst, 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right bg-yellow-950 text-[#facc15]">₹{items.reduce((s, i) => s + i.motorFinal, 0).toLocaleString()}</td>
                    
                    <td className="px-2 py-3"></td>
                    <td className="px-2 py-3 text-right bg-purple-900">₹{items.reduce((s, i) => s + i.remotePrice, 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right bg-purple-950 text-[#d8b4fe]">₹{items.reduce((s, i) => s + i.remoteFinal, 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SomfyCalculation;