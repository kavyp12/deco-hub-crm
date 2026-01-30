// [FILE: src/pages/Calculation/ForestCalculation.tsx]
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Calculator } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

// --- CONSTANTS & RATES ---

const RUNNER_RATES = [
  { name: 'FES BASE AND FLEX HOOK', rate: 355 },
  { name: 'EASY WAVE AND END HOOK', rate: 240 },
  { name: 'EASY WAVE AND WAVE HOOK', rate: 295 },
  { name: 'FES BASE AND SNAP', rate: 265 }
];

const TAPE_RATES = [
  { name: 'FLEX TAPE TRANSPARENT', rate: 150 },
  { name: 'EASY FOLD TAPE WHITE', rate: 475 }
];

const TRACK_PRICING = [
  { range: "UPTO 6.5'",         white: 18230, black: 19860, fmsPlus: 17490, fmsPlusRecessWhite: 24390, fmsPlusRecessBlack: 24390, dsXlLed: 21240, dual: 23370 },
  { range: "ABOVE 6.5' TO 8'",  white: 20230, black: 22120, fmsPlus: 19610, fmsPlusRecessWhite: 28020, fmsPlusRecessBlack: 28020, dsXlLed: 24390, dual: 28150 },
  { range: "ABOVE 8' TO 10'",   white: 22120, black: 24390, fmsPlus: 21730, fmsPlusRecessWhite: 31650, fmsPlusRecessBlack: 31650, dsXlLed: 27530, dual: 33930 },
  { range: "ABOVE 10' TO 11.5'", white: 24130, black: 26640, fmsPlus: 23880, fmsPlusRecessWhite: 35180, fmsPlusRecessBlack: 35180, dsXlLed: 30910, dual: 38320 },
  { range: "ABOVE 11.5' TO 13'", white: 26130, black: 28910, fmsPlus: 26020, fmsPlusRecessWhite: 38960, fmsPlusRecessBlack: 38960, dsXlLed: 34050, dual: 42720 },
  { range: "ABOVE 13' TO 14.5'", white: 28400, black: 31290, fmsPlus: 28150, fmsPlusRecessWhite: 41980, fmsPlusRecessBlack: 41980, dsXlLed: 37450, dual: 47120 },
  { range: "ABOVE 14.5' TO 16'", white: 29660, black: 32800, fmsPlus: 30140, fmsPlusRecessWhite: 46730, fmsPlusRecessBlack: 46730, dsXlLed: 40470, dual: 51380 },
  { range: "ABOVE 16' TO 17.5'", white: 31160, black: 34050, fmsPlus: 32930, fmsPlusRecessWhite: 51750, fmsPlusRecessBlack: 51750, dsXlLed: 41830, dual: 53510 },
  { range: "ABOVE 17.5' TO 19'", white: 32250, black: 34800, fmsPlus: 34050, fmsPlusRecessWhite: 52770, fmsPlusRecessBlack: 52770, dsXlLed: 43100, dual: 54020 },
];

const EXCESS_RATES = {
  white: 1600, 
  black: 1775, 
  fmsPlus: 1790, 
  fmsPlusRecessWhite: 2750,
  fmsPlusRecessBlack: 2800,
  dsXlLed: 2100,  
  dual: 2500
};

// --- MOTOR & REMOTE LOGIC ---

const PRICES = {
  MOTOR_M: 55620,
  MOTOR_L_WHITE: 41190,
  MOTOR_L_BLACK: 45730,
  MOTOR_AC: 31640,
  MOTOR_ION: 50250,
  ADAPTER: 7690,
  RELAY: 3970,
  SURGE: 2980,
};

const MOTOR_VARIANTS = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'm_std', label: "Shuttle 'M' 70 KG (Std)", price: PRICES.MOTOR_M + PRICES.ADAPTER }, 
  { id: 'm_auto', label: "Shuttle 'M' 70 KG (Auto)", price: PRICES.MOTOR_M + PRICES.ADAPTER + PRICES.RELAY },
  { id: 'l_white_std', label: "Shuttle 'L' White 40 KG (Std)", price: PRICES.MOTOR_L_WHITE },
  { id: 'l_white_auto', label: "Shuttle 'L' White 40 KG (Auto)", price: PRICES.MOTOR_L_WHITE + PRICES.RELAY },
  { id: 'l_black_std', label: "Shuttle 'L' Black 40 KG (Std)", price: PRICES.MOTOR_L_BLACK },
  { id: 'l_black_auto', label: "Shuttle 'L' Black 40 KG (Auto)", price: PRICES.MOTOR_L_BLACK + PRICES.RELAY },
  { id: 'ac_motor', label: "Shuttle AC Motor (Bundle)", price: PRICES.MOTOR_AC + PRICES.SURGE },
  { id: 'ion_motor', label: "Shuttle 'ION' (Battery)", price: PRICES.MOTOR_ION },
];

const REMOTE_OPTIONS = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'easy_touch_6', label: 'Easy Touch (6 Ch)', price: 7520 },
  { id: 'diamond', label: 'Diamond Sense', price: 11870 },
  { id: 'wall_switch_2', label: 'Wall Switch (2 Ch)', price: 6350 },
  { id: 'wifi_dongle', label: 'Wifi Dongle', price: 10840 },
  { id: 'ac_control', label: 'AC Control Set', price: 6990 },
];

interface ForestItem {
  selectionItemId: string;
  areaName: string;
  productName: string;
  unit: string;
  width: number;
  height: number;
  rft: number;
  
  // KG Calculation
  gsm: number;
  fabricQty: number;
  motorKg: number;
  
  trackType: string;
  trackPrice: number;
  
  runnerType: string;
  runnerPrice: number;
  
  tapeType: string;
  tapePrice: number;
  
  motorType: string;
  motorPrice: number;
  
  remoteType: string;
  remotePrice: number;
  
  // SEPARATE CALCULATIONS
  trackBasic: number;
  trackGst: number;
  trackFinal: number;

  motorGst: number;
  motorFinal: number;

  remoteGst: number;
  remoteFinal: number;
}

export default function ForestCalculation() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [items, setItems] = useState<ForestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- CALCULATION HELPERS ---

  const roundCustom = (val: number) => {
    const decimal = parseFloat((val - Math.floor(val)).toFixed(3));
    return decimal > 0.09 ? Math.ceil(val) : Math.floor(val);
  };

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

  // --- ROBUST GSM FINDER ---
  const findGsmInAttributes = (attributes: any) => {
    if (!attributes || typeof attributes !== 'object') return 0;
    
    // 1. Check exact key from screenshot
    let valStr = attributes['Weight/Mt'] || attributes['Weight/mt'] || attributes['GSM'] || attributes['gsm'];
    
    // 2. Fuzzy search if exact key missing
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

    // 3. Parse "499 GSM" -> 499
    // parseFloat stops reading at the first non-number character (like space or G)
    const val = parseFloat(String(valStr));
    return isNaN(val) ? 0 : val;
  };

  // --- KG SPECIFIC CALCULATION ---
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

  const calculateTrackPrice = (rft: number, trackType: string): number => {
    const typeKey = (trackType && trackType in EXCESS_RATES) ? (trackType as keyof typeof TRACK_PRICING[0]) : 'white';
    let basePrice = 0;
    if (rft <= 6.5) basePrice = Number(TRACK_PRICING[0][typeKey]);
    else if (rft <= 8) basePrice = Number(TRACK_PRICING[1][typeKey]);
    else if (rft <= 10) basePrice = Number(TRACK_PRICING[2][typeKey]);
    else if (rft <= 11.5) basePrice = Number(TRACK_PRICING[3][typeKey]);
    else if (rft <= 13) basePrice = Number(TRACK_PRICING[4][typeKey]);
    else if (rft <= 14.5) basePrice = Number(TRACK_PRICING[5][typeKey]);
    else if (rft <= 16) basePrice = Number(TRACK_PRICING[6][typeKey]);
    else if (rft <= 17.5) basePrice = Number(TRACK_PRICING[7][typeKey]);
    else if (rft <= 19) basePrice = Number(TRACK_PRICING[8][typeKey]);
    else {
      basePrice = Number(TRACK_PRICING[8][typeKey]); 
      const excess = rft - 19;
      const excessRate = EXCESS_RATES[typeKey as keyof typeof EXCESS_RATES] || 0;
      basePrice += excess * excessRate;
    }
    return basePrice || 0;
  };

  // --- [UPDATED] TAPE CALCULATION ---
  const calculateTapePrice = (widthInInches: number, tapeType: string): number => {
    // 1. Calculate panels (Width / 21)
    const rawPanels = widthInInches / 21;
    // 2. Round panels using custom logic
    const panels = roundCustom(rawPanels);
    
    // 3. Multiply by 1.38
    const rawMeters = panels * 1.38;
    // 4. Round final meters
    const finalQty = roundCustom(rawMeters);
    
    const rate = TAPE_RATES.find(t => t.name === tapeType)?.rate || 0;
    return finalQty * rate;
  };

  const calculateRunnerPrice = (rft: number, runnerType: string): number => {
    const rate = RUNNER_RATES.find(r => r.name === runnerType)?.rate || 0;
    return rft * rate;
  };

  const calculateRFT = (width: number, unit: string): number => {
    const wInch = toInches(width, unit);
    return roundCustom(wInch / 12);
  };

  // --- DATA FETCHING ---

  useEffect(() => {
    if (selectionId) fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    try {
      const res = await api.get(`/calculations/forest/${selectionId}`);
      const dataItems = res.data?.items || [];
      
      if (dataItems.length > 0) {
        const mapped = dataItems.map((i: any) => {
          const unit = i.selectionItem?.unit || 'mm';
          const rawWidth = parseFloat(i.selectionItem?.width || 0);
          const rawHeight = parseFloat(i.selectionItem?.height || 0);
          
          const rft = calculateRFT(rawWidth, unit);
          
          let trackType = i.trackType || 'white';
          if (trackType === 'fmsPlusConceal') trackType = 'fmsPlusRecessWhite';

          const runnerType = i.runnerType || 'FES BASE AND FLEX HOOK';
          const tapeType = i.tapeType || 'FLEX TAPE TRANSPARENT';
          const motorType = i.motorType || 'none';
          const remoteType = i.remoteType || 'none';

          const trackPrice = calculateTrackPrice(rft, trackType);
          const runnerPrice = calculateRunnerPrice(rft, runnerType);
          
          // [UPDATED] Use Inches for Tape Calculation
          const widthInch = toInches(rawWidth, unit);
          const tapePrice = calculateTapePrice(widthInch, tapeType);
          
          const motorPrice = i.motorPrice ?? (MOTOR_VARIANTS.find(m => m.id === motorType)?.price || 0);
          const remotePrice = i.remotePrice ?? (REMOTE_OPTIONS.find(r => r.id === remoteType)?.price || 0);
          
          // --- KG Calculation ---
          const attributes = i.selectionItem?.product?.attributes || {};
          const gsm = findGsmInAttributes(attributes);

          const areaName = i.selectionItem?.details?.areaName || i.selectionItem?.areaName || 'Area';
          const fabricQty = calculateFabricForKg(rawWidth, rawHeight, unit);
          const motorKg = calculateMotorKg(fabricQty, gsm, areaName);

          const trackBasic = trackPrice + runnerPrice + tapePrice;
          const trackGst = trackBasic * 0.18;
          const trackFinal = Math.round(trackBasic + trackGst);

          const motorGst = motorPrice * 0.18;
          const motorFinal = Math.round(motorPrice + motorGst);

          const remoteGst = remotePrice * 0.18;
          const remoteFinal = Math.round(remotePrice + remoteGst);

          return {
            selectionItemId: i.selectionItemId,
            areaName,
            productName: i.selectionItem?.productName || 'Curtain',
            unit,
            width: rawWidth,
            height: rawHeight,
            rft,
            gsm,
            fabricQty,
            motorKg,
            trackType, trackPrice,
            runnerType, runnerPrice,
            tapeType, tapePrice,
            motorType, motorPrice,
            remoteType, remotePrice,
            trackBasic, trackGst, trackFinal,
            motorGst, motorFinal,
            remoteGst, remoteFinal
          };
        });
        setItems(mapped);
      } else {
        const selRes = await api.get(`/selections/${selectionId}`);
        const selectionItems = selRes.data?.items || [];

        // Filter for Forest (Auto) items
        const forestItems = selectionItems.filter((item: any) => 
          item.calculationType && item.calculationType.includes('Forest (Auto)')
        );
  
        const mapped = forestItems.map((item: any) => {
          const unit = item.unit || 'mm';
          const rawWidth = parseFloat(item.width || 0);
          const rawHeight = parseFloat(item.height || 0);
          
          const rft = calculateRFT(rawWidth, unit);
          const trackType = 'white';
          const runnerType = 'FES BASE AND FLEX HOOK';
          const tapeType = 'FLEX TAPE TRANSPARENT';
          
          // [UPDATED] Use Inches for Tape Calculation
          const widthInch = toInches(rawWidth, unit);

          const trackPrice = rft > 0 ? calculateTrackPrice(rft, trackType) : 0;
          const runnerPrice = rft > 0 ? calculateRunnerPrice(rft, runnerType) : 0;
          const tapePrice = rawWidth > 0 ? calculateTapePrice(widthInch, tapeType) : 0;

          // --- KG Calculation ---
          const attributes = item.product?.attributes || {};
          const gsm = findGsmInAttributes(attributes);
          
          const areaName = item.details?.areaName || item.areaName || 'Area';
          const fabricQty = calculateFabricForKg(rawWidth, rawHeight, unit);
          const motorKg = calculateMotorKg(fabricQty, gsm, areaName);

          const trackBasic = trackPrice + runnerPrice + tapePrice;
          const trackGst = trackBasic * 0.18;
          const trackFinal = Math.round(trackBasic + trackGst);

          return {
            selectionItemId: item.id,
            areaName,
            productName: item.productName || 'Curtain',
            unit,
            width: rawWidth,
            height: rawHeight,
            rft,
            gsm,
            fabricQty,
            motorKg,
            trackType, trackPrice,
            runnerType, runnerPrice,
            tapeType, tapePrice,
            motorType: 'none', motorPrice: 0,
            remoteType: 'none', remotePrice: 0,
            trackBasic, trackGst, trackFinal,
            motorGst: 0, motorFinal: 0,
            remoteGst: 0, remoteFinal: 0
          };
        });
        setItems(mapped);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load Forest data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- UPDATE HANDLER ---

  const handleUpdate = (id: string, field: keyof ForestItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.selectionItemId !== id) return item;
      
      const updatedItem = { ...item, [field]: value };
      
      // 1. Recalculate RFT/Dimensions/KG
      if (field === 'width' || field === 'height') {
        const newWidth = field === 'width' ? (parseFloat(value) || 0) : item.width;
        const newHeight = field === 'height' ? (parseFloat(value) || 0) : item.height;
        
        updatedItem.width = newWidth;
        updatedItem.height = newHeight;
        
        updatedItem.rft = calculateRFT(newWidth, item.unit);
        updatedItem.trackPrice = calculateTrackPrice(updatedItem.rft, item.trackType);
        updatedItem.runnerPrice = calculateRunnerPrice(updatedItem.rft, item.runnerType);
        
        // [UPDATED] Use Inches for Tape Calculation
        const widthInch = toInches(newWidth, item.unit);
        updatedItem.tapePrice = calculateTapePrice(widthInch, item.tapeType);

        // Update KG
        updatedItem.fabricQty = calculateFabricForKg(newWidth, newHeight, item.unit);
        updatedItem.motorKg = calculateMotorKg(updatedItem.fabricQty, item.gsm, item.areaName);
      }

      if (field === 'rft') {
        updatedItem.trackPrice = calculateTrackPrice(parseFloat(value) || 0, item.trackType);
        updatedItem.runnerPrice = calculateRunnerPrice(parseFloat(value) || 0, item.runnerType);
      }

      // 2. Recalculate Prices on Type Change
      if (field === 'trackType') updatedItem.trackPrice = calculateTrackPrice(item.rft, value);
      if (field === 'runnerType') updatedItem.runnerPrice = calculateRunnerPrice(item.rft, value);
      if (field === 'tapeType') {
        // [UPDATED] Use Inches for Tape Calculation
        const widthInch = toInches(item.width, item.unit);
        updatedItem.tapePrice = calculateTapePrice(widthInch, value);
      }

      // 3. Motor & Remote Prices
      if (field === 'motorType') {
        const selectedMotor = MOTOR_VARIANTS.find(m => m.id === value);
        updatedItem.motorPrice = selectedMotor ? selectedMotor.price : 0;
      }
      if (field === 'remoteType') {
        const selectedRemote = REMOTE_OPTIONS.find(r => r.id === value);
        updatedItem.remotePrice = selectedRemote ? selectedRemote.price : 0;
      }
    
      if (['trackPrice', 'runnerPrice', 'tapePrice', 'motorPrice', 'remotePrice'].includes(field)) {
        (updatedItem as any)[field] = parseFloat(value) || 0;
      }

      // 5. FINAL SEPARATE CALCULATIONS
      
      // Track Section
      updatedItem.trackBasic = updatedItem.trackPrice + updatedItem.runnerPrice + updatedItem.tapePrice;
      updatedItem.trackGst = updatedItem.trackBasic * 0.18;
      updatedItem.trackFinal = Math.round(updatedItem.trackBasic + updatedItem.trackGst);

      // Motor Section
      updatedItem.motorGst = updatedItem.motorPrice * 0.18;
      updatedItem.motorFinal = Math.round(updatedItem.motorPrice + updatedItem.motorGst);

      // Remote Section
      updatedItem.remoteGst = updatedItem.remotePrice * 0.18;
      updatedItem.remoteFinal = Math.round(updatedItem.remotePrice + updatedItem.remoteGst);

      return updatedItem;
    }));
  };

  // --- SAVE HANDLER ---

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/calculations/forest/${selectionId}`, {
        items: items.map(item => ({
          selectionItemId: item.selectionItemId,
          // Save Dimensions in case they were edited
          width: item.width,
          
          trackType: item.trackType,
          trackPrice: item.trackPrice,
          runnerType: item.runnerType,
          runnerPrice: item.runnerPrice,
          tapeType: item.tapeType,
          tapePrice: item.tapePrice,
          motorType: item.motorType,
          motorPrice: item.motorPrice,
          remoteType: item.remoteType,
          remotePrice: item.remotePrice,
          // Saving calculated values for record
          trackFinal: item.trackFinal,
          motorFinal: item.motorFinal,
          remoteFinal: item.remoteFinal,
          motorGst: item.motorGst,
          remoteGst: item.remoteGst,
          gst: item.trackGst // Mapping track gst to generic GST field if needed
        }))
      });
      toast({ title: "Saved", description: "Forest calculations updated!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const grandTotal = items.reduce((sum, item) => sum + item.trackFinal + item.motorFinal + item.remoteFinal, 0);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-[#ee4046]" /></div>;

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
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Calculator className="h-5 w-5 text-[#ee4046]" /> 
                Forest Track Calculator
              </h1>
              <p className="text-sm text-gray-500">Separate GST Calculations for Track, Motor & Remote</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-gray-500 uppercase font-semibold">Invoice Value</span>
              <div className="text-2xl font-bold text-[#ee4046]">₹{grandTotal.toLocaleString()}</div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-[#ee4046] hover:bg-[#d63940]">
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
                    <th className="px-2 py-3 text-center bg-blue-50/50">W</th>
                    <th className="px-2 py-3 text-center bg-blue-50/50">H</th>
                    <th className="px-2 py-3 text-center bg-blue-50/50 border-r border-blue-100">RFT</th>
                    
                    {/* TRACK SECTION */}
                    <th className="px-2 py-3 min-w-[120px]">Track</th>
                    <th className="px-2 py-3 min-w-[120px] bg-gray-50/50">Runner</th>
                    <th className="px-2 py-3 min-w-[120px]">Tape</th>
                    <th className="px-2 py-3 text-right bg-blue-100 text-blue-900 border-l border-white">Basic</th>
                    <th className="px-2 py-3 text-right bg-blue-100 text-blue-900">GST(18%)</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-blue-600">Track Final</th>
                    
                    {/* MOTOR SECTION */}
                    <th className="px-2 py-3 min-w-[160px] bg-yellow-50/50 text-yellow-900 border-l border-gray-300">Motor (Type)</th>
                    <th className="px-2 py-3 text-center bg-yellow-100/50 text-yellow-900 font-bold" title="Calculated Weight">KG</th>
                    <th className="px-2 py-3 text-right bg-yellow-100/50 text-yellow-900">Price</th>
                    <th className="px-2 py-3 text-right bg-yellow-100/50 text-yellow-900">GST</th>
                    <th className="px-2 py-3 text-right font-bold text-white bg-yellow-600">Motor Final</th>

                    {/* REMOTE SECTION */}
                    <th className="px-2 py-3 min-w-[140px] bg-purple-50/50 text-purple-900 border-l border-gray-300">Remote</th>
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
                        <div className="text-[10px] text-gray-400 mt-1">GSM: {item.gsm}</div>
                      </td>

                      {/* Dimensions */}
                      <td className="px-1 py-3 bg-blue-50/10">
                        <Input type="number" className="h-8 text-xs text-center w-14 mx-auto"
                          value={item.width || ''} onChange={(e) => handleUpdate(item.selectionItemId, 'width', e.target.value)} />
                      </td>
                      <td className="px-1 py-3 bg-blue-50/10">
                        <Input type="number" className="h-8 text-xs text-center w-14 mx-auto"
                          value={item.height || ''} onChange={(e) => handleUpdate(item.selectionItemId, 'height', e.target.value)} />
                      </td>
                      <td className="px-1 py-3 bg-blue-50/10 border-r border-blue-100 text-center font-bold text-blue-700">
                        {item.rft}
                      </td>

                      {/* TRACK COMPONENTS */}
                      <td className="px-2 py-3">
                        <Select value={item.trackType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'trackType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="white">White</SelectItem>
                            <SelectItem value="black">Black</SelectItem>
                            <SelectItem value="fmsPlus">FMS Plus</SelectItem>
                            <SelectItem value="fmsPlusRecessWhite">Recess (White)</SelectItem>
                            <SelectItem value="fmsPlusRecessBlack">Recess (Black)</SelectItem>
                            <SelectItem value="dsXlLed">DS XL LED</SelectItem>
                            <SelectItem value="dual">Dual</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] text-gray-400 text-right mt-1">₹{item.trackPrice.toFixed(0)}</div>
                      </td>

                      <td className="px-2 py-3 bg-gray-50/30">
                        <Select value={item.runnerType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'runnerType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RUNNER_RATES.map(r => <SelectItem key={r.name} value={r.name}>{r.name.replace(' AND ', ' & ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] text-gray-400 text-right mt-1">₹{item.runnerPrice.toFixed(0)}</div>
                      </td>

                      <td className="px-2 py-3">
                        <Select value={item.tapeType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'tapeType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TAPE_RATES.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] text-gray-400 text-right mt-1">₹{item.tapePrice.toFixed(0)}</div>
                      </td>

                      {/* TRACK CALCULATIONS */}
                      <td className="px-2 py-3 text-right bg-blue-50 font-medium text-blue-900 border-l">₹{item.trackBasic.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-blue-50 text-gray-500 text-xs">₹{item.trackGst.toFixed(0)}</td>
                      <td className="px-2 py-3 text-right font-bold bg-blue-100 text-blue-700 border-r border-gray-300">₹{item.trackFinal.toLocaleString()}</td>

                      {/* MOTOR SECTION */}
                      <td className="px-2 py-3 bg-yellow-50/20">
                        <Select value={item.motorType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'motorType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-yellow-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MOTOR_VARIANTS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-3 text-center bg-yellow-50/30 text-yellow-800 font-bold border-l border-white">
                        {item.motorKg}
                      </td>
                      <td className="px-2 py-3 text-right bg-yellow-50/20">₹{item.motorPrice.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right bg-yellow-50/20 text-xs text-gray-500">₹{item.motorGst.toFixed(0)}</td>
                      <td className="px-2 py-3 text-right font-bold bg-yellow-100 text-yellow-700 border-r border-gray-300">₹{item.motorFinal.toLocaleString()}</td>

                      {/* REMOTE SECTION */}
                      <td className="px-2 py-3 bg-purple-50/20">
                         <Select value={item.remoteType} onValueChange={(v) => handleUpdate(item.selectionItemId, 'remoteType', v)}>
                          <SelectTrigger className="h-8 text-xs w-full border-purple-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REMOTE_OPTIONS.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
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
                    <td colSpan={7} className="px-4 py-3 text-right uppercase">Category Totals</td>
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
}