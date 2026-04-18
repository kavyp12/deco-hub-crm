// [FILE: src/pages/Pipeline.tsx]
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  MessageSquare, CheckSquare, Plus, Activity, Search, 
  X, AlignLeft, Image as ImageIcon, Check, Pencil, Monitor, FileText, IndianRupee,
  MoreHorizontal, PlusCircle, Trash2, Clock, ClipboardList,Filter
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

// --- TYPES ---
interface Task {
  id: string;
  inquiry_number: string;
  client_name: string;
  stage: string;
  updated_at: string;
  
  sales_person?: { id: string, name: string }; 
  sales_persons?: { id: string, name: string }[]; 

  comments?: Comment[];
  checklists?: Checklist[];
  labels?: Label[];
  description?: string;

  selections?: {
    id: string; 
    selection_number: string; 
    status: string; 
    quotations: {
      quotation_number: string;
      grandTotal: number;
      stage: string;
    }[]
  }[];
}

interface Comment {
  id: string;
  content: string;
  attachmentUrl?: string;
  createdAt: string;
  user: { name: string };
}

interface Label {
  id: string;
  text: string;
  color: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface AppUser { id: string; name: string; role: string; }

interface ColumnDef {
  id: string;
  title: string;
  color: string;
  isSystem?: boolean; 
}

// --- CONSTANTS ---
const LABEL_COLORS = [
  'bg-green-600', 'bg-yellow-500', 'bg-orange-500', 
  'bg-red-600', 'bg-purple-600', 'bg-blue-600',
  'bg-sky-500', 'bg-lime-600', 'bg-pink-500', 'bg-slate-500'
];

// ✅ CORRECTED PERMANENT COLUMNS (Only the 4 you requested)
const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "Inquiry", title: "Inquiry", color: "border-t-4 border-blue-500", isSystem: true },
  { id: "Quotation Submitted", title: "Quotation Submitted", color: "border-t-4 border-purple-500", isSystem: true },
  { id: "Ongoing Projects", title: "On Going Projects", color: "border-t-4 border-yellow-500", isSystem: true },
  { id: "Completed", title: "Completed", color: "border-t-4 border-green-500", isSystem: true },
  { id: "Complaints", title: "Complaints", color: "border-t-4 border-red-500", isSystem: true },
];

const COLORS_LIST = [
  "border-gray-500", "border-red-500", "border-orange-500", "border-amber-500",
  "border-yellow-500", "border-lime-500", "border-green-500", "border-emerald-500",
  "border-teal-500", "border-cyan-500", "border-sky-500", "border-blue-500",
  "border-indigo-500", "border-violet-500", "border-purple-500", "border-fuchsia-500",
  "border-pink-500", "border-rose-500"
];

const STATUS_LABELS: Record<string, string> = {
  contacted:         '📞 Contacted',
  follow_up:         '🔄 Follow-up',
  meeting_scheduled: '📅 Meeting Scheduled',
  proposal_sent:     '📄 Proposal Sent',
  negotiation:       '🤝 Negotiation',
  closed_won:        '✅ Closed Won',
  closed_lost:       '❌ Closed Lost',
  no_response:       '🔇 No Response',
  on_hold:           '⏸️ On Hold',
};

const STATUS_COLORS: Record<string, string> = {
  contacted:         'bg-blue-100 text-blue-700 border-blue-200',
  follow_up:         'bg-yellow-100 text-yellow-700 border-yellow-200',
  meeting_scheduled: 'bg-purple-100 text-purple-700 border-purple-200',
  proposal_sent:     'bg-indigo-100 text-indigo-700 border-indigo-200',
  negotiation:       'bg-orange-100 text-orange-700 border-orange-200',
  closed_won:        'bg-green-100 text-green-700 border-green-200',
  closed_lost:       'bg-red-100 text-red-700 border-red-200',
  no_response:       'bg-gray-100 text-gray-600 border-gray-200',
  on_hold:           'bg-slate-100 text-slate-600 border-slate-200',
};

// --- HELPER: Consistent Member Colors ---
const getMemberColor = (name: string) => {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 
    'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 
    'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 
    'bg-pink-500', 'bg-rose-500'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : '??';

const getFileUrl = (path: string | undefined) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = api.defaults.baseURL || '';
    const rootUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
    return `${rootUrl}${path}`;
};

const Pipeline: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const currentUser = profile; // logged-in user (has id & name)
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // --- COLUMN MANAGEMENT STATE ---
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  
  // --- QUICK CREATE CARD STATE ---
  const [addingCardToColumn, setAddingCardToColumn] = useState<string | null>(null);
  const [insertAfterTaskId, setInsertAfterTaskId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardAssignees, setNewCardAssignees] = useState<string[]>([]);
  // Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Label State
  const [labelSearch, setLabelSearch] = useState('');
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelTitle, setNewLabelTitle] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState('bg-green-600');

  // Comment State
  const [newComment, setNewComment] = useState('');
  const [commentAttachment, setCommentAttachment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Checklist State
  const [newChecklistTitle, setNewChecklistTitle] = useState('Checklist');
  const [newItemText, setNewItemText] = useState('');
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  
  // Description Edit State
  const [description, setDescription] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resizable Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(350); 
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Timeline State
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);


// --- FILTER STATE ---
const [filterUser, setFilterUser] = useState<string>('all');
const [filterLabel, setFilterLabel] = useState<string>('all');
const [filterDate, setFilterDate] = useState<string>('');
const [filterStage, setFilterStage] = useState<string>('all');
const [filterSearch, setFilterSearch] = useState<string>(''); // unified with search
const [isFilterOpen, setIsFilterOpen] = useState(false); // controls fixed panel

const [filterActivity, setFilterActivity] = useState<string>('all');
const [filterChecklist, setFilterChecklist] = useState<string>('all');


  useEffect(() => {
    fetchPipeline();
    fetchUsers();
  }, []);


  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents the card modal from opening when you click the trash icon
    if (!confirm('Are you sure you want to delete this card?')) return;
    
    try {
      await api.delete(`/inquiries/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast({ title: "Deleted", description: "Card deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete card", variant: "destructive" });
    }
  };


  const fetchPipeline = async () => {
    try {
      const { data } = await api.get('/pipeline');
      setTasks(data);
      
      // Auto-discover extra stages from DB that aren't in our default list
      const systemIds = new Set(DEFAULT_COLUMNS.map(c => c.id));
      const foundStages = new Set(data.map((t: Task) => t.stage));
      const customStages: ColumnDef[] = [];
      
      foundStages.forEach((stage: string) => {
          if (!systemIds.has(stage)) {
              customStages.push({
                  id: stage,
                  title: stage,
                  color: "border-t-4 border-gray-400",
                  isSystem: false
              });
          }
      });
      
      if(customStages.length > 0) {
          setColumns(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newCols = customStages.filter(c => !existingIds.has(c.id));
              return [...prev, ...newCols];
          });
      }

    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users/all');
      setAllUsers(data);
    } catch(e) { console.error(e); }
  };

  // --- COLUMN ACTIONS ---

  const handleAddColumn = () => {
      if (!newColumnTitle.trim()) return;
      const newId = newColumnTitle.trim();
      
      if(columns.some(c => c.id === newId)) {
          toast({ title: "Error", description: "Stage already exists", variant: "destructive" });
          return;
      }

      const randomColor = COLORS_LIST[Math.floor(Math.random() * COLORS_LIST.length)];
      
      const newCol: ColumnDef = {
          id: newId,
          title: newColumnTitle,
          color: `border-t-4 ${randomColor}`,
          isSystem: false
      };
      
      setColumns([...columns, newCol]);
      setNewColumnTitle('');
      toast({ title: "Stage Added", description: `Added stage "${newColumnTitle}"` });
  };

  const handleDeleteColumn = (colId: string) => {
      if (getTasksByStage(colId).length > 0) {
          toast({ title: "Cannot Delete", description: "Please move all cards out of this stage first.", variant: "destructive" });
          return;
      }
      setColumns(prev => prev.filter(c => c.id !== colId));
  };

  // --- MANUAL CARD ACTIONS ---

const handleQuickCreateCard = async (stageId: string) => {
    if (!newCardTitle.trim()) return;
    
    try {
        // 1. Force the current user to be in the assignees list
        const finalAssignees = currentUser 
            ? Array.from(new Set([...newCardAssignees, currentUser.id]))
            : newCardAssignees;

        const primaryAssignee = finalAssignees.length > 0 ? finalAssignees[0] : null;

        // 2. Calculate orderIndex using the UNFILTERED ordered task list
        //    so active search/filter state can never corrupt the position.
        let orderIndex: number;
        const colTasks = getOrderedTasksByStage(stageId);

        if (insertAfterTaskId) {
            const afterTaskIndex = colTasks.findIndex(t => t.id === insertAfterTaskId);
            const afterTask = colTasks[afterTaskIndex];
            const nextTask = colTasks[afterTaskIndex + 1];

            const afterIdx = (afterTask as any).orderIndex ?? 0;
            const nextIdx = nextTask ? ((nextTask as any).orderIndex ?? afterIdx + 1000) : afterIdx + 1000;

            orderIndex = Math.round((afterIdx + nextIdx) / 2);
            if (orderIndex === afterIdx) orderIndex = afterIdx + 1;
        } else {
            // Adding at the bottom of the column
            const maxIdx = colTasks.reduce((max, t) => Math.max(max, (t as any).orderIndex ?? 0), -1);
            orderIndex = maxIdx + 1000;
        }

        const payload = {
            client_name: newCardTitle,
            mobile_number: "0000000000",
            inquiry_date: new Date().toISOString(),
            address: "Manual Entry",
            stage: stageId,   // ← send stage so backend fallback scopes correctly
            orderIndex,
            ...(primaryAssignee && { sales_person_id: primaryAssignee }), 
        };

        const { data: newInquiry } = await api.post('/inquiries', payload);
        
        let assignedUsers = allUsers.filter(u => u.id === newInquiry.sales_person_id);

        if (finalAssignees.length > 0) {
            await api.put(`/inquiries/${newInquiry.id}/assign`, { userIds: finalAssignees });
            assignedUsers = allUsers.filter(u => finalAssignees.includes(u.id));
        }

        if (stageId !== "Inquiry") {
            await api.put(`/inquiries/${newInquiry.id}/stage`, { stage: stageId, orderIndex });
            newInquiry.stage = stageId; 
        }

        const newTask: Task = {
            ...newInquiry,
            orderIndex,  // ← always stamp the calculated orderIndex onto local task
            sales_person: assignedUsers[0] ? { id: assignedUsers[0].id, name: assignedUsers[0].name } : undefined,
            sales_persons: assignedUsers.map(u => ({ id: u.id, name: u.name })), 
            stage: stageId,
            labels: [],
            comments: [],
            checklists: [],
            selections: []
        };

        // Just append — getTasksByStage sorts by orderIndex so position is automatic
        setTasks(prev => [...prev, newTask]);
        
        setNewCardTitle('');
        setNewCardAssignees(currentUser ? [currentUser.id] : []);
        setAddingCardToColumn(null);
        setInsertAfterTaskId(null);
        toast({ title: "Card Created", description: "New card added successfully." });

    } catch (error) {
        console.error(error);
        toast({ title: "Error", description: "Failed to create card", variant: "destructive" });
    }
};

  const fetchTimeline = async (inquiryId: string) => {
    setTimelineLoading(true);
    try {
      const { data } = await api.get(`/daily-reports/inquiry/${inquiryId}/timeline`);
      setTimelineData(data.timeline || []);
    } catch {
      // ignore
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDescription(task.description || '');
    setIsEditingDesc(false);
    setEditingCommentId(null);
    fetchTimeline(task.id);
  };

  // --- ACTIONS ---

  const handleSaveDescription = async () => {
    if (!selectedTask) return;
    try {
      await api.put(`/inquiries/${selectedTask.id}/description`, { description });
      const updatedTask = { ...selectedTask, description };
      updateLocalTask(updatedTask);
      setIsEditingDesc(false);
      toast({ title: "Saved", description: "Description updated." });
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleToggleMember = async (userId: string) => {
    if (!selectedTask) return;
    
    // Combine primary owner and collaborators into one array
    const currentMemberIds = [
      ...(selectedTask.sales_person ? [selectedTask.sales_person.id] : []),
      ...(selectedTask.sales_persons || []).map(p => p.id)
    ];
    
    // Ensure unique IDs
    const uniqueMembers = Array.from(new Set(currentMemberIds));
    const isAssigned = uniqueMembers.includes(userId);
    
    let newUserIds: string[];
    if (isAssigned) {
        newUserIds = uniqueMembers.filter(id => id !== userId);
    } else {
        newUserIds = [...uniqueMembers, userId];
    }

    if (newUserIds.length === 0) {
        toast({ title: "Error", description: "At least one member must be assigned.", variant: "destructive" });
        return;
    }

    try {
      const { data } = await api.put(`/inquiries/${selectedTask.id}/assign`, { userIds: newUserIds });
      
      const updatedTask = { 
        ...selectedTask, 
        sales_person: data.sales_person,
        sales_persons: data.sales_persons 
      };
      updateLocalTask(updatedTask);
    } catch(e) { console.error(e); }
  };

  const getUniqueLabels = () => {
    const unique = new Map();
    tasks.forEach(t => {
        (t.labels || []).forEach(l => { 
            const key = `${l.text}-${l.color}`;
            if (!unique.has(key)) {
                unique.set(key, { text: l.text, color: l.color });
            }
        });
    });
    return Array.from(unique.values());
  };

  const handleToggleLabel = async (labelDef: {text: string, color: string}) => {
      if (!selectedTask) return;
      const currentLabels = selectedTask.labels || [];
      const existingLabel = currentLabels.find(l => l.text === labelDef.text && l.color === labelDef.color);

      if (existingLabel) {
          try {
              await api.delete(`/labels/${existingLabel.id}`);
              const updatedTask = { ...selectedTask, labels: currentLabels.filter(l => l.id !== existingLabel.id) };
              updateLocalTask(updatedTask);
          } catch(e) { console.error(e); }
      } else {
          try {
            const { data } = await api.post(`/inquiries/${selectedTask.id}/labels`, { color: labelDef.color, text: labelDef.text });
            const updatedTask = { ...selectedTask, labels: [...currentLabels, data] };
            updateLocalTask(updatedTask);
          } catch(e) { console.error(e); }
      }
  };

  const handleCreateLabel = async () => {
    if (!selectedTask || !newLabelTitle.trim()) return;
    await handleToggleLabel({ text: newLabelTitle, color: selectedLabelColor });
    setNewLabelTitle(''); 
    setIsCreatingLabel(false);
  };

  const handleAddChecklist = async () => {
    if (!selectedTask || !newChecklistTitle.trim()) return;
    try {
      const { data } = await api.post(`/inquiries/${selectedTask.id}/checklists`, { title: newChecklistTitle });
      const currentChecklists = selectedTask.checklists || [];
      const updatedTask = { ...selectedTask, checklists: [...currentChecklists, { ...data, items: [] }] };
      updateLocalTask(updatedTask);
      setNewChecklistTitle('Checklist'); 
    } catch(e) { console.error(e); }
  };

  const handleAddChecklistItem = async (checklistId: string) => {
    if (!newItemText.trim()) return;
    try {
      const { data } = await api.post(`/checklists/${checklistId}/items`, { text: newItemText });
      const updatedChecklists = (selectedTask?.checklists || []).map(cl => {
        if (cl.id === checklistId) return { ...cl, items: [...cl.items, data] };
        return cl;
      });
      const updatedTask = { ...selectedTask!, checklists: updatedChecklists };
      updateLocalTask(updatedTask);
      setNewItemText('');
      setAddingItemTo(null);
    } catch(e) { console.error(e); }
  };

  const handleToggleChecklistItem = async (checklistId: string, itemId: string, currentStatus: boolean) => {
    try {
      await api.put(`/checklist-items/${itemId}`, { isCompleted: !currentStatus });
      const updatedChecklists = (selectedTask?.checklists || []).map(cl => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: cl.items.map(item => item.id === itemId ? { ...item, isCompleted: !currentStatus } : item)
          };
        }
        return cl;
      });
      const updatedTask = { ...selectedTask!, checklists: updatedChecklists };
      updateLocalTask(updatedTask);
    } catch(e) { console.error(e); }
  };

  const handleDeleteChecklist = async (checklistId: string) => {
      try {
          await api.delete(`/checklists/${checklistId}`);
          const updatedChecklists = (selectedTask?.checklists || []).filter(cl => cl.id !== checklistId);
          const updatedTask = { ...selectedTask!, checklists: updatedChecklists };
          updateLocalTask(updatedTask);
      } catch (e) { console.error("Failed to delete checklist", e); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCommentAttachment(data.url);
    } catch (error) { toast({ title: "Upload Failed", variant: "destructive" }); }
  };

  const handleAddComment = async () => {
    if (!selectedTask || (!newComment.trim() && !commentAttachment)) return;
    try {
      const { data } = await api.post(`/inquiries/${selectedTask.id}/comments`, { 
        content: newComment,
        attachmentUrl: commentAttachment 
      });
      const currentComments = selectedTask.comments || [];
      const updatedTask = { ...selectedTask, comments: [data, ...currentComments] };
      updateLocalTask(updatedTask);
      setNewComment('');
      setCommentAttachment(null);
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleEditComment = async (commentId: string) => {
      if(!selectedTask) return;
      const currentComments = selectedTask.comments || [];
      const updatedComments = currentComments.map(c => 
        c.id === commentId ? { ...c, content: editingCommentText } : c
      );
      const updatedTask = { ...selectedTask, comments: updatedComments };
      updateLocalTask(updatedTask);
      setEditingCommentId(null);
  };

  const updateLocalTask = (updatedTask: Task) => {
    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

const onDragEnd = async (result: any) => {
  const { destination, source, draggableId, type } = result;

  if (!destination) return;
  if (destination.droppableId === source.droppableId && destination.index === source.index) return;

  // --- HANDLE COLUMN DRAGGING ---
  if (type === 'column') {
    const systemCount = DEFAULT_COLUMNS.length;
    if (source.index < systemCount || destination.index < systemCount) return;

    const newColumns = Array.from(columns);
    const [movedColumn] = newColumns.splice(source.index, 1);
    newColumns.splice(destination.index, 0, movedColumn);
    setColumns(newColumns);
    return;
  }

  // --- HANDLE CARD DRAGGING ---
  const realId = draggableId.split('::')[1];
  const destStage = destination.droppableId;
  const srcStage = source.droppableId;

  const currentDestTasks = getOrderedTasksByStage(destStage).filter(t => t.id !== realId);

  // Calculate the new orderIndex
  let newOrderIndex = 0;
  if (currentDestTasks.length === 0) {
    newOrderIndex = 1000;
  } else if (destination.index === 0) {
    newOrderIndex = ((currentDestTasks[0] as any).orderIndex ?? 1000) - 1000;
  } else if (destination.index >= currentDestTasks.length) {
    newOrderIndex = ((currentDestTasks[currentDestTasks.length - 1] as any).orderIndex ?? 0) + 1000;
  } else {
    const prevIdx = (currentDestTasks[destination.index - 1] as any).orderIndex ?? 0;
    const nextIdx = (currentDestTasks[destination.index] as any).orderIndex ?? 0;
    newOrderIndex = Math.round((prevIdx + nextIdx) / 2);
    if (newOrderIndex === prevIdx) newOrderIndex = prevIdx + 1;
  }

  // ✅ FIX: Physically reorder the tasks array so the rendered order
  // matches immediately — prevents the snap-back flicker on re-render.
  setTasks(prev => {
    // 1. Pull out the moved task and stamp its new values
    const movedTask = prev.find(t => t.id === realId);
    if (!movedTask) return prev;

    const updatedMovedTask = {
      ...movedTask,
      stage: destStage,
      orderIndex: newOrderIndex,
      updated_at: new Date().toISOString(),
    };

    // 2. Remove the moved task from the array
    const rest = prev.filter(t => t.id !== realId);

    // 3. Get the destination column tasks (excluding moved), sorted
    const destColumnTasks = rest
      .filter(t => t.stage === destStage)
      .sort((a, b) => ((a as any).orderIndex ?? 0) - ((b as any).orderIndex ?? 0));

    // 4. Insert the moved task at the exact destination index
    destColumnTasks.splice(destination.index, 0, updatedMovedTask);

    // 5. Rebuild: all tasks NOT in dest column + newly ordered dest column
    const otherTasks = rest.filter(t => t.stage !== destStage);
    return [...otherTasks, ...destColumnTasks];
  });

  // Persist to backend
  try {
    await api.put(`/inquiries/${realId}/stage`, {
      stage: destStage,
      orderIndex: newOrderIndex,
    });
  } catch (error) {
    fetchPipeline(); // Rollback on failure
  }
};
  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    const startWidth = sidebarWidth;
    const startX = mouseDownEvent.clientX;
    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
        const newWidth = startWidth + (startX - mouseMoveEvent.clientX);
        if (newWidth > 250 && newWidth < 800) setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = 'default';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // --- SELECTORS ---
  const getLinkedQuote = (task: Task) => {
    if (!task.selections || task.selections.length === 0) return null;
    for (const selection of task.selections) {
        if (selection.quotations && selection.quotations.length > 0) return selection.quotations[0];
    }
    return null;
  };

  const getLinkedSelection = (task: Task) => {
    if (!task.selections || task.selections.length === 0) return null;
    return task.selections[0];
  };

 // ✅ CORRECT FILTERING LOGIC
const getTasksByStage = (stage: string) => {
  return tasks.filter(t => {
    if (t.stage === stage) return true;
    const linkedQuote = getLinkedQuote(t);
    const linkedSelection = getLinkedSelection(t);
    if (t.stage === 'Inquiry' || !t.stage) {
      if (stage === "Quotation Submitted" && linkedQuote) return true;
      if (stage === "Ongoing Projects" && linkedSelection && !linkedQuote) return true;
      if (stage === "Inquiry" && !linkedSelection && !linkedQuote) return true;
    }
    return false;
  })
  .filter(t => {
    const matchesSearch = t.client_name.toLowerCase().includes(search.toLowerCase()) ||
                          t.inquiry_number.toLowerCase().includes(search.toLowerCase());

    let matchesUser = true;
    if (filterUser !== 'all') {
      const members = [
        ...(t.sales_person ? [t.sales_person] : []),
        ...(t.sales_persons || [])
      ];
      matchesUser = members.some(m => m.id === filterUser);
    }

    let matchesLabel = true;
    if (filterLabel !== 'all') {
      matchesLabel = (t.labels || []).some((l: any) => l.text === filterLabel);
    }

    let matchesDate = true;
    if (filterDate) {
      matchesDate = (t.updated_at || '').startsWith(filterDate);
    }

    // NEW: filter by has/no comments
    let matchesActivity = true;
    if (filterActivity === 'has_comments') {
      matchesActivity = (t.comments || []).length > 0;
    } else if (filterActivity === 'no_comments') {
      matchesActivity = (t.comments || []).length === 0;
    }

    // NEW: filter by has/no checklist
    let matchesChecklist = true;
    if (filterChecklist === 'has_checklist') {
      matchesChecklist = (t.checklists || []).length > 0;
    } else if (filterChecklist === 'incomplete') {
      matchesChecklist = (t.checklists || []).some(cl =>
        cl.items.some(item => !item.isCompleted)
      );
    }

    return matchesSearch && matchesUser && matchesLabel && matchesDate && matchesActivity && matchesChecklist;
  })
  
};

// NEW FUNCTION — add right after getTasksByStage
// Used internally for orderIndex calculations — NO filters applied,
// so drag/create positions are never thrown off by active search/filter state.
const getOrderedTasksByStage = (stage: string) => {
  return tasks
    .filter(t => {
      if (t.stage === stage) return true;
      const linkedQuote = getLinkedQuote(t);
      const linkedSelection = getLinkedSelection(t);
      if (t.stage === 'Inquiry' || !t.stage) {
        if (stage === "Quotation Submitted" && linkedQuote) return true;
        if (stage === "Ongoing Projects" && linkedSelection && !linkedQuote) return true;
        if (stage === "Inquiry" && !linkedSelection && !linkedQuote) return true;
      }
      return false;
    })
    .sort((a, b) => ((a as any).orderIndex ?? 0) - ((b as any).orderIndex ?? 0));
};
  
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-6rem)] flex flex-col animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 px-1">
          <div><h1 className="text-2xl font-bold">Sales Pipeline</h1><p className="text-muted-foreground">Manage inquiries & quotations</p></div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
             
          {/* FILTER TOGGLE BUTTON */}
<div className="relative">
  <Button
    variant="outline"
    className={cn("gap-2 bg-background border border-border", isFilterOpen && "ring-2 ring-primary")}
    onClick={() => setIsFilterOpen(prev => !prev)}
  >
    <Filter className="h-4 w-4" /> Filters
    {(filterUser !== 'all' || filterLabel !== 'all' || filterDate || filterActivity !== 'all' || filterChecklist !== 'all') && (
      <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
    )}
  </Button>
</div>

{/* FIXED FILTER PANEL — renders outside the header flow */}
{isFilterOpen && (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-40"
      onClick={() => setIsFilterOpen(false)}
    />

    {/* Fixed Panel */}
    <div className="fixed top-20 right-6 z-50 w-[340px] bg-background border border-border rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
      
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-muted/30 rounded-t-xl">
        <h4 className="font-semibold text-sm">Filter Cards</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
            onClick={() => {
              setFilterUser('all');
              setFilterLabel('all');
              setFilterDate('');
              setFilterActivity('all');
              setFilterChecklist('all');
            }}
          >
            Clear all
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => setIsFilterOpen(false)}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Filter Body */}
      <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">

        {/* 1. Assigned User */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            👤 Assigned User
          </label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
          >
            <option value="all">All Users</option>
            {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* 2. Label */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            🏷️ Label
          </label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filterLabel}
            onChange={e => setFilterLabel(e.target.value)}
          >
            <option value="all">All Labels</option>
            {getUniqueLabels().map((l: any, i) => (
              <option key={i} value={l.text}>{l.text}</option>
            ))}
          </select>
        </div>

        {/* 3. Month */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            📅 Month
          </label>
          <Input
            type="month"
            className="h-9 text-sm w-full bg-background"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
          />
        </div>

        {/* 4. Activity / Comments */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            💬 Comments
          </label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all', label: 'Any' },
              { value: 'has_comments', label: 'Has Comments' },
              { value: 'no_comments', label: 'No Comments' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterActivity(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  filterActivity === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Checklist */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            ✅ Checklist
          </label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all', label: 'Any' },
              { value: 'has_checklist', label: 'Has Checklist' },
              { value: 'incomplete', label: 'Has Incomplete' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterChecklist(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  filterChecklist === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 6. Stage Quick-jump */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            📌 Stage
          </label>
          <div className="flex gap-2 flex-wrap">
            {['all', ...columns.map(c => c.id)].map(stageId => (
              <button
                key={stageId}
                onClick={() => setFilterStage(stageId)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  filterStage === stageId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {stageId === 'all' ? 'All Stages' : columns.find(c => c.id === stageId)?.title || stageId}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 rounded-b-xl flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          {(filterUser !== 'all' || filterLabel !== 'all' || filterDate || filterActivity !== 'all' || filterChecklist !== 'all' || filterStage !== 'all')
            ? '🔵 Filters active'
            : 'No filters applied'}
        </span>
        <Button size="sm" className="h-7 px-4 text-xs" onClick={() => setIsFilterOpen(false)}>
          Done
        </Button>
      </div>
    </div>
  </>
)}

             {/* ADD STAGE DROPDOWN */}
             <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 border-dashed w-full sm:w-auto">
                        <PlusCircle className="h-4 w-4" /> Add Stage
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                    <h4 className="font-semibold text-sm mb-2">Create New Stage</h4>
                    <div className="flex gap-2">
                        <Input 
                            placeholder="Stage Name (e.g. Queries)" 
                            value={newColumnTitle} 
                            onChange={(e) => setNewColumnTitle(e.target.value)} 
                            className="h-8 text-xs"
                        />
                        <Button size="sm" className="h-8" onClick={handleAddColumn}>Add</Button>
                    </div>
                </PopoverContent>
             </Popover>

             <div className="w-full sm:w-64 relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search board..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
             </div>
          </div>
        </div>

        {/* Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="all-columns" direction="horizontal" type="column">
            {(provided) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef} 
                className="flex-1 flex gap-4 overflow-x-auto pb-4 px-1"
              >
                {columns.map((column, columnIndex) => (
                  <Draggable key={column.id} draggableId={`col-${column.id}`} index={columnIndex} isDragDisabled={!!column.isSystem}>
                    {(provided) => (
                      <div 
                        ref={provided.innerRef} 
                        {...provided.draggableProps} 
                        className="flex-shrink-0 w-80 flex flex-col rounded-xl bg-muted/40 border border-border/50 group/col relative"
                      >
                        
                        {/* Column Header - Drag Handle is attached here */}
                        <div 
                          {...provided.dragHandleProps} 
                          className={`p-3 font-semibold text-xs flex justify-between items-center bg-background rounded-t-xl border-b ${column.color} border-t-4`}
                        >
                          <span className="flex items-center gap-2">
                              {column.title}
                              <Badge variant="secondary" className="ml-2 h-5">{getTasksByStage(column.id).length}</Badge>
                          </span>
                          
                          {/* Delete Option for Custom Columns ONLY */}
                          {!column.isSystem && (
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/col:opacity-100 transition-opacity">
                                          <MoreHorizontal className="h-3 w-3" />
                                      </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteColumn(column.id)}>
                                          <Trash2 className="h-3 w-3 mr-2" /> Delete Stage
                                      </DropdownMenuItem>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                          )}
                        </div>

                        {/* Droppable Area for Cards */}
                        <Droppable droppableId={column.id} type="task">
                          {(provided, snapshot) => (
                            <div 
                                {...provided.droppableProps} 
                                ref={provided.innerRef} 
                                className={cn("flex-1 p-2 overflow-y-auto space-y-2 min-h-[100px]", snapshot.isDraggingOver ? "bg-muted/50" : "")}
                            >
                                
                                {getTasksByStage(column.id).map((task, index) => {
                                    const linkedQuote = getLinkedQuote(task);
                                    const linkedSelection = getLinkedSelection(task); 
                                    const isQuoteStage = column.id === 'Quotation Submitted';
                                    const isOngoingStage = column.id === 'Ongoing Projects'; 
                                    const uniqueDraggableId = `${column.id}::${task.id}`;

                                    return (
                                    <Draggable key={uniqueDraggableId} draggableId={uniqueDraggableId} index={index}>
                                        {(provided, snapshot) => (
                                        <div 
                                            ref={provided.innerRef} 
                                            {...provided.draggableProps} 
                                            {...provided.dragHandleProps} 
                                        >
                                            <div 
                                                onClick={() => handleTaskClick(task)}
                                                className={cn("bg-background p-2 rounded-lg shadow-sm border border-border hover:border-primary/50 transition-all cursor-pointer group relative", snapshot.isDragging ? "shadow-xl ring-2 ring-primary rotate-1" : "")}
                                            >
                                            
                                            {/* ACTIONS (Shows on Hover) */}
                                            <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <Button 
                                                    variant="outline" 
                                                    size="icon" 
                                                    className="h-6 w-6 rounded-full shadow-md hover:scale-110 bg-background"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAddingCardToColumn(column.id);
                                                        setInsertAfterTaskId(task.id);
                                                    }}
                                                >
                                                    <Plus className="h-3 w-3 text-primary" />
                                                </Button>
                                                <Button 
                                                    variant="destructive" 
                                                    size="icon" 
                                                    className="h-6 w-6 rounded-full shadow-md hover:scale-110"
                                                    onClick={(e) => handleDeleteTask(task.id, e)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            {(task.labels || []).length > 0 && (
                                            <div className="flex gap-1 mb-1.5 flex-wrap">
                                                {task.labels!.map((l:any) => (
                                                <div key={l.id} className={`${l.color} h-1.5 w-6 rounded-full`} title={l.text}></div>
                                                ))}
                                            </div>
                                            )}
                                            
                                            <div className="mb-1 flex justify-between items-start">
                                            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded border leading-none py-0.5">
                                                {isQuoteStage && linkedQuote ? linkedQuote.quotation_number : 
                                                isOngoingStage && linkedSelection ? linkedSelection.selection_number : 
                                                task.inquiry_number}
                                            </span>
                                            
                                            {(isQuoteStage && linkedQuote) && (
                                                <span className="text-[10px] font-bold text-green-600 flex items-center">
                                                <IndianRupee className="w-2 h-2 mr-0.5" />
                                                {linkedQuote.grandTotal.toLocaleString()}
                                                </span>
                                            )}

                                            {(isOngoingStage && linkedSelection) && (
                                                <span className={cn(
                                                "text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase",
                                                linkedSelection.status === 'pending' ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                                                linkedSelection.status === 'confirmed' ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                "bg-gray-100 text-gray-600 border-gray-200"
                                                )}>
                                                {linkedSelection.status}
                                                </span>
                                            )}
                                            </div>
                                            
                                            <h4 className="font-semibold text-xs mb-2 leading-tight">{task.client_name}</h4>
                                            
                                            <div className="flex items-center justify-between">
                                                <div className="flex -space-x-1.5">
                                                    {(() => {
                                                        const uniqueMembers = [
                                                            ...(task.sales_person ? [task.sales_person] : []),
                                                            ...(task.sales_persons || [])
                                                        ].filter((p, i, self) => self.findIndex(m => m.id === p.id) === i);

                                                        return uniqueMembers.length > 0 ? (
                                                            uniqueMembers.map(person => (
                                                                <div key={person.id} className={cn("h-5 w-5 rounded-full text-white flex items-center justify-center text-[8px] font-bold ring-1 ring-background", getMemberColor(person.name))} title={person.name}>
                                                                    {getInitials(person.name)}
                                                                </div>
                                                            ))
                                                        ) : ( <div className="h-5"></div> );
                                                    })()}
                                                </div>

                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    {((task.comments || []).length > 0 || (task.checklists || []).length > 0) && (
                                                        <div className="flex items-center gap-1.5 bg-muted/50 px-1 py-0.5 rounded">
                                                            {(task.comments || []).length > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{task.comments!.length}</span>}
                                                            {(task.checklists || []).length > 0 && (
                                                                <span className="flex items-center gap-0.5">
                                                                    <CheckSquare className="h-2.5 w-2.5" />
                                                                    {task.checklists!.reduce((acc, cl) => acc + cl.items.filter(i => i.isCompleted).length, 0)}/
                                                                    {task.checklists!.reduce((acc, cl) => acc + cl.items.length, 0)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            </div>
                                            {addingCardToColumn === column.id && insertAfterTaskId === task.id && (
                                                <div 
    className="bg-background p-2 rounded-lg border border-primary/20 shadow-sm mt-3 animate-in fade-in zoom-in-95 cursor-default" 
    onClick={e => e.stopPropagation()}
>
    <Input 
        placeholder="Client Name / Task Title" 
        value={newCardTitle} 
        onChange={(e) => setNewCardTitle(e.target.value)} 
        className="mb-2 h-8 text-sm"
        autoFocus
    />
    
    {/* Show Selected Member Avatars */}
    {newCardAssignees.length > 0 && (
        <div className="flex -space-x-1.5 mb-2 px-1">
            {newCardAssignees.map(id => {
                const u = allUsers.find(x => x.id === id);
                if(!u) return null;
                return (
                    <div key={id} className={cn("h-5 w-5 rounded-full text-white flex items-center justify-center text-[8px] font-bold ring-1 ring-background", getMemberColor(u.name))} title={u.name}>
                        {getInitials(u.name)}
                    </div>
                )
            })}
        </div>
    )}

    <div className="flex gap-2 justify-between items-center">
        <div className="flex gap-2">
            <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleQuickCreateCard(column.id)}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setAddingCardToColumn(null); setNewCardAssignees([]); setInsertAfterTaskId(null); }}>Cancel</Button>
        </div>
        
        {/* Assign Members Popover */}
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full border border-dashed border-muted-foreground hover:border-foreground shrink-0">
                    <Plus className="h-3 w-3 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end" onClick={e => e.stopPropagation()}>
                <h4 className="text-xs font-bold text-muted-foreground mb-2 px-2">Assign Members</h4>
                <ScrollArea className="h-48">
                    {allUsers.map(user => {
                        const isSelected = newCardAssignees.includes(user.id);
                        return (
                            <div key={user.id} 
                                className={cn("flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer text-sm", isSelected && "bg-accent/50")}
                                onClick={() => {
                                    setNewCardAssignees(prev => 
                                        prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id]
                                    );
                                }}
                            >
                                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs text-white shrink-0", getMemberColor(user.name))}>{getInitials(user.name)}</div>
                                <span className="truncate">{user.name}</span>
                                {isSelected && <Check className="ml-auto h-3 w-3 shrink-0" />}
                            </div>
                        );
                    })}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    </div>
</div>
                                            )}
                                        </div>
                                        )}
                                    </Draggable>
                                    );
                                })}
                                {provided.placeholder}

                                {/* --- QUICK ADD CARD BUTTON GOES HERE --- */}
                                {addingCardToColumn === column.id && !insertAfterTaskId ? (
<div 
    className="bg-background p-2 rounded-lg border border-primary/20 shadow-sm mt-3 animate-in fade-in zoom-in-95 cursor-default" 
    onClick={e => e.stopPropagation()}
>
    <Input 
        placeholder="Client Name / Task Title" 
        value={newCardTitle} 
        onChange={(e) => setNewCardTitle(e.target.value)} 
        className="mb-2 h-8 text-sm"
        autoFocus
    />
    
    {/* Show Selected Member Avatars */}
    {(() => {
        const displayAssignees = Array.from(new Set([...newCardAssignees, currentUser?.id])).filter(Boolean) as string[];
        if (displayAssignees.length === 0) return null;
        return (
            <div className="flex -space-x-1.5 mb-2 px-1">
                {displayAssignees.map(id => {
                    const u = allUsers.find(x => x.id === id);
                    if(!u) return null;
                    return (
                        <div key={id} className={cn("h-5 w-5 rounded-full text-white flex items-center justify-center text-[8px] font-bold ring-1 ring-background", getMemberColor(u.name))} title={u.name}>
                            {getInitials(u.name)}
                        </div>
                    )
                })}
            </div>
        )
    })()}

    <div className="flex gap-2 justify-between items-center">
        <div className="flex gap-2">
            <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleQuickCreateCard(column.id)}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setAddingCardToColumn(null); setNewCardAssignees([]); setInsertAfterTaskId(null); }}>Cancel</Button>
        </div>
        
        {/* Assign Members Popover */}
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full border border-dashed border-muted-foreground hover:border-foreground shrink-0">
                    <Plus className="h-3 w-3 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end" onClick={e => e.stopPropagation()}>
                <h4 className="text-xs font-bold text-muted-foreground mb-2 px-2">Assign Members</h4>
                <ScrollArea className="h-48">
                    {allUsers.map(user => {
                        const isCurrentUser = currentUser && user.id === currentUser.id;
                        const isSelected = newCardAssignees.includes(user.id) || isCurrentUser;
                        
                        return (
                            <div key={user.id} 
                                className={cn("flex items-center gap-2 p-2 rounded text-sm", 
                                    isSelected ? "bg-accent/50" : "hover:bg-accent cursor-pointer",
                                    isCurrentUser && "opacity-70 cursor-not-allowed" // Locked state for creator
                                )}
                                onClick={() => {
                                    if (isCurrentUser) return; // Prevent unchecking the creator
                                    setNewCardAssignees(prev => 
                                        prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id]
                                    );
                                }}
                            >
                                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs text-white shrink-0", getMemberColor(user.name))}>{getInitials(user.name)}</div>
                                <span className="truncate">{user.name}</span>
                                {isCurrentUser && <span className="text-[10px] text-muted-foreground ml-auto">(Creator)</span>}
                                {isSelected && !isCurrentUser && <Check className="ml-auto h-3 w-3 shrink-0" />}
                                {isCurrentUser && <Check className="ml-2 h-3 w-3 shrink-0 text-muted-foreground" />}
                            </div>
                        );
                    })}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    </div>
</div>
                                ) : addingCardToColumn !== column.id && (
                                    <Button 
                                        variant="ghost" 
                                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 text-xs justify-start px-2"
                                        onClick={() => { setAddingCardToColumn(column.id); setInsertAfterTaskId(null); }}
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-2" /> Add Card
                                    </Button>
                                )}

                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* --- DETAIL MODAL (Unchanged) --- */}
        <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
           <DialogContent className="max-w-[95vw] md:max-w-5xl h-[90vh] md:h-[85vh] p-0 bg-background border-border flex flex-col overflow-hidden text-foreground">
              {selectedTask && (
                <div className="flex flex-col h-full">
                  <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border bg-card/30 flex-shrink-0 flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex items-start gap-4">
                        <Monitor className="h-6 w-6 text-muted-foreground mt-1" />
                        <div>
                            <DialogTitle className="text-xl font-bold">{selectedTask.client_name}</DialogTitle>
                            <div className="text-sm text-muted-foreground flex gap-2 items-center mt-1">
                                <span className="bg-muted px-1.5 rounded text-xs font-mono">{selectedTask.inquiry_number}</span>
                                <span>in list <span className="underline decoration-dotted">{selectedTask.stage}</span></span>
                            </div>
                        </div>
                    </div>
                    {/* ✅ SHOW QUOTE TOTAL IN HEADER IF AVAILABLE */}
                    {getLinkedQuote(selectedTask) && (
                       <div className="text-right">
                          <div className="text-xl font-bold text-green-600 flex items-center justify-end">
                             <IndianRupee className="w-5 h-5" />
                             {getLinkedQuote(selectedTask).grandTotal.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">Quoted Amount</div>
                       </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden relative">
                      {/* LEFT COLUMN */}
                      <div className="md:flex-1 md:overflow-y-auto p-4 md:p-6 space-y-8 flex-shrink-0">
                          
                          <div className="flex flex-col sm:flex-row flex-wrap items-start gap-6 sm:gap-8">
                              
                              {/* 1. MEMBERS */}
                              <div className="space-y-1.5 w-full sm:w-auto">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</h4>
                                <div className="flex items-center gap-1">
                                    {(() => {
                                        const uniqueMembers = [
                                            ...(selectedTask.sales_person ? [selectedTask.sales_person] : []),
                                            ...(selectedTask.sales_persons || [])
                                        ].filter((p, i, self) => self.findIndex(m => m.id === p.id) === i);

                                        return uniqueMembers.map(person => (
                                            <div key={person.id} className={cn("h-8 w-8 rounded-full text-white flex items-center justify-center text-xs font-bold shadow-sm -ml-2 first:ml-0 ring-2 ring-background", getMemberColor(person.name))} title={person.name}>
                                                {getInitials(person.name)}
                                            </div>
                                        ));
                                    })()}
                                      
                                      <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80 shadow-sm ml-1">
                                                <Plus className="h-4 w-4 text-foreground" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-60 p-2" align="start">
                                            <h4 className="text-xs font-bold text-muted-foreground mb-2 px-2">Assign Members</h4>
                                            <ScrollArea className="h-48">
                                                {allUsers.map(user => {
                                                    const isSelected = (selectedTask.sales_persons || []).some(p => p.id === user.id);
                                                    return (
                                                        <div key={user.id} 
                                                            className={cn("flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer text-sm", isSelected && "bg-accent/50")}
                                                            onClick={() => handleToggleMember(user.id)}
                                                        >
                                                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs text-white", getMemberColor(user.name))}>{getInitials(user.name)}</div>
                                                            {user.name}
                                                            {isSelected && <Check className="ml-auto h-3 w-3" />}
                                                        </div>
                                                    );
                                                })}
                                            </ScrollArea>
                                        </PopoverContent>
                                      </Popover>
                                  </div>
                              </div>

                              {/* 2. LABELS */}
                              <div className="space-y-1.5 w-full sm:w-auto">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Labels</h4>
                                  <div className="flex items-center gap-2 flex-wrap">
                                      {(selectedTask.labels || []).map(l => (
                                          <div key={l.id} className={`${l.color} text-white px-3 py-1 rounded-[3px] text-sm font-medium cursor-default shadow-sm min-h-[32px]`} >
                                              {l.text}
                                          </div>
                                      ))}
                                      
                                      <Popover onOpenChange={(open) => { if(!open) setIsCreatingLabel(false); }}>
                                        <PopoverTrigger asChild>
                                            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-[3px] bg-muted hover:bg-muted/80 shadow-sm">
                                                <Plus className="h-4 w-4 text-foreground" />
                                            </Button>
                                        </PopoverTrigger>
                                        
                                        <PopoverContent className="w-72 p-0 bg-popover border-border" align="start">
                                            {!isCreatingLabel ? (
                                                <div className="flex flex-col">
                                                    <div className="p-3 border-b border-border bg-muted/30">
                                                        <h4 className="text-sm font-semibold text-center text-foreground">Labels</h4>
                                                    </div>
                                                    <div className="p-3 space-y-3">
                                                        <Input 
                                                            placeholder="Search labels..." 
                                                            className="h-8 text-sm bg-background"
                                                            value={labelSearch}
                                                            onChange={e => setLabelSearch(e.target.value)}
                                                        />
                                                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                                            <div className="text-xs text-muted-foreground px-1 pb-1">Available Labels</div>
                                                            {getUniqueLabels().filter(l => l.text.toLowerCase().includes(labelSearch.toLowerCase())).map((labelDef, i) => {
                                                                const isChecked = (selectedTask.labels || []).some(l => l.text === labelDef.text && l.color === labelDef.color);
                                                                return (
                                                                    <div key={i} className="flex items-center gap-2 p-1.5 hover:bg-accent rounded cursor-pointer group" onClick={() => handleToggleLabel(labelDef)}>
                                                                        <Checkbox checked={isChecked} className="h-4 w-4" />
                                                                        <div className={`${labelDef.color} flex-1 h-8 rounded text-white text-sm flex items-center px-2 shadow-sm`}>
                                                                            {labelDef.text}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <Button variant="secondary" className="w-full h-8 text-sm" onClick={() => setIsCreatingLabel(true)}>
                                                            Create a new label
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <div className="p-3 border-b border-border bg-muted/30 flex items-center relative">
                                                        <h4 className="text-sm font-semibold text-center w-full">Create label</h4>
                                                    </div>
                                                    <div className="p-4 space-y-4">
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-muted-foreground">Title</label>
                                                            <Input value={newLabelTitle} onChange={e => setNewLabelTitle(e.target.value)} className="h-8 text-sm"/>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-muted-foreground">Select a color</label>
                                                            <div className="grid grid-cols-5 gap-2">
                                                                {LABEL_COLORS.map(color => (
                                                                    <div key={color} className={cn("h-8 w-full rounded cursor-pointer hover:opacity-80 transition-all", color, selectedLabelColor === color && "ring-2 ring-offset-1 ring-primary")} onClick={() => setSelectedLabelColor(color)}>
                                                                        {selectedLabelColor === color && <Check className="h-4 w-4 text-white m-auto mt-2" />}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center pt-2">
                                                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsCreatingLabel(false)}>Cancel</Button>
                                                            <Button size="sm" className="h-8 px-4" onClick={handleCreateLabel} disabled={!newLabelTitle}>Create</Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </PopoverContent>
                                      </Popover>
                                  </div>
                              </div>
                              
                              {/* 3. ADD TO CARD */}
                              <div className="space-y-1.5 w-full sm:w-auto">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add to card</h4>
                                  <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="secondary" className="h-8 text-sm bg-muted shadow-sm px-3">
                                                <CheckSquare className="h-3.5 w-3.5 mr-2" /> Checklist
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 p-0" align="start">
                                            <div className="p-3 border-b border-border bg-muted/30">
                                                <h4 className="text-sm font-semibold text-center">Add checklist</h4>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <Input value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)} autoFocus placeholder="Checklist Title" />
                                                <Button className="w-full" onClick={handleAddChecklist}>Add</Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    
                                    {/* ✅ IF QUOTATION EXISTS - LINK TO IT */}
                                    {getLinkedQuote(selectedTask) && (
                                       <Button variant="outline" className="h-8 text-sm shadow-sm px-3 text-green-600 border-green-200 bg-green-50">
                                            <FileText className="h-3.5 w-3.5 mr-2" /> View Quote
                                       </Button>
                                    )}
                                  </div>
                              </div>
                          </div>

                          <Separator />

                          {/* DESCRIPTION */}
                          <div className="space-y-3 group">
                              <div className="flex justify-between items-center">
                                  <h3 className="font-semibold flex items-center gap-2 text-lg"><AlignLeft className="h-5 w-5 text-muted-foreground" /> Description</h3>
                                  {!isEditingDesc && description && (
                                      <Button variant="secondary" size="sm" className="h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setIsEditingDesc(true)}>Edit</Button>
                                  )}
                              </div>
                              
                              {isEditingDesc || !description ? (
                                  <div className="space-y-2">
                                      <Textarea 
                                          placeholder="Add a more detailed description..." 
                                          className="min-h-[120px] bg-muted/30 border-transparent focus:bg-background focus:border-primary resize-none p-3"
                                          value={description}
                                          onChange={e => setDescription(e.target.value)}
                                          onBlur={() => { if(!description) setIsEditingDesc(false) }}
                                      />
                                      {isEditingDesc && (
                                          <div className="flex gap-2">
                                              <Button size="sm" onClick={handleSaveDescription}>Save</Button>
                                              <Button size="sm" variant="ghost" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                                          </div>
                                      )}
                                  </div>
                              ) : (
                                  <div className="text-sm text-foreground/90 whitespace-pre-wrap cursor-pointer hover:bg-muted/30 p-2 rounded -ml-2 transition-colors" onClick={() => setIsEditingDesc(true)}>
                                      {description}
                                  </div>
                              )}
                          </div>

                          {/* CHECKLISTS */}
                          <div className="space-y-6">
                              {(selectedTask.checklists || []).map((checklist) => {
                                  const completedCount = checklist.items.filter(i => i.isCompleted).length;
                                  const totalCount = checklist.items.length;
                                  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

                                  return (
                                    <div key={checklist.id} className="space-y-3">
                                        <div className="flex items-center justify-between group/chk">
                                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                                <CheckSquare className="h-5 w-5 text-muted-foreground" /> {checklist.title}
                                            </h3>
                                            <Button variant="ghost" size="sm" className="opacity-0 group-hover/chk:opacity-100 h-8 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleDeleteChecklist(checklist.id)}>Delete</Button>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-muted-foreground w-8">{progress}%</span>
                                            <Progress value={progress} className="h-2 flex-1" />
                                        </div>

                                        <div className="space-y-2 pl-0">
                                            {checklist.items.map(item => (
                                                <div key={item.id} className="flex items-start gap-3 group/item hover:bg-muted/20 p-1.5 rounded -ml-1.5 transition-colors">
                                                    <Checkbox 
                                                        checked={item.isCompleted} 
                                                        onCheckedChange={() => handleToggleChecklistItem(checklist.id, item.id, item.isCompleted)} 
                                                        className="mt-0.5"
                                                    />
                                                    <span className={cn("text-sm transition-all", item.isCompleted && "line-through text-muted-foreground")}>{item.text}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {addingItemTo === checklist.id ? (
                                            <div className="pl-0 space-y-2 animate-in fade-in slide-in-from-top-1">
                                                <Textarea 
                                                    value={newItemText}
                                                    onChange={e => setNewItemText(e.target.value)}
                                                    placeholder="Add an item..."
                                                    className="min-h-[60px] resize-none"
                                                    autoFocus
                                                />
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => handleAddChecklistItem(checklist.id)}>Add</Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setAddingItemTo(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Button variant="secondary" size="sm" className="h-8 bg-muted/50" onClick={() => setAddingItemTo(checklist.id)}>
                                                Add an item
                                            </Button>
                                        )}
                                    </div>
                                  );
                              })}
                          </div>

                      </div>

                      {/* --- DRAGGABLE SPLITTER --- */}
                      <div 
                          className="hidden md:flex w-1 cursor-col-resize bg-border hover:bg-primary transition-colors items-center justify-center group z-10"
                          onMouseDown={startResizing}
                      >
                          <div className="h-8 w-1 bg-border group-hover:bg-primary rounded-full" />
                      </div>

                      {/* RIGHT COLUMN (Activity Stream) - Resizable */}
                      <div style={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : sidebarWidth }} className="flex-shrink-0 bg-muted/10 flex flex-col md:h-full min-h-[500px] relative border-t md:border-t-0" ref={sidebarRef}>
                          
                          <Tabs defaultValue="comments" className="flex-1 flex flex-col h-full overflow-hidden">
                              <div className="px-4 pt-3 pb-2 border-b border-border bg-background">
                                  <TabsList className="w-full bg-muted/50 p-1">
                                      <TabsTrigger value="comments" className="flex-1 text-xs py-1.5"><MessageSquare className="w-3.5 h-3.5 mr-2" /> Comments</TabsTrigger>
                                      <TabsTrigger value="reports" className="flex-1 text-xs py-1.5"><ClipboardList className="w-3.5 h-3.5 mr-2" /> Reports</TabsTrigger>
                                  </TabsList>
                              </div>

                              <TabsContent value="comments" className="m-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden flex-col">
                                  <ScrollArea className="flex-1 p-4">
                                      {/* Input Area */}
                                      <div className="bg-background border border-border rounded-lg shadow-sm p-3 mb-6 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                          <Textarea 
                                              placeholder="Write a comment..." 
                                              value={newComment} 
                                              onChange={e => setNewComment(e.target.value)} 
                                              className="min-h-[40px] border-none focus-visible:ring-0 p-0 resize-none text-sm shadow-none"
                                          />
                                          
                                          {commentAttachment && (
                                              <div className="mt-3 flex items-start gap-3 bg-muted/30 p-2 rounded-md border border-border/50">
                                                  <div className="relative h-16 w-24 rounded overflow-hidden border border-border bg-background flex items-center justify-center group">
                                                      <img src={getFileUrl(commentAttachment)} className="w-full h-full object-cover" />
                                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setCommentAttachment(null)}>
                                                          <X className="text-white h-5 w-5 drop-shadow-md" />
                                                      </div>
                                                  </div>
                                                  <div className="text-xs text-muted-foreground flex flex-col justify-center h-16">
                                                      <span className="font-medium text-foreground">Image attached</span>
                                                      <span>Click Save to post</span>
                                                  </div>
                                              </div>
                                          )}

                                          <div className="flex justify-between items-center pt-3 mt-2 border-t border-border/50">
                                              <div className="flex gap-1">
                                                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()}>
                                                      <ImageIcon className="h-4 w-4 mr-1.5" /> Attach
                                                  </Button>
                                              </div>
                                              <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim() && !commentAttachment} className="h-7 px-4">Save</Button>
                                          </div>
                                      </div>

                                      {/* Stream */}
                                      <div className="space-y-5">
                                          {(selectedTask.comments || []).map((comment) => (
                                              <div key={comment.id} className="flex gap-3 group">
                                                  <div className={cn("w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs text-white border border-border mt-0.5", getMemberColor(comment.user.name))}>
                                                      {getInitials(comment.user.name)}
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="flex items-center gap-2 mb-1 justify-between">
                                                          <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-sm">{comment.user.name}</span>
                                                            <span className="text-[10px] text-muted-foreground">{format(parseISO(comment.createdAt), 'MMM d, p')}</span>
                                                          </div>
                                                          {/* Edit Button */}
                                                          {editingCommentId !== comment.id && (
                                                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}>
                                                                <Pencil className="h-3 w-3 text-muted-foreground" />
                                                            </Button>
                                                          )}
                                                      </div>
                                                      
                                                      {editingCommentId === comment.id ? (
                                                          <div className="space-y-2">
                                                              <Textarea 
                                                                  value={editingCommentText} 
                                                                  onChange={e => setEditingCommentText(e.target.value)} 
                                                                  className="min-h-[60px] text-sm"
                                                              />
                                                              <div className="flex gap-2">
                                                                  <Button size="sm" className="h-7" onClick={() => handleEditComment(comment.id)}>Save</Button>
                                                                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <div className="text-sm text-foreground/90 bg-white dark:bg-card p-2.5 rounded-lg border border-border shadow-sm inline-block min-w-[200px]">
                                                              {comment.content}
                                                              
                                                              {comment.attachmentUrl && (
                                                                <div className="mt-2 group/img cursor-pointer">
                                                                    <div className="rounded-md overflow-hidden border border-border relative">
                                                                        <img src={getFileUrl(comment.attachmentUrl)} alt="Attachment" className="max-w-full max-h-[200px] object-contain bg-muted/20" />
                                                                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors"></div>
                                                                    </div>
                                                                </div>
                                                              )}
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </ScrollArea>
                              </TabsContent>

                              <TabsContent value="reports" className="m-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden flex-col">
                                  <ScrollArea className="flex-1 p-4">
                                      {timelineLoading ? (
                                          <div className="text-center py-10 text-muted-foreground text-sm">Loading reports...</div>
                                      ) : (!timelineData || timelineData.length === 0) ? (
                                          <div className="text-center py-10 text-muted-foreground text-sm">No daily reports recorded yet.</div>
                                      ) : (
                                          <div className="relative pb-2 pl-4">
                                              <div className="absolute left-6 top-1 bottom-0 w-px bg-border" />
                                              <div className="space-y-6">
                                                  {timelineData.map((entry: any, i: number) => (
                                                      <div key={entry.id} className="flex gap-4 relative">
                                                          <div className={cn(
                                                              'w-4 h-4 rounded-full border-[3px] border-background flex-shrink-0 z-10',
                                                              i === 0 ? 'bg-accent' : 'bg-muted-foreground/50'
                                                          )} />
                                                          <div className="flex-1 pb-2">
                                                              <div className="flex items-center justify-between mb-1.5 gap-2">
                                                                  <span className="text-sm font-semibold">{entry.dailyReport?.user?.name || "Unknown"}</span>
                                                                  <span className="text-xs text-muted-foreground">
                                                                      {format(new Date(entry.createdAt), 'dd MMM yyyy')}
                                                                  </span>
                                                              </div>
                                                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium inline-block mb-2', STATUS_COLORS[entry.status] || 'bg-muted text-muted-foreground border-border')}>
                                                                  {STATUS_LABELS[entry.status] || entry.status}
                                                              </span>
                                                              <div className="text-sm text-foreground/90 bg-muted/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed shadow-sm border border-border/50">
                                                                  {entry.workDone}
                                                              </div>
                                                          </div>
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      )}
                                  </ScrollArea>
                              </TabsContent>
                          </Tabs>
                      </div>
                  </div>
                </div>
              )}
           </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;