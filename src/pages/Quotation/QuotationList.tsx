// [FILE: src/pages/Quotation/QuotationList.tsx]
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Plus, Search, Pencil, FileText, FileSpreadsheet, Trash2, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

export default function QuotationList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/quotations');
      setQuotes(res.data);
    } catch (error) {
      console.error("Failed to fetch quotes", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, quoteNumber: string) => {
    if (!window.confirm(`Are you sure you want to delete Quotation ${quoteNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/quotations/${id}`);
      
      // Update UI immediately (remove item from local state)
      setQuotes(prev => prev.filter(q => q.id !== id));
      
      toast({ 
        title: "Deleted", 
        description: `Quotation ${quoteNumber} deleted successfully.` 
      });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to delete quotation.", 
        variant: "destructive" 
      });
    }
  };

  // ✅ FIX: Handle edit based on quotation type
  const handleEdit = (quote: any) => {
    // Navigate to edit page - the QuotationEdit component will handle the type internally
    navigate(`/quotations/edit/${quote.id}`);
  };

  const filtered = quotes.filter((q: any) => 
    q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
    q.clientName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
            <p className="text-sm text-gray-500">Manage and edit your price quotes</p>
          </div>
          <Button onClick={() => navigate('/selections')} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" /> New Quote (From Selection)
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
               <Input 
                 placeholder="Search by Quote No or Client..." 
                 className="pl-9 max-w-sm"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
               />
             </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Quote #</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No quotations found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((q: any) => (
                      <tr key={q.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 font-bold text-blue-600">{q.quotation_number}</td>
                        
                        <td className="px-4 py-3">
                          {q.quotationType === 'simple' ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <FileText className="h-3 w-3 mr-1" />
                              Simple
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <FileSpreadsheet className="h-3 w-3 mr-1" />
                              Detailed
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-gray-500">{new Date(q.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 font-medium">{q.clientName}</td>
                        <td className="px-4 py-3">
                           <Badge variant="outline" className="capitalize">{q.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">₹{q.grandTotal.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right flex justify-end gap-1">
                          
                          {/* ✅ FIXED Edit Button */}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => handleEdit(q)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          
                          {/* Preview Button */}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => navigate(`/quotations/preview/${q.id}`)}
                            title="Preview / Print"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>

                          {/* Delete Button */}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(q.id, q.quotation_number)}
                            title="Delete Quotation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>

                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}