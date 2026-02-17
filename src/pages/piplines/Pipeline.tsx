// [FILE: src/pages/Pipeline.tsx]
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  MessageSquare, CheckSquare, Plus, Activity, Search, 
  X, AlignLeft, Image as ImageIcon, Check, Pencil, Monitor, FileText, IndianRupee,
  MoreHorizontal, PlusCircle, Trash2
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
  { id: "Ongoing Projects", title: "On Going Projects", color: "border-t-4 border-yellow-500", isSystem: true },
  { id: "Quotation Submitted", title: "Quotation Submitted", color: "border-t-4 border-purple-500", isSystem: true },
  { id: "Completed", title: "Completed", color: "border-t-4 border-green-500", isSystem: true }
];

const COLORS_LIST = [
  "border-gray-500", "border-red-500", "border-orange-500", "border-amber-500",
  "border-yellow-500", "border-lime-500", "border-green-500", "border-emerald-500",
  "border-teal-500", "border-cyan-500", "border-sky-500", "border-blue-500",
  "border-indigo-500", "border-violet-500", "border-purple-500", "border-fuchsia-500",
  "border-pink-500", "border-rose-500"
];

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // --- COLUMN MANAGEMENT STATE ---
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  
  // --- QUICK CREATE CARD STATE ---
  const [addingCardToColumn, setAddingCardToColumn] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardAssignee, setNewCardAssignee] = useState<string>('');

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

  useEffect(() => {
    fetchPipeline();
    fetchUsers();
  }, []);

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
          // Creating a minimal inquiry
          const payload = {
              client_name: newCardTitle,
              mobile_number: "0000000000",
              inquiry_date: new Date().toISOString(),
              address: "Manual Entry",
              sales_person_id: newCardAssignee || allUsers[0]?.id, 
          };

          const { data: newInquiry } = await api.post('/inquiries', payload);
          
          // Move to correct stage immediately if not default
          if (stageId !== "Inquiry") {
              await api.put(`/inquiries/${newInquiry.id}/stage`, { stage: stageId });
              newInquiry.stage = stageId; 
          }

          const assignedUser = allUsers.find(u => u.id === payload.sales_person_id);
          
          const newTask: Task = {
              ...newInquiry,
              sales_person: assignedUser ? { id: assignedUser.id, name: assignedUser.name } : undefined,
              stage: stageId,
              labels: [],
              comments: [],
              checklists: [],
              selections: []
          };

          setTasks(prev => [newTask, ...prev]);
          setNewCardTitle('');
          setNewCardAssignee('');
          setAddingCardToColumn(null);
          toast({ title: "Card Created", description: "New card added successfully." });

      } catch (error) {
          console.error(error);
          toast({ title: "Error", description: "Failed to create card", variant: "destructive" });
      }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDescription(task.description || '');
    setIsEditingDesc(false);
    setEditingCommentId(null);
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
    const currentMembers = selectedTask.sales_persons || [];
    const isAssigned = currentMembers.some(p => p.id === userId);
    let newUserIds: string[];
    if (isAssigned) {
        newUserIds = currentMembers.filter(p => p.id !== userId).map(p => p.id);
    } else {
        newUserIds = [...currentMembers.map(p => p.id), userId];
    }
    try {
      await api.put(`/inquiries/${selectedTask.id}/assign`, { userIds: newUserIds });
      const newMembers = allUsers.filter(u => newUserIds.includes(u.id)).map(u => ({ id: u.id, name: u.name }));
      const updatedTask = { ...selectedTask, sales_persons: newMembers };
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
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    const realId = draggableId.split('::')[1]; 

    const updatedTasks = tasks.map(t => 
      t.id === realId ? { ...t, stage: destination.droppableId, updated_at: new Date().toISOString() } : t
    );
    setTasks(updatedTasks);
    
    try { 
      await api.put(`/inquiries/${realId}/stage`, { stage: destination.droppableId }); 
    } catch (error) { 
      fetchPipeline(); 
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
      const linkedQuote = getLinkedQuote(t);
      const linkedSelection = getLinkedSelection(t);

      // 1. Completed Column: always wins if specifically marked
      if (t.stage === 'Completed') return stage === 'Completed';

      // 2. Quotation Column: Data Driven (Has Quote?)
      if (stage === "Quotation Submitted") return !!linkedQuote;

      // 3. Ongoing Projects: Data Driven (Has Selection? No Quote?)
      if (stage === "Ongoing Projects") return !!linkedSelection && !linkedQuote;

      // 4. Inquiry Column: Default (No Data, No Custom Stage)
      //    We only show here if it doesn't have Selection/Quote AND 
      //    the stage in DB is strictly 'Inquiry' (so moving it to "Queries" hides it here)
      if (stage === "Inquiry") {
         return !linkedSelection && !linkedQuote && t.stage === 'Inquiry';
      }

      // 5. Custom Columns (Queries, Pending Works, etc.)
      return t.stage === stage;
    })
    .filter(t => t.client_name.toLowerCase().includes(search.toLowerCase()) || t.inquiry_number.toLowerCase().includes(search.toLowerCase()));
  };
  
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-6rem)] flex flex-col animate-fade-in">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 px-1">
          <div><h1 className="text-2xl font-bold">Sales Pipeline</h1><p className="text-muted-foreground">Manage inquiries & quotations</p></div>
          <div className="flex items-center gap-3">
             {/* ADD STAGE DROPDOWN */}
             <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 border-dashed">
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

             <div className="w-64 relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search board..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
             </div>
          </div>
        </div>

        {/* Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4 px-1">
            {columns.map((column) => (
              <div key={column.id} className="flex-shrink-0 w-80 flex flex-col rounded-xl bg-muted/40 border border-border/50 group/col relative">
                
                {/* Column Header */}
                <div className={`p-3 font-semibold text-xs flex justify-between items-center bg-background rounded-t-xl border-b ${column.color} border-t-4`}>
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

                {/* Droppable Area */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className={cn("flex-1 p-2 overflow-y-auto space-y-2 min-h-[100px]", snapshot.isDraggingOver ? "bg-muted/50" : "")}>
                        
                        {getTasksByStage(column.id).map((task, index) => {
                            // Link Logic
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
                                    onClick={() => handleTaskClick(task)}
                                    className={cn("bg-background p-2 rounded-lg shadow-sm border border-border hover:border-primary/50 transition-all cursor-pointer group", snapshot.isDragging ? "shadow-xl ring-2 ring-primary rotate-1" : "")}
                                >
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
                                )}
                            </Draggable>
                            );
                        })}
                        {provided.placeholder}

                        {/* --- QUICK ADD CARD BUTTON --- */}
                        {addingCardToColumn === column.id ? (
                            <div className="bg-background p-2 rounded-lg border border-primary/20 shadow-sm animate-in fade-in zoom-in-95">
                                <Input 
                                    placeholder="Client Name / Task Title" 
                                    value={newCardTitle} 
                                    onChange={(e) => setNewCardTitle(e.target.value)} 
                                    className="mb-2 h-8 text-sm"
                                    autoFocus
                                />
                                <select 
                                    className="w-full mb-2 text-xs border rounded p-1.5 bg-background"
                                    value={newCardAssignee}
                                    onChange={(e) => setNewCardAssignee(e.target.value)}
                                >
                                    <option value="">Assign to...</option>
                                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                                <div className="flex gap-2">
                                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleQuickCreateCard(column.id)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => setAddingCardToColumn(null)}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <Button 
                                variant="ghost" 
                                className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 text-xs justify-start px-2"
                                onClick={() => setAddingCardToColumn(column.id)}
                            >
                                <Plus className="h-3.5 w-3.5 mr-2" /> Add Card
                            </Button>
                        )}

                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>

        {/* --- DETAIL MODAL (Unchanged) --- */}
        <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
           <DialogContent className="max-w-5xl h-[85vh] p-0 bg-background border-border flex flex-col overflow-hidden text-foreground">
              {selectedTask && (
                <div className="flex flex-col h-full">
                  <div className="px-6 py-4 border-b border-border bg-card/30 flex-shrink-0 flex justify-between items-start">
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

                  <div className="flex-1 flex overflow-hidden relative">
                      {/* LEFT COLUMN */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-8">
                          
                          <div className="flex flex-wrap items-start gap-8">
                              
                              {/* 1. MEMBERS */}
                              <div className="space-y-1.5">
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
                              <div className="space-y-1.5">
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
                              <div className="space-y-1.5">
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
                          className="w-1 cursor-col-resize bg-border hover:bg-primary transition-colors flex items-center justify-center group z-10"
                          onMouseDown={startResizing}
                      >
                          <div className="h-8 w-1 bg-border group-hover:bg-primary rounded-full" />
                      </div>

                      {/* RIGHT COLUMN (Activity Stream) - Resizable */}
                      <div style={{ width: sidebarWidth }} className="flex-shrink-0 bg-muted/10 flex flex-col h-full relative" ref={sidebarRef}>
                          
                          {/* Activity Header */}
                          <div className="p-4 pb-2 border-b border-border bg-background">
                              <h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Activity</h3>
                          </div>

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