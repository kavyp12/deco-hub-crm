import React, { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, ArrowLeft, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { format } from 'date-fns';

interface Log {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

const ActivityLogs = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/logs');
      setLogs(res.data);
    } catch (error) {
      console.error("Failed to fetch logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE': return 'bg-green-100 text-green-800 border-green-200';
      case 'UPDATE': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DELETE': return 'bg-red-100 text-red-800 border-red-200';
      case 'LOGIN': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredLogs = logs.filter(log => 
    (log.details?.toLowerCase() || '').includes(search.toLowerCase()) || 
    (log.entity?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (log.action?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (log.userId?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-6 w-6" /> Activity Logs
              </h1>
              <p className="text-sm text-gray-500">Super Admin Audit Trail</p>
            </div>
          </div>
          <div className="flex gap-3">
             <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input 
                    placeholder="Search logs..." 
                    className="pl-9 bg-gray-50" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
             </div>
             <Button variant="outline" onClick={fetchLogs}>
               <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
             </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-700 font-semibold border-b">
                <tr>
                  <th className="px-6 py-3 w-48">Timestamp</th>
                  <th className="px-6 py-3 w-32">Action</th>
                  <th className="px-6 py-3 w-32">Entity</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 w-40">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 font-bold text-gray-700">{log.entity}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {log.details}
                      {log.entityId && <span className="text-xs text-gray-400 block mt-1">ID: {log.entityId}</span>}
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs font-mono">
                      {log.userId}
                    </td>
                  </tr>
                ))}
                {!loading && filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      No activity logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ActivityLogs;