// [FILE: src/pages/Quotation/QuotationEdit.tsx]
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [header, setHeader] = useState({
    quotation_number: '',
    quotationType: 'detailed',
    selectionId: '',
    clientName: '',
    clientAddress: '',
    transportationCharge: 0,
    installationCharge: 0
  });

  const [items, setItems] = useState<QuotationItem[]>([]);

  useEffect(() => {
    // Always fetch from database when editing an existing quotation
    if (id && id !== 'new') {
      fetchQuote();
    } else if (id === 'new') {
      // Handle new quotation creation from selection
      if (location.state && location.state.generatedData) {
        const data = location.state.generatedData;
        setHeader({
          quotation_number: data.quotation_number || 'NEW',
          quotationType: data.quotationType || 'detailed',
          selectionId: data.selectionId || '',
          clientName: data.clientName || '',
          clientAddress: data.clientAddress || '',
          transportationCharge: 0,
          installationCharge: 0
        });
        setItems(data.items || []); 
        setLoading(false);
      } else {
        toast({ title: "Error", description: "No data found. Please generate quote again.", variant: "destructive" });
        navigate('/quotations');
      }
    }
  }, [id, location.state]);

  const fetchQuote = async () => {
    try {
      const res = await api.get(`/quotations/${id}`);
      const q = res.data;
      
      setHeader({
        quotation_number: q.quotation_number,
        quotationType: q.quotationType || 'detailed', // ✅ Preserve the type from DB
        selectionId: q.selectionId,
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
  const subTotal = items.reduce((acc, item) => acc + calculateRow(item).subtotal, 0);
  const discountTotal = items.reduce((acc, item) => acc + calculateRow(item).discountAmount, 0);
  const taxableValue = items.reduce((acc, item) => acc + calculateRow(item).taxable, 0);
  const gstTotal = items.reduce((acc, item) => acc + calculateRow(item).gstAmt, 0);
  
  const grandTotal = itemsTotal + parseFloat(String(header.transportationCharge)) + parseFloat(String(header.installationCharge));
  
  // ✅ Check if this is a simple quotation
  const isSimple = header.quotationType === 'simple';

  const saveQuote = async () => {
    const payload = {
      ...header,
      items: items.map(i => {
        const c = calculateRow(i);
        return { 
          ...i,
          discountAmount: c.discountAmount,
          gstAmount: c.gstAmt,
          subtotal: c.subtotal,
          taxableValue: c.taxable,
          total: c.total
        }; 
      }),
      subTotal, discountTotal, taxableValue, gstTotal, grandTotal
    };

    try {
      if (id === 'new') {
        // Create new quotation
        await api.post('/quotations', payload);
        toast({ title: "Success", description: "Quotation created successfully" });
      } else {
        // Update existing quotation
        await api.put(`/quotations/${id}`, payload);
        toast({ title: "Saved", description: "Quotation updated successfully" });
      }
      navigate('/quotations');
    } catch (e) {
      toast({ title: "Error", description: "Failed to save quotation", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => navigate('/quotations')}>
               <ArrowLeft className="w-5 h-5"/>
             </Button>
             <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {id === 'new' ? 'New Quotation' : `Edit: ${header.quotation_number}`}
                </h1>
                <p className="text-sm text-gray-500">
                  {isSimple ? 'Simple Mode' : 'Detailed Mode'} • {header.clientName}
                </p>
             </div>
          </div>
          <div className="flex gap-2">
            {id !== 'new' && (
              <Button variant="outline" onClick={() => navigate(`/quotations/preview/${id}`)}>
                 <Printer className="w-4 h-4 mr-2"/> Preview
              </Button>
            )}
            <Button onClick={saveQuote} className="bg-green-600 hover:bg-green-700 text-white">
               <Save className="w-4 h-4 mr-2"/> {id === 'new' ? 'Create Quotation' : 'Save Changes'}
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
                   <th className="p-3 w-28 text-right">Rate</th>
                   
                   {/* ✅ Show/Hide columns based on quotation type */}
                   {!isSimple && <th className="p-3 w-16">Disc %</th>}
                   {!isSimple && <th className="p-3 w-28 text-right">Taxable</th>}
                   {!isSimple && <th className="p-3 w-16">GST %</th>}
                   
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
                            className="text-center"
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
                             <option value="Lot">Lot</option>
                           </select>
                        </td>
                        <td className="p-2">
                          <Input 
                            type="number" 
                            className="text-right"
                            value={item.unitPrice} 
                            onChange={e => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)} 
                          />
                        </td>

                        {/* ✅ Only show these columns for detailed quotations */}
                        {!isSimple && (
                          <>
                            <td className="p-2">
                              <Input 
                                type="number" 
                                value={item.discountPercent} 
                                onChange={e => handleItemChange(idx, 'discountPercent', parseFloat(e.target.value) || 0)} 
                                className="text-gray-600 text-center" 
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
                                className="text-center"
                              />
                            </td>
                          </>
                        )}

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

          {/* Footer Totals */}
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