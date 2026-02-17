import React, { useEffect, useState } from 'react';
import { 
  Clock, CheckCircle, AlertTriangle, FileText, 
  CalendarCheck, History, Coffee, Briefcase, Eye, User
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext'; // Import Auth Context
import api from '@/lib/api';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  checkIn: string;
  checkOut: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  reportTasks: string;
  reportWip?: string;
  reportPending?: string;
  reportIssues?: string;
  createdAt: string;
  user?: { // Optional, only present for admins
    name: string;
    role: string;
  };
}

const Attendance: React.FC = () => {
  const { toast } = useToast();
  const { role } = useAuth(); // Get the current user's role
  
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]); // Displays in table
  
  // Timer State
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');

  // Modal States
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [isReportViewOpen, setIsReportViewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AttendanceRecord | null>(null);

  const [reportData, setReportData] = useState({
    tasks: '',
    wip: '',
    issues: '',
    pending: ''
  });
  const [submitLoading, setSubmitLoading] = useState(false);

  // 1. Fetch Data based on Role
  const fetchData = async () => {
    try {
      setLoading(true);

      // A. Always fetch "Me" to get the current Timer/Switch status
      const myDataResponse = await api.get('/attendance/me');
      setTodayRecord(myDataResponse.data.today);

      // B. Decide which history to show in the table
      if (role === 'super_admin') {
        // Admin: Fetch EVERYONE'S history
        const allDataResponse = await api.get('/attendance/all');
        setHistory(allDataResponse.data);
      } else {
        // Employee: Fetch ONLY MY history
        setHistory(myDataResponse.data.history);
      }

    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to load attendance data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role]); // Re-run if role changes

  // 2. Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (todayRecord && todayRecord.status === 'ACTIVE') {
      interval = setInterval(() => {
        const start = new Date(todayRecord.checkIn).getTime();
        const now = new Date().getTime();
        const diff = now - start;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [todayRecord]);

  // 3. Handlers
  const handleToggle = async (checked: boolean) => {
    if (checked) {
        try {
            const { data } = await api.post('/attendance/check-in', {});
            setTodayRecord(data);
            toast({ title: 'Work Mode: ON', description: 'Your shift has started.', className: "bg-green-50 border-green-200 text-green-800" });
        } catch (error: any) {
            toast({ title: 'Error', description: error.response?.data?.error, variant: 'destructive' });
        }
    } else {
        setIsCheckOutOpen(true);
    }
  };

  const handleCheckOutSubmit = async () => {
    if (!reportData.tasks.trim()) {
      toast({ title: 'Report Incomplete', description: 'Please list the tasks completed today.', variant: 'destructive' });
      return;
    }
    try {
      setSubmitLoading(true);
      const { data } = await api.put('/attendance/check-out', reportData);
      setTodayRecord(data);
      setIsCheckOutOpen(false);
      fetchData(); // Refresh list to show the new completed record
      toast({ title: 'Shift Ended', description: 'Daily report submitted successfully.' });
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to submit report', variant: 'destructive' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openReportView = (record: AttendanceRecord) => {
    setSelectedReport(record);
    setIsReportViewOpen(true);
  };

  const isWorking = todayRecord?.status === 'ACTIVE';
  const isCompleted = todayRecord?.status === 'COMPLETED';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
            <p className="text-muted-foreground mt-1">
                {role === 'super_admin' ? 'Manage team attendance & reports.' : 'Manage your work status.'}
            </p>
          </div>
          <div className="bg-primary/5 px-4 py-2 rounded-lg border border-primary/10 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">
              {format(new Date(), 'EEEE, MMMM do, yyyy')}
            </span>
          </div>
        </div>

        {/* --- TOGGLE CARD (Everyone Sees This) --- */}
        <Card className={`shadow-lg border-2 transition-all duration-300 ${isWorking ? 'border-green-500/20 bg-green-50/10' : 'border-muted'}`}>
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col items-center justify-center space-y-6">
                
                <div className="text-center space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">My Status</h2>
                    <div className="text-4xl font-bold flex items-center gap-3 justify-center">
                        {isWorking ? (
                            <span className="text-green-600 flex items-center gap-2"><Briefcase className="h-8 w-8" /> Working</span>
                        ) : isCompleted ? (
                            <span className="text-blue-600 flex items-center gap-2"><CheckCircle className="h-8 w-8" /> Done</span>
                        ) : (
                            <span className="text-gray-400 flex items-center gap-2"><Coffee className="h-8 w-8" /> Offline</span>
                        )}
                    </div>
                </div>

                {!isCompleted && (
                    <div className="flex items-center gap-6 scale-125 py-4">
                        <span className={`text-sm font-medium ${!isWorking ? 'text-foreground' : 'text-muted-foreground'}`}>Offline</span>
                        <Switch 
                            checked={isWorking}
                            onCheckedChange={handleToggle}
                            className="data-[state=checked]:bg-green-600 h-10 w-20 [&>span]:h-9 [&>span]:w-9 [&>span]:translate-x-0.5 data-[state=checked]:[&>span]:translate-x-[42px]"
                        />
                        <span className={`text-sm font-medium ${isWorking ? 'text-green-700 font-bold' : 'text-muted-foreground'}`}>Online</span>
                    </div>
                )}

                {isWorking && (
                     <div className="bg-background/80 border px-8 py-4 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-bold text-muted-foreground mb-1 uppercase">Session Time</span>
                        <div className="text-4xl font-mono font-medium tracking-wider text-foreground">{elapsedTime}</div>
                    </div>
                )}
            </div>
          </CardContent>
        </Card>

        {/* --- HISTORY TABLE (Conditional) --- */}
        <div className="grid gap-4 mt-8">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                    {role === 'super_admin' ? 'All Employee Reports' : 'My Activity History'}
                </h3>
             </div>
             {role === 'super_admin' && (
                 <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    Admin View
                 </Badge>
             )}
           </div>
           
           <Card className="overflow-hidden border shadow-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-muted/50 text-muted-foreground font-medium uppercase text-xs">
                   <tr>
                     <th className="px-6 py-3">Date</th>
                     {/* Only Show Employee Column for Admin */}
                     {role === 'super_admin' && <th className="px-6 py-3">Employee</th>}
                     <th className="px-6 py-3">Session</th>
                     <th className="px-6 py-3">Report Content</th>
                     <th className="px-6 py-3">Status</th>
                     <th className="px-6 py-3 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                   {history.length === 0 ? (
                     <tr>
                       <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No records found.</td>
                     </tr>
                   ) : history.map((rec) => (
                     <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                       <td className="px-6 py-4 font-medium whitespace-nowrap">
                           {format(new Date(rec.createdAt), 'MMM dd, yyyy')}
                       </td>
                       
                       {/* Admin Column: Employee Name */}
                       {role === 'super_admin' && (
                           <td className="px-6 py-4">
                               <div className="flex items-center gap-2">
                                   <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                       {rec.user?.name?.charAt(0).toUpperCase() || <User className="h-4 w-4"/>}
                                   </div>
                                   <div>
                                       <div className="font-medium text-foreground">{rec.user?.name || 'Unknown'}</div>
                                       <div className="text-xs text-muted-foreground capitalize">{rec.user?.role?.replace('_', ' ')}</div>
                                   </div>
                               </div>
                           </td>
                       )}

                       <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col text-xs">
                                <span className="text-green-600 font-medium">IN: {format(new Date(rec.checkIn), 'h:mm a')}</span>
                                {rec.checkOut ? (
                                    <span className="text-red-600 font-medium">OUT: {format(new Date(rec.checkOut), 'h:mm a')}</span>
                                ) : (
                                    <span className="text-blue-500 animate-pulse">Active Now...</span>
                                )}
                            </div>
                       </td>
                       <td className="px-6 py-4">
                         {rec.reportTasks ? (
                           <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                             {rec.reportTasks}
                           </div>
                         ) : (
                           <span className="text-muted-foreground opacity-50 italic">No report yet</span>
                         )}
                       </td>
                       <td className="px-6 py-4">
                         <Badge variant="outline" className={
                             rec.status === 'ACTIVE' 
                             ? 'bg-green-50 text-green-700 border-green-200 animate-pulse' 
                             : 'bg-gray-100 text-gray-700 border-gray-200'
                         }>
                           {rec.status}
                         </Badge>
                       </td>
                       <td className="px-6 py-4 text-right">
                           {rec.reportTasks && (
                               <Button variant="ghost" size="sm" onClick={() => openReportView(rec)} className="h-8 w-8 p-0">
                                   <Eye className="h-4 w-4 text-primary" />
                               </Button>
                           )}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </Card>
        </div>

        {/* --- DIALOG: SUBMIT REPORT (Check Out) --- */}
        <Dialog open={isCheckOutOpen} onOpenChange={(o) => !o && setIsCheckOutOpen(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>End Shift Report</DialogTitle>
              <DialogDescription>Submit your daily summary to go offline.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>1. Tasks Completed <span className="text-red-500">*</span></Label>
                <Textarea 
                  placeholder="- Completed Quotation #101..." 
                  value={reportData.tasks} 
                  onChange={e => setReportData({...reportData, tasks: e.target.value})} 
                  className="min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>2. Work In Progress</Label>
                  <Textarea value={reportData.wip} onChange={e => setReportData({...reportData, wip: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>3. Plan for Tomorrow</Label>
                  <Textarea value={reportData.pending} onChange={e => setReportData({...reportData, pending: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>4. Issues (Optional)</Label>
                <Input value={reportData.issues} onChange={e => setReportData({...reportData, issues: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsCheckOutOpen(false)}>Cancel</Button>
              <Button onClick={handleCheckOutSubmit} disabled={submitLoading} variant="destructive">
                {submitLoading ? 'Submitting...' : 'End Shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- DIALOG: VIEW REPORT (Read Only) --- */}
        <Dialog open={isReportViewOpen} onOpenChange={setIsReportViewOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary"/>
                        Daily Report Details
                    </DialogTitle>
                    <DialogDescription>
                        Submitted by <span className="font-bold text-foreground">{selectedReport?.user?.name || 'You'}</span> on {selectedReport && format(new Date(selectedReport.createdAt), 'PPP')}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                    <div className="bg-muted/30 p-4 rounded-lg space-y-1">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground">Tasks Completed</h4>
                        <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportTasks}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-lg space-y-1">
                            <h4 className="text-xs font-bold uppercase text-blue-600">Work In Progress</h4>
                            <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportWip || 'N/A'}</p>
                        </div>
                        <div className="bg-green-50/50 p-4 rounded-lg space-y-1">
                            <h4 className="text-xs font-bold uppercase text-green-600">Plan for Tomorrow</h4>
                            <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportPending || 'N/A'}</p>
                        </div>
                    </div>

                    {selectedReport?.reportIssues && (
                        <div className="bg-red-50/50 p-4 rounded-lg space-y-1">
                             <h4 className="text-xs font-bold uppercase text-red-600">Issues / Blockers</h4>
                             <p className="text-sm text-red-800">{selectedReport.reportIssues}</p>
                        </div>
                    )}
                </div>
                
                <DialogFooter>
                    <Button onClick={() => setIsReportViewOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
};

export default Attendance;