import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Ruler, Calculator, 
  Grid, Blinds, Layers, ArrowRight, 
  Loader2 
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

export default function CalculationHub() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<any>(null);
  
  // Totals
  const [totals, setTotals] = useState({
    local: 0,
    forest: 0,
    roman: 0,
    blinds: 0
  });

  useEffect(() => {
    fetchData();
  }, [selectionId]);

  const fetchData = async () => {
    try {
      // 1. Fetch Selection Details
      const selRes = await api.get(`/selections/${selectionId}`);
      setSelection(selRes.data);

      // 2. Fetch All Calculation Data to compute totals
      const [localRes, forestRes, genericRes] = await Promise.all([
        api.get(`/calculations/local/${selectionId}`).catch(() => ({ data: null })),
        api.get(`/calculations/forest/${selectionId}`).catch(() => ({ data: null })),
        api.get(`/calculations/by-selection/${selectionId}`).catch(() => ({ data: null }))
      ]);

      // Calculate Local Total
      let localTotal = 0;
      if (localRes.data && localRes.data.items) {
        localTotal = localRes.data.items.reduce((sum: number, item: any) => {
           // Replicate Local Calculation Logic roughly for preview
           const fabric = (item.fabric || 0) * (item.fabricRate || 0);
           const labour = (item.labour || 0) * (item.labourRate || 0);
           const other = (item.channel || 0) * (item.channelRate || 0) + (item.fitting || 0) * (item.fittingRate || 0);
           return sum + fabric + labour + other; // Simplified
        }, 0);
      }

      // Calculate Forest Total
      let forestTotal = 0;
      if (forestRes.data && forestRes.data.items) {
        forestTotal = forestRes.data.items.reduce((sum: number, i: any) => 
          sum + (i.trackFinal || 0) + (i.motorFinal || 0) + (i.remoteFinal || 0), 0);
      }

      // Calculate Roman & Blinds Total (From Generic Table)
      let romanTotal = 0;
      let blindsTotal = 0;
      
      if (genericRes.data && genericRes.data.items) {
        genericRes.data.items.forEach((item: any) => {
          if (item.category === 'Roman') {
            const val = (item.fabric * item.fabricRate) + (item.panna * item.labourRate) + item.fittingRate;
            romanTotal += val || 0;
          } else if (item.category === 'Blinds') {
            const val = (item.sqft * item.sqftRate) + (item.sqft * item.labourRate) + item.fittingRate;
            blindsTotal += val || 0;
          }
        });
      }

      setTotals({
        local: localTotal,
        forest: forestTotal,
        roman: romanTotal,
        blinds: blindsTotal
      });

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const grandTotal = totals.local + totals.forest + totals.roman + totals.blinds;

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-[#ee4046]" /></div>;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto pb-20 p-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/calculations')}>
              <ArrowLeft className="h-5 w-5"/>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Calculation Hub</h1>
              <p className="text-muted-foreground">
                Client: <span className="font-semibold text-gray-800">{selection?.inquiry?.client_name}</span> 
                <span className="mx-2">•</span> 
                {selection?.selection_number}
              </p>
            </div>
          </div>
          <div className="text-right bg-white p-3 px-5 rounded-lg border shadow-sm">
            <div className="text-xs text-muted-foreground uppercase font-bold">Project Grand Total</div>
            <div className="text-2xl font-bold text-[#ee4046]">₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        {/* Step 1: Dimensions Setup */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Ruler className="h-5 w-5 text-gray-500" />
              Step 1: Setup Items
            </h2>
          </div>
          <Card className="hover:border-[#ee4046]/50 transition-all cursor-pointer group" onClick={() => navigate(`/calculations/edit/${selectionId}`)}>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#ee4046]">Dimensions & Categories</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Add items, set measurements (Width/Height), and assign categories (Standard, Roman, Blinds).
                </p>
                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary">{selection?.items?.length || 0} Items Defined</Badge>
                </div>
              </div>
              <Button className="bg-gray-900 group-hover:bg-[#ee4046]">
                Manage Items <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Cost Calculators */}
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Calculator className="h-5 w-5 text-gray-500" />
          Step 2: Calculate Costs
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Local Standard */}
          <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-500" /> Standard (Local)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4 h-10">
                Calculate fabric, labour, channel & fitting using local rates.
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">Estimated Total</div>
                  <div className="text-xl font-bold text-blue-700">₹{totals.local.toLocaleString()}</div>
                </div>
                <Button variant="outline" className="border-blue-200 hover:bg-blue-50 text-blue-700" onClick={() => navigate(`/calculations/local/${selectionId}`)}>
                  Open Local <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. Forest */}
          <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Layers className="h-5 w-5 text-green-500" /> Standard (Forest)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4 h-10">
                Tracks, Motors & Remotes with specific Forest pricing logic.
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">Estimated Total</div>
                  <div className="text-xl font-bold text-green-700">₹{totals.forest.toLocaleString()}</div>
                </div>
                <Button variant="outline" className="border-green-200 hover:bg-green-50 text-green-700" onClick={() => navigate(`/calculations/forest/${selectionId}`)}>
                  Open Forest <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 3. Roman */}
          <Card className="border-l-4 border-l-orange-500 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Grid className="h-5 w-5 text-orange-500" /> Roman Curtains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4 h-10">
                Calculation based on Parts and Panna logic.
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">Estimated Total</div>
                  <div className="text-xl font-bold text-orange-700">₹{totals.roman.toLocaleString()}</div>
                </div>
                <Button variant="outline" className="border-orange-200 hover:bg-orange-50 text-orange-700" onClick={() => navigate(`/calculations/roman/${selectionId}`)}>
                  Open Roman <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 4. Blinds */}
          <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Blinds className="h-5 w-5 text-purple-500" /> Blinds / Rugs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4 h-10">
                Sq.Ft based calculation with minimum area rules.
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">Estimated Total</div>
                  <div className="text-xl font-bold text-purple-700">₹{totals.blinds.toLocaleString()}</div>
                </div>
                <Button variant="outline" className="border-purple-200 hover:bg-purple-50 text-purple-700" onClick={() => navigate(`/calculations/blinds/${selectionId}`)}>
                  Open Blinds <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}