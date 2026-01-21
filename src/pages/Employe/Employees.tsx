import React, { useEffect, useState } from 'react';
import { Plus, Search, Shield, Pencil, Trash2, Users } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { z } from 'zod';

const employeeSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  mobile_number: z.string().optional(),
  role: z.enum(['sales', 'accounting', 'admin_hr'], {
    required_error: 'Please select a role',
  }),
});

interface Employee {
  id: string;
  name: string;
  email: string;
  mobile_number: string | null;
  created_at: string;
  role: string | null;
}

const Employees: React.FC = () => {
  const { role: userRole } = useAuth();
  const { toast } = useToast();
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    mobile_number: '',
    role: '' as 'sales' | 'accounting' | 'admin_hr' | '',
  });

  useEffect(() => {
    // Only fetch if admin
    if (userRole === 'super_admin' || userRole === 'admin_hr') {
      fetchEmployees();
    } else {
      setLoading(false);
    }
  }, [userRole]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/employees');
      setEmployees(data.filter((e: any) => e.role !== 'super_admin'));
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({ title: 'Error', description: 'Failed to load employees', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', mobile_number: '', role: '' });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const result = employeeSchema.safeParse(formData);
      if (!result.success) {
        toast({ title: "Validation Error", description: result.error.errors[0].message, variant: "destructive" });
        setFormLoading(false);
        return;
      }
      await api.post('/employees', formData);
      toast({ title: 'Success', description: 'Employee created successfully.' });
      setIsCreateOpen(false);
      resetForm();
      fetchEmployees();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditOpen = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFormData({
        name: employee.name,
        email: employee.email,
        password: '',
        mobile_number: employee.mobile_number || '',
        role: (employee.role as any) || '',
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setFormLoading(true);

    try {
        await api.put(`/employees/${selectedEmployee.id}`, {
            name: formData.name,
            mobile_number: formData.mobile_number,
            role: formData.role
        });
        toast({ title: 'Updated', description: 'Employee updated.' });
        setIsEditOpen(false);
        fetchEmployees();
    } catch (error: any) {
        toast({ title: 'Error', description: error.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
        setFormLoading(false);
    }
  };

  const handleDeleteOpen = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedEmployee) return;
    setFormLoading(true);
    try {
        await api.delete(`/employees/${selectedEmployee.id}`);
        toast({ title: 'Deleted', description: 'Employee removed.' });
        setIsDeleteOpen(false);
        fetchEmployees();
    } catch (error: any) {
        toast({ title: 'Error', description: error.response?.data?.error || 'Failed', variant: 'destructive' });
    } finally {
        setFormLoading(false);
    }
  };

  const getRoleBadge = (role: string | null) => {
    const styles: Record<string, string> = {
      super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
      sales: 'bg-blue-100 text-blue-700 border-blue-200',
      accounting: 'bg-green-100 text-green-700 border-green-200',
      admin_hr: 'bg-orange-100 text-orange-700 border-orange-200',
    };
    return styles[role || ''] || 'bg-gray-100 text-gray-700';
  };

  const filteredEmployees = employees.filter((emp) => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (userRole !== 'super_admin') {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <Shield className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold">Employees</h1>
            <p className="text-muted-foreground mt-1">Manage team members</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="accent" className="w-full md:w-auto">
                <Plus className="mr-2 h-4 w-4"/> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-lg">
               <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
               <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Password" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input value={formData.mobile_number} onChange={e => setFormData({...formData, mobile_number: e.target.value})} placeholder="+1234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v as any})}>
                       <SelectTrigger><SelectValue placeholder="Select Role"/></SelectTrigger>
                       <SelectContent>
                          <SelectItem value="sales">Sales</SelectItem>
                          <SelectItem value="accounting">Accounting</SelectItem>
                          <SelectItem value="admin_hr">Admin/HR</SelectItem>
                       </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={formLoading} className="w-full">Create</Button>
               </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="card-premium p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 w-full md:max-w-md" />
          </div>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden space-y-4">
          {filteredEmployees.map((emp) => (
            <div key={emp.id} className="card-premium p-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-lg">
                   {emp.name.charAt(0).toUpperCase()}
                 </div>
                 <div className="min-w-0">
                    <p className="font-bold text-foreground">{emp.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{emp.email}</p>
                 </div>
              </div>
              <div className="flex justify-between items-center border-t pt-3">
                 <span className={`badge-category border px-2 py-1 rounded-full text-xs font-medium ${getRoleBadge(emp.role)}`}>{emp.role}</span>
                 <span className="text-sm text-muted-foreground">{emp.mobile_number || 'No Mobile'}</span>
              </div>
              <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => handleEditOpen(emp)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteOpen(emp)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP TABLE VIEW (>= md) */}
        <div className="hidden md:block card-premium overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header px-6 py-4 text-left">Employee</th>
                <th className="table-header px-6 py-4 text-left">Role</th>
                <th className="table-header px-6 py-4 text-left">Mobile</th>
                <th className="table-header px-6 py-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="border-b hover:bg-muted/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">{emp.name.charAt(0).toUpperCase()}</div>
                        <div><p className="font-medium">{emp.name}</p><p className="text-sm text-muted-foreground">{emp.email}</p></div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge-category border ${getRoleBadge(emp.role)}`}>{emp.role}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{emp.mobile_number || '—'}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditOpen(emp)}><Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteOpen(emp)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="max-w-[90vw] md:max-w-lg">
                <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Mobile</Label><Input value={formData.mobile_number} onChange={e => setFormData({...formData, mobile_number: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Role</Label>
                        <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v as any})}>
                            <SelectTrigger><SelectValue placeholder="Role"/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sales">Sales</SelectItem>
                                <SelectItem value="accounting">Accounting</SelectItem>
                                <SelectItem value="admin_hr">Admin/HR</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" variant="accent" disabled={formLoading} className="w-full">Save Changes</Button>
                </form>
            </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <DialogContent className="max-w-[90vw] md:max-w-lg">
                <DialogHeader><DialogTitle>Delete Employee</DialogTitle></DialogHeader>
                <p>Are you sure?</p>
                <Button variant="destructive" onClick={handleDelete} disabled={formLoading} className="w-full">Delete</Button>
            </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Employees;