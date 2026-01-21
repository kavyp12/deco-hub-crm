import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Calculator, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Search, 
  Ruler, 
  Layers, 
  Zap, 
  Calendar,
  Briefcase,
  ArrowRight,
  Grid,       // For Roman
  Blinds      // For Blinds
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { format } from 'date-fns';

// --- Types ---
interface UnifiedCalculation {
  id: string;
  selectionId: string;
  selection_number: string;
  client_name: string;
  inquiry_number: string;
  type: 'Local' | 'Forest' | 'Somfy' | 'Roman' | 'Blinds';
  itemCount: number;
  created_at: string;
  totalValue: number;
}

interface GroupedInquiry {
  inquiry_number: string;
  client_name: string;
  calculations: UnifiedCalculation[];
  totalProjectValue: number;
  latestActivity: string;
}

const CalculationList: React.FC = () => {
  const [groupedInquiries, setGroupedInquiries] = useState<GroupedInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Track which inquiry dropdowns are open
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAndGroupCalculations();
  }, []);

  // --- 1. ROBUST TOTAL CALCULATION ---
  const calcTotal = (items: any[], type: string) => {
    if (!items || items.length === 0) return 0;
    
    return items.reduce((sum, item) => {
      // A. LOCAL
      if (type === 'Local') {
        const fabric = (item.fabric || 0) * (item.fabricRate || 0);
        const channel = (item.channel || 0) * (item.channelRate || 0);
        const labour = (item.labour || 0) * (item.labourRate || 0);
        const fitting = (item.fitting || 0) * (item.fittingRate || 0);
        // Add blackout/sheer if they are calculated separately in your logic
        return sum + fabric + channel + labour + fitting;
      }

      // B. FOREST (Sum components + 18% GST)
      if (type === 'Forest') {
        const basic = (item.trackPrice || 0) + 
                      (item.runnerPrice || 0) + 
                      (item.tapePrice || 0) +
                      (item.motorPrice || 0) + 
                      (item.remotePrice || 0);
        return sum + (basic * 1.18); 
      }

      // C. SOMFY (Sum components + 18% GST)
      if (type === 'Somfy') {
        const basic = (item.trackPrice || 0) + 
                      (item.motorPrice || 0) + 
                      (item.remotePrice || 0) +
                      (item.rippleTapePrice || 0);
        return sum + (basic * 1.18);
      }

      // D. ROMAN (Fabric + Labour + Fitting)
      if (type === 'Roman') {
        const fabric = (item.fabric || 0) * (item.fabricRate || 0);
        const labour = (item.panna || 0) * (item.labourRate || 0); // Roman labour is usually per panna/pleat
        const fitting = (item.fittingRate || 0);
        return sum + fabric + labour + fitting;
      }

      // E. BLINDS (Sqft + Labour + Fitting)
      if (type === 'Blinds') {
        const mat = (item.sqft || 0) * (item.sqftRate || 0);
        const labour = (item.sqft || 0) * (item.labourRate || 0);
        const fitting = (item.fittingRate || 0);
        return sum + mat + labour + fitting;
      }

      return sum;
    }, 0);
  };

  const fetchAndGroupCalculations = async () => {
    try {
      setLoading(true);
      const selectionsRes = await api.get('/selections');
      const selections = selectionsRes.data;

      const allCalcs: UnifiedCalculation[] = [];

      // Loop selections to find calculations
      for (const selection of selections) {
        const baseInfo = {
          selectionId: selection.id,
          selection_number: selection.selection_number,
          client_name: selection.inquiry?.client_name || 'Unknown Client',
          inquiry_number: selection.inquiry?.inquiry_number || 'No Inquiry ID',
        };

        // 1. Check LOCAL
        try {
          const res = await api.get(`/calculations/local/${selection.id}`);
          if (res.data?.items?.length > 0) {
            allCalcs.push({
              ...baseInfo,
              id: res.data.id,
              type: 'Local',
              itemCount: res.data.items.length,
              created_at: res.data.created_at || new Date().toISOString(),
              totalValue: calcTotal(res.data.items, 'Local')
            });
          }
        } catch (e) {}

        // 2. Check FOREST
        try {
          const res = await api.get(`/calculations/forest/${selection.id}`);
          if (res.data?.items?.length > 0) {
            allCalcs.push({
              ...baseInfo,
              id: res.data.id,
              type: 'Forest',
              itemCount: res.data.items.length,
              created_at: res.data.created_at || new Date().toISOString(),
              totalValue: calcTotal(res.data.items, 'Forest')
            });
          }
        } catch (e) {}

        // 3. Check SOMFY
        try {
          const res = await api.get(`/calculations/somfy/${selection.id}`);
          if (res.data?.items?.length > 0) {
            allCalcs.push({
              ...baseInfo,
              id: res.data.id,
              type: 'Somfy',
              itemCount: res.data.items.length,
              created_at: res.data.created_at || new Date().toISOString(),
              totalValue: calcTotal(res.data.items, 'Somfy')
            });
          }
        } catch (e) {}

        // 4. Check GENERIC (Roman / Blinds)
        // 4. Check GENERIC (Roman / Blinds / Others)
        try {
          const res = await api.get(`/calculations/by-selection/${selection.id}`);
          
          if (res.data && res.data.items && res.data.items.length > 0) {
            const items = res.data.items;

            // Filter items by category
            const romanItems = items.filter((i: any) => i.category === 'Roman');
            const blindsItems = items.filter((i: any) => i.category === 'Blinds');

            // If Roman items exist, add Roman Entry
            if (romanItems.length > 0) {
              allCalcs.push({
                ...baseInfo,
                id: res.data.id + '-roman', // Unique key
                type: 'Roman',
                itemCount: romanItems.length,
                created_at: res.data.created_at || new Date().toISOString(),
                totalValue: calcTotal(romanItems, 'Roman')
              });
            }

            // If Blinds items exist, add Blinds Entry
            if (blindsItems.length > 0) {
              allCalcs.push({
                ...baseInfo,
                id: res.data.id + '-blinds', // Unique key
                type: 'Blinds',
                itemCount: blindsItems.length,
                created_at: res.data.created_at || new Date().toISOString(),
                totalValue: calcTotal(blindsItems, 'Blinds')
              });
            }
          }
        } catch (e) {}
      }

      // Group by Inquiry Number
      const groups: Record<string, GroupedInquiry> = {};
      allCalcs.forEach(calc => {
        const key = calc.inquiry_number;
        if (!groups[key]) {
          groups[key] = {
            inquiry_number: key,
            client_name: calc.client_name,
            calculations: [],
            totalProjectValue: 0,
            latestActivity: calc.created_at
          };
        }
        groups[key].calculations.push(calc);
        groups[key].totalProjectValue += calc.totalValue;
        
        if (new Date(calc.created_at) > new Date(groups[key].latestActivity)) {
          groups[key].latestActivity = calc.created_at;
        }
      });

      // Sort by latest activity
      setGroupedInquiries(Object.values(groups).sort((a, b) => 
        new Date(b.latestActivity).getTime() - new Date(a.latestActivity).getTime()
      ));

    } catch (err) {
      console.error("Error fetching calculations:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDropdown = (id: string) => {
    const newSet = new Set(openDropdowns);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setOpenDropdowns(newSet);
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'Local': return <Ruler className="h-4 w-4 text-blue-600" />;
      case 'Forest': return <Layers className="h-4 w-4 text-green-600" />;
      case 'Somfy': return <Zap className="h-4 w-4 text-yellow-600" />;
      case 'Roman': return <Grid className="h-4 w-4 text-orange-600" />;
      case 'Blinds': return <Blinds className="h-4 w-4 text-purple-600" />;
      default: return <Calculator className="h-4 w-4 text-gray-600" />;
    }
  };

  const getLink = (selectionId: string) => {
    return `/calculations/edit/${selectionId}`;
  };

  // Filter Logic
  const filteredInquiries = groupedInquiries.filter(group => 
    group.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.inquiry_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto pb-20 px-4 sm:px-6 animate-fade-in">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8 pt-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900">
              <Briefcase className="h-8 w-8 text-[#ee4046]" /> 
              Project Calculations
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage calculations grouped by Client Inquiry.
            </p>
          </div>
          <Link to="/selections">
            <Button className="bg-[#ee4046] hover:bg-[#d63940] text-white shadow-md">
              <Plus className="h-4 w-4 mr-2" /> New Calculation
            </Button>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input 
            placeholder="Search by Client Name or Inquiry #..." 
            className="pl-10 h-12 text-lg bg-white shadow-sm border-gray-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ee4046]"></div>
          </div>
        )}

        {/* List of Inquiries (Cards) */}
        <div className="space-y-4">
          {!loading && filteredInquiries.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed">
              <p className="text-gray-500">No calculations found matching your search.</p>
            </div>
          )}

          {filteredInquiries.map((group) => {
            const isOpen = openDropdowns.has(group.inquiry_number);
            
            return (
              <div key={group.inquiry_number} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                
                {/* 1. The Main "Card" Face (Click to Toggle) */}
                <div 
                  onClick={() => toggleDropdown(group.inquiry_number)}
                  className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white hover:bg-gray-50/50 transition-colors"
                >
                  {/* Left: Client Info */}
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 p-2 rounded-lg transition-colors ${isOpen ? 'bg-[#ee4046]/10 text-[#ee4046]' : 'bg-gray-100 text-gray-400'}`}>
                      {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{group.client_name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <Badge variant="secondary" className="font-mono text-xs">{group.inquiry_number}</Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(group.latestActivity), 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Summary Stats */}
                  <div className="flex items-center gap-6 md:text-right">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Value</p>
                      <p className="text-lg font-bold text-gray-900">₹{group.totalProjectValue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="hidden md:block w-px h-8 bg-gray-200"></div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Files</p>
                      <p className="text-lg font-bold text-gray-900">{group.calculations.length}</p>
                    </div>
                  </div>
                </div>

                {/* 2. The Dropdown Content (Calculations List) */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/30 animate-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-1 divide-y divide-gray-100">
                      {group.calculations.map((calc, idx) => (
                        <div key={`${calc.type}-${idx}`} className="flex items-center justify-between p-4 pl-[4.5rem] hover:bg-white transition-colors group">
                          
                          {/* Calculation Info */}
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-md border shadow-sm ${
                              calc.type === 'Local' ? 'bg-blue-50 border-blue-100' : 
                              calc.type === 'Forest' ? 'bg-green-50 border-green-100' : 
                              calc.type === 'Somfy' ? 'bg-yellow-50 border-yellow-100' :
                              calc.type === 'Roman' ? 'bg-orange-50 border-orange-100' :
                              'bg-purple-50 border-purple-100'
                            }`}>
                              {getIcon(calc.type)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800 flex items-center gap-2">
                                {calc.type} Calculation
                                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 rounded">
                                  {calc.selection_number}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {calc.itemCount} Items • Created {format(new Date(calc.created_at), 'MMM d, h:mm a')}
                              </p>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="flex items-center gap-4 pr-4">
                             <div className="text-right mr-4">
                                <span className="block text-xs text-gray-400">Value</span>
                                <span className="font-mono text-sm font-semibold text-gray-700">
                                  ₹{Math.round(calc.totalValue).toLocaleString('en-IN')}
                                </span>
                             </div>
                             
                             <Link to={getLink(calc.selectionId)}>
                              <Button size="sm" variant="outline" className="border-gray-300 hover:border-[#ee4046] hover:text-[#ee4046]">
                                Open Hub
                                <ArrowRight className="ml-2 h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>

                        </div>
                      ))}
                    </div>
                    
                    {/* Footer of Dropdown */}
                    <div className="bg-gray-50 p-3 text-center border-t border-gray-100">
                      <p className="text-xs text-gray-400">End of calculations for {group.client_name}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CalculationList;