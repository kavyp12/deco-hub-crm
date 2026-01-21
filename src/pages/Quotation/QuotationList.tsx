// [FILE: src/pages/Quotation/QuotationList.tsx]
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Plus, Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';

export default function QuotationList() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/quotations').then(res => setQuotes(res.data));
  }, []);

  const filtered = quotes.filter((q: any) => 
    q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
    q.selection?.inquiry?.client_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
            <p className="text-sm text-gray-500">Manage generated price quotes</p>
          </div>
          <Button onClick={() => navigate('/selections')} className="bg-blue-600">
            <Plus className="h-4 w-4 mr-2" /> New Quote (From Selection)
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
               <Input 
                 placeholder="Search by Quote No or Client Name..." 
                 className="pl-9 max-w-sm"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
               />
             </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b">
                <tr>
                  <th className="px-4 py-3">Quote #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Selection Ref</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((q: any) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-blue-600">{q.quotation_number}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{q.selection?.inquiry?.client_name}</td>
                    <td className="px-4 py-3 text-gray-500">{q.selection?.selection_number}</td>
                    <td className="px-4 py-3 text-right font-bold">₹{q.grandTotal.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/quotations/${q.id}`)}>
                        <Eye className="h-4 w-4 text-gray-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}