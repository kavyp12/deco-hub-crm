import React, { useEffect, useState, useRef } from 'react';
import { 
  Clock, CheckCircle, FileText, CalendarCheck, History, 
  Coffee, Briefcase, Eye, User, FileSpreadsheet, PauseCircle, PlayCircle, Save, AlertTriangle, TrendingUp, Users 
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  checkIn: string;
  checkOut: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'AUTO_CLOSED';
  workingHours?: number;
  totalBreakHours: number;
  isLate: boolean;
  draftTasks?: string;
  draftWip?: string;
  draftPending?: string;
  draftIssues?: string;
  reportTasks: string;
  reportWip?: string;
  reportPending?: string;
  reportIssues?: string;
  createdAt: string;
  user?: { name: string; role: string; };
}

interface LeaveBalance {
  casual: number;
  sick: number;
  paid: number;
}

export default function Attendance() {
  const { toast } = useToast();
  const { role } = useAuth();
  
  const isAdmin = role === 'super_admin' || role === 'admin_hr';
  
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balances, setBalances] = useState<LeaveBalance>({ casual: 0, sick: 0, paid: 0 });
  const [analytics, setAnalytics] = useState({ present: 0, absent: 0, late: 0, avgHours: 0 });
  
  // Timer State & Server Sync
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
  const [timeOffset, setTimeOffset] = useState<number>(0);

  // Modals
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [isReportViewOpen, setIsReportViewOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AttendanceRecord | null>(null);

  // Forms
  const [reportData, setReportData] = useState({ tasks: '', wip: '', issues: '', pending: '' });
  const [leaveData, setLeaveData] = useState({ type: 'Casual', startDate: '', endDate: '', reason: '' });
  const [correctionData, setCorrectionData] = useState({ date: '', requestedCheckIn: '', requestedCheckOut: '', reason: '' });
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  
  // Admin Filters
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Use refs to get latest values inside setInterval without re-triggering it constantly
  const todayRecordRef = useRef(todayRecord);
  const timeOffsetRef = useRef(timeOffset);

  useEffect(() => {
    todayRecordRef.current = todayRecord;
  }, [todayRecord]);

  useEffect(() => {
    timeOffsetRef.current = timeOffset;
  }, [timeOffset]);

  const formatBreakTime = (decimalHours: number | undefined | null) => {
    if (!decimalHours) return '00:00:00';
    
    // Convert the decimal hours into total exact seconds
    const totalSeconds = Math.floor(decimalHours * 3600);
    
    // Break it down into Hours, Minutes, and Seconds
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

  const fetchData = async () => {
    try {
      setLoading(true);

      const myDataResponse = await api.get('/attendance/me');
      const today = myDataResponse.data.today;
      setTodayRecord(today);
      
      // Calculate server clock drift to prevent negative timer
      if (myDataResponse.data.serverTime) {
         const serverNow = new Date(myDataResponse.data.serverTime).getTime();
         const localNow = new Date().getTime();
         setTimeOffset(serverNow - localNow);
      }
      
      // Load Drafts into form if they exist
      if (today && (today.status === 'ACTIVE' || today.status === 'PAUSED')) {
         setReportData({
             tasks: today.draftTasks || '',
             wip: today.draftWip || '',
             issues: today.draftIssues || '',
             pending: today.draftPending || ''
         });
      }

      if (isAdmin) {
        const teamDataResponse = await api.get(`/attendance/team?date=${filterDate}&status=${filterStatus}`);
        setHistory(teamDataResponse.data);
        
        const analyticsRes = await api.get('/attendance/analytics');
        setAnalytics(analyticsRes.data);
      } else {
        setHistory(myDataResponse.data.history);
      }

      const leavesResponse = await api.get('/leaves');
      setLeaves(leavesResponse.data);

      const balancesResponse = await api.get('/leaves/balances');
      if (balancesResponse.data) setBalances(balancesResponse.data);

    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role, filterDate, filterStatus]);

  // Timer Logic (Accounts for Breaks & Server Sync)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const updateTime = () => {
        const record = todayRecordRef.current;
        if (!record) return;
        
        const start = new Date(record.checkIn).getTime();
        // Sync local time with server time
        const syncedNow = new Date().getTime() + timeOffsetRef.current;
        
        // Subtract total break hours from elapsed time
        const breakMs = (record.totalBreakHours || 0) * 60 * 60 * 1000;
        
        // Prevent negative time display
        const diff = Math.max(0, syncedNow - start - breakMs);
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    if (todayRecord?.status === 'ACTIVE') {
      updateTime(); // initial call
      interval = setInterval(updateTime, 1000);
    } else if (todayRecord?.status === 'PAUSED') {
       // Stop ticking but show exact time up to the pause
       updateTime();
    }
    
    return () => clearInterval(interval);
  }, [todayRecord?.status]); // Only re-run interval setup if status changes

  // --- ACTIONS ---

  const handleToggle = async (checked: boolean) => {
    if (checked) {
        try {
            const { data } = await api.post('/attendance/check-in', {});
            setTodayRecord(data);
            toast({ title: 'Work Mode: ON', description: 'Your shift has started.', className: "bg-green-50 text-green-800" });
            fetchData();
        } catch (error: any) {
            toast({ title: 'Error', description: error.response?.data?.error || 'Check-in failed', variant: 'destructive' });
        }
    } else {
        setIsCheckOutOpen(true);
    }
  };

  const handlePauseResume = async () => {
      try {
          if (todayRecord?.status === 'ACTIVE') {
              const { data } = await api.post('/attendance/pause');
              setTodayRecord(data);
              toast({ title: 'Break Started', description: 'Your timer is paused.' });
          } else {
              const { data } = await api.post('/attendance/resume');
              setTodayRecord(data);
              toast({ title: 'Welcome Back', description: 'Your timer is running.' });
          }
      } catch (error) {
          toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
      }
  };

  const handleSaveDraft = async () => {
     try {
         setDraftLoading(true);
         await api.put('/attendance/draft', reportData);
         toast({ title: 'Draft Saved', description: 'You can complete your checkout later.' });
     } catch(e) {
         toast({ title: 'Error', description: 'Failed to save draft', variant: 'destructive' });
     } finally {
         setDraftLoading(false);
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
      fetchData(); 
      toast({ title: 'Shift Ended', description: 'Daily report submitted successfully.' });
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to submit report', variant: 'destructive' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleApplyLeave = async () => {
    try {
      await api.post('/leaves', leaveData);
      setIsLeaveModalOpen(false);
      fetchData();
      toast({ title: 'Success', description: 'Leave application submitted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to apply for leave', variant: 'destructive' });
    }
  };
  
  const handleSubmitCorrection = async () => {
      try {
          await api.post('/attendance/correction', correctionData);
          setIsCorrectionModalOpen(false);
          toast({ title: 'Submitted', description: 'Time correction request sent to Admin.' });
      } catch (e) {
          toast({ title: 'Error', description: 'Failed to submit correction', variant: 'destructive' });
      }
  };

  const updateLeaveStatus = async (id: string, newStatus: string) => {
    try {
      await api.put(`/leaves/${id}/status`, { status: newStatus });
      fetchData();
      toast({ title: 'Leave Updated', description: `Leave marked as ${newStatus}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update leave', variant: 'destructive' });
    }
  };

  const openReportView = (record: AttendanceRecord) => {
    setSelectedReport(record);
    setIsReportViewOpen(true);
  };

  const exportExcel = async () => {
    try {
      const response = await api.get('/attendance/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Attendance_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: 'Export Failed', description: 'Could not download the Excel file.', variant: 'destructive' });
    }
  };

  const isWorking = todayRecord?.status === 'ACTIVE';
  const isPaused = todayRecord?.status === 'PAUSED';
  const isCompleted = todayRecord?.status === 'COMPLETED';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">HR & Attendance</h1>
            <p className="text-muted-foreground mt-1">
                {isAdmin ? 'Manage team attendance, reports, and leaves.' : 'Manage your work status and leaves.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="bg-primary/5 px-4 py-2 rounded-lg border border-primary/10 flex items-center gap-2">
               <CalendarCheck className="h-5 w-5 text-primary" />
               <span className="font-semibold text-foreground">
                 {format(new Date(), 'EEEE, MMMM do, yyyy')}
               </span>
             </div>
             {isAdmin && (
                <Button onClick={exportExcel} variant="outline" className="gap-2 border-green-200 text-green-700 hover:bg-green-50">
                   <FileSpreadsheet className="h-4 w-4" /> Export Excel
                </Button>
             )}
          </div>
        </div>

        <Tabs defaultValue={isAdmin ? "team" : "my-space"} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
            <TabsTrigger value="my-space">My Space</TabsTrigger>
            {isAdmin && <TabsTrigger value="team">Team Dashboard</TabsTrigger>}
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
          </TabsList>

          {/* TAB 1: MY SPACE */}
          <TabsContent value="my-space" className="space-y-6">
            <Card className={`shadow-lg border-2 transition-all duration-300 ${isWorking ? 'border-green-500/20 bg-green-50/10' : isPaused ? 'border-amber-500/20 bg-amber-50/10' : 'border-muted'}`}>
              <CardContent className="p-8 md:p-10 relative">
                  
                {/* Correction Button Top Right */}
                <Button onClick={() => setIsCorrectionModalOpen(true)} variant="ghost" size="sm" className="absolute top-4 right-4 text-muted-foreground hover:text-primary">
                    <History className="h-4 w-4 mr-2"/> Request Correction
                </Button>

                <div className="flex flex-col items-center justify-center space-y-6">
                    <div className="text-center space-y-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">My Status</h2>
                        <div className="text-4xl font-bold flex items-center gap-3 justify-center">
                            {isWorking ? (
                                <span className="text-green-600 flex items-center gap-2"><Briefcase className="h-8 w-8" /> Working</span>
                            ) : isPaused ? (
                                <span className="text-amber-600 flex items-center gap-2"><Coffee className="h-8 w-8" /> On Break</span>
                            ) : isCompleted ? (
                                <span className="text-blue-600 flex items-center gap-2"><CheckCircle className="h-8 w-8" /> Done</span>
                            ) : (
                                <span className="text-gray-400 flex items-center gap-2"><Clock className="h-8 w-8" /> Offline</span>
                            )}
                        </div>
                    </div>

                    {!isCompleted && (
                        <div className="flex items-center gap-6 scale-125 py-4">
                            <span className={`text-sm font-medium ${!isWorking && !isPaused ? 'text-foreground' : 'text-muted-foreground'}`}>Offline</span>
                            <Switch 
                                checked={isWorking || isPaused}
                                onCheckedChange={handleToggle}
                                className="data-[state=checked]:bg-green-600 h-10 w-20 [&>span]:h-9 [&>span]:w-9 [&>span]:translate-x-0.5 data-[state=checked]:[&>span]:translate-x-[42px]"
                            />
                            <span className={`text-sm font-medium ${isWorking || isPaused ? 'text-green-700 font-bold' : 'text-muted-foreground'}`}>Online</span>
                        </div>
                    )}

                    {(isWorking || isPaused) && (
                         <div className="flex flex-col items-center gap-4">
                            <div className="bg-background/80 border px-8 py-4 rounded-xl flex flex-col items-center shadow-sm">
                                <span className="text-[10px] font-bold text-muted-foreground mb-1 uppercase">Net Session Time</span>
                                <div className={`text-4xl font-mono font-medium tracking-wider ${isPaused ? 'text-amber-600' : 'text-foreground'}`}>{elapsedTime}</div>
                            </div>
                            
                            <Button 
                                onClick={handlePauseResume} 
                                variant={isPaused ? "default" : "secondary"} 
                                className={`gap-2 ${isPaused ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                            >
                                {isPaused ? <PlayCircle className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
                                {isPaused ? 'Resume Shift' : 'Take a Break'}
                            </Button>
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {!isAdmin && (
               <Card>
                 <CardHeader>
                   <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-muted-foreground"/> My Activity History</CardTitle>
                 </CardHeader>
                 <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="bg-muted/50 text-muted-foreground font-medium uppercase text-xs">
                       <tr>
                         <th className="px-6 py-3">Date</th>
                         <th className="px-6 py-3">Session</th>
                         <th className="px-6 py-3">Breaks</th>
                         <th className="px-6 py-3">Net Hours</th>
                         <th className="px-6 py-3 text-center">Status</th>
                         <th className="px-6 py-3 text-right">Report</th>
                       </tr>
                     </thead>
                    <tbody className="divide-y divide-border">
  {history.length === 0 ? (
    <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No records found.</td></tr>
  ) : history.map((rec) => (
    <tr key={rec.id} className="hover:bg-muted/30">
      <td className="px-6 py-4 font-medium whitespace-nowrap">
          {format(new Date(rec.createdAt), 'MMM dd, yyyy')}
          {rec.isLate && <Badge variant="destructive" className="ml-2 text-[10px]">Late</Badge>}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
           <div className="flex flex-col text-xs">
               <span className="text-green-600 font-medium">IN: {format(new Date(rec.checkIn), 'h:mm a')}</span>
               {rec.checkOut && <span className="text-red-600 font-medium">OUT: {format(new Date(rec.checkOut), 'h:mm a')}</span>}
           </div>
      </td>
      
      {/* THIS IS THE UPDATED BREAK TIME CELL */}
      <td className="px-6 py-4 text-xs font-mono text-amber-600 font-medium">
          {rec.totalBreakHours ? formatBreakTime(rec.totalBreakHours) : '-'}
      </td>
      
      <td className="px-6 py-4 font-mono font-medium">{rec.workingHours ? `${rec.workingHours.toFixed(2)}h` : '-'}</td>
      <td className="px-6 py-4 text-center">
          <Badge variant={rec.status === 'AUTO_CLOSED' ? 'destructive' : 'outline'}>{rec.status}</Badge>
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
            )}
          </TabsContent>

          {/* TAB 2: TEAM DASHBOARD (ADMIN ONLY) */}
          {isAdmin && (
            <TabsContent value="team" className="space-y-6">
                
              {/* Analytics Top Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4 flex items-center justify-between">
                          <div>
                              <p className="text-sm font-medium text-muted-foreground">Total Present</p>
                              <h3 className="text-2xl font-bold">{analytics.present}</h3>
                          </div>
                          <Users className="h-8 w-8 text-primary opacity-50"/>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-4 flex items-center justify-between">
                          <div>
                              <p className="text-sm font-medium text-muted-foreground">Absent</p>
                              <h3 className="text-2xl font-bold text-red-500">{analytics.absent}</h3>
                          </div>
                          <AlertTriangle className="h-8 w-8 text-red-500 opacity-50"/>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-4 flex items-center justify-between">
                          <div>
                              <p className="text-sm font-medium text-muted-foreground">Late Check-ins</p>
                              <h3 className="text-2xl font-bold text-amber-500">{analytics.late}</h3>
                          </div>
                          <Clock className="h-8 w-8 text-amber-500 opacity-50"/>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-4 flex items-center justify-between">
                          <div>
                              <p className="text-sm font-medium text-muted-foreground">Avg Net Hours</p>
                              <h3 className="text-2xl font-bold text-blue-500">{analytics.avgHours}</h3>
                          </div>
                          <TrendingUp className="h-8 w-8 text-blue-500 opacity-50"/>
                      </CardContent>
                  </Card>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                 <div className="w-full md:w-1/3 space-y-1">
                   <Label>Date Filter</Label>
                   <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                 </div>
                 <div className="w-full md:w-1/3 space-y-1">
                   <Label>Status</Label>
                   <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                     <option value="ALL">All Status</option>
                     <option value="ACTIVE">Currently Working</option>
                     <option value="PAUSED">On Break</option>
                     <option value="COMPLETED">Shift Completed</option>
                   </select>
                 </div>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3">Employee</th>
                        <th className="px-6 py-3">In/Out Times</th>
                        <th className="px-6 py-3 text-center">Break Time</th>
                        <th className="px-6 py-3 text-center">Net Hours</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Daily Report</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.length === 0 ? (
                         <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No records found for this date.</td></tr>
                       ) : history.map((rec) => (
                        <tr key={rec.id} className="hover:bg-muted/30">
                           <td className="px-6 py-4">
                               <div className="flex items-center gap-2">
                                   <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                       {rec.user?.name?.charAt(0).toUpperCase() || <User className="h-4 w-4"/>}
                                   </div>
                                   <div>
                                       <div className="font-medium text-foreground flex items-center gap-2">
                                           {rec.user?.name || 'Unknown'}
                                           {rec.isLate && <Badge variant="destructive" className="h-4 text-[9px] px-1">LATE</Badge>}
                                        </div>
                                       <div className="text-[10px] text-muted-foreground uppercase">{rec.user?.role?.replace('_', ' ')}</div>
                                   </div>
                               </div>
                           </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs">
                             <div className="text-green-600 font-medium">IN: {format(new Date(rec.checkIn), 'h:mm a')}</div>
                             {rec.checkOut ? (
                                <div className="text-red-600 font-medium">OUT: {format(new Date(rec.checkOut), 'h:mm a')}</div>
                             ) : (
                                <div className="text-blue-500 animate-pulse mt-1">Shift Active</div>
                             )}
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-xs">{rec.totalBreakHours ? `${rec.totalBreakHours.toFixed(1)}h` : '-'}</td>
                          <td className="px-6 py-4 text-center font-mono font-medium">{rec.workingHours ? `${rec.workingHours.toFixed(1)}h` : '-'}</td>
                          <td className="px-6 py-4">
                             <Badge variant="outline" className={
                                 rec.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 
                                 rec.status === 'PAUSED' ? 'bg-amber-50 text-amber-700' :
                                 rec.status === 'AUTO_CLOSED' ? 'bg-red-50 text-red-700' : ''
                              }>
                               {rec.status}
                             </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {rec.reportTasks ? (
                              <Button variant="ghost" size="sm" onClick={() => openReportView(rec)}><Eye className="h-4 w-4 text-primary"/></Button>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}

          {/* TAB 3: LEAVES & BALANCES */}
          <TabsContent value="leaves" className="space-y-6">
            
            {!isAdmin && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <Card className="bg-blue-50/50 border-blue-100">
                        <CardContent className="p-4 text-center">
                            <h4 className="text-xs font-bold text-blue-600 uppercase">Casual Leaves</h4>
                            <p className="text-3xl font-black text-blue-900 mt-2">{balances.casual}</p>
                            <span className="text-xs text-blue-500">Remaining</span>
                        </CardContent>
                    </Card>
                    <Card className="bg-orange-50/50 border-orange-100">
                        <CardContent className="p-4 text-center">
                            <h4 className="text-xs font-bold text-orange-600 uppercase">Sick Leaves</h4>
                            <p className="text-3xl font-black text-orange-900 mt-2">{balances.sick}</p>
                            <span className="text-xs text-orange-500">Remaining</span>
                        </CardContent>
                    </Card>
                    <Card className="bg-green-50/50 border-green-100">
                        <CardContent className="p-4 text-center">
                            <h4 className="text-xs font-bold text-green-600 uppercase">Paid/Vacation</h4>
                            <p className="text-3xl font-black text-green-900 mt-2">{balances.paid}</p>
                            <span className="text-xs text-green-500">Remaining</span>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex justify-between items-center">
               <h3 className="text-lg font-semibold text-muted-foreground">Leave Requests</h3>
               <Button onClick={() => setIsLeaveModalOpen(true)}>Apply for Leave</Button>
            </div>
            
            <Card>
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    {isAdmin && <th className="px-6 py-3">Employee</th>}
                    <th className="px-6 py-3">Leave Type</th>
                    <th className="px-6 py-3">Duration</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3">Status</th>
                    {isAdmin && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                   {leaves.length === 0 ? (
                         <tr><td colSpan={isAdmin ? 6 : 5} className="px-6 py-8 text-center text-muted-foreground">No leave history.</td></tr>
                    ) : leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      {isAdmin && <td className="px-6 py-4 font-medium">{l.user?.name}</td>}
                      <td className="px-6 py-4 font-medium">{l.type}</td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">
                        <div className="font-medium text-foreground">{format(new Date(l.startDate), 'MMM dd')} - {format(new Date(l.endDate), 'MMM dd')}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground max-w-[200px] truncate" title={l.reason}>{l.reason}</td>
                      <td className="px-6 py-4">
                         <Badge variant={l.status === 'APPROVED' ? 'default' : l.status === 'REJECTED' ? 'destructive' : 'outline'}>{l.status}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                           {l.status === 'PENDING' ? (
                             <>
                              <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-200" onClick={() => updateLeaveStatus(l.id, 'APPROVED')}>Approve</Button>
                              <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200" onClick={() => updateLeaveStatus(l.id, 'REJECTED')}>Reject</Button>
                             </>
                           ) : (
                               <span className="text-xs text-muted-foreground">Reviewed</span>
                           )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>

        {/* --- DIALOG: SUBMIT / DRAFT REPORT (Check Out) --- */}
        <Dialog open={isCheckOutOpen} onOpenChange={(o) => !o && setIsCheckOutOpen(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>End Shift / Daily Report</DialogTitle>
              <DialogDescription>Save a draft to continue later, or submit to end your shift.</DialogDescription>
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
                <Label>4. Issues / Blockers (Optional)</Label>
                <Input value={reportData.issues} onChange={e => setReportData({...reportData, issues: e.target.value})} />
              </div>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between w-full">
              <Button variant="outline" onClick={handleSaveDraft} disabled={draftLoading}>
                  <Save className="h-4 w-4 mr-2" /> {draftLoading ? 'Saving...' : 'Save Draft'}
              </Button>
              <div className="space-x-2">
                  <Button variant="ghost" onClick={() => setIsCheckOutOpen(false)}>Cancel</Button>
                  <Button onClick={handleCheckOutSubmit} disabled={submitLoading || draftLoading} variant="destructive">
                    {submitLoading ? 'Submitting...' : 'End Shift'}
                  </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- DIALOG: TIME CORRECTION --- */}
        <Dialog open={isCorrectionModalOpen} onOpenChange={setIsCorrectionModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Time Correction Request</DialogTitle>
                    <DialogDescription>Forgot to check-in/out? Submit a request to HR.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Date of missing punch</Label>
                        <Input type="date" value={correctionData.date} onChange={e => setCorrectionData({...correctionData, date: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Requested In Time (Optional)</Label>
                            <Input type="datetime-local" value={correctionData.requestedCheckIn} onChange={e => setCorrectionData({...correctionData, requestedCheckIn: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>Requested Out Time (Optional)</Label>
                            <Input type="datetime-local" value={correctionData.requestedCheckOut} onChange={e => setCorrectionData({...correctionData, requestedCheckOut: e.target.value})} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Reason <span className="text-red-500">*</span></Label>
                        <Textarea placeholder="E.g., System was down, forgot to click checkout..." value={correctionData.reason} onChange={e => setCorrectionData({...correctionData, reason: e.target.value})} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsCorrectionModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitCorrection} disabled={!correctionData.date || !correctionData.reason}>Submit Request</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* --- DIALOG: VIEW REPORT (Read Only) --- */}
        <Dialog open={isReportViewOpen} onOpenChange={setIsReportViewOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary"/> Daily Report Details
                    </DialogTitle>
                    <DialogDescription>
                        Submitted by <span className="font-bold text-foreground">{selectedReport?.user?.name || 'You'}</span> on {selectedReport && format(new Date(selectedReport.createdAt), 'PPP')}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                    <div className="bg-muted/30 p-4 rounded-lg space-y-1 border">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground">Tasks Completed</h4>
                        <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportTasks}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-lg space-y-1 border border-blue-100">
                            <h4 className="text-xs font-bold uppercase text-blue-600">Work In Progress</h4>
                            <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportWip || 'N/A'}</p>
                        </div>
                        <div className="bg-green-50/50 p-4 rounded-lg space-y-1 border border-green-100">
                            <h4 className="text-xs font-bold uppercase text-green-600">Plan for Tomorrow</h4>
                            <p className="text-sm whitespace-pre-wrap">{selectedReport?.reportPending || 'N/A'}</p>
                        </div>
                    </div>
                    {selectedReport?.reportIssues && (
                        <div className="bg-red-50/50 p-4 rounded-lg space-y-1 border border-red-100">
                             <h4 className="text-xs font-bold uppercase text-red-600">Issues / Blockers</h4>
                             <p className="text-sm text-red-800">{selectedReport.reportIssues}</p>
                        </div>
                    )}
                </div>
                <DialogFooter><Button onClick={() => setIsReportViewOpen(false)}>Close</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        {/* --- DIALOG: LEAVE APPLICATION --- */}
        <Dialog open={isLeaveModalOpen} onOpenChange={setIsLeaveModalOpen}>
          <DialogContent>
            <DialogHeader>
                <DialogTitle>Apply for Leave</DialogTitle>
                <DialogDescription>Submit your leave request to HR/Admin for approval.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm" 
                        value={leaveData.type} onChange={e => setLeaveData({...leaveData, type: e.target.value})}>
                  <option value="Casual">Casual</option>
                  <option value="Sick">Sick</option>
                  <option value="Paid">Paid / Vacation</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={leaveData.startDate} onChange={e => setLeaveData({...leaveData, startDate: e.target.value})}/>
                </div>
                <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={leaveData.endDate} onChange={e => setLeaveData({...leaveData, endDate: e.target.value})}/>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason for Leave</Label>
                <Textarea value={leaveData.reason} onChange={e => setLeaveData({...leaveData, reason: e.target.value})} placeholder="Please provide brief details..." />
              </div>
            </div>
            <DialogFooter>
               <Button variant="ghost" onClick={() => setIsLeaveModalOpen(false)}>Cancel</Button>
               <Button onClick={handleApplyLeave} disabled={!leaveData.startDate || !leaveData.endDate || !leaveData.reason}>Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}