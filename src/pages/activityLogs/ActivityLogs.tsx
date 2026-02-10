import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, RefreshCw, ArrowLeft, Search, Download, 
  Filter, Calendar, FileSpreadsheet, User as UserIcon,
  LayoutList, CheckCircle2, AlertCircle, Trash2, PlusCircle,
  Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import api from '@/lib/api';
import { format } from 'date-fns';
import * as xlsx from 'xlsx';

interface Log {
  id: string;
  userId: string;
  userName?: string; // We will map this on frontend if needed, or backend
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
  
  // Filters
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterEntity, setFilterEntity] = useState('ALL');

  const navigate = useNavigate();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // We will now hit the standard logs endpoint
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

  // --- EXPORT FUNCTIONALITY ---
  const handleExport = async () => {
    try {
      // Option A: Client-side export of current view
      // Option B: Hit the backend export route (Recommended for full data)
      const response = await api.get('/logs/export', { responseType: 'blob' });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Activity_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to download report");
    }
  };

  // --- UI HELPERS ---
  const getActionIcon = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE': return <PlusCircle className="h-4 w-4 text-green-600" />;
      case 'UPDATE': return <RefreshCw className="h-4 w-4 text-blue-600" />;
      case 'DELETE': return <Trash2 className="h-4 w-4 text-red-600" />;
      case 'LOGIN': return <UserIcon className="h-4 w-4 text-purple-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE': return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100';
      case 'UPDATE': return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
      case 'DELETE': return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
      case 'LOGIN': return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Filter Logic
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.details?.toLowerCase() || '').includes(search.toLowerCase()) || 
      (log.entity?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (log.userId?.toLowerCase() || '').includes(search.toLowerCase());
    
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    const matchesEntity = filterEntity === 'ALL' || log.entity === filterEntity;

    return matchesSearch && matchesAction && matchesEntity;
  });

  // Stats for the "Ribbon"
  const stats = {
    total: filteredLogs.length,
    creates: filteredLogs.filter(l => l.action === 'CREATE').length,
    updates: filteredLogs.filter(l => l.action === 'UPDATE').length,
    deletes: filteredLogs.filter(l => l.action === 'DELETE').length,
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50/50">
        
        {/* Top Header Area */}
        <div className="bg-white border-b px-8 py-5 flex flex-col gap-4 shadow-sm z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-slate-100">
                <ArrowLeft className="h-5 w-5 text-slate-500" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                  <ShieldAlert className="h-6 w-6 text-red-600" /> Audit Trail
                </h1>
                <p className="text-sm text-slate-500">Track system security and user activities</p>
              </div>
            </div>
            <div className="flex gap-2">
               <Button variant="outline" onClick={fetchLogs} className="border-slate-300">
                 <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Sync
               </Button>
               <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white shadow-sm">
                 <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Report
               </Button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
             <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Search logs..." 
                    className="pl-9 bg-white border-slate-200" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
             </div>
             
             <div className="h-8 w-[1px] bg-slate-300 mx-1"></div>

             <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-[140px] bg-white border-slate-200">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-slate-500" />
                    <SelectValue placeholder="Action" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                </SelectContent>
             </Select>

             <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger className="w-[140px] bg-white border-slate-200">
                  <div className="flex items-center gap-2">
                    <LayoutList className="h-3.5 w-3.5 text-slate-500" />
                    <SelectValue placeholder="Entity" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Entities</SelectItem>
                  <SelectItem value="INQUIRY">Inquiry</SelectItem>
                  <SelectItem value="QUOTATION">Quotation</SelectItem>
                  <SelectItem value="SELECTION">Selection</SelectItem>
                  <SelectItem value="PRODUCT">Product</SelectItem>
                  <SelectItem value="AUTH">Auth</SelectItem>
                </SelectContent>
             </Select>
          </div>
        </div>

        {/* Stats Summary (Optional Ribbon) */}
        <div className="grid grid-cols-4 gap-4 px-8 py-4">
           <Card className="shadow-sm border-slate-200 bg-white">
              <CardContent className="p-4 flex items-center justify-between">
                 <div className="text-sm font-medium text-slate-500">Total Activities</div>
                 <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
              </CardContent>
           </Card>
           <Card className="shadow-sm border-green-100 bg-green-50/50">
              <CardContent className="p-4 flex items-center justify-between">
                 <div className="text-sm font-medium text-green-600">Creations</div>
                 <div className="text-2xl font-bold text-green-700">{stats.creates}</div>
              </CardContent>
           </Card>
           <Card className="shadow-sm border-blue-100 bg-blue-50/50">
              <CardContent className="p-4 flex items-center justify-between">
                 <div className="text-sm font-medium text-blue-600">Updates</div>
                 <div className="text-2xl font-bold text-blue-700">{stats.updates}</div>
              </CardContent>
           </Card>
           <Card className="shadow-sm border-red-100 bg-red-50/50">
              <CardContent className="p-4 flex items-center justify-between">
                 <div className="text-sm font-medium text-red-600">Deletions</div>
                 <div className="text-2xl font-bold text-red-700">{stats.deletes}</div>
              </CardContent>
           </Card>
        </div>

        {/* Main Table */}
        <div className="flex-1 overflow-auto px-8 pb-8">
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                  <TableHead className="w-[150px]">Entity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-slate-50 group">
                    <TableCell className="text-xs font-mono text-slate-500 whitespace-nowrap">
                      {format(new Date(log.createdAt), 'dd MMM yyyy')}
                      <span className="block text-slate-400">{format(new Date(log.createdAt), 'HH:mm:ss')}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`flex w-fit items-center gap-1.5 pl-1.5 pr-2.5 py-0.5 ${getActionBadge(log.action)}`}>
                        {getActionIcon(log.action)}
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded">
                        {log.entity}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {log.details}
                      {log.entityId && (
                         <span className="text-[10px] text-slate-400 font-mono ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           ID: {log.entityId}
                         </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                           {/* Frontend assumes userId is name or ID, ideally backend sends 'userName' */}
                           {log.userId.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-mono truncate max-w-[120px]" title={log.userId}>
                            {/* If the API sends user name, display it, else ID */}
                            {log.userName || log.userId}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Search className="h-8 w-8 mb-2 opacity-50" />
                        <p>No activity logs found matching your filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ActivityLogs;