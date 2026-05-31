// [FILE: src/pages/Pipeline.tsx]
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  MessageSquare, CheckSquare, Plus, Activity, Search,
  X, AlignLeft, Image as ImageIcon, Check, Pencil, Monitor, FileText, IndianRupee,
  MoreHorizontal, PlusCircle, Trash2, Clock, ClipboardList, Filter,
  CalendarDays, AtSign, ChevronDown, Users, RefreshCw, BellRing
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
  future_reference?: string;
  future_reference_updated_at?: string; // ADD THIS LINE
  orderIndex?: number; // ADDED: Ensures Strict Ordering Support

  isInactive?: boolean;   // lead with no activity for 2+ days (from backend)
  daysInactive?: number;  // how many days since last activity

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

  payments?: { id: string; amount: number; date: string; status: string; }[];
}
interface Comment {
  id: string;
  content: string;
  attachmentUrl?: string;
  attachmentUrls?: string[];    // ADDED: For multiple attachments
  dueDate?: string | null;
  createdAt: string;
  user: { id: string; name: string };
  mentions?: { isRead?: boolean; user: { id: string; name: string } }[];
  stage?: string;
  checklists?: { id: string; title: string; items: { id: string; text: string; isCompleted: boolean }[] }[];
  selections?: any[];
  payments?: { id: string; amount: number; date: string; status: string; }[];
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

const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: "Inquiry", title: "Inquiry", color: "border-t-4 border-blue-500", isSystem: true },
  { id: "Quotation Submitted", title: "Quotation Submitted", color: "border-t-4 border-purple-500", isSystem: true },
  { id: "Ongoing Projects", title: "On Going Projects", color: "border-t-4 border-yellow-500", isSystem: true },
  { id: "Completed", title: "Completed", color: "border-t-4 border-green-500", isSystem: true },
  { id: "Complaints", title: "Complaints", color: "border-t-4 border-red-500", isSystem: true },
];

// --- REFERENCE STAGES (hidden from the Kanban board, shown in their own tabs) ---
const LOST_STAGE = 'Future Reference';          // lost inquiries kept for future reference
const COMPLETED_REF_STAGE = 'Completed Reference'; // completed clients kept for future reference
const HIDDEN_STAGES = new Set<string>([LOST_STAGE, COMPLETED_REF_STAGE]);

const COLORS_LIST = [
  "border-gray-500", "border-red-500", "border-orange-500", "border-amber-500",
  "border-yellow-500", "border-lime-500", "border-green-500", "border-emerald-500",
  "border-teal-500", "border-cyan-500", "border-sky-500", "border-blue-500",
  "border-indigo-500", "border-violet-500", "border-purple-500", "border-fuchsia-500",
  "border-pink-500", "border-rose-500"
];

const STATUS_LABELS: Record<string, string> = {
  contacted: '📞 Contacted',
  follow_up: '🔄 Follow-up',
  meeting_scheduled: '📅 Meeting Scheduled',
  proposal_sent: '📄 Proposal Sent',
  negotiation: '🤝 Negotiation',
  closed_won: '✅ Closed Won',
  closed_lost: '❌ Closed Lost',
  no_response: '🔇 No Response',
  on_hold: '⏸️ On Hold',
};

const STATUS_COLORS: Record<string, string> = {
  contacted: 'bg-blue-100 text-blue-700 border-blue-200',
  follow_up: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  meeting_scheduled: 'bg-purple-100 text-purple-700 border-purple-200',
  proposal_sent: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  negotiation: 'bg-orange-100 text-orange-700 border-orange-200',
  closed_won: 'bg-green-100 text-green-700 border-green-200',
  closed_lost: 'bg-red-100 text-red-700 border-red-200',
  no_response: 'bg-gray-100 text-gray-600 border-gray-200',
  on_hold: 'bg-slate-100 text-slate-600 border-slate-200',
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

const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';

const getFileUrl = (path: string | undefined) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const baseUrl = api.defaults.baseURL || '';
  const rootUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
  return `${rootUrl}${path}`;
};

const checkHasFullAccess = (task: Task | null, currentUser: any) => {
  if (!task || !currentUser) return false;
  if (currentUser.role === 'super_admin' || currentUser.role === 'admin_hr') return true;
  if (task.sales_person?.id === currentUser.id) return true;
  if (task.sales_persons?.some(p => p.id === currentUser.id)) return true;
  return false;
};

const Pipeline: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const currentUser = profile;
  // Who can use the Future Reference feature: super admins and sales managers.
  const canUseFutureRef = currentUser?.role === 'super_admin' || currentUser?.role === 'sales_manager';
  // Only the super admin reviews/approves inquiry deletion requests.
  const isSuperAdmin = currentUser?.role === 'super_admin';
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
  const [selectedTaskColumn, setSelectedTaskColumn] = useState<string | null>(null);

  // Label State
  const [labelSearch, setLabelSearch] = useState('');
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelTitle, setNewLabelTitle] = useState('');
  const [selectedLabelColor, setSelectedLabelColor] = useState('bg-green-600');

  // Comment State
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]); // CHANGED to array
  const [commentAttachment, setCommentAttachment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingCommentDueDate, setEditingCommentDueDate] = useState<string>(''); // ADDED
  const [editingCommentAttachments, setEditingCommentAttachments] = useState<string[]>([]); // ADDED

  // Due date & @mention state
  const [commentDueDate, setCommentDueDate] = useState<string>('');
  const [mentionQuery, setMentionQuery] = useState<string>('');
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionedUsers, setMentionedUsers] = useState<AppUser[]>([]);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // @mention state for EDIT comment mode
  const [editMentionQuery, setEditMentionQuery] = useState<string>('');
  const [showEditMentionPicker, setShowEditMentionPicker] = useState(false);
  const [editingMentionedUsers, setEditingMentionedUsers] = useState<AppUser[]>([]);
  const editCommentInputRef = useRef<HTMLTextAreaElement>(null);

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
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [filterActivity, setFilterActivity] = useState<string>('all');
  const [filterChecklist, setFilterChecklist] = useState<string>('all');

  // Stage Change State
  const [stageDueDateInput, setStageDueDateInput] = useState('');
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [stagePopoverOpen, setStagePopoverOpen] = useState(false);

  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentDate, setNewPaymentDate] = useState('');

  const STAGE_KEYWORDS = ['Measurement Taken', 'Quotation Submitted', 'Payment Follow Up', 'Quotation Confirmed', 'Final Measurement by Labour'];
  const [stageSuggestions, setStageSuggestions] = useState<string[]>([]);

  // Payment Edit State
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');

  // Label Edit State
  const [editingLabelOriginal, setEditingLabelOriginal] = useState<{ text: string, color: string } | null>(null);
  const [editingLabelText, setEditingLabelText] = useState('');
  const [editingLabelColor, setEditingLabelColor] = useState('bg-green-600');

  // Future Reference State (Super Admin Only)
  const [futureRefTask, setFutureRefTask] = useState<Task | null>(null);
  const [futureRefText, setFutureRefText] = useState('');
  const [futureRefTarget, setFutureRefTarget] = useState<string>(LOST_STAGE); // which box to send to

  // Board-level view: the main Kanban board, the Future Reference board, or the
  // Delete Approvals queue (super admin only).
  const [boardView, setBoardView] = useState<'board' | 'future' | 'approvals'>('board');

  // Delete-approval queue (super admin only)
  interface DeletionRequest {
    id: string;
    inquiryId: string;
    inquiryNumber: string;
    clientName: string;
    reason?: string | null;
    createdAt: string;
    requestedBy?: { id: string; name: string; role: string };
  }
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);



  useEffect(() => {
    fetchPipeline();
    fetchUsers();
    if (isSuperAdmin) fetchDeletionRequests();
  }, []);

  // Load the pending deletion requests for the Super Admin approval tab.
  const fetchDeletionRequests = async () => {
    try {
      const { data } = await api.get('/deletion-requests');
      setDeletionRequests(data);
    } catch (e) { console.error('Failed to load deletion requests', e); }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // If this card already moved into measurement/selection (has a Selection),
    // a non-super-admin can only REQUEST deletion — it goes to the Super Admin's
    // "Delete Approvals" tab. Super admins always delete directly.
    const task = tasks.find(t => t.id === taskId);
    const hasSelection = (task?.selections?.length || 0) > 0;
    const willNeedApproval = !isSuperAdmin && hasSelection;

    let reason: string | null = null;
    if (willNeedApproval) {
      reason = prompt('This inquiry has moved into measurement/selection, so deleting it needs Super Admin approval.\n\nOptionally add a reason, then press OK to send the request:');
      // prompt returns null only when the user cancels.
      if (reason === null) return;
    } else {
      if (!confirm('Are you sure you want to delete this card?')) return;
    }

    try {
      const { data } = await api.delete(`/inquiries/${taskId}`, { data: { reason } });

      if (data?.pendingApproval) {
        toast({ title: "Sent for approval", description: data.message || "Deletion request sent to Super Admin." });
        return; // card stays on the board until approved
      }

      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast({ title: "Deleted", description: "Card deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete card", variant: "destructive" });
    }
  };

  // Super Admin: approve a pending deletion request → really deletes the inquiry.
  const handleApproveDeletion = async (request: DeletionRequest) => {
    if (!confirm(`Approve deletion of Inquiry #${request.inquiryNumber} (${request.clientName})? This permanently deletes it.`)) return;
    try {
      await api.put(`/deletion-requests/${request.id}/approve`);
      setDeletionRequests(prev => prev.filter(r => r.id !== request.id));
      setTasks(prev => prev.filter(t => t.id !== request.inquiryId));
      toast({ title: "Deleted", description: `Inquiry #${request.inquiryNumber} permanently deleted.` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to approve deletion", variant: "destructive" });
    }
  };

  // Super Admin: reject a pending deletion request → keeps the inquiry.
  const handleRejectDeletion = async (request: DeletionRequest) => {
    try {
      await api.put(`/deletion-requests/${request.id}/reject`);
      setDeletionRequests(prev => prev.filter(r => r.id !== request.id));
      toast({ title: "Rejected", description: `Kept Inquiry #${request.inquiryNumber}.` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to reject deletion", variant: "destructive" });
    }
  };

  const fetchPipeline = async () => {
    try {
      const { data } = await api.get('/pipeline');
      // ✅ BOOTSTRAP: Assign default orderIndex if missing to ensure stable sorting
      const normalizedData = data.map((t: Task, i: number) => ({
        ...t,
        orderIndex: t.orderIndex ?? (i * 1000)
      }));
      setTasks(normalizedData);

      const systemIds = new Set(DEFAULT_COLUMNS.map(c => c.id));
      const foundStages = new Set(data.map((t: Task) => t.stage));
      const customStages: ColumnDef[] = [];

      foundStages.forEach((stage: string) => {
        if (!systemIds.has(stage) && !HIDDEN_STAGES.has(stage)) {
          customStages.push({
            id: stage,
            title: stage,
            color: "border-t-4 border-gray-400",
            isSystem: false
          });
        }
      });

      if (customStages.length > 0) {
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
    } catch (e) { console.error(e); }
  };

  // --- COLUMN ACTIONS ---
  const handleAddColumn = () => {
    if (!newColumnTitle.trim()) return;
    const newId = newColumnTitle.trim();

    if (columns.some(c => c.id === newId)) {
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
      // Use the members picked in the create form. If none were picked, default
      // to the current user so every card still has an owner.
      const finalAssignees = newCardAssignees.length > 0
        ? Array.from(new Set(newCardAssignees))
        : (currentUser ? [currentUser.id] : []);

      const primaryAssignee = finalAssignees.length > 0 ? finalAssignees[0] : null;

      let orderIndex: number;
      const colTasks = getOrderedTasksByStage(stageId);

      if (insertAfterTaskId) {
        const afterTaskIndex = colTasks.findIndex(t => t.id === insertAfterTaskId);
        if (afterTaskIndex !== -1) {
          const afterTask = colTasks[afterTaskIndex];
          const nextTask = colTasks[afterTaskIndex + 1];

          const afterIdx = afterTask.orderIndex ?? 0;
          const nextIdx = nextTask ? (nextTask.orderIndex ?? afterIdx + 1000) : afterIdx + 1000;

          orderIndex = Math.round((afterIdx + nextIdx) / 2);
          if (orderIndex === afterIdx) orderIndex = afterIdx + 1;
        } else {
          // Fallback to bottom if not found
          const maxIdx = colTasks.length > 0 ? colTasks[colTasks.length - 1].orderIndex ?? 0 : -1000;
          orderIndex = maxIdx + 1000;
        }
      } else {
        const maxIdx = colTasks.length > 0 ? colTasks[colTasks.length - 1].orderIndex ?? 0 : -1000;
        orderIndex = maxIdx + 1000;
      }

      const payload = {
        client_name: newCardTitle,
        mobile_number: "0000000000",
        inquiry_date: new Date().toISOString(),
        address: "Manual Entry",
        stage: stageId,
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
        orderIndex,
        sales_person: assignedUsers[0] ? { id: assignedUsers[0].id, name: assignedUsers[0].name } : undefined,
        sales_persons: assignedUsers.map(u => ({ id: u.id, name: u.name })),
        stage: stageId,
        labels: [],
        comments: [],
        checklists: [],
        selections: []
      };

      setTasks(prev => [...prev, newTask]);

      setNewCardTitle('');
      setNewCardAssignees([]);
      setAddingCardToColumn(null);
      setInsertAfterTaskId(null);
      toast({ title: "Card Created", description: "New card added successfully." });

    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to create card", variant: "destructive" });
    }
  };

  const toggleNewCardAssignee = (userId: string) => {
    setNewCardAssignees(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Member picker shown inside the "Add Card" form so the linked person(s) can be
  // assigned at creation time, instead of opening the card afterwards.
  const renderAssigneePicker = () => (
    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
            <Users className="h-3.5 w-3.5" /> Members
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start" onClick={e => e.stopPropagation()}>
          <div className="p-3 border-b border-border bg-muted/30">
            <h4 className="text-sm font-semibold">Assign Members</h4>
          </div>
          {/* Native overflow scroll so the mouse wheel works (multi-select) */}
          <div className="p-2 max-h-60 overflow-y-auto">
            {allUsers.map(u => {
              const selected = newCardAssignees.includes(u.id);
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                  onClick={() => toggleNewCardAssignee(u.id)}
                >
                  <Checkbox checked={selected} />
                  <div className={cn("h-6 w-6 rounded-full text-white flex items-center justify-center text-[9px] font-bold", getMemberColor(u.name))}>
                    {getInitials(u.name)}
                  </div>
                  <span className="text-sm capitalize flex-1 truncate">{u.name}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected member avatars */}
      <div className="flex -space-x-1.5">
        {newCardAssignees.map(id => {
          const u = allUsers.find(x => x.id === id);
          if (!u) return null;
          return (
            <div
              key={id}
              className={cn("h-6 w-6 rounded-full text-white flex items-center justify-center text-[9px] font-bold ring-1 ring-background cursor-pointer", getMemberColor(u.name))}
              title={`${u.name} (click to remove)`}
              onClick={() => toggleNewCardAssignee(id)}
            >
              {getInitials(u.name)}
            </div>
          );
        })}
      </div>
    </div>
  );

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

  const handleTaskClick = async (task: Task, columnId: string) => {
    setSelectedTask(task);
    setSelectedTaskColumn(columnId);
    setDescription(task.description || '');
    setIsEditingDesc(false);
    setEditingCommentId(null);
    fetchTimeline(task.id);

    const hasUnread = task.comments?.some(c =>
      (c.stage === columnId || (!c.stage && task.stage === columnId)) &&
      c.mentions?.some(m => m.user?.id === currentUser?.id && m.isRead === false)
    );

    if (hasUnread) {
      try {
        await api.put(`/inquiries/${task.id}/mentions/read`, { stage: columnId });

        const updatedComments = task.comments?.map(c => {
          const isMatchingStage = c.stage === columnId || (!c.stage && task.stage === columnId);
          return {
            ...c,
            mentions: isMatchingStage
              ? c.mentions?.map(m => m.user?.id === currentUser?.id ? { ...m, isRead: true } : m)
              : c.mentions
          };
        });
        updateLocalTask({ ...task, comments: updatedComments });
      } catch (e) {
        console.error('Failed to mark mentions as read', e);
      }
    }
  };

  // --- ACTIONS ---
  const handleAddPayment = async () => {
    if (!selectedTask || !newPaymentAmount || !newPaymentDate) return;
    try {
      const { data } = await api.post(`/inquiries/${selectedTask.id}/payments`, {
        amount: newPaymentAmount,
        date: newPaymentDate
      });

      const currentPayments = selectedTask.payments || [];
      const updatedTask = { ...selectedTask, payments: [...currentPayments, data] };
      updateLocalTask(updatedTask);

      setNewPaymentAmount('');
      setNewPaymentDate('');
      toast({ title: "Payment Added", description: "Payment follow-up scheduled." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to add payment", variant: "destructive" });
    }
  };

  const handleTogglePaymentStatus = async (paymentId: string) => {
    try {
      await api.put(`/payments/${paymentId}/collect`);
      const updatedPayments = (selectedTask?.payments || []).map(p =>
        p.id === paymentId ? { ...p, status: 'collected' } : p
      );
      updateLocalTask({ ...selectedTask!, payments: updatedPayments });
    } catch (e) {
      console.error(e);
    }
  };

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

    const currentMemberIds = [
      ...(selectedTask.sales_person ? [selectedTask.sales_person.id] : []),
      ...(selectedTask.sales_persons || []).map(p => p.id)
    ];

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
    } catch (e) { console.error(e); }
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

  const handleToggleLabel = async (labelDef: { text: string, color: string }) => {
    if (!selectedTask) return;
    const currentLabels = selectedTask.labels || [];
    const existingLabel = currentLabels.find(l => l.text === labelDef.text && l.color === labelDef.color);

    if (existingLabel) {
      try {
        await api.delete(`/labels/${existingLabel.id}`);
        const updatedTask = { ...selectedTask, labels: currentLabels.filter(l => l.id !== existingLabel.id) };
        updateLocalTask(updatedTask);
      } catch (e) { console.error(e); }
    } else {
      try {
        const { data } = await api.post(`/inquiries/${selectedTask.id}/labels`, { color: labelDef.color, text: labelDef.text });
        const updatedTask = { ...selectedTask, labels: [...currentLabels, data] };
        updateLocalTask(updatedTask);
      } catch (e) { console.error(e); }
    }
  };

  const handleCreateLabel = async () => {
    if (!selectedTask || !newLabelTitle.trim()) return;
    await handleToggleLabel({ text: newLabelTitle, color: selectedLabelColor });
    setNewLabelTitle('');
    setIsCreatingLabel(false);
  };

  const handleGlobalLabelDelete = async (text: string, color: string) => {
    if (!confirm('Are you sure you want to delete this label from ALL cards?')) return;
    try {
      await api.post('/labels/delete-global', { text, color });

      // Update local state to remove this label from all tasks immediately
      setTasks(prev => prev.map(t => ({
        ...t,
        labels: (t.labels || []).filter(l => !(l.text === text && l.color === color))
      })));

      if (selectedTask) {
        setSelectedTask(prev => prev ? {
          ...prev,
          labels: (prev.labels || []).filter(l => !(l.text === text && l.color === color))
        } : null);
      }

      toast({ title: "Deleted", description: "Label removed from all cards." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete label", variant: "destructive" });
    }
  };

  const handleGlobalLabelUpdate = async () => {
    if (!editingLabelOriginal || !editingLabelText.trim()) return;
    try {
      await api.put('/labels/update-global', {
        oldText: editingLabelOriginal.text,
        oldColor: editingLabelOriginal.color,
        newText: editingLabelText,
        newColor: editingLabelColor
      });

      // Refetch the board to get the updated labels everywhere
      fetchPipeline();
      setEditingLabelOriginal(null);
      toast({ title: "Updated", description: "Label updated successfully." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to update label", variant: "destructive" });
    }
  };

  const handleAddChecklist = async () => {
    if (!selectedTask || !newChecklistTitle.trim()) return;
    try {
      const { data } = await api.post(`/inquiries/${selectedTask.id}/checklists`, { title: newChecklistTitle });
      const currentChecklists = selectedTask.checklists || [];
      const updatedTask = { ...selectedTask, checklists: [...currentChecklists, { ...data, items: [] }] };
      updateLocalTask(updatedTask);
      setNewChecklistTitle('Checklist');
    } catch (e) { console.error(e); }
  };

  // Function 1: Delete individual checklist items
  const handleDeleteChecklistItem = async (checklistId: string, itemId: string) => {
    try {
      await api.delete(`/checklist-items/${itemId}`);

      const updatedChecklists = (selectedTask?.checklists || []).map(cl => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: cl.items.filter(item => item.id !== itemId)
          };
        }
        return cl;
      });

      const updatedTask = { ...selectedTask!, checklists: updatedChecklists };
      updateLocalTask(updatedTask);
      toast({ title: "Deleted", description: "Checklist item deleted." });
    } catch (e) {
      console.error("Failed to delete item", e);
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  };

  // Function 2: Edit existing payment
  const handleUpdatePayment = async (paymentId: string) => {
    if (!selectedTask || !editPaymentAmount || !editPaymentDate) return;

    try {
      const { data } = await api.put(`/payments/${paymentId}`, {
        amount: Number(editPaymentAmount),
        date: editPaymentDate
      });

      const updatedPayments = (selectedTask.payments || []).map(p =>
        p.id === paymentId ? { ...p, amount: data.amount, date: data.date } : p
      );

      const updatedTask = { ...selectedTask, payments: updatedPayments };
      updateLocalTask(updatedTask);

      setEditingPaymentId(null);
      setEditPaymentAmount('');
      setEditPaymentDate('');
      toast({ title: "Payment Updated", description: "Payment details updated successfully." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to update payment", variant: "destructive" });
    }
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
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // ✅ FIX: Loop through ALL selected files and upload them
    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data.url;
    });

    try {
      // Wait for all images to upload
      const uploadedUrls = await Promise.all(uploadPromises);

      // Route the attachments to either the new comment or the edit mode
      if (editingCommentId) {
        setEditingCommentAttachments(prev => [...prev, ...uploadedUrls]);
      } else {
        setCommentAttachments(prev => [...prev, ...uploadedUrls]);
      }
    } catch (error) {
      toast({ title: "Upload Failed", variant: "destructive" });
    }

    // Clear the file input so you can select the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask) return;

    let updatedTask = { ...selectedTask };
    let hasUpdates = false;

    const matchedStage = STAGE_KEYWORDS.find(s => s.toLowerCase() === newComment.trim().toLowerCase());

    if (matchedStage) {
      try {
        await api.put(`/inquiries/${selectedTask.id}/stage`, {
          stage: matchedStage,
          stageDueDate: commentDueDate || null,
        });
        updatedTask.stage = matchedStage;
        hasUpdates = true;
        toast({ title: 'Stage updated', description: `Moved to "${matchedStage}"` });
      } catch (e) {
        toast({ title: 'Error', variant: 'destructive', description: 'Failed to update stage' });
      }
    }

    if (newComment.trim() || commentAttachments.length > 0) {
      try {
        const { data } = await api.post(`/inquiries/${selectedTask.id}/comments`, {
          content: newComment,
          attachmentUrls: commentAttachments, // Send array of attachments
          attachmentUrl: commentAttachments.length > 0 ? commentAttachments[0] : null, // Fallback for old API
          dueDate: commentDueDate || null,
          mentionedUserIds: mentionedUsers.map(u => u.id),
          stage: selectedTaskColumn
        });

        // Ensure frontend displays attachments immediately even if backend doesn't return the array yet
        const newCommentObj = { ...data, attachmentUrls: data.attachmentUrls || commentAttachments };

        const currentComments = updatedTask.comments || [];
        updatedTask.comments = [newCommentObj, ...currentComments];
        hasUpdates = true;
      } catch (e) {
        toast({ title: "Error", variant: "destructive", description: 'Failed to post comment' });
      }
    }

    if (hasUpdates) {
      // Activity just happened (comment / stage update) → clear the "needs attention" badge instantly
      updatedTask.isInactive = false;
      updatedTask.daysInactive = 0;
      updateLocalTask(updatedTask);
    }

    // Reset states
    setNewComment('');
    setCommentAttachments([]);
    setCommentDueDate('');
    setMentionedUsers([]);
    setPendingStage(null);
    setStageSuggestions([]);
  };


  const handleSaveFutureReference = async () => {
    if (!futureRefTask) return;

    // The target box is chosen explicitly from the 3-dot menu (Lost Inquiry vs
    // Completed Reference), or kept as-is when editing notes from a tab.
    const targetStage = futureRefTarget;

    try {
      // 1. Save the future reference notes
      const { data } = await api.put(`/inquiries/${futureRefTask.id}/future-reference`, {
        future_reference: futureRefText
      });

      // 2. Move the card to the reference stage
      await api.put(`/inquiries/${futureRefTask.id}/stage`, {
        stage: targetStage,
        orderIndex: 0 // Moves it to the top of the column
      });

      // 3. Update the task in the local board state
      setTasks(prev => prev.map(t =>
        t.id === futureRefTask.id ? {
          ...t,
          future_reference: data.future_reference,
          future_reference_updated_at: data.future_reference_updated_at,
          stage: targetStage, // <--- Changes the box locally
          orderIndex: 0
        } : t
      ));

      // 4. Update the selected task if the modal is also open
      if (selectedTask?.id === futureRefTask.id) {
        setSelectedTask(prev => prev ? {
          ...prev,
          future_reference: data.future_reference,
          future_reference_updated_at: data.future_reference_updated_at,
          stage: targetStage
        } : null);
      }

      setFutureRefTask(null);
      setFutureRefText('');
      const label = targetStage === COMPLETED_REF_STAGE ? 'Completed References' : 'Lost Inquiries';
      toast({ title: `Moved to ${label}`, description: "Card is now hidden from the pipeline board." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to save future reference", variant: "destructive" });
    }
  };

  // Restore a reference card back onto the Kanban board.
  // Completed-reference cards return to "Completed"; lost inquiries return to "Inquiry".
  const handleRestoreFromReference = async (task: Task) => {
    const targetStage = task.stage === COMPLETED_REF_STAGE ? 'Completed' : 'Inquiry';
    try {
      await api.put(`/inquiries/${task.id}/stage`, { stage: targetStage, orderIndex: 0 });
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, stage: targetStage, orderIndex: 0 } : t
      ));
      if (selectedTask?.id === task.id) {
        setSelectedTask(prev => prev ? { ...prev, stage: targetStage } : null);
      }
      toast({ title: "Restored", description: `Card moved back to "${targetStage}".` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to restore card", variant: "destructive" });
    }
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);

    const lastAt = val.lastIndexOf('@');
    let isMentioning = false;

    // Handle @ Mentions
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1);
      if (!afterAt.includes(' ')) {
        setMentionQuery(afterAt);
        setShowMentionPicker(true);
        isMentioning = true;
      } else {
        setShowMentionPicker(false);
        setMentionQuery('');
      }
    } else {
      setShowMentionPicker(false);
      setMentionQuery('');
    }

    // ONLY show stage suggestions if we are NOT currently mentioning someone
    if (!isMentioning && val.length >= 2) {
      const matches = STAGE_KEYWORDS.filter(stage => stage.toLowerCase().includes(val.toLowerCase()));
      if (matches.length === 1 && matches[0].toLowerCase() === val.toLowerCase()) {
        setStageSuggestions([]);
      } else {
        setStageSuggestions(matches);
      }
    } else {
      setStageSuggestions([]);
    }
  };

  const handleSelectMention = (user: AppUser) => {
    const lastAt = newComment.lastIndexOf('@');
    const before = newComment.slice(0, lastAt);
    setNewComment(`${before}@${user.name} `);
    if (!mentionedUsers.find(u => u.id === user.id)) {
      setMentionedUsers(prev => [...prev, user]);
    }
    setShowMentionPicker(false);
    setMentionQuery('');
    commentInputRef.current?.focus();
  };

  // Derive the list of mentioned users from the raw text by matching @Name
  // against the known users. This makes add/remove of mentions work naturally:
  // remove an "@Name" from the text and the user stops being mentioned.
  const extractMentionedUsers = (text: string): AppUser[] => {
    if (!text) return [];
    const matched: AppUser[] = [];
    // Match longer names first so "@John Doe" wins over "@John"
    const sorted = [...allUsers].sort((a, b) => b.name.length - a.name.length);
    for (const user of sorted) {
      const escaped = `@${user.name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // word-ish boundary: not immediately followed by a letter/number
      const regex = new RegExp(`${escaped}(?![\\p{L}\\p{N}])`, 'iu');
      if (regex.test(text) && !matched.find(m => m.id === user.id)) {
        matched.push(user);
      }
    }
    return matched;
  };

  const handleEditCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditingCommentText(val);

    // Keep the mentioned-users list in sync with the text so removing an
    // "@Name" un-mentions that person.
    setEditingMentionedUsers(extractMentionedUsers(val));

    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1);
      if (!afterAt.includes(' ')) {
        setEditMentionQuery(afterAt);
        setShowEditMentionPicker(true);
        return;
      }
    }
    setShowEditMentionPicker(false);
    setEditMentionQuery('');
  };

  const handleSelectEditMention = (user: AppUser) => {
    const lastAt = editingCommentText.lastIndexOf('@');
    const before = lastAt !== -1 ? editingCommentText.slice(0, lastAt) : editingCommentText;
    const nextText = `${before}@${user.name} `;
    setEditingCommentText(nextText);
    setEditingMentionedUsers(extractMentionedUsers(nextText));
    setShowEditMentionPicker(false);
    setEditMentionQuery('');
    editCommentInputRef.current?.focus();
  };

  const handleEditComment = async (commentId: string) => {
    if (!selectedTask) return;

    try {
      // Re-derive mentions from the final text so added/removed @mentions are saved
      const finalMentioned = extractMentionedUsers(editingCommentText);

      await api.put(`/comments/${commentId}`, {
        content: editingCommentText,
        dueDate: editingCommentDueDate || null,
        attachmentUrls: editingCommentAttachments,
        attachmentUrl: editingCommentAttachments.length > 0 ? editingCommentAttachments[0] : null,
        mentionedUserIds: finalMentioned.map(u => u.id)
      });

      const currentComments = selectedTask.comments || [];
      const updatedComments = currentComments.map(c =>
        c.id === commentId ? {
          ...c,
          content: editingCommentText,
          dueDate: editingCommentDueDate || null,
          attachmentUrls: editingCommentAttachments,
          attachmentUrl: editingCommentAttachments.length > 0 ? editingCommentAttachments[0] : undefined,
          mentions: finalMentioned.map(u => ({ user: { id: u.id, name: u.name } }))
        } : c
      );

      updateLocalTask({ ...selectedTask, comments: updatedComments });

      // Close edit mode
      setEditingCommentId(null);
      setEditingCommentAttachments([]);
      setEditingCommentDueDate('');
      setEditingMentionedUsers([]);
      setShowEditMentionPicker(false);
      setEditMentionQuery('');

    } catch (e) {
      toast({ title: "Error", description: "Failed to save comment", variant: "destructive" });
    }
  };

  // ADD THIS NEW FUNCTION FOR DELETION
  const handleDeleteComment = async (commentId: string) => {
    if (!selectedTask) return;
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/comments/${commentId}`);
      const updatedComments = (selectedTask.comments || []).filter(c => c.id !== commentId);
      updateLocalTask({ ...selectedTask, comments: updatedComments });
      toast({ title: "Deleted", description: "Comment deleted successfully." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete comment", variant: "destructive" });
    }
  };

  const updateLocalTask = (updatedTask: Task) => {
    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  // ✅ FIXED onDragEnd: Smooth mapping instead of clunky slicing
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

    const currentDestTasks = getOrderedTasksByStage(destStage).filter(t => t.id !== realId);

    let newOrderIndex = 0;
    if (currentDestTasks.length === 0) {
      newOrderIndex = 1000;
    } else if (destination.index === 0) {
      newOrderIndex = (currentDestTasks[0].orderIndex ?? 1000) - 1000;
    } else if (destination.index >= currentDestTasks.length) {
      newOrderIndex = (currentDestTasks[currentDestTasks.length - 1].orderIndex ?? 0) + 1000;
    } else {
      const prevIdx = currentDestTasks[destination.index - 1].orderIndex ?? 0;
      const nextIdx = currentDestTasks[destination.index].orderIndex ?? 0;
      newOrderIndex = Math.round((prevIdx + nextIdx) / 2);
      if (newOrderIndex === prevIdx) newOrderIndex = prevIdx + 1;
    }

    // Efficient UI mapping update (Rendering dynamically handles sorting now)
    setTasks(prev => prev.map(t =>
      t.id === realId
        ? { ...t, stage: destStage, orderIndex: newOrderIndex, updated_at: new Date().toISOString() }
        : t
    ));

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

  // ✅ ADDED SORT FUNCTION HERE: Dynamically sorts everything ensuring stickiness 
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

        let matchesActivity = true;
        if (filterActivity === 'has_comments') {
          matchesActivity = (t.comments || []).length > 0;
        } else if (filterActivity === 'no_comments') {
          matchesActivity = (t.comments || []).length === 0;
        }

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
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)); // 👈 THE MAGIC KEY FOR DRAG & DROP STICKINESS
  };

  // ✅ Used internally for orderIndex logic WITHOUT filters applied
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
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  };


  // Reference stages never render on the MAIN board — they live in the Future Reference tab.
  const mainColumns = columns.filter(col => !HIDDEN_STAGES.has(col.id));

  // The Future Reference tab shows the same board layout, but only these two columns.
  const referenceColumns: ColumnDef[] = [
    { id: LOST_STAGE, title: "Lost Inquiries", color: "border-t-4 border-slate-800", isSystem: true },
    { id: COMPLETED_REF_STAGE, title: "Completed References", color: "border-t-4 border-emerald-600", isSystem: true },
  ];

  // Which columns the board renders depends on the active tab.
  const visibleColumns = boardView === 'future' ? referenceColumns : mainColumns;

  // Combined count for the Future Reference tab badge.
  const referenceCount = tasks.filter(t => HIDDEN_STAGES.has(t.stage)).length;

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

            {/* FIXED FILTER PANEL */}
            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />

                <div className="fixed top-20 right-6 z-50 w-[340px] bg-background border border-border rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">

                  <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-muted/30 rounded-t-xl">
                    <h4 className="font-semibold text-sm">Filter Cards</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                        onClick={() => {
                          setFilterUser('all'); setFilterLabel('all'); setFilterDate('');
                          setFilterActivity('all'); setFilterChecklist('all');
                        }}
                      >
                        Clear all
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setIsFilterOpen(false)}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                    {/* Filter Forms */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">👤 Assigned User</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                        <option value="all">All Users</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">🏷️ Label</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
                        <option value="all">All Labels</option>
                        {getUniqueLabels().map((l: any, i) => (
                          <option key={i} value={l.text}>{l.text}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">📅 Month</label>
                      <Input type="month" className="h-9 text-sm w-full bg-background" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">💬 Comments</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{ value: 'all', label: 'Any' }, { value: 'has_comments', label: 'Has Comments' }, { value: 'no_comments', label: 'No Comments' }].map(opt => (
                          <button key={opt.value} onClick={() => setFilterActivity(opt.value)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-all", filterActivity === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>{opt.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">✅ Checklist</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{ value: 'all', label: 'Any' }, { value: 'has_checklist', label: 'Has Checklist' }, { value: 'incomplete', label: 'Has Incomplete' }].map(opt => (
                          <button key={opt.value} onClick={() => setFilterChecklist(opt.value)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-all", filterChecklist === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>{opt.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">📌 Stage</label>
                      <div className="flex gap-2 flex-wrap">
                        {['all', ...columns.map(c => c.id)].map(stageId => (
                          <button key={stageId} onClick={() => setFilterStage(stageId)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-all", filterStage === stageId ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                            {stageId === 'all' ? 'All Stages' : columns.find(c => c.id === stageId)?.title || stageId}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-border bg-muted/20 rounded-b-xl flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {(filterUser !== 'all' || filterLabel !== 'all' || filterDate || filterActivity !== 'all' || filterChecklist !== 'all' || filterStage !== 'all') ? '🔵 Filters active' : 'No filters applied'}
                    </span>
                    <Button size="sm" className="h-7 px-4 text-xs" onClick={() => setIsFilterOpen(false)}>Done</Button>
                  </div>
                </div>
              </>
            )}

            {/* ADD STAGE DROPDOWN */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed w-full sm:w-auto"><PlusCircle className="h-4 w-4" /> Add Stage</Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <h4 className="font-semibold text-sm mb-2">Create New Stage</h4>
                <div className="flex gap-2">
                  <Input placeholder="Stage Name (e.g. Queries)" value={newColumnTitle} onChange={(e) => setNewColumnTitle(e.target.value)} className="h-8 text-xs" />
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

        {/* VIEW TABS — main board + the Future Reference board (Super Admin / Sales Manager only) */}
        {canUseFutureRef && (
          <div className="flex items-center gap-1 mb-4 px-1">
            {[
              { id: 'board', label: 'Pipeline Board' },
              { id: 'future', label: 'Future Reference', count: referenceCount },
              // Delete Approvals — Super Admin only
              ...(isSuperAdmin ? [{ id: 'approvals', label: 'Delete Approvals', count: deletionRequests.length }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setBoardView(tab.id as 'board' | 'future' | 'approvals')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium border transition-all flex items-center gap-2",
                  boardView === tab.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {tab.label}
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <Badge variant={boardView === tab.id ? "secondary" : "outline"} className="h-5">{tab.count}</Badge>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Delete Approvals queue — Super Admin reviews pending inquiry deletions here */}
        {boardView === 'approvals' && isSuperAdmin && (
          <div className="flex-1 overflow-y-auto px-1 pb-4">
            {deletionRequests.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-20">
                <Trash2 className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">No pending deletion requests</p>
                <p className="text-xs">When a sales person deletes an inquiry that has a measurement/selection, it will appear here for your approval.</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-3xl">
                {deletionRequests.map(req => (
                  <div key={req.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4 shadow-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">#{req.inquiryNumber}</span>
                        <span className="text-sm text-muted-foreground">·</span>
                        <span className="text-sm font-medium truncate">{req.clientName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Requested by <span className="font-medium">{req.requestedBy?.name || 'Unknown'}</span>
                        {' · '}{format(parseISO(req.createdAt), 'dd MMM yyyy, h:mm a')}
                      </p>
                      {req.reason && (
                        <p className="text-xs mt-2 bg-muted/50 rounded-md px-2 py-1.5">
                          <span className="font-medium">Reason:</span> {req.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleRejectDeletion(req)}>
                        Reject
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleApproveDeletion(req)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Approve &amp; Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Board — renders the main columns or the reference columns depending on the tab */}
        {boardView !== 'approvals' && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="all-columns" direction="horizontal" type="column">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="flex-1 flex gap-4 overflow-x-auto pb-4 px-1"
              >
                {/* CHANGE THIS LINE */}
                {visibleColumns.map((column, columnIndex) => (
                  <Draggable key={column.id} draggableId={`col-${column.id}`} index={columnIndex} isDragDisabled={!!column.isSystem}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="flex-shrink-0 w-80 flex flex-col rounded-xl bg-muted/40 border border-border/50 group/col relative"
                      >

                        {/* Column Header */}
                        <div
                          {...provided.dragHandleProps}
                          className={`p-3 font-semibold text-xs flex justify-between items-center bg-background rounded-t-xl border-b ${column.color} border-t-4`}
                        >
                          <span className="flex items-center gap-2">
                            {column.title}
                            <Badge variant="secondary" className="ml-2 h-5">{getTasksByStage(column.id).length}</Badge>
                          </span>

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
                                const hasFullAccess = checkHasFullAccess(task, currentUser);

                                return (
                                  <Draggable key={uniqueDraggableId} draggableId={uniqueDraggableId} index={index} isDragDisabled={!hasFullAccess}>
                                    {(provided, snapshot) => {

                                      const hasUnreadMention = task.comments?.some(c =>
                                        (c.stage === column.id || (!c.stage && task.stage === column.id)) &&
                                        c.mentions?.some(m => m.user?.id === currentUser?.id && m.isRead === false)
                                      );

                                      return (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                          className="flex flex-col gap-2" // ✅ Wrapped to maintain clean inline addition
                                        >
                                          {/* --- THE ACTUAL CARD --- */}
                                          <div



                                            onClick={() => handleTaskClick(task, column.id)}
                                            className={cn(
                                              "p-2 rounded-lg shadow-sm border transition-all cursor-pointer group relative",
                                              snapshot.isDragging ? "bg-background shadow-xl ring-2 ring-primary rotate-1 border-primary/50" : "bg-background border-border hover:border-primary/50",
                                              hasUnreadMention && "ring-2 ring-blue-500 animate-pulse bg-blue-50/60 shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-400",
                                              task.isInactive && !hasUnreadMention && "ring-1 ring-red-400 border-red-300 bg-red-50/40"
                                            )}
                                          >
                                            {/* ACTIONS (Shows on Hover) */}
                                            {hasFullAccess && (
                                              <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">

                                                {/* SUPER ADMIN / SALES MANAGER: 3-Dot Menu for Future Reference */}
                                                {canUseFutureRef && (
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <Button variant="outline" size="icon" className="h-6 w-6 rounded-full shadow-md hover:scale-110 bg-background text-primary" onClick={e => e.stopPropagation()}>
                                                        <MoreHorizontal className="h-3 w-3" />
                                                      </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                      <DropdownMenuItem
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setFutureRefTask(task);
                                                          setFutureRefTarget(LOST_STAGE);
                                                          // Only Super Admin can see existing notes. Others get a blank box to write a new note.
                                                          setFutureRefText(task.future_reference || '');
                                                        }}
                                                        className="cursor-pointer"
                                                      >
                                                        <FileText className="h-3.5 w-3.5 mr-2" />
                                                        Send to Lost Inquiries
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setFutureRefTask(task);
                                                          setFutureRefTarget(COMPLETED_REF_STAGE);
                                                          setFutureRefText(task.future_reference || '');
                                                        }}
                                                        className="cursor-pointer"
                                                      >
                                                        <FileText className="h-3.5 w-3.5 mr-2" />
                                                        Send to Completed References
                                                      </DropdownMenuItem>
                                                      {HIDDEN_STAGES.has(task.stage) && (
                                                        <DropdownMenuItem
                                                          onClick={(e) => { e.stopPropagation(); handleRestoreFromReference(task); }}
                                                          className="cursor-pointer"
                                                        >
                                                          <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                                          Restore to Pipeline
                                                        </DropdownMenuItem>
                                                      )}
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                )}

                                                {/* Add Card Button */}
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

                                                {/* Delete Button */}
                                                <Button
                                                  variant="destructive"
                                                  size="icon"
                                                  className="h-6 w-6 rounded-full shadow-md hover:scale-110"
                                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            )}

                                            {/* FORGOTTEN-LEAD BADGE — no activity for 2+ days */}
                                            {task.isInactive && (
                                              <div
                                                className="flex items-center gap-1 mb-1.5 px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-semibold leading-none w-fit"
                                                title={`No activity for ${task.daysInactive} day${task.daysInactive === 1 ? '' : 's'} — please follow up`}
                                              >
                                                <BellRing className="h-2.5 w-2.5" />
                                                Needs attention · {task.daysInactive}d idle
                                              </div>
                                            )}

                                            {/* (Leave the labels mapping right below this untouched) */}
                                            {(task.labels || []).length > 0 && (
                                              <div className="flex gap-1 mb-1.5 flex-wrap">
                                                {task.labels!.map((l: any) => (
                                                  <div key={l.id} className={`${l.color} h-1.5 w-6 rounded-full capitalize`} title={l.text}></div>
                                                ))}
                                              </div>
                                            )}

                                            <div className="mb-1 flex justify-between items-start">
                                              <div className="flex items-center gap-3">
                                                <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded border leading-none py-0.5">
                                                  {isQuoteStage && linkedQuote ? linkedQuote.quotation_number :
                                                    isOngoingStage && linkedSelection ? linkedSelection.selection_number :
                                                      task.inquiry_number}
                                                </span>

                                                {(() => {
                                                  const pendingPayments = (task.payments || []).filter(p => p.status !== 'collected');
                                                  const pendingPaymentsCount = pendingPayments.length;
                                                  if (pendingPaymentsCount === 0) return null;

                                                  const today = new Date();
                                                  today.setHours(0, 0, 0, 0);

                                                  // Defaults
                                                  let bellColor = 'text-blue-500';
                                                  let badgeBg = 'bg-blue-600';
                                                  let animation = '';

                                                  let minDiffDays = Infinity;

                                                  // Find the most urgent payment
                                                  pendingPayments.forEach(p => {
                                                    const pDate = new Date(p.date);
                                                    pDate.setHours(0, 0, 0, 0);
                                                    const diffTime = pDate.getTime() - today.getTime();
                                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                    if (diffDays < minDiffDays) minDiffDays = diffDays;
                                                  });

                                                  if (minDiffDays <= 0) {
                                                    // Red: On the same day or overdue
                                                    bellColor = 'text-red-500';
                                                    badgeBg = 'bg-red-600';
                                                    animation = 'animate-bounce';
                                                  } else if (minDiffDays === 1) {
                                                    // Orange: 1 day before
                                                    bellColor = 'text-orange-500';
                                                    badgeBg = 'bg-orange-600';
                                                    animation = 'animate-pulse';
                                                  } else if (minDiffDays === 2) {
                                                    // Yellow: 2 days before
                                                    bellColor = 'text-yellow-500';
                                                    badgeBg = 'bg-yellow-600';
                                                  }

                                                  return (
                                                    <div className={`relative flex items-center justify-center ${bellColor} ${animation}`} title={`${pendingPaymentsCount} Pending Payment(s)`}>
                                                      <BellRing className="w-5 h-5" />
                                                      <span className={`absolute -top-1.5 -right-1.5 ${badgeBg} text-white text-[9px] font-bold h-4 w-4 flex items-center justify-center rounded-full leading-none shadow-sm border border-background`}>
                                                        {pendingPaymentsCount}
                                                      </span>
                                                    </div>
                                                  );
                                                })()}
                                              </div>

                                              <div className="flex items-center gap-2">
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
                                            </div>
                                            <h4 className="font-semibold text-xs mb-2 leading-tight">{task.client_name}</h4>
                                            {/* --- PASTE THIS DIRECTLY BELOW THE CLIENT NAME IN THE CARD --- */}
                                            {HIDDEN_STAGES.has(column.id) && task.future_reference_updated_at && (
                                              <div className="mb-2 text-[9px] font-medium text-amber-700 bg-amber-50/80 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 w-fit">
                                                <Clock className="h-2.5 w-2.5" />
                                                {format(new Date(task.future_reference_updated_at), 'dd MMM yyyy, hh:mm a')}
                                              </div>
                                            )}
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
                                                  ) : (<div className="h-5"></div>);
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
                                          {/* --- END OF ACTUAL CARD --- */}

                                          {/* ✅ INLINE ADD CARD INPUT */}
                                          {addingCardToColumn === column.id && insertAfterTaskId === task.id && (
                                            <div className="p-2 bg-background rounded-lg border border-primary shadow-sm animate-in fade-in zoom-in-95 mt-1">
                                              <Input
                                                autoFocus
                                                placeholder="Enter client name..."
                                                value={newCardTitle}
                                                onChange={e => setNewCardTitle(e.target.value)}
                                                className="h-8 text-xs mb-2"
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') handleQuickCreateCard(column.id);
                                                  if (e.key === 'Escape') { setAddingCardToColumn(null); setNewCardTitle(''); setInsertAfterTaskId(null); setNewCardAssignees([]); }
                                                }}
                                              />
                                              {renderAssigneePicker()}
                                              <div className="flex gap-2">
                                                <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleQuickCreateCard(column.id)}>Add</Button>
                                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingCardToColumn(null); setNewCardTitle(''); setInsertAfterTaskId(null); setNewCardAssignees([]); }}>Cancel</Button>
                                              </div>
                                            </div>
                                          )}

                                        </div>
                                      )
                                    }}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}

                              {/* ✅ BOTTOM ADD CARD INPUT (hidden in reference columns) */}
                              {!HIDDEN_STAGES.has(column.id) && (addingCardToColumn === column.id && !insertAfterTaskId ? (
                                <div className="p-2 bg-background rounded-lg border border-primary shadow-sm animate-in fade-in zoom-in-95 mt-2">
                                  <Input
                                    autoFocus
                                    placeholder="Enter client name..."
                                    value={newCardTitle}
                                    onChange={e => setNewCardTitle(e.target.value)}
                                    className="h-8 text-xs mb-2"
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleQuickCreateCard(column.id);
                                      if (e.key === 'Escape') { setAddingCardToColumn(null); setNewCardTitle(''); setInsertAfterTaskId(null); setNewCardAssignees([]); }
                                    }}
                                  />
                                  {renderAssigneePicker()}
                                  <div className="flex gap-2">
                                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleQuickCreateCard(column.id)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingCardToColumn(null); setNewCardTitle(''); setInsertAfterTaskId(null); setNewCardAssignees([]); }}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 text-xs justify-start px-2"
                                  onClick={() => { setAddingCardToColumn(column.id); setInsertAfterTaskId(null); }}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-2" /> Add Card
                                </Button>
                              ))}
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
        )}

        {/* --- DETAIL MODAL --- */}
        <Dialog open={!!selectedTask} onOpenChange={(open) => {
          if (!open) {
            setSelectedTask(null);
            setPendingStage(null);
            setStageDueDateInput('');
            setStagePopoverOpen(false);
          }
        }}>
          <DialogContent className="max-w-[95vw] md:max-w-5xl h-[90vh] md:h-[85vh] p-0 bg-background border-border flex flex-col overflow-hidden text-foreground">
            {selectedTask && (() => {
              const hasFullAccess = checkHasFullAccess(selectedTask, currentUser);

              return (
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

                            {hasFullAccess && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-dashed bg-muted/50 text-muted-foreground hover:text-foreground -ml-2 z-10 ring-2 ring-background">
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0" align="start">
                                  <div className="p-3 border-b border-border bg-muted/30">
                                    <h4 className="text-sm font-semibold">Assign Members</h4>
                                  </div>
                                  {/* Drive scroll manually: this popover portals outside the Dialog,
                                      where Radix's scroll-lock blocks the mouse wheel. */}
                                  <div
                                    className="p-2 max-h-60 overflow-y-auto"
                                    onWheel={(e) => {
                                      e.currentTarget.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
                                    }}
                                  >
                                    {allUsers.map(user => {
                                      const isAssigned = [
                                        ...(selectedTask.sales_person ? [selectedTask.sales_person] : []),
                                        ...(selectedTask.sales_persons || [])
                                      ].some(m => m.id === user.id);
                                      return (
                                        <div key={user.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer" onClick={() => handleToggleMember(user.id)}>
                                          <Checkbox checked={isAssigned} />
                                          <span className="text-sm capitalize">{user.name}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 w-full sm:w-auto">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Labels</h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(selectedTask.labels || []).map(l => (
                              <div key={l.id} className={`${l.color} text-white px-3 py-1 rounded-[3px] text-sm font-medium cursor-default shadow-sm min-h-[32px] flex items-center justify-center`} >
                                {l.text}
                              </div>
                            ))}

                            {hasFullAccess && (
                              <Popover open={isCreatingLabel} onOpenChange={setIsCreatingLabel}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-8 border-dashed bg-muted/50 text-muted-foreground hover:text-foreground px-3">
                                    <Plus className="h-4 w-4 mr-1" /> Add Label
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0" align="start">
                                  <div className="p-3 border-b border-border bg-muted/30">
                                    <h4 className="text-sm font-semibold">Labels</h4>
                                  </div>
                                  <div className="p-3 space-y-3">
                                    <div className="space-y-2">
                                      <Input placeholder="Label text" value={newLabelTitle} onChange={e => setNewLabelTitle(e.target.value)} className="h-8 text-sm" />
                                      <div className="flex flex-wrap gap-2">
                                        {LABEL_COLORS.map(color => (
                                          <div key={color} className={`h-6 w-6 rounded cursor-pointer ${color} ${selectedLabelColor === color ? 'ring-2 ring-offset-2 ring-primary' : ''}`} onClick={() => setSelectedLabelColor(color)} />
                                        ))}
                                      </div>
                                      <Button size="sm" className="w-full" onClick={handleCreateLabel} disabled={!newLabelTitle.trim()}>Create New Label</Button>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                      <p className="text-xs font-semibold text-muted-foreground">Existing Labels</p>
                                      {getUniqueLabels().map((label: any, idx: number) => {
                                        const isActive = (selectedTask.labels || []).some(l => l.text === label.text && l.color === label.color);

                                        // Edit Mode UI
                                        if (editingLabelOriginal?.text === label.text && editingLabelOriginal?.color === label.color) {
                                          return (
                                            <div key={idx} className="flex flex-col gap-2 p-2 border border-border rounded bg-muted/20">
                                              <Input value={editingLabelText} onChange={e => setEditingLabelText(e.target.value)} className="h-7 text-xs" />
                                              <div className="flex flex-wrap gap-1">
                                                {LABEL_COLORS.map(color => (
                                                  <div key={color} className={`h-4 w-4 rounded cursor-pointer ${color} ${editingLabelColor === color ? 'ring-2 ring-offset-1 ring-primary' : ''}`} onClick={() => setEditingLabelColor(color)} />
                                                ))}
                                              </div>
                                              <div className="flex gap-2 mt-1">
                                                <Button size="sm" className="h-6 px-2 text-[10px]" onClick={handleGlobalLabelUpdate}>Save</Button>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingLabelOriginal(null)}>Cancel</Button>
                                              </div>
                                            </div>
                                          );
                                        }

                                        // Default View UI (With Hover Edit/Delete)
                                        return (
                                          <div key={idx} className="flex items-center justify-between p-1 hover:bg-muted rounded group">
                                            <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => handleToggleLabel(label)}>
                                              <Checkbox checked={isActive} />
                                              {/* Note the 'capitalize' class added below */}
                                              <div className={`${label.color} text-white px-2 py-0.5 rounded text-xs capitalize`}>{label.text}</div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingLabelOriginal(label);
                                                setEditingLabelText(label.text);
                                                setEditingLabelColor(label.color);
                                              }}>
                                                <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => {
                                                e.stopPropagation();
                                                handleGlobalLabelDelete(label.text, label.color);
                                              }}>
                                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>

                        {hasFullAccess && (
                          <div className="space-y-1.5 w-full sm:w-auto">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add to card</h4>
                            <div className="flex items-center gap-2 flex-wrap">
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

                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="secondary" className="h-8 text-sm bg-muted shadow-sm px-3">
                                    <IndianRupee className="h-3.5 w-3.5 mr-2" /> Payment
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-0" align="start">
                                  <div className="p-3 border-b border-border bg-muted/30">
                                    <h4 className="text-sm font-semibold text-center">Schedule Payment</h4>
                                  </div>
                                  <div className="p-4 space-y-3">
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-semibold text-muted-foreground">Amount</label>
                                      <Input type="number" placeholder="Enter amount..." value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} className="h-8 text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-xs font-semibold text-muted-foreground">Date</label>
                                      <Input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} className="h-8 text-sm" />
                                    </div>
                                    <Button className="w-full h-8" onClick={handleAddPayment}>Save Payment</Button>
                                  </div>
                                </PopoverContent>
                              </Popover>

                              {getLinkedQuote(selectedTask) && (
                                <Button variant="outline" className="h-8 text-sm shadow-sm px-3 text-green-600 border-green-200 bg-green-50">
                                  <FileText className="h-3.5 w-3.5 mr-2" /> View Quote
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* FUTURE REFERENCE DISPLAY (Super Admin Only) */}
                      {canUseFutureRef && selectedTask.future_reference && (
                        <>
                          <div className="space-y-3 group bg-amber-50 p-4 rounded-lg border border-amber-200">
                            <div className="flex justify-between items-center">
                              <h3 className="font-semibold flex items-center gap-2 text-lg text-amber-800">
                                <FileText className="h-5 w-5" /> Future Reference Notes
                              </h3>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-amber-700 border-amber-300 hover:bg-amber-100"
                                onClick={() => {
                                  setFutureRefTask(selectedTask);
                                  setFutureRefTarget(selectedTask.stage);
                                  setFutureRefText(selectedTask.future_reference || '');
                                }}
                              >
                                Edit Notes
                              </Button>
                            </div>
                            <div className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                              {selectedTask.future_reference}
                            </div>
                          </div>
                          <Separator className="my-6" />
                        </>
                      )}

                      {/* DESCRIPTION */}
                      <div className="space-y-3 group">
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold flex items-center gap-2 text-lg"><AlignLeft className="h-5 w-5 text-muted-foreground" /> Description</h3>
                          {hasFullAccess && !isEditingDesc && description && (
                            <Button variant="secondary" size="sm" className="h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setIsEditingDesc(true)}>Edit</Button>
                          )}
                        </div>

                        {hasFullAccess && (isEditingDesc || !description) ? (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Add a more detailed description..."
                              className="min-h-[120px] bg-muted/30 border-transparent focus:bg-background focus:border-primary resize-none p-3"
                              value={description}
                              onChange={e => setDescription(e.target.value)}
                              onBlur={() => { if (!description) setIsEditingDesc(false) }}
                            />
                            {isEditingDesc && (
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveDescription}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-foreground/90 whitespace-pre-wrap cursor-pointer hover:bg-muted/30 p-2 rounded -ml-2 transition-colors" onClick={() => hasFullAccess && setIsEditingDesc(true)}>
                            {description || "No description provided."}
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
                                {hasFullAccess && (
                                  <Button variant="ghost" size="sm" className="opacity-0 group-hover/chk:opacity-100 h-8 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleDeleteChecklist(checklist.id)}>Delete Checklist</Button>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-8">{progress}%</span>
                                <Progress value={progress} className="h-2 flex-1" />
                              </div>

                              <div className="space-y-2 pl-0">
                                {checklist.items.map(item => (
                                  <div key={item.id} className="flex items-start justify-between group/item hover:bg-muted/20 p-1.5 rounded -ml-1.5 transition-colors">
                                    <div className="flex items-start gap-3">
                                      <Checkbox
                                        checked={item.isCompleted}
                                        onCheckedChange={() => handleToggleChecklistItem(checklist.id, item.id, item.isCompleted)}
                                        className="mt-0.5"
                                        disabled={!hasFullAccess}
                                      />
                                      <span className={cn("text-sm transition-all", item.isCompleted && "line-through text-muted-foreground")}>{item.text}</span>
                                    </div>

                                    {/* Added 1-by-1 Delete Button */}
                                    {hasFullAccess && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => handleDeleteChecklistItem(checklist.id, item.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {hasFullAccess && (
                                addingItemTo === checklist.id ? (
                                  <div className="pl-0 space-y-2 animate-in fade-in slide-in-from-top-1">
                                    {/* Replaced Textarea with Input */}
                                    <Input
                                      value={newItemText}
                                      onChange={e => setNewItemText(e.target.value)}
                                      placeholder="Add an item..."
                                      className="h-8 text-sm"
                                      autoFocus
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleAddChecklistItem(checklist.id);
                                        if (e.key === 'Escape') setAddingItemTo(null);
                                      }}
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" className="h-7" onClick={() => handleAddChecklistItem(checklist.id)}>Add</Button>
                                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddingItemTo(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button variant="secondary" size="sm" className="h-8 bg-muted/50" onClick={() => setAddingItemTo(checklist.id)}>
                                    Add an item
                                  </Button>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* PAYMENTS - Wrapped in hasFullAccess for assigned members only */}
                      {hasFullAccess && (selectedTask.payments || []).length > 0 && (
                        <div className="space-y-3 mt-6">
                          <h3 className="font-semibold flex items-center gap-2 text-lg">
                            <IndianRupee className="h-5 w-5 text-muted-foreground" /> Payments
                          </h3>
                          <div className="space-y-2">
                            {selectedTask.payments!.map((payment: any) => (
                              <div key={payment.id} className="flex flex-col p-2.5 border border-border rounded-lg bg-background shadow-sm hover:border-primary/50 transition-colors group">

                                {editingPaymentId === payment.id ? (
                                  <div className="flex flex-col gap-2">
                                    <div className="flex gap-2 items-center">
                                      <Input
                                        type="number"
                                        value={editPaymentAmount}
                                        onChange={(e) => setEditPaymentAmount(e.target.value)}
                                        className="h-8 text-sm w-32"
                                        placeholder="Amount"
                                      />
                                      <Input
                                        type="date"
                                        value={editPaymentDate}
                                        onChange={(e) => setEditPaymentDate(e.target.value)}
                                        className="h-8 text-sm flex-1"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleUpdatePayment(payment.id)}>Save</Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingPaymentId(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={payment.status === 'collected'}
                                        onCheckedChange={() => handleTogglePaymentStatus(payment.id)}
                                        disabled={payment.status === 'collected'}
                                      />
                                      <div className={cn("flex flex-col", payment.status === 'collected' && "opacity-50 line-through")}>
                                        <span className="font-bold text-sm text-green-600 flex items-center">
                                          ₹{payment.amount.toLocaleString()}
                                        </span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          <CalendarDays className="h-3 w-3" /> Due: {format(new Date(payment.date), 'dd MMM yyyy')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">

                                      {/* Edit Pencil Icon (Only shows on hover if not collected) */}
                                      {payment.status !== 'collected' && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => {
                                            setEditingPaymentId(payment.id);
                                            setEditPaymentAmount(payment.amount.toString());
                                            setEditPaymentDate(new Date(payment.date).toISOString().split('T')[0]);
                                          }}
                                        >
                                          <Pencil className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                      )}

                                      {payment.status === 'collected' ? (
                                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold uppercase">Collected</span>
                                      ) : (
                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold uppercase">Pending</span>
                                      )}
                                    </div>
                                  </div>
                                )}

                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* DRAGGABLE SPLITTER */}
                    <div
                      className="hidden md:flex w-1 cursor-col-resize bg-border hover:bg-primary transition-colors items-center justify-center group z-10"
                      onMouseDown={startResizing}
                    >
                      <div className="h-8 w-1 bg-border group-hover:bg-primary rounded-full" />
                    </div>

                    {/* RIGHT COLUMN (Activity Stream) */}
                    <div style={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : sidebarWidth }} className="flex-shrink-0 bg-muted/10 flex flex-col md:h-full min-h-[500px] relative border-t md:border-t-0" ref={sidebarRef}>

                      <Tabs defaultValue="comments" className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="px-4 pt-3 pb-2 border-b border-border bg-background">
                          <TabsList className="w-full bg-muted/50 p-1">
                            <TabsTrigger value="comments" className="flex-1 text-xs py-1.5"><MessageSquare className="w-3.5 h-3.5 mr-2" /> Comments</TabsTrigger>
                            <TabsTrigger value="reports" className="flex-1 text-xs py-1.5"><ClipboardList className="w-3.5 h-3.5 mr-2" /> Reports</TabsTrigger>
                          </TabsList>
                        </div>
                        <TabsContent value="comments" className="m-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden flex-col">
                          <div className="flex-1 p-4 overflow-y-auto">

                            {hasFullAccess ? (
                              <div className="bg-background border border-border rounded-lg shadow-sm p-3 mb-6 focus-within:ring-2 focus-within:ring-primary/20 transition-all relative flex flex-col z-50">

                                {stageSuggestions.length > 0 && (
                                  <div className="absolute top-full left-0 mt-2 w-full bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 z-[100]">
                                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-3 py-2 bg-muted/50 border-b border-border">
                                      Select Stage to Move Card
                                    </div>
                                    {stageSuggestions.map(stage => (
                                      <div
                                        key={stage}
                                        className="px-4 py-2.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground cursor-pointer transition-colors"
                                        onClick={() => {
                                          setNewComment(stage);
                                          setStageSuggestions([]);
                                          commentInputRef.current?.focus();
                                        }}
                                      >
                                        {stage}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <Textarea
                                  ref={commentInputRef}
                                  placeholder="Write a comment… type @ to mention someone"
                                  value={newComment}
                                  onChange={handleCommentChange}
                                  className="min-h-[40px] border-none focus-visible:ring-0 p-0 resize-none text-sm shadow-none flex-1"
                                />

                                {showMentionPicker && (
                                  <div className="absolute left-3 z-[150] bg-popover border border-border rounded-xl shadow-2xl w-56 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
                                    style={{ top: '100%', marginTop: 8 }}
                                  >
                                    <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/30">
                                      <AtSign className="h-3 w-3 inline mr-1" />Mention teammate
                                    </div>
                                    <div className="py-1 max-h-44 overflow-y-auto">
                                      {(() => {
                                        const visibleUsers = allUsers.filter(u =>
                                          u.name.toLowerCase().includes(mentionQuery.toLowerCase())
                                        );

                                        if (visibleUsers.length === 0) {
                                          return <p className="text-xs text-muted-foreground px-3 py-2">No users found</p>;
                                        }

                                        return visibleUsers.map(user => (
                                          <button
                                            key={user.id}
                                            onMouseDown={e => { e.preventDefault(); handleSelectMention(user); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-sm transition-colors"
                                          >
                                            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0', getMemberColor(user.name))}>
                                              {getInitials(user.name)}
                                            </div>
                                            <span className="truncate font-medium capitalize">{user.name}</span>
                                            {mentionedUsers.find(m => m.id === user.id) && <Check className="ml-auto h-3.5 w-3.5 text-accent shrink-0" />}
                                          </button>
                                        ));
                                      })()}
                                    </div>
                                  </div>
                                )}

                                {/* Image Previews for New Comment */}
                                {commentAttachments.length > 0 && (
                                  <div className="w-full flex flex-wrap gap-2 mt-2 px-2 pb-2">
                                    {commentAttachments.map((url, idx) => (
                                      <div key={idx} className="relative group/newimg">
                                        <img src={getFileUrl(url)} alt="Attached" className="h-10 w-10 object-cover rounded border" />
                                        <button
                                          onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/newimg:opacity-100 transition-opacity"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-border/50 w-full">
                                  <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                                      onClick={() => fileInputRef.current?.click()}
                                    >
                                      <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Attach
                                    </Button>
                                    <div className="relative shrink-0 flex items-center">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                          'h-7 px-2 gap-1.5 max-w-[110px] text-xs',
                                          commentDueDate ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                                        )}
                                        onClick={() => {
                                          const input = document.getElementById('native-date-picker') as HTMLInputElement;
                                          if (input) {
                                            try { input.showPicker(); } catch (e) { input.focus(); }
                                          }
                                        }}
                                      >
                                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">
                                          {commentDueDate ? format(new Date(commentDueDate), 'dd MMM') : 'Due Date'}
                                        </span>
                                      </Button>
                                      <input
                                        id="native-date-picker"
                                        type="date"
                                        className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                                        value={commentDueDate}
                                        onChange={e => setCommentDueDate(e.target.value)}
                                      />
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={handleAddComment}
                                    disabled={!newComment.trim() && commentAttachments.length === 0}
                                    className="h-7 px-4 shrink-0 mt-2 sm:mt-0"
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-muted/30 p-4 rounded-lg border border-border mb-6 flex flex-col items-center justify-center text-center">
                                <Monitor className="h-6 w-6 text-muted-foreground mb-2 opacity-50" />
                                <p className="text-sm font-semibold text-foreground">Read-Only Mode</p>
                                <p className="text-xs text-muted-foreground mt-1">You are viewing this card because you were mentioned. You do not have permission to reply or modify details.</p>
                              </div>
                            )}

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
                                        <span className="font-semibold text-sm capitalize">{comment.user.name}</span>
                                        <span className="text-[10px] text-muted-foreground">{format(parseISO(comment.createdAt), 'MMM d, p')}</span>
                                      </div>

                                      {/* ONLY show Edit/Delete if the user has full access AND they created the comment */}
                                      {hasFullAccess && (currentUser?.name === comment.user.name || currentUser?.id === comment.user.id) && editingCommentId !== comment.id && (
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                            setEditingCommentId(comment.id);
                                            setEditingCommentText(comment.content);
                                            setEditingCommentDueDate(comment.dueDate || '');
                                            setEditingCommentAttachments(comment.attachmentUrls || (comment.attachmentUrl ? [comment.attachmentUrl] : []));
                                            setEditingMentionedUsers(extractMentionedUsers(comment.content));
                                            setShowEditMentionPicker(false);
                                            setEditMentionQuery('');
                                          }}>
                                            <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleDeleteComment(comment.id)}>
                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>

                                    {editingCommentId === comment.id ? (
                                      <div className="space-y-2 mt-1">
                                        <div className="relative">
                                          <Textarea
                                            ref={editCommentInputRef}
                                            value={editingCommentText}
                                            onChange={handleEditCommentChange}
                                            placeholder="Edit comment… type @ to mention someone"
                                            className="min-h-[60px] text-sm"
                                          />

                                          {showEditMentionPicker && (
                                            <div className="absolute left-0 z-[150] bg-popover border border-border rounded-xl shadow-2xl w-56 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
                                              style={{ top: '100%', marginTop: 8 }}
                                            >
                                              <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/30">
                                                <AtSign className="h-3 w-3 inline mr-1" />Mention teammate
                                              </div>
                                              <div className="py-1 max-h-44 overflow-y-auto">
                                                {(() => {
                                                  const visibleUsers = allUsers.filter(u =>
                                                    u.name.toLowerCase().includes(editMentionQuery.toLowerCase())
                                                  );

                                                  if (visibleUsers.length === 0) {
                                                    return <p className="text-xs text-muted-foreground px-3 py-2">No users found</p>;
                                                  }

                                                  return visibleUsers.map(user => (
                                                    <button
                                                      key={user.id}
                                                      onMouseDown={e => { e.preventDefault(); handleSelectEditMention(user); }}
                                                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-sm transition-colors"
                                                    >
                                                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0', getMemberColor(user.name))}>
                                                        {getInitials(user.name)}
                                                      </div>
                                                      <span className="truncate font-medium capitalize">{user.name}</span>
                                                      {editingMentionedUsers.find(m => m.id === user.id) && <Check className="ml-auto h-3.5 w-3.5 text-accent shrink-0" />}
                                                    </button>
                                                  ));
                                                })()}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Currently tagged people in this edit */}
                                        {editingMentionedUsers.length > 0 && (
                                          <div className="flex items-center flex-wrap gap-1">
                                            <Users className="h-3 w-3 text-muted-foreground" />
                                            {editingMentionedUsers.map(u => (
                                              <span key={u.id} className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200 font-medium">
                                                @{u.name}
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    // Remove all "@Name" occurrences from the text and the chip
                                                    const escaped = `@${u.name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                    const stripped = editingCommentText.replace(new RegExp(`${escaped}\\s?`, 'gi'), '');
                                                    setEditingCommentText(stripped);
                                                    setEditingMentionedUsers(extractMentionedUsers(stripped));
                                                  }}
                                                  className="hover:text-red-600"
                                                >
                                                  <X className="h-2.5 w-2.5" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        <div className="flex items-center gap-2 flex-wrap">
                                          <div className="flex items-center gap-1.5">
                                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                            <input
                                              type="date"
                                              value={editingCommentDueDate}
                                              onChange={e => setEditingCommentDueDate(e.target.value)}
                                              className="h-7 text-xs border border-input rounded-md px-2 bg-background"
                                            />
                                          </div>

                                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                                            <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Attach Files
                                          </Button>
                                        </div>

                                        {/* Edit Mode Attachment Previews */}
                                        {editingCommentAttachments.length > 0 && (
                                          <div className="flex flex-wrap gap-2 mt-2">
                                            {editingCommentAttachments.map((url, idx) => (
                                              <div key={idx} className="relative group/editimg">
                                                <img src={getFileUrl(url)} alt="Attachment" className="h-12 w-12 object-cover rounded border" />
                                                <button
                                                  onClick={() => setEditingCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                                                  className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover/editimg:opacity-100 transition-opacity shadow-sm"
                                                >
                                                  <X className="h-3 w-3" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        <div className="flex gap-2 pt-2">
                                          <Button size="sm" className="h-7" onClick={() => handleEditComment(comment.id)}>Save Changes</Button>
                                          <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                                            setEditingCommentId(null);
                                            setEditingCommentAttachments([]);
                                            setEditingCommentDueDate('');
                                            setEditingMentionedUsers([]);
                                            setShowEditMentionPicker(false);
                                            setEditMentionQuery('');
                                          }}>Cancel</Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-foreground/90 bg-white dark:bg-card p-2.5 rounded-lg border border-border shadow-sm inline-block min-w-[200px] w-full">
                                        <p className="whitespace-pre-wrap break-words leading-relaxed text-sm text-foreground/80">
                                          {(() => {
                                            try {
                                              if (!comment.content) return null;

                                              const possibleNames = allUsers?.map((u: any) => `@${u.name}`) || [];

                                              if (possibleNames.length === 0) {
                                                return <span>{comment.content}</span>;
                                              }

                                              const escapedNames = possibleNames
                                                .filter(Boolean)
                                                .sort((a: string, b: string) => b.length - a.length)
                                                .map((name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

                                              const regex = new RegExp(`(${escapedNames.join('|')})`, 'gi');

                                              return comment.content.split(regex).map((part: string, i: number) => {
                                                if (!part) return null;

                                                const isMention = possibleNames.some(
                                                  (name: string) => name.toLowerCase() === part.toLowerCase()
                                                );

                                                if (isMention) {
                                                  return (
                                                    <span key={i} className="text-blue-700 font-semibold bg-blue-100 px-1.5 py-0.5 rounded-md shadow-sm">
                                                      {part}
                                                    </span>
                                                  );
                                                }

                                                return <span key={i}>{part}</span>;
                                              });
                                            } catch (err) {
                                              return <span>{comment.content}</span>;
                                            }
                                          })()}
                                        </p>

                                        {comment.dueDate && (
                                          <div className={cn(
                                            'mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border',
                                            new Date(comment.dueDate) < new Date()
                                              ? 'bg-red-50 text-red-600 border-red-200'
                                              : new Date(comment.dueDate).toDateString() === new Date().toDateString()
                                                ? 'bg-orange-50 text-orange-600 border-orange-200'
                                                : 'bg-blue-50 text-blue-600 border-blue-200'
                                          )}>
                                            <CalendarDays className="h-3 w-3" />
                                            Due: {format(new Date(comment.dueDate), 'dd MMM yyyy')}
                                            {new Date(comment.dueDate) < new Date() && ' · Overdue'}
                                            {new Date(comment.dueDate).toDateString() === new Date().toDateString() && ' · Today'}
                                          </div>
                                        )}

                                        {comment.mentions && comment.mentions.length > 0 && (
                                          <div className="mt-1.5 flex items-center flex-wrap gap-1">
                                            <Users className="h-3 w-3 text-muted-foreground" />
                                            {comment.mentions.map((m: any) => (
                                              <span key={m.user.id} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200 font-medium">
                                                @{m.user.name}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {/* Display Multiple Attachments */}
                                        {(() => {
                                          const attachments = comment.attachmentUrls || (comment.attachmentUrl ? [comment.attachmentUrl] : []);
                                          if (attachments.length === 0) return null;

                                          return (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {attachments.map((url, idx) => (
                                                <div key={idx} className="group/img cursor-pointer max-w-[200px]">
                                                  <div className="rounded-md overflow-hidden border border-border relative">
                                                    <img src={getFileUrl(url)} alt={`Attachment ${idx + 1}`} className="w-full h-auto object-contain bg-muted/20" />
                                                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors"></div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}

                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="reports" className="m-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden flex-col">
                          <div className="flex-1 p-4 overflow-y-auto">
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
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>


        {/* FUTURE REFERENCE MODAL (Super Admin Only) */}
        <Dialog open={!!futureRefTask} onOpenChange={(open) => !open && setFutureRefTask(null)}>
          <DialogContent className="sm:max-w-[500px]" onClick={e => e.stopPropagation()}>
            <DialogTitle className="flex items-center gap-2 text-primary">
              Future Reference <Badge variant="destructive" className="text-[10px]">Restricted Access</Badge>
            </DialogTitle>
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                These notes are confidential and only visible to Super Admins and Sales Managers.
              </p>

              {/* LAST UPDATED TIMESTAMP */}
              {futureRefTask?.future_reference_updated_at && (
                <div className="flex items-center gap-2 text-xs font-medium text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  <Clock className="h-3.5 w-3.5" />
                  Last updated: {format(new Date(futureRefTask.future_reference_updated_at), 'dd MMM yyyy, hh:mm a')}
                </div>
              )}

              <Textarea
                placeholder="Add private future reference notes here..."
                value={futureRefText}
                onChange={(e) => setFutureRefText(e.target.value)}
                className="min-h-[150px] resize-none focus-visible:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setFutureRefTask(null)}>Cancel</Button>
                <Button onClick={handleSaveFutureReference}>Save Reference</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;