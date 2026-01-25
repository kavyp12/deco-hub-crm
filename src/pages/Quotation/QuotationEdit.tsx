// [FILE: src/pages/Quotation/QuotationEdit.tsx]
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Printer, Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface QuotationItem {
  id?: string;
  srNo: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  gstPercent: number;
}

export default function QuotationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [header, setHeader] = useState({
    quotation_number: '',
    clientName: '',
    clientAddress: '',
    transportationCharge: 0,
    installationCharge: 0
  });

  const [items, setItems] = useState<QuotationItem[]>([]);

  useEffect(() => {
    fetchQuote();
  }, [id]);

  const fetchQuote = async () => {
    try {
      const res = await api.get(`/quotations/${id}`);
      const q = res.data;
      
      setHeader({
        quotation_number: q.quotation_number,
        clientName: q.clientName,
        clientAddress: q.clientAddress || '',
        transportationCharge: parseFloat(q.transportationCharge) || 0,
        installationCharge: parseFloat(q.installationCharge) || 0
      });

      setItems(q.items.map((i: any) => ({
        id: i.id,
        srNo: i.srNo,
        description: i.description,
        quantity: parseFloat(i.quantity) || 0,
        unit: i.unit,
        unitPrice: parseFloat(i.unitPrice) || 0,
        discountPercent: parseFloat(i.discountPercent) || 0,
        gstPercent: parseFloat(i.gstPercent) || 0,
      })));
      
      setLoading(false);
    } catch (e) {
      toast({ title: "Error", description: "Failed to load quotation", variant: "destructive" });
      setLoading(false);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([
      ...items, 
      { 
        srNo: items.length + 1, 
        description: 'New Item', 
        quantity: 1, 
        unit: 'Nos', 
        unitPrice: 0, 
        discountPercent: 0, 
        gstPercent: 12
      }
    ]);
  };

  const removeItem = (index: number) => {
    if (!confirm('Remove this item?')) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.map((item, i) => ({ ...item, srNo: i + 1 })));
  };

  const saveQuote = async () => {
    try {
      await api.put(`/quotations/${id}`, {
        ...header,
        items
      });
      toast({ title: "Saved", description: "Quotation updated successfully" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  // Real-time calculation
  const calculateRow = (item: QuotationItem) => {
    const qty = parseFloat(String(item.quantity)) || 0;
    const rate = parseFloat(String(item.unitPrice)) || 0;
    const subtotal = qty * rate;
    
    const discPct = parseFloat(String(item.discountPercent)) || 0;
    const discAmt = subtotal * (discPct / 100);
    
    const taxable = subtotal - discAmt;
    
    const gstPct = parseFloat(String(item.gstPercent)) || 0;
    const gstAmt = taxable * (gstPct / 100);
    
    return { 
      subtotal, 
      discountAmount: discAmt, 
      taxable, 
      gstAmt, 
      total: taxable + gstAmt 
    };
  };

  // Calculate totals
  const itemsTotal = items.reduce((acc, item) => acc + calculateRow(item).total, 0);
  const transportationCharge = parseFloat(String(header.transportationCharge)) || 0;
  const installationCharge = parseFloat(String(header.installationCharge)) || 0;
  const grandTotal = itemsTotal + transportationCharge + installationCharge;

  if (loading) return (
    <DashboardLayout>
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-4 space-y-6 pb-20">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => navigate('/quotations')}>
               <ArrowLeft className="w-5 h-5"/>
             </Button>
             <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Quotation: {header.quotation_number}</h1>
                <p className="text-sm text-gray-500">Modify items, prices, discounts, and taxes.</p>
             </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/quotations/preview/${id}`)}>
               <Printer className="w-4 h-4 mr-2"/> Preview / Print
            </Button>
            <Button onClick={saveQuote} className="bg-green-600 hover:bg-green-700 text-white">
               <Save className="w-4 h-4 mr-2"/> Save Changes
            </Button>
          </div>
        </div>

        {/* Client Details */}
        <Card>
           <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                 <Label>Client Name</Label>
                 <Input 
                   value={header.clientName} 
                   onChange={e => setHeader({...header, clientName: e.target.value})} 
                   placeholder="Client Name"
                 />
              </div>
              <div className="space-y-2">
                 <Label>Address / Project Ref</Label>
                 <Input 
                   value={header.clientAddress} 
                   onChange={e => setHeader({...header, clientAddress: e.target.value})} 
                   placeholder="Address or Project Name"
                 />
              </div>
           </CardContent>
        </Card>

        {/* Items Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-gray-100 text-gray-700 font-bold uppercase text-xs">
                 <tr>
                   <th className="p-3 w-10 text-center">#</th>
                   <th className="p-3 w-64">Description</th>
                   <th className="p-3 w-20">Qty</th>
                   <th className="p-3 w-24">Unit</th>
                   <th className="p-3 w-28">Rate</th>
                   <th className="p-3 w-16">Disc %</th>
                   <th className="p-3 w-28 text-right">Taxable</th>
                   <th className="p-3 w-16">GST %</th>
                   <th className="p-3 w-28 text-right">Total</th>
                   <th className="p-3 w-10"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-200">
                 {items.map((item, idx) => {
                    const c = calculateRow(item);
                    return (
                      <tr key={idx} className="hover:bg-gray-50 group">
                        <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                        <td className="p-2">
                          <Input 
                            value={item.description} 
                            onChange={e => handleItemChange(idx, 'description', e.target.value)} 
                          />
                        </td>
                        <td className="p-2">
                          <Input 
                            type="number" 
                            value={item.quantity} 
                            onChange={e => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)} 
                          />
                        </td>
                        <td className="p-2">
                           <select 
                             className="border rounded px-2 py-1 bg-white w-full text-sm h-9 border-input"
                             value={item.unit} 
                             onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                           >
                             <option value="Nos">Nos</option>
                             <option value="Mtr">Mtr</option>
                             <option value="Sqft">Sqft</option>
                             <option value="Set">Set</option>
                           </select>
                        </td>
                        <td className="p-2">
                          <Input 
                            type="number" 
                            value={item.unitPrice} 
                            onChange={e => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)} 
                          />
                        </td>
                        <td className="p-2">
                          <Input 
                            type="number" 
                            value={item.discountPercent} 
                            onChange={e => handleItemChange(idx, 'discountPercent', parseFloat(e.target.value) || 0)} 
                            className="text-gray-600" 
                          />
                        </td>
                        <td className="p-2 text-right font-mono text-gray-700">
                          ₹{c.taxable.toFixed(0)}
                        </td>
                        <td className="p-2">
                          <Input 
                            type="number" 
                            value={item.gstPercent} 
                            onChange={e => handleItemChange(idx, 'gstPercent', parseFloat(e.target.value) || 0)} 
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-gray-900">
                          ₹{c.total.toFixed(0)}
                        </td>
                        <td className="p-2 text-center">
                           <Button 
                             size="icon" 
                             variant="ghost" 
                             className="h-8 w-8 text-red-500 hover:bg-red-50" 
                             onClick={() => removeItem(idx)}
                           >
                              <Trash2 className="w-4 h-4" />
                           </Button>
                        </td>
                      </tr>
                    );
                 })}
               </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
             <Button variant="outline" onClick={addItem} size="sm" className="border-dashed border-gray-400">
               <Plus className="w-4 h-4 mr-2"/> Add Item
             </Button>
             
             <div className="w-full md:w-80 space-y-3 bg-white p-4 rounded border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center">
                   <Label className="text-gray-600">Transportation</Label>
                   <Input 
                     type="number" 
                     className="w-32 h-8 text-right"
                     value={header.transportationCharge} 
                     onChange={e => setHeader({...header, transportationCharge: parseFloat(e.target.value) || 0})} 
                   />
                </div>
                <div className="flex justify-between items-center">
                   <Label className="text-gray-600">Installation</Label>
                   <Input 
                     type="number" 
                     className="w-32 h-8 text-right"
                     value={header.installationCharge} 
                     onChange={e => setHeader({...header, installationCharge: parseFloat(e.target.value) || 0})} 
                   />
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                   <span className="font-bold text-lg">Grand Total</span>
                   <span className="font-bold text-xl text-blue-600">
                     ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                   </span>
                </div>
             </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}